import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLE_PREVIEW_PROJECTS,
  buildProjectArtifacts,
  normalizePreviewTitle,
} from "./build-source-map.mjs";
import {
  assertUniqueNormalizedSongTitles,
  validateCrossProjectIsolation,
  validateProjectArtifacts,
} from "./validate-apple-preview-maps.mjs";

const project = APPLE_PREVIEW_PROJECTS[0];

test("preview title normalization is deterministic and punctuation-insensitive", () => {
  assert.equal(
    normalizePreviewTitle(" Ｗant you！want you！ "),
    "wantyouwantyou",
  );
  assert.equal(normalizePreviewTitle("祝祭・〜♡"), "祝祭");
  assert.equal(normalizePreviewTitle("が"), "が");
});

test("source-map builder ranks exact candidates but never approves them", () => {
  const { sourceMap, sourceReport } = createGeneratedFixture();
  assert.equal(sourceMap.songs[0].trackId, 101);
  assert.equal(sourceMap.songs[0].needsReview, true);
  assert.equal(sourceMap.songs[0].candidateCount, 2);
  assert.deepEqual(sourceReport.songs[0].rankedTrackIds, [101, 102]);
  assert.equal(sourceMap.songs[1].matchMethod, "unmatched");
  assert.equal(sourceMap.songs[1].trackId, null);
});

test("near-title candidates remain unmatched instead of using fuzzy matching", () => {
  const artifacts = buildProjectArtifacts({
    project,
    songs: [createSong("alpha", "Alpha")],
    appleResults: [
      createAppleTrack(301, "Alphx", "Alpha - Single", "2024-01-01T00:00:00Z"),
    ],
    snapshotRunId: "fixture",
  });
  assert.equal(artifacts.sourceMap.songs[0].matchMethod, "unmatched");
});

test("approved projection closes exactly with reviewed source evidence", () => {
  const fixture = createApprovedFixture();
  assert.doesNotThrow(() => validateProjectArtifacts(fixture));
});

test("validator rejects non-boolean needsReview", () => {
  const fixture = createApprovedFixture();
  fixture.sourceMap.songs[0].needsReview = "false";
  assert.throws(
    () => validateProjectArtifacts(fixture),
    /needsReview must be a boolean/,
  );
});

test("validator rejects an Apple lookalike preview hostname", () => {
  const fixture = createApprovedFixture();
  fixture.sourceMap.songs[0].previewUrl =
    "https://audio-ssl.itunes.apple.com.evil.example/preview.m4a";
  assert.throws(
    () => validateProjectArtifacts(fixture),
    /must use https:\/\/audio-ssl\.itunes\.apple\.com/,
  );
});

test("validator rejects a runtime projection containing review-only data", () => {
  const fixture = createApprovedFixture();
  fixture.sourceMap.songs[0].needsReview = true;
  fixture.sourceReport.songs[0].needsReview = true;
  fixture.sourceReport.approvedSongCount = 0;
  fixture.sourceReport.needsReviewCount = 2;
  assert.throws(
    () => validateProjectArtifacts(fixture),
    /stale or leaks review-only data/,
  );
});

test("normalized title collisions fail closed within one project", () => {
  assert.throws(
    () =>
      assertUniqueNormalizedSongTitles(
        [createSong("one", "A・B"), createSong("two", "Ａ B")],
        "fixture",
      ),
    /normalized title collision/,
  );
});

test("cross-project exclusive URLs cannot leak into another runtime", () => {
  const left = createIsolationArtifact("left", 1);
  const right = createIsolationArtifact("right", 2);
  left.runtime[0].previewUrl = right.runtime[0].previewUrl;
  assert.throws(
    () => validateCrossProjectIsolation([left, right]),
    /leaks another project's exclusive URL/,
  );
});

test("cross-project shared Apple media requires the same normalized title and track tuple", () => {
  const left = createIsolationArtifact("left", 1, "Alpha");
  const right = createIsolationArtifact("right", 2, "Beta");
  left.sourceMap.songs[0] = {
    ...left.sourceMap.songs[0],
    trackId: right.sourceMap.songs[0].trackId,
    previewUrl: right.sourceMap.songs[0].previewUrl,
    trackViewUrl: right.sourceMap.songs[0].trackViewUrl,
  };
  left.runtime[0] = {
    ...left.runtime[0],
    previewUrl: right.runtime[0].previewUrl,
    trackViewUrl: right.runtime[0].trackViewUrl,
  };
  assert.throws(
    () => validateCrossProjectIsolation([left, right]),
    /must preserve normalized title and the complete track tuple/,
  );

  left.sourceMap.songs[0].title = " Ｔriple・Date ";
  right.sourceMap.songs[0].title = "Triple Date";
  assert.doesNotThrow(() => validateCrossProjectIsolation([left, right]));
});

function createGeneratedFixture() {
  return buildProjectArtifacts({
    project,
    songs: [createSong("alpha", "Alpha"), createSong("beta", "Beta")],
    appleResults: [
      createAppleTrack(102, "Alpha", "Compilation", "2023-01-01T00:00:00Z"),
      createAppleTrack(101, "Alpha", "Alpha", "2024-01-01T00:00:00Z"),
      createAppleTrack(103, "Betx", "Beta", "2024-01-01T00:00:00Z"),
    ],
    snapshotRunId: "fixture",
  });
}

function createApprovedFixture() {
  const songs = [createSong("alpha", "Alpha"), createSong("beta", "Beta")];
  const artifacts = buildProjectArtifacts({
    project,
    songs,
    appleResults: [
      createAppleTrack(101, "Alpha", "Alpha", "2024-01-01T00:00:00Z"),
    ],
    snapshotRunId: "fixture",
  });
  const sourceEntry = artifacts.sourceMap.songs[0];
  const reportEntry = artifacts.sourceReport.songs[0];
  sourceEntry.needsReview = false;
  sourceEntry.reviewNote = "Reviewed against the frozen Apple track metadata.";
  reportEntry.needsReview = false;
  reportEntry.reviewNote = sourceEntry.reviewNote;
  artifacts.sourceReport.approvedSongCount = 1;
  artifacts.sourceReport.needsReviewCount = 1;
  const runtime = [
    {
      songId: sourceEntry.songId,
      previewUrl: sourceEntry.previewUrl,
      trackViewUrl: sourceEntry.trackViewUrl,
    },
  ];
  return {
    project,
    songs,
    sourceMap: artifacts.sourceMap,
    sourceReport: artifacts.sourceReport,
    runtimeText: `${JSON.stringify(runtime, null, 2)}\n`,
  };
}

function createSong(id, title) {
  return {
    id,
    title: { ja: title, romaji: title.toLowerCase() },
    releaseTitle: { ja: title, romaji: title.toLowerCase() },
  };
}

function createAppleTrack(trackId, trackName, collectionName, releaseDate) {
  return {
    wrapperType: "track",
    kind: "song",
    trackId,
    trackName,
    collectionId: trackId + 1_000,
    collectionName,
    releaseDate,
    previewUrl: `https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/${trackId}.m4a`,
    trackViewUrl: `https://music.apple.com/jp/album/track/${trackId}`,
  };
}

function createIsolationArtifact(projectId, id, title = `Title ${id}`) {
  const previewUrl = `https://audio-ssl.itunes.apple.com/preview-${id}.m4a`;
  const trackViewUrl = `https://music.apple.com/jp/album/${id}`;
  return {
    projectId,
    sourceMap: {
      songs: [
        {
          songId: `song-${id}`,
          title,
          trackId: id,
          previewUrl,
          trackViewUrl,
        },
      ],
    },
    runtime: [{ songId: `song-${id}`, previewUrl, trackViewUrl }],
  };
}
