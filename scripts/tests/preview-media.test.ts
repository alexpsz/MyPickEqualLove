import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreviewMediaIndex,
  getPreviewMedia,
  hasPreviewMedia,
} from "../../src/utils/previewMedia";
import type { PreviewMediaRuntimeEntry } from "../../src/projects/runtimeTypes";

const validEntry: PreviewMediaRuntimeEntry = {
  songId: "equal-love",
  previewUrl:
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/test.m4a",
  trackViewUrl: "https://music.apple.com/jp/album/test/1?i=2",
};

test("looks up a published current-project preview and rejects unknown songs", () => {
  assert.equal(hasPreviewMedia("equal-love"), true);
  assert.equal(getPreviewMedia("equal-love")?.songId, "equal-love");
  assert.equal(hasPreviewMedia("not-a-song"), false);
  assert.equal(getPreviewMedia("not-a-song"), undefined);
});

test("builds an idempotent index for valid entries", () => {
  const first = buildPreviewMediaIndex([validEntry]);
  const second = buildPreviewMediaIndex([...first.values()]);

  assert.deepEqual([...second], [...first]);
  assert.equal(second.get(validEntry.songId), validEntry);
});

test("fails closed for malicious or lookalike URL hosts", () => {
  const invalidEntries: PreviewMediaRuntimeEntry[] = [
    {
      ...validEntry,
      songId: "http-preview",
      previewUrl: validEntry.previewUrl.replace("https:", "http:"),
    },
    {
      ...validEntry,
      songId: "preview-lookalike",
      previewUrl: "https://audio-ssl.itunes.apple.com.evil.example/preview.m4a",
    },
    {
      ...validEntry,
      songId: "track-lookalike",
      trackViewUrl: "https://music.apple.com.evil.example/jp/album/test",
    },
    {
      ...validEntry,
      songId: "wrong-track-host",
      trackViewUrl: "https://itunes.apple.com/jp/album/test",
    },
  ];

  assert.equal(buildPreviewMediaIndex(invalidEntries).size, 0);
});

test("fails closed when a song id is duplicated", () => {
  const duplicate = {
    ...validEntry,
    previewUrl:
      "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/other.m4a",
  };

  assert.equal(buildPreviewMediaIndex([validEntry, duplicate]).size, 0);
});
