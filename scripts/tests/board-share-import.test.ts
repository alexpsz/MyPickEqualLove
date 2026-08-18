import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBoardShareMismatchUrl,
  planBoardShareDialog,
  type CreateBoardSharePreviewDiff,
} from "../../src/utils/boardShareImport";

/**
 * Mirrors createBoardSharePreviewDiff from boardShareProtocol.mjs, which this
 * suite cannot import (standalone ESM, and these tests compile to CommonJS).
 * The protocol implementation itself is covered by test:share-links; injecting
 * it here keeps these cases focused on the decision layer.
 */
const createPreviewDiff: CreateBoardSharePreviewDiff = (snapshot) => ({
  changes: snapshot.slotIds.flatMap((slotId) => {
    const currentSongId = snapshot.currentPicks[slotId];
    const importedSongId = snapshot.importedPicks[slotId];
    return currentSongId === importedSongId
      ? []
      : [{ slotId, currentSongId, importedSongId }];
  }),
  contextChanged:
    snapshot.importedContextId !== null &&
    snapshot.importedContextId !== snapshot.currentContextId,
});

const SLOTS = [
  { id: "slot-1", label: "#1" },
  { id: "slot-2", label: "#2" },
];
const UI_SLOTS = [
  { id: "slot-1", label: "第1位" },
  { id: "slot-2", label: "第2位" },
];
const TITLES: Record<string, string> = {
  "song-a": "アイドル",
  "song-b": "ヒロインズ",
};

const base = {
  originalHash: "#__mypick_board_v1=abc",
  slots: SLOTS,
  uiSlots: UI_SLOTS,
  uiContextOptions: [
    { id: "day1", label: "Day 1" },
    { id: "day2", label: "Day 2" },
  ],
  currentPicks: {},
  getSongTitle: (songId: string) => TITLES[songId],
  createPreviewDiff,
};

test("an invalid payload reports whether the version was unsupported", () => {
  assert.deepEqual(
    planBoardShareDialog({
      ...base,
      resolved: { status: "invalid", reason: "unsupported-version" },
    }),
    { kind: "invalid", unsupportedVersion: true },
  );

  assert.deepEqual(
    planBoardShareDialog({
      ...base,
      resolved: { status: "invalid", reason: "invalid-shape" },
    }),
    { kind: "invalid", unsupportedVersion: false },
  );
});

test("a mismatch keeps the payload hash on the sister-site URL", () => {
  const plan = planBoardShareDialog({
    ...base,
    resolved: {
      status: "mismatch",
      canonicalUrl: "https://joy.example.test/live/x/",
      displayName: "≒JOY",
    },
  });

  assert.equal(plan.kind, "mismatch");
  assert.equal(
    plan.kind === "mismatch" ? plan.targetUrl : "",
    "https://joy.example.test/live/x/#__mypick_board_v1=abc",
  );
});

test("buildBoardShareMismatchUrl accepts a hash with or without '#'", () => {
  assert.equal(
    buildBoardShareMismatchUrl("https://a.test/", "#x=1"),
    "https://a.test/#x=1",
  );
  assert.equal(
    buildBoardShareMismatchUrl("https://a.test/", "x=1"),
    "https://a.test/#x=1",
  );
});

test("only changed slots appear, labelled from the localized slots", () => {
  const plan = planBoardShareDialog({
    ...base,
    currentPicks: { "slot-1": "song-a", "slot-2": "song-a" },
    resolved: {
      status: "import",
      picks: { "slot-1": "song-a", "slot-2": "song-b" },
    },
  });

  assert.equal(plan.kind, "import");
  if (plan.kind !== "import") return;
  assert.equal(
    plan.changes.length,
    1,
    "slot-1 is unchanged and must be hidden",
  );
  assert.deepEqual(plan.changes[0], {
    slotId: "slot-2",
    slotLabel: "第2位",
    currentTitle: "アイドル",
    importedTitle: "ヒロインズ",
  });
});

test("a slot missing from the localized set falls back to the raw label", () => {
  const plan = planBoardShareDialog({
    ...base,
    uiSlots: [],
    resolved: { status: "import", picks: { "slot-1": "song-a" } },
  });

  assert.equal(plan.kind === "import" && plan.changes[0].slotLabel, "#1");
});

test("an unknown song id yields no title rather than throwing", () => {
  const plan = planBoardShareDialog({
    ...base,
    resolved: { status: "import", picks: { "slot-1": "song-missing" } },
  });

  assert.equal(
    plan.kind === "import" && plan.changes[0].importedTitle,
    undefined,
  );
});

test("the context label appears only when the import changes context", () => {
  const changing = planBoardShareDialog({
    ...base,
    effectiveContextId: "day1",
    resolved: { status: "import", contextId: "day2", picks: {} },
  });
  assert.equal(changing.kind === "import" && changing.contextLabel, "Day 2");

  const same = planBoardShareDialog({
    ...base,
    effectiveContextId: "day2",
    resolved: { status: "import", contextId: "day2", picks: {} },
  });
  assert.equal(same.kind === "import" && same.contextLabel, undefined);
});

test("clearing a slot is reported as a change with no imported title", () => {
  const plan = planBoardShareDialog({
    ...base,
    currentPicks: { "slot-1": "song-a" },
    resolved: { status: "import", picks: {} },
  });

  assert.equal(plan.kind, "import");
  if (plan.kind !== "import") return;
  assert.deepEqual(plan.changes, [
    {
      slotId: "slot-1",
      slotLabel: "第1位",
      currentTitle: "アイドル",
      importedTitle: undefined,
    },
  ]);
});
