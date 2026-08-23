import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const APPLE_PREVIEW_SCHEMA_VERSION = 1;
export const APPLE_PREVIEW_STOREFRONT = "JP";

export const APPLE_PREVIEW_PROJECTS = Object.freeze([
  Object.freeze({
    projectId: "equal-love",
    artistId: 1273762750,
    songsPath: new URL(
      "../../src/projects/equal-love/songs.json",
      import.meta.url,
    ),
  }),
  Object.freeze({
    projectId: "nearly-equal-joy",
    artistId: 1631260593,
    songsPath: new URL(
      "../../src/projects/nearly-equal-joy/songs.json",
      import.meta.url,
    ),
  }),
  Object.freeze({
    projectId: "not-equal-me",
    artistId: 1477023494,
    songsPath: new URL(
      "../../src/projects/not-equal-me/songs.json",
      import.meta.url,
    ),
  }),
]);

export const SOURCE_MAP_KEYS = Object.freeze([
  "schemaVersion",
  "projectId",
  "storefront",
  "artistId",
  "songs",
]);

export const SOURCE_MAP_SONG_KEYS = Object.freeze([
  "songId",
  "title",
  "trackId",
  "trackName",
  "collectionId",
  "collectionName",
  "previewUrl",
  "trackViewUrl",
  "matchMethod",
  "candidateCount",
  "needsReview",
  "reviewNote",
]);

export const SOURCE_REPORT_KEYS = Object.freeze([
  "schemaVersion",
  "projectId",
  "storefront",
  "artistId",
  "snapshotRunId",
  "coverageNote",
  "catalogSongCount",
  "matchedSongCount",
  "approvedSongCount",
  "needsReviewCount",
  "candidateCountDistribution",
  "unmatchedSongIds",
  "songs",
]);

export const SOURCE_REPORT_SONG_KEYS = Object.freeze([
  "songId",
  "title",
  "normalizedTitle",
  "candidateCount",
  "candidates",
  "rankedTrackIds",
  "suggestedTrackId",
  "selectedTrackId",
  "needsReview",
  "reviewNote",
]);

export const CANDIDATE_KEYS = Object.freeze([
  "trackId",
  "trackName",
  "collectionId",
  "collectionName",
  "releaseDate",
  "previewUrl",
  "trackViewUrl",
]);

const MATCH_METHOD_EXACT = "exact-normalized-title";
const MATCH_METHOD_UNMATCHED = "unmatched";
const HISTORICAL_EXACT_MATCH_COUNTS = Object.freeze({
  "equal-love": 79,
  "nearly-equal-joy": 30,
  "not-equal-me": 59,
});

export function normalizePreviewTitle(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function rankPreviewCandidates(candidates, releaseTitle) {
  const normalizedReleaseTitle = normalizePreviewTitle(releaseTitle ?? "");
  return [...candidates].sort((left, right) => {
    const leftReleaseMatch =
      normalizedReleaseTitle !== "" &&
      normalizePreviewTitle(left.collectionName) === normalizedReleaseTitle;
    const rightReleaseMatch =
      normalizedReleaseTitle !== "" &&
      normalizePreviewTitle(right.collectionName) === normalizedReleaseTitle;

    if (leftReleaseMatch !== rightReleaseMatch) {
      return leftReleaseMatch ? -1 : 1;
    }

    const releaseDateOrder = left.releaseDate.localeCompare(right.releaseDate);
    if (releaseDateOrder !== 0) return releaseDateOrder;
    return left.trackId - right.trackId;
  });
}

export function extractAppleTrackCandidates(results) {
  const candidatesByTrackId = new Map();

  for (const result of results) {
    if (
      result?.wrapperType !== "track" ||
      result?.kind !== "song" ||
      !Number.isSafeInteger(result.trackId) ||
      result.trackId <= 0
    ) {
      continue;
    }

    const candidate = {
      trackId: result.trackId,
      trackName: requireNonEmptyString(result.trackName, "trackName"),
      collectionId: requirePositiveInteger(result.collectionId, "collectionId"),
      collectionName: requireNonEmptyString(
        result.collectionName,
        "collectionName",
      ),
      releaseDate: requireNonEmptyString(result.releaseDate, "releaseDate"),
      previewUrl: requireNonEmptyString(result.previewUrl, "previewUrl"),
      trackViewUrl: requireNonEmptyString(result.trackViewUrl, "trackViewUrl"),
    };

    const existing = candidatesByTrackId.get(candidate.trackId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(candidate)) {
      throw new Error(
        `Apple track ${candidate.trackId} changed across frozen collection responses`,
      );
    }
    candidatesByTrackId.set(candidate.trackId, candidate);
  }

  return [...candidatesByTrackId.values()].sort(
    (left, right) => left.trackId - right.trackId,
  );
}

export function buildProjectArtifacts({
  project,
  songs,
  appleResults,
  snapshotRunId,
}) {
  const allCandidates = extractAppleTrackCandidates(appleResults);
  const sourceSongs = [];
  const reportSongs = [];

  for (const song of songs) {
    const title = requireNonEmptyString(
      song?.title?.ja,
      `${song?.id}.title.ja`,
    );
    const normalizedTitle = normalizePreviewTitle(title);
    const matchingCandidates = rankPreviewCandidates(
      allCandidates.filter(
        (candidate) =>
          normalizePreviewTitle(candidate.trackName) === normalizedTitle,
      ),
      song?.releaseTitle?.ja,
    );
    const suggested = matchingCandidates[0];
    const reviewNote = suggested
      ? "Machine suggestion only; confirm the selected Apple track."
      : "No exact normalized title candidate in the frozen Apple catalog.";
    const sourceEntry = suggested
      ? {
          songId: requireNonEmptyString(song.id, "song.id"),
          title,
          trackId: suggested.trackId,
          trackName: suggested.trackName,
          collectionId: suggested.collectionId,
          collectionName: suggested.collectionName,
          previewUrl: suggested.previewUrl,
          trackViewUrl: suggested.trackViewUrl,
          matchMethod: MATCH_METHOD_EXACT,
          candidateCount: matchingCandidates.length,
          needsReview: true,
          reviewNote,
        }
      : {
          songId: requireNonEmptyString(song.id, "song.id"),
          title,
          trackId: null,
          trackName: null,
          collectionId: null,
          collectionName: null,
          previewUrl: null,
          trackViewUrl: null,
          matchMethod: MATCH_METHOD_UNMATCHED,
          candidateCount: 0,
          needsReview: true,
          reviewNote,
        };

    sourceSongs.push(sourceEntry);
    reportSongs.push({
      songId: sourceEntry.songId,
      title,
      normalizedTitle,
      candidateCount: matchingCandidates.length,
      candidates: matchingCandidates,
      rankedTrackIds: matchingCandidates.map(({ trackId }) => trackId),
      suggestedTrackId: suggested?.trackId ?? null,
      selectedTrackId: sourceEntry.trackId,
      needsReview: sourceEntry.needsReview,
      reviewNote,
    });
  }

  const sourceMap = {
    schemaVersion: APPLE_PREVIEW_SCHEMA_VERSION,
    projectId: project.projectId,
    storefront: APPLE_PREVIEW_STOREFRONT,
    artistId: project.artistId,
    songs: sourceSongs,
  };
  const matchedSongCount = sourceSongs.filter(
    ({ matchMethod }) => matchMethod !== MATCH_METHOD_UNMATCHED,
  ).length;
  const sourceReport = {
    schemaVersion: APPLE_PREVIEW_SCHEMA_VERSION,
    projectId: project.projectId,
    storefront: APPLE_PREVIEW_STOREFRONT,
    artistId: project.artistId,
    snapshotRunId,
    coverageNote: `${matchedSongCount}/${sourceSongs.length} exact-title matches in frozen run ${snapshotRunId}, compared with the historical ${HISTORICAL_EXACT_MATCH_COUNTS[project.projectId]}/${sourceSongs.length} observation. Apple catalog coverage is informational and may change; it is not an acceptance constant.`,
    catalogSongCount: sourceSongs.length,
    matchedSongCount,
    approvedSongCount: 0,
    needsReviewCount: sourceSongs.length,
    candidateCountDistribution: createCandidateCountDistribution(reportSongs),
    unmatchedSongIds: sourceSongs
      .filter(({ matchMethod }) => matchMethod === MATCH_METHOD_UNMATCHED)
      .map(({ songId }) => songId),
    songs: reportSongs,
  };

  return { sourceMap, sourceReport };
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

async function readFrozenAppleResults(runDirectory, project) {
  const manifest = await readJsonFile(join(runDirectory, "manifest.json"));
  assert(
    manifest.schemaVersion === 1,
    "snapshot manifest schemaVersion must be 1",
  );
  assert(
    manifest.storefront === APPLE_PREVIEW_STOREFRONT,
    `snapshot storefront must be ${APPLE_PREVIEW_STOREFRONT}`,
  );
  const manifestProject = manifest.projects?.find(
    ({ projectId }) => projectId === project.projectId,
  );
  assert(manifestProject, `snapshot is missing ${project.projectId}`);
  assert(
    manifestProject.artistId === project.artistId,
    `${project.projectId} snapshot artistId is invalid`,
  );
  assert(
    Array.isArray(manifestProject.collectionIds) &&
      Array.isArray(manifestProject.completedCollectionIds),
    `${project.projectId} snapshot collection lists are invalid`,
  );
  assert(
    manifestProject.collectionIds.length ===
      manifestProject.completedCollectionIds.length &&
      manifestProject.collectionIds.every(
        (collectionId, index) =>
          collectionId === manifestProject.completedCollectionIds[index],
      ),
    `${project.projectId} snapshot is incomplete`,
  );

  const results = [];
  for (const collectionId of manifestProject.collectionIds) {
    const response = await readJsonFile(
      join(
        runDirectory,
        "projects",
        project.projectId,
        "collections",
        `${collectionId}.json`,
      ),
    );
    assert(
      Array.isArray(response.results),
      `${project.projectId}/${collectionId} response has no results`,
    );
    results.push(...response.results);
  }
  return { results, snapshotRunId: manifest.runId };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const runDirectory = isAbsolute(options.runDirectory)
    ? options.runDirectory
    : resolve(options.runDirectory);
  const projects = options.projectId
    ? APPLE_PREVIEW_PROJECTS.filter(
        ({ projectId }) => projectId === options.projectId,
      )
    : APPLE_PREVIEW_PROJECTS;
  assert(projects.length > 0, `Unknown project: ${options.projectId}`);

  for (const project of projects) {
    const [songs, frozen] = await Promise.all([
      readJsonFile(project.songsPath),
      readFrozenAppleResults(runDirectory, project),
    ]);
    assert(
      Array.isArray(songs),
      `${project.projectId} songs.json must be an array`,
    );
    const artifacts = buildProjectArtifacts({
      project,
      songs,
      appleResults: frozen.results,
      snapshotRunId: frozen.snapshotRunId,
    });
    const outputDirectory = dirname(fileURLToPath(import.meta.url));
    await Promise.all([
      writeJson(
        join(outputDirectory, `${project.projectId}-source-map.json`),
        artifacts.sourceMap,
      ),
      writeJson(
        join(outputDirectory, `${project.projectId}-source-report.json`),
        artifacts.sourceReport,
      ),
    ]);
    console.log(
      `${project.projectId}: matched ${artifacts.sourceReport.matchedSongCount}/${songs.length}; all entries require review`,
    );
  }
}

function parseArguments(args) {
  let runDirectory;
  let projectId;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run-dir") {
      runDirectory = args[index + 1];
      index += 1;
    } else if (argument === "--project") {
      projectId = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  assert(
    runDirectory,
    "Usage: build-source-map.mjs --run-dir <directory> [--project <id>]",
  );
  return { runDirectory, projectId };
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

async function readJsonFile(path) {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${String(path)} is not valid JSON: ${error.message}`);
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`apple preview source map: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
