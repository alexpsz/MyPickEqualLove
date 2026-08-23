import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  APPLE_PREVIEW_PROJECTS,
  APPLE_PREVIEW_SCHEMA_VERSION,
  APPLE_PREVIEW_STOREFRONT,
  CANDIDATE_KEYS,
  SOURCE_MAP_KEYS,
  SOURCE_MAP_SONG_KEYS,
  SOURCE_REPORT_KEYS,
  SOURCE_REPORT_SONG_KEYS,
  normalizePreviewTitle,
} from "./build-source-map.mjs";

export const MATCH_METHODS = Object.freeze([
  "exact-normalized-title",
  "manual",
  "unmatched",
]);

const RUNTIME_ENTRY_KEYS = Object.freeze([
  "songId",
  "previewUrl",
  "trackViewUrl",
]);
const PREVIEW_HOST = "audio-ssl.itunes.apple.com";
const TRACK_HOST = "music.apple.com";

export function validateProjectArtifacts({
  project,
  songs,
  sourceMap,
  sourceReport,
  runtimeText,
}) {
  assertExactKeys(
    sourceMap,
    SOURCE_MAP_KEYS,
    `${project.projectId} source map`,
  );
  assert(
    sourceMap.schemaVersion === APPLE_PREVIEW_SCHEMA_VERSION,
    `${project.projectId} source map schemaVersion must be ${APPLE_PREVIEW_SCHEMA_VERSION}`,
  );
  assert(
    sourceMap.projectId === project.projectId,
    `${project.projectId} source map projectId is invalid`,
  );
  assert(
    sourceMap.storefront === APPLE_PREVIEW_STOREFRONT,
    `${project.projectId} source map storefront must be ${APPLE_PREVIEW_STOREFRONT}`,
  );
  assert(
    sourceMap.artistId === project.artistId,
    `${project.projectId} source map artistId is invalid`,
  );
  assert(
    Array.isArray(songs),
    `${project.projectId} songs.json must be an array`,
  );
  assert(
    Array.isArray(sourceMap.songs) && sourceMap.songs.length === songs.length,
    `${project.projectId} source map must cover every catalog song`,
  );
  assertUniqueNormalizedSongTitles(songs, project.projectId);

  const songIds = new Set();
  const trackIds = new Set();
  for (const [index, entry] of sourceMap.songs.entries()) {
    const song = songs[index];
    const label = `${project.projectId} sourceMap.songs[${index}]`;
    assertExactKeys(entry, SOURCE_MAP_SONG_KEYS, label);
    assert(entry.songId === song?.id, `${label} must match songs.json order`);
    assert(
      entry.title === song?.title?.ja,
      `${label}.title must match songs.json title.ja`,
    );
    assert(
      !songIds.has(entry.songId),
      `${label} duplicates songId ${entry.songId}`,
    );
    songIds.add(entry.songId);
    assert(
      MATCH_METHODS.includes(entry.matchMethod),
      `${label}.matchMethod is unsupported`,
    );
    assert(
      Number.isSafeInteger(entry.candidateCount) && entry.candidateCount >= 0,
      `${label}.candidateCount must be a non-negative integer`,
    );
    assert(
      typeof entry.needsReview === "boolean",
      `${label}.needsReview must be a boolean`,
    );
    assertNonEmptyString(entry.reviewNote, `${label}.reviewNote`);

    if (entry.matchMethod === "unmatched") {
      for (const key of [
        "trackId",
        "trackName",
        "collectionId",
        "collectionName",
        "previewUrl",
        "trackViewUrl",
      ]) {
        assert(
          entry[key] === null,
          `${label}.${key} must be null when unmatched`,
        );
      }
      assert(
        entry.candidateCount === 0,
        `${label} unmatched candidateCount must be 0`,
      );
      assert(
        entry.needsReview === true,
        `${label} unmatched entry must need review`,
      );
      continue;
    }

    assertPositiveInteger(entry.trackId, `${label}.trackId`);
    assertPositiveInteger(entry.collectionId, `${label}.collectionId`);
    assertNonEmptyString(entry.trackName, `${label}.trackName`);
    assertNonEmptyString(entry.collectionName, `${label}.collectionName`);
    assertExactHttpsHost(entry.previewUrl, PREVIEW_HOST, `${label}.previewUrl`);
    assertExactHttpsHost(
      entry.trackViewUrl,
      TRACK_HOST,
      `${label}.trackViewUrl`,
    );
    assert(entry.candidateCount > 0, `${label} matched entry needs candidates`);
    assert(
      !trackIds.has(entry.trackId),
      `${label} reuses trackId ${entry.trackId}`,
    );
    trackIds.add(entry.trackId);
    if (entry.matchMethod === "exact-normalized-title") {
      assert(
        normalizePreviewTitle(entry.trackName) ===
          normalizePreviewTitle(entry.title),
        `${label} exact match title does not normalize equally`,
      );
    }
    if (entry.needsReview === false) {
      assert(
        entry.matchMethod !== "unmatched",
        `${label} approved entry cannot be unmatched`,
      );
    }
  }

  validateSourceReport({ project, songs, sourceMap, sourceReport });

  const expectedProjection = sourceMap.songs.flatMap((entry) =>
    entry.needsReview === false
      ? [
          {
            songId: entry.songId,
            previewUrl: entry.previewUrl,
            trackViewUrl: entry.trackViewUrl,
          },
        ]
      : [],
  );
  const expectedRuntimeText = `${JSON.stringify(expectedProjection, null, 2)}\n`;
  assert(
    runtimeText === expectedRuntimeText,
    `${project.projectId} runtime projection is stale or leaks review-only data`,
  );
  const runtime = parseJson(
    runtimeText,
    `${project.projectId} runtime projection`,
  );
  assert(
    Array.isArray(runtime),
    `${project.projectId} runtime projection must be an array`,
  );
  for (const [index, entry] of runtime.entries()) {
    const label = `${project.projectId} runtime[${index}]`;
    assertExactKeys(entry, RUNTIME_ENTRY_KEYS, label);
    assertNonEmptyString(entry.songId, `${label}.songId`);
    assertExactHttpsHost(entry.previewUrl, PREVIEW_HOST, `${label}.previewUrl`);
    assertExactHttpsHost(
      entry.trackViewUrl,
      TRACK_HOST,
      `${label}.trackViewUrl`,
    );
  }

  return {
    projectId: project.projectId,
    catalogCount: songs.length,
    approvedCount: expectedProjection.length,
    needsReviewCount: sourceMap.songs.filter(({ needsReview }) => needsReview)
      .length,
    runtime,
  };
}

function validateSourceReport({ project, songs, sourceMap, sourceReport }) {
  const label = `${project.projectId} source report`;
  assertExactKeys(sourceReport, SOURCE_REPORT_KEYS, label);
  assert(
    sourceReport.schemaVersion === APPLE_PREVIEW_SCHEMA_VERSION &&
      sourceReport.projectId === project.projectId &&
      sourceReport.storefront === APPLE_PREVIEW_STOREFRONT &&
      sourceReport.artistId === project.artistId,
    `${label} identity does not match the source map`,
  );
  assertNonEmptyString(sourceReport.snapshotRunId, `${label}.snapshotRunId`);
  assertNonEmptyString(sourceReport.coverageNote, `${label}.coverageNote`);
  assert(
    Array.isArray(sourceReport.songs) &&
      sourceReport.songs.length === songs.length,
    `${label} must cover every catalog song`,
  );

  for (const [index, reportSong] of sourceReport.songs.entries()) {
    const mapSong = sourceMap.songs[index];
    const catalogSong = songs[index];
    const songLabel = `${label}.songs[${index}]`;
    assertExactKeys(reportSong, SOURCE_REPORT_SONG_KEYS, songLabel);
    assert(
      reportSong.songId === mapSong.songId &&
        reportSong.songId === catalogSong.id &&
        reportSong.title === mapSong.title &&
        reportSong.title === catalogSong.title.ja,
      `${songLabel} identity does not close with source map and catalog`,
    );
    assert(
      reportSong.normalizedTitle === normalizePreviewTitle(reportSong.title) &&
        reportSong.normalizedTitle !== "",
      `${songLabel}.normalizedTitle is stale`,
    );
    assert(
      Array.isArray(reportSong.candidates),
      `${songLabel}.candidates must be an array`,
    );
    assert(
      Array.isArray(reportSong.rankedTrackIds),
      `${songLabel}.rankedTrackIds must be an array`,
    );
    const candidateTrackIds = new Set();
    for (const [candidateIndex, candidate] of reportSong.candidates.entries()) {
      const candidateLabel = `${songLabel}.candidates[${candidateIndex}]`;
      assertExactKeys(candidate, CANDIDATE_KEYS, candidateLabel);
      assertPositiveInteger(candidate.trackId, `${candidateLabel}.trackId`);
      assertPositiveInteger(
        candidate.collectionId,
        `${candidateLabel}.collectionId`,
      );
      assertNonEmptyString(candidate.trackName, `${candidateLabel}.trackName`);
      assertNonEmptyString(
        candidate.collectionName,
        `${candidateLabel}.collectionName`,
      );
      assertNonEmptyString(
        candidate.releaseDate,
        `${candidateLabel}.releaseDate`,
      );
      assertExactHttpsHost(
        candidate.previewUrl,
        PREVIEW_HOST,
        `${candidateLabel}.previewUrl`,
      );
      assertExactHttpsHost(
        candidate.trackViewUrl,
        TRACK_HOST,
        `${candidateLabel}.trackViewUrl`,
      );
      assert(
        !candidateTrackIds.has(candidate.trackId),
        `${candidateLabel} duplicates trackId ${candidate.trackId}`,
      );
      candidateTrackIds.add(candidate.trackId);
    }
    assert(
      reportSong.candidateCount === reportSong.candidates.length &&
        reportSong.candidateCount === mapSong.candidateCount,
      `${songLabel}.candidateCount is stale`,
    );
    assert(
      JSON.stringify(reportSong.rankedTrackIds) ===
        JSON.stringify(reportSong.candidates.map(({ trackId }) => trackId)),
      `${songLabel}.rankedTrackIds does not describe candidate order`,
    );
    assert(
      reportSong.suggestedTrackId ===
        (reportSong.candidates[0]?.trackId ?? null),
      `${songLabel}.suggestedTrackId is stale`,
    );
    assert(
      reportSong.selectedTrackId === mapSong.trackId &&
        reportSong.needsReview === mapSong.needsReview &&
        reportSong.reviewNote === mapSong.reviewNote,
      `${songLabel} review decision does not match source map`,
    );

    if (mapSong.trackId === null) {
      assert(
        reportSong.candidates.length === 0,
        `${songLabel} unmatched entry has candidates`,
      );
      continue;
    }
    const selected = reportSong.candidates.find(
      ({ trackId }) => trackId === mapSong.trackId,
    );
    assert(
      selected,
      `${songLabel} selected track is absent from candidate evidence`,
    );
    for (const key of CANDIDATE_KEYS) {
      if (key === "releaseDate") continue;
      assert(
        selected[key] === mapSong[key],
        `${songLabel} selected ${key} does not match source map`,
      );
    }
  }

  const matchedSongCount = sourceMap.songs.filter(
    ({ matchMethod }) => matchMethod !== "unmatched",
  ).length;
  const approvedSongCount = sourceMap.songs.filter(
    ({ needsReview }) => needsReview === false,
  ).length;
  const needsReviewCount = sourceMap.songs.length - approvedSongCount;
  const unmatchedSongIds = sourceMap.songs
    .filter(({ matchMethod }) => matchMethod === "unmatched")
    .map(({ songId }) => songId);
  const candidateCountDistribution = createCandidateCountDistribution(
    sourceReport.songs,
  );

  assert(
    sourceReport.catalogSongCount === songs.length,
    `${label}.catalogSongCount is stale`,
  );
  assert(
    sourceReport.matchedSongCount === matchedSongCount,
    `${label}.matchedSongCount is stale`,
  );
  assert(
    sourceReport.approvedSongCount === approvedSongCount,
    `${label}.approvedSongCount is stale`,
  );
  assert(
    sourceReport.needsReviewCount === needsReviewCount,
    `${label}.needsReviewCount is stale`,
  );
  assert(
    JSON.stringify(sourceReport.unmatchedSongIds) ===
      JSON.stringify(unmatchedSongIds),
    `${label}.unmatchedSongIds is stale`,
  );
  assert(
    JSON.stringify(sourceReport.candidateCountDistribution) ===
      JSON.stringify(candidateCountDistribution),
    `${label}.candidateCountDistribution is stale`,
  );
}

export function validateCrossProjectIsolation(projectArtifacts) {
  const sourceUrlSets = new Map(
    projectArtifacts.map(({ projectId, sourceMap }) => [
      projectId,
      new Set(
        sourceMap.songs.flatMap(({ previewUrl, trackViewUrl }) =>
          previewUrl && trackViewUrl ? [previewUrl, trackViewUrl] : [],
        ),
      ),
    ]),
  );

  for (const artifact of projectArtifacts) {
    const ownUrls = sourceUrlSets.get(artifact.projectId);
    const otherExclusiveUrls = new Set();
    for (const [otherProjectId, urls] of sourceUrlSets) {
      if (otherProjectId === artifact.projectId) continue;
      for (const url of urls) {
        if (!ownUrls.has(url)) otherExclusiveUrls.add(url);
      }
    }
    for (const entry of artifact.runtime) {
      assert(
        !otherExclusiveUrls.has(entry.previewUrl) &&
          !otherExclusiveUrls.has(entry.trackViewUrl),
        `${artifact.projectId} runtime projection leaks another project's exclusive URL`,
      );
    }
  }
}

export function assertUniqueNormalizedSongTitles(songs, projectId) {
  const seen = new Map();
  for (const song of songs) {
    const normalized = normalizePreviewTitle(song?.title?.ja);
    assert(
      normalized !== "",
      `${projectId}/${song?.id} normalizes to an empty title`,
    );
    const existing = seen.get(normalized);
    assert(
      !existing,
      `${projectId} normalized title collision: ${existing} and ${song.id}`,
    );
    seen.set(normalized, song.id);
  }
}

export function assertExactKeys(value, expectedKeys, label) {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(
    JSON.stringify(actualKeys) === JSON.stringify(expected),
    `${label} keys must be exactly ${expected.join(", ")}; got ${actualKeys.join(", ")}`,
  );
}

function createCandidateCountDistribution(reportSongs) {
  const counts = new Map();
  for (const song of reportSongs) {
    const key = String(song.candidateCount);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(
      ([left], [right]) => Number(left) - Number(right),
    ),
  );
}

function assertExactHttpsHost(value, hostname, label) {
  assertNonEmptyString(value, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  assert(
    url.protocol === "https:" && url.hostname === hostname,
    `${label} must use https://${hostname}`,
  );
}

function assertPositiveInteger(value, label) {
  assert(
    Number.isSafeInteger(value) && value > 0,
    `${label} must be a positive integer`,
  );
}

function assertNonEmptyString(value, label) {
  assert(
    typeof value === "string" && value.trim() !== "",
    `${label} must be a non-empty string`,
  );
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const artifacts = [];
  for (const project of APPLE_PREVIEW_PROJECTS) {
    const [songs, sourceMap, sourceReport, runtimeText] = await Promise.all([
      readJson(project.songsPath),
      readJson(
        new URL(`./${project.projectId}-source-map.json`, import.meta.url),
      ),
      readJson(
        new URL(`./${project.projectId}-source-report.json`, import.meta.url),
      ),
      readFile(
        new URL(
          `../../src/projects/${project.projectId}/preview-media.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
    const summary = validateProjectArtifacts({
      project,
      songs,
      sourceMap,
      sourceReport,
      runtimeText,
    });
    artifacts.push({ ...summary, sourceMap });
    console.log(
      `${project.projectId}: catalog=${summary.catalogCount}, approved=${summary.approvedCount}, needsReview=${summary.needsReviewCount}`,
    );
  }
  validateCrossProjectIsolation(artifacts);
  console.log("Apple preview maps: PASS");
}

async function readJson(path) {
  return parseJson(await readFile(path, "utf8"), String(path));
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`Apple preview maps: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
