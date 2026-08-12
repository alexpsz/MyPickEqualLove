import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_UNDO_LIMIT,
  boardHistoryReducer,
  commitBoardMutation,
  createBoardHistoryState,
} from "../../src/utils/boardHistory";
import {
  BOARD_NAME_MAX_LENGTH,
  BOARD_SNAPSHOT_LIMIT_PER_SCOPE,
  addBoardSnapshot,
  createEmptyBoardLibrary,
  deleteBoardSnapshot,
  getSnapshotsForScope,
  importStoredBoard,
  loadStoredBoard,
  loadStoredOptions,
  mutateStoredBoardLibrary,
  mutateStoredOptions,
  normalizeBoardName,
  parseBoardLibrary,
  renameBoardSnapshot,
  saveBoardLibrary,
  type BoardScope,
  type MutableStorageLike,
} from "../../src/utils/boardStorage";
import type { StoredPicks } from "../../src/schema/music";

class MemoryStorage implements MutableStorageLike {
  readonly values = new Map<string, string>();
  reads: string[] = [];
  writes: string[] = [];
  throwOnGet = false;
  throwOnSet = false;
  setCalls = 0;
  failOnSetCalls = new Set<number>();

  getItem(key: string) {
    if (this.throwOnGet) throw new Error("storage unavailable");
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.setCalls += 1;
    if (this.failOnSetCalls.has(this.setCalls)) {
      throw new Error("planned write failure");
    }
    if (this.throwOnSet) throw new Error("quota exceeded");
    this.writes.push(key);
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const standardScope: BoardScope = {
  projectId: "equal-love",
  experienceId: "standard",
  contextId: null,
};

const sanitize = (picks: StoredPicks) =>
  Object.fromEntries(
    Object.entries(picks).filter(
      ([slotId, songId]) =>
        ["slot-1", "slot-2"].includes(slotId) &&
        ["song-1", "song-2", "song-3"].includes(songId),
    ),
  );

test("history supports bounded multi-step undo and redo", () => {
  let state = createBoardHistoryState();
  for (let index = 1; index <= BOARD_UNDO_LIMIT + 3; index += 1) {
    state = boardHistoryReducer(state, {
      type: "commit",
      mutation: { kind: "pick", nextPicks: { "slot-1": `song-${index}` } },
    });
  }
  assert.equal(state.past.length, BOARD_UNDO_LIMIT);

  for (let index = 0; index < BOARD_UNDO_LIMIT; index += 1) {
    state = boardHistoryReducer(state, { type: "undo" });
  }
  assert.deepEqual(state.present, { "slot-1": "song-3" });
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, BOARD_UNDO_LIMIT);

  state = boardHistoryReducer(state, { type: "redo" });
  assert.deepEqual(state.present, { "slot-1": "song-4" });
});

test("reset and no-op commits never create history and a new commit clears redo", () => {
  const initial = createBoardHistoryState({ "slot-1": "song-1" });
  assert.equal(
    commitBoardMutation(initial, {
      kind: "sort",
      nextPicks: { "slot-1": "song-1" },
    }),
    initial,
  );

  let state = boardHistoryReducer(initial, {
    type: "commit",
    mutation: { kind: "restore", nextPicks: { "slot-2": "song-2" } },
  });
  state = boardHistoryReducer(state, { type: "undo" });
  assert.equal(state.future.length, 1);
  state = boardHistoryReducer(state, {
    type: "commit",
    mutation: { kind: "clear", nextPicks: {} },
  });
  assert.equal(state.future.length, 0);

  state = boardHistoryReducer(state, {
    type: "reset",
    picks: { "slot-2": "song-2" },
  });
  assert.deepEqual(state, {
    past: [],
    present: { "slot-2": "song-2" },
    future: [],
  });
});

test("legacy board and options migrate without deleting the legacy payload", () => {
  const storage = new MemoryStorage();
  const legacyBoard = JSON.stringify({
    "slot-1": "song-1",
    deleted: "song-2",
  });
  const legacyOptions = JSON.stringify({
    showTitles: false,
    transparentBg: true,
  });
  storage.values.set("picks-v1", legacyBoard);
  storage.values.set("options-v1", legacyOptions);

  const board = loadStoredBoard({
    storage,
    versionedKey: "picks-v2",
    legacyKey: "picks-v1",
    sanitize,
  });
  const options = loadStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
  });

  assert.equal(board.status, "migrated");
  assert.deepEqual(board.picks, { "slot-1": "song-1" });
  assert.equal(options.status, "migrated");
  assert.deepEqual(options.options, {
    showTitles: false,
    transparentBg: true,
    showQrCode: false,
    templateId: "classic",
    sizePresetId: "portrait",
  });
  assert.equal(storage.values.get("picks-v1"), legacyBoard);
  assert.equal(storage.values.get("options-v1"), legacyOptions);
  assert.deepEqual(JSON.parse(storage.values.get("picks-v2") ?? ""), {
    schemaVersion: 2,
    picks: { "slot-1": "song-1" },
  });
  assert.deepEqual(JSON.parse(storage.values.get("options-v2") ?? ""), {
    version: 2,
    showTitles: false,
    transparentBg: true,
    showQrCode: false,
    templateId: "classic",
    sizePresetId: "portrait",
  });
});

test("intermediate options migrate to the canonical export format", () => {
  const storage = new MemoryStorage();
  storage.values.set(
    "options-v2",
    JSON.stringify({
      schemaVersion: 2,
      showTitles: false,
      transparentBg: true,
    }),
  );

  const result = loadStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
  });

  assert.equal(result.status, "migrated");
  assert.deepEqual(result.options, {
    showTitles: false,
    transparentBg: true,
    showQrCode: false,
    templateId: "classic",
    sizePresetId: "portrait",
  });
  assert.deepEqual(JSON.parse(storage.values.get("options-v2") ?? ""), {
    version: 2,
    showTitles: false,
    transparentBg: true,
    showQrCode: false,
    templateId: "classic",
    sizePresetId: "portrait",
  });
});

test("canonical export options load without rewriting storage", () => {
  const storage = new MemoryStorage();
  const serialized = JSON.stringify({
    version: 2,
    showTitles: false,
    transparentBg: true,
    showQrCode: true,
    templateId: "spotlight",
    sizePresetId: "story",
  });
  storage.values.set("options-v2", serialized);

  const result = loadStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
  });

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.options, {
    showTitles: false,
    transparentBg: true,
    showQrCode: true,
    templateId: "spotlight",
    sizePresetId: "story",
  });
  assert.equal(storage.values.get("options-v2"), serialized);
  assert.equal(storage.writes.length, 0);
});

test("stored options mutation starts from canonical defaults when storage is empty", () => {
  const storage = new MemoryStorage();
  const result = mutateStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
    update: (current) => ({ ...current, templateId: "spotlight" }),
  });

  assert.deepEqual(result, {
    ok: true,
    options: {
      showTitles: true,
      transparentBg: false,
      showQrCode: false,
      templateId: "spotlight",
      sizePresetId: "portrait",
    },
  });
  assert.deepEqual(JSON.parse(storage.values.get("options-v2") ?? ""), {
    version: 2,
    showTitles: true,
    transparentBg: false,
    showQrCode: false,
    templateId: "spotlight",
    sizePresetId: "portrait",
  });
});

test("stored options mutation re-reads and preserves sibling fields", () => {
  const storage = new MemoryStorage();
  storage.values.set(
    "options-v2",
    JSON.stringify({
      version: 2,
      showTitles: false,
      transparentBg: false,
      showQrCode: true,
      templateId: "spotlight",
      sizePresetId: "story",
    }),
  );

  const result = mutateStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
    update: (current) => ({ ...current, transparentBg: true }),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.options, {
      showTitles: false,
      transparentBg: true,
      showQrCode: true,
      templateId: "spotlight",
      sizePresetId: "story",
    });
  }
});

test("published canonical v2 without QR migrates to disabled QR", () => {
  const storage = new MemoryStorage();
  storage.values.set(
    "options-v2",
    JSON.stringify({
      version: 2,
      showTitles: false,
      transparentBg: true,
      templateId: "spotlight",
      sizePresetId: "story",
    }),
  );

  const result = loadStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
  });

  assert.equal(result.status, "migrated");
  assert.deepEqual(result.options, {
    showTitles: false,
    transparentBg: true,
    showQrCode: false,
    templateId: "spotlight",
    sizePresetId: "story",
  });
  assert.deepEqual(JSON.parse(storage.values.get("options-v2") ?? ""), {
    version: 2,
    showTitles: false,
    transparentBg: true,
    showQrCode: false,
    templateId: "spotlight",
    sizePresetId: "story",
  });
});

test("stored options mutation fails closed for unsupported data", () => {
  const storage = new MemoryStorage();
  const serialized = JSON.stringify({ version: 99 });
  storage.values.set("options-v2", serialized);

  const result = mutateStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
    update: (current) => ({ ...current, transparentBg: true }),
  });

  assert.deepEqual(result, { ok: false, status: "unsupported" });
  assert.equal(storage.values.get("options-v2"), serialized);
  assert.equal(storage.writes.length, 0);
});

test("stored options fail closed for malformed QR without legacy fallback", () => {
  const storage = new MemoryStorage();
  const serialized = JSON.stringify({
    version: 2,
    showTitles: true,
    transparentBg: false,
    showQrCode: "yes",
    templateId: "classic",
    sizePresetId: "portrait",
  });
  storage.values.set("options-v2", serialized);
  storage.values.set(
    "options-v1",
    JSON.stringify({ showTitles: false, transparentBg: true }),
  );

  const result = mutateStoredOptions({
    storage,
    versionedKey: "options-v2",
    legacyKey: "options-v1",
    update: (current) => ({ ...current, showQrCode: true }),
  });

  assert.deepEqual(result, { ok: false, status: "invalid" });
  assert.equal(storage.values.get("options-v2"), serialized);
  assert.equal(storage.reads.includes("options-v1"), false);
  assert.equal(storage.writes.length, 0);
});

test("unknown or corrupt v2 data fails closed without reading legacy", () => {
  for (const serialized of ["{", JSON.stringify({ schemaVersion: 99 })]) {
    const storage = new MemoryStorage();
    storage.values.set("picks-v2", serialized);
    storage.values.set("picks-v1", JSON.stringify({ "slot-1": "song-1" }));
    const result = loadStoredBoard({
      storage,
      versionedKey: "picks-v2",
      legacyKey: "picks-v1",
      sanitize,
    });
    assert.deepEqual(result.picks, {});
    assert.equal(storage.reads.includes("picks-v1"), false);
    assert.equal(storage.writes.length, 0);
  }
});

test("unknown or corrupt v2 options fail closed without reading legacy", () => {
  for (const serialized of [
    "{",
    JSON.stringify({
      schemaVersion: 99,
      showTitles: true,
      transparentBg: false,
    }),
  ]) {
    const storage = new MemoryStorage();
    storage.values.set("options-v2", serialized);
    storage.values.set(
      "options-v1",
      JSON.stringify({ showTitles: false, transparentBg: true }),
    );
    const result = loadStoredOptions({
      storage,
      versionedKey: "options-v2",
      legacyKey: "options-v1",
    });
    assert.equal(result.options, null);
    assert.equal(storage.reads.includes("options-v1"), false);
    assert.equal(storage.writes.length, 0);
  }
});

test("migration returns in-memory data but reports unavailable when writing fails", () => {
  const storage = new MemoryStorage();
  storage.values.set("picks-v1", JSON.stringify({ "slot-1": "song-1" }));
  storage.throwOnSet = true;
  const result = loadStoredBoard({
    storage,
    versionedKey: "picks-v2",
    legacyKey: "picks-v1",
    sanitize,
  });
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.picks, { "slot-1": "song-1" });
  assert.equal(storage.values.has("picks-v2"), false);
});

test("share import atomically writes a versioned board and context", () => {
  const storage = new MemoryStorage();
  const legacy = JSON.stringify({ "slot-1": "legacy-song" });
  storage.values.set("picks-v1", legacy);
  storage.values.set(
    "picks-v2",
    JSON.stringify({ schemaVersion: 2, picks: { "slot-1": "song-1" } }),
  );
  storage.values.set("context", "day1");

  const result = importStoredBoard({
    storage,
    versionedKey: "picks-v2",
    picks: { "slot-2": "song-2" },
    context: { key: "context", value: "day2" },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(JSON.parse(storage.values.get("picks-v2") ?? ""), {
    schemaVersion: 2,
    picks: { "slot-2": "song-2" },
  });
  assert.equal(storage.values.get("context"), "day2");
  assert.equal(storage.values.get("picks-v1"), legacy);
});

test("share import rolls back the board when the context write fails", () => {
  const storage = new MemoryStorage();
  const previousBoard = JSON.stringify({
    schemaVersion: 2,
    picks: { "slot-1": "song-1" },
  });
  storage.values.set("picks-v2", previousBoard);
  storage.values.set("context", "day1");
  storage.failOnSetCalls.add(2);

  const result = importStoredBoard({
    storage,
    versionedKey: "picks-v2",
    picks: { "slot-2": "song-2" },
    context: { key: "context", value: "day2" },
  });

  assert.deepEqual(result, {
    ok: false,
    error: "storage",
    rollbackComplete: true,
  });
  assert.equal(storage.values.get("picks-v2"), previousBoard);
  assert.equal(storage.values.get("context"), "day1");
});

test("share import reports an incomplete rollback when restoration fails", () => {
  const storage = new MemoryStorage();
  const previousBoard = JSON.stringify({
    schemaVersion: 2,
    picks: { "slot-1": "song-1" },
  });
  storage.values.set("picks-v2", previousBoard);
  storage.values.set("context", "day1");
  storage.failOnSetCalls.add(2);
  storage.failOnSetCalls.add(3);

  const result = importStoredBoard({
    storage,
    versionedKey: "picks-v2",
    picks: { "slot-2": "song-2" },
    context: { key: "context", value: "day2" },
  });

  assert.deepEqual(result, {
    ok: false,
    error: "storage",
    rollbackComplete: false,
  });
});

test("share import refuses corrupt or future versioned board documents", () => {
  for (const value of ["{", JSON.stringify({ schemaVersion: 99, picks: {} })]) {
    const storage = new MemoryStorage();
    storage.values.set("picks-v2", value);
    const result = importStoredBoard({
      storage,
      versionedKey: "picks-v2",
      picks: { "slot-1": "song-1" },
    });
    assert.deepEqual(result, {
      ok: false,
      error: "storage",
      rollbackComplete: true,
    });
    assert.equal(storage.values.get("picks-v2"), value);
    assert.equal(storage.writes.length, 0);
  }
});

test("snapshot names normalize, deduplicate within scope, and remain isolated", () => {
  assert.equal(normalizeBoardName("  Ｆoo　 Bar  "), "Foo Bar");
  let document = createEmptyBoardLibrary();
  const first = addBoardSnapshot(document, {
    id: "one",
    name: "  Ｆoo　 Bar  ",
    now: "2026-08-12T10:00:00.000Z",
    scope: standardScope,
    picks: { "slot-1": "song-1" },
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  document = first.document;

  const duplicate = addBoardSnapshot(document, {
    id: "two",
    name: "foo bar",
    now: "2026-08-12T10:01:00.000Z",
    scope: standardScope,
    picks: { "slot-2": "song-2" },
  });
  assert.deepEqual(duplicate, { ok: false, error: "duplicate-name" });

  const otherContext = addBoardSnapshot(document, {
    id: "two",
    name: "foo bar",
    now: "2026-08-12T10:01:00.000Z",
    scope: {
      ...standardScope,
      experienceId: "kokuritsu_2026",
      contextId: "day1",
    },
    picks: { "slot-2": "song-2" },
  });
  assert.equal(otherContext.ok, true);
  assert.deepEqual(
    getSnapshotsForScope(document, standardScope, sanitize).map(
      (snapshot) => snapshot.name,
    ),
    ["Foo Bar"],
  );
});

test("snapshot validation covers empty, long, duplicate id, capacity, rename, and delete", () => {
  const empty = addBoardSnapshot(createEmptyBoardLibrary(), {
    id: "empty",
    name: " ",
    now: "2026-08-12T10:00:00.000Z",
    scope: standardScope,
    picks: {},
  });
  assert.deepEqual(empty, { ok: false, error: "empty-name" });
  const tooLong = addBoardSnapshot(createEmptyBoardLibrary(), {
    id: "long",
    name: "x".repeat(BOARD_NAME_MAX_LENGTH + 1),
    now: "2026-08-12T10:00:00.000Z",
    scope: standardScope,
    picks: { "slot-1": "song-1" },
  });
  assert.deepEqual(tooLong, { ok: false, error: "name-too-long" });

  let document = createEmptyBoardLibrary();
  for (let index = 0; index < BOARD_SNAPSHOT_LIMIT_PER_SCOPE; index += 1) {
    const result = addBoardSnapshot(document, {
      id: `id-${index}`,
      name: `Board ${index}`,
      now: `2026-08-12T10:${String(index).padStart(2, "0")}:00.000Z`,
      scope: standardScope,
      picks: { "slot-1": "song-1" },
    });
    assert.equal(result.ok, true);
    if (result.ok) document = result.document;
  }
  assert.deepEqual(
    addBoardSnapshot(document, {
      id: "overflow",
      name: "Overflow",
      now: "2026-08-12T11:00:00.000Z",
      scope: standardScope,
      picks: { "slot-1": "song-1" },
    }),
    { ok: false, error: "capacity" },
  );
  assert.deepEqual(
    addBoardSnapshot(document, {
      id: "id-0",
      name: "Fresh name",
      now: "2026-08-12T11:00:00.000Z",
      scope: { ...standardScope, contextId: "other" },
      picks: { "slot-1": "song-1" },
    }),
    { ok: false, error: "duplicate-id" },
  );

  const renamed = renameBoardSnapshot(document, {
    snapshotId: "id-0",
    name: "Renamed",
    now: "2026-08-12T12:00:00.000Z",
  });
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  assert.equal(renamed.snapshot.name, "Renamed");
  assert.equal(renamed.snapshot.createdAt, "2026-08-12T10:00:00.000Z");

  const deleted = deleteBoardSnapshot(renamed.document, "id-0");
  assert.equal(deleted.ok, true);
  if (deleted.ok) assert.equal(deleted.document.snapshots.length, 19);
});

test("library parser rejects corrupt, unsupported, duplicate, and over-capacity documents", () => {
  assert.equal(parseBoardLibrary("{").status, "invalid");
  assert.equal(
    parseBoardLibrary(JSON.stringify({ schemaVersion: 2, snapshots: [] }))
      .status,
    "unsupported",
  );

  const storage = new MemoryStorage();
  let document = createEmptyBoardLibrary();
  const added = addBoardSnapshot(document, {
    id: "one",
    name: "One",
    now: "2026-08-12T10:00:00.000Z",
    scope: standardScope,
    picks: { "slot-1": "song-1" },
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  document = added.document;
  assert.equal(saveBoardLibrary(storage, "library", document), true);
  assert.equal(
    parseBoardLibrary(storage.values.get("library") ?? "").status,
    "loaded",
  );
  assert.equal(
    parseBoardLibrary(storage.values.get("library") ?? "", "not-equal-me")
      .status,
    "invalid",
  );

  const duplicate = { ...document.snapshots[0] };
  assert.equal(
    parseBoardLibrary(
      JSON.stringify({ schemaVersion: 1, snapshots: [duplicate, duplicate] }),
    ).status,
    "invalid",
  );
  assert.equal(
    parseBoardLibrary(
      JSON.stringify({
        schemaVersion: 1,
        snapshots: Array.from({ length: 201 }, (_, index) => ({
          ...duplicate,
          id: `id-${index}`,
          name: `Board ${index}`,
          contextId: `context-${index}`,
        })),
      }),
    ).status,
    "invalid",
  );
});

test("stored library mutations re-read current storage before writing", () => {
  const storage = new MemoryStorage();
  const first = mutateStoredBoardLibrary(
    storage,
    "library",
    standardScope.projectId,
    (document) =>
      addBoardSnapshot(document, {
        id: "one",
        name: "One",
        now: "2026-08-12T10:00:00.000Z",
        scope: standardScope,
        picks: { "slot-1": "song-1" },
      }),
  );
  assert.equal(first.ok, true);

  const staleDocument = createEmptyBoardLibrary();
  const second = mutateStoredBoardLibrary(
    storage,
    "library",
    standardScope.projectId,
    (latestDocument) => {
      assert.notDeepEqual(latestDocument, staleDocument);
      return addBoardSnapshot(latestDocument, {
        id: "two",
        name: "Two",
        now: "2026-08-12T10:01:00.000Z",
        scope: standardScope,
        picks: { "slot-2": "song-2" },
      });
    },
  );
  assert.equal(second.ok, true);
  if (second.ok) {
    assert.deepEqual(
      second.document.snapshots.map(({ id }) => id),
      ["one", "two"],
    );
  }
});

test("stored library mutation fails closed for unsupported or unavailable storage", () => {
  const storage = new MemoryStorage();
  storage.values.set(
    "library",
    JSON.stringify({ schemaVersion: 999, snapshots: [] }),
  );
  const unsupported = mutateStoredBoardLibrary(
    storage,
    "library",
    standardScope.projectId,
    (document) =>
      addBoardSnapshot(document, {
        id: "one",
        name: "One",
        now: "2026-08-12T10:00:00.000Z",
        scope: standardScope,
        picks: { "slot-1": "song-1" },
      }),
  );
  assert.deepEqual(unsupported, { ok: false, error: "storage" });
  assert.equal(storage.writes.length, 0);

  storage.values.delete("library");
  storage.throwOnSet = true;
  const unavailable = mutateStoredBoardLibrary(
    storage,
    "library",
    standardScope.projectId,
    (document) =>
      addBoardSnapshot(document, {
        id: "one",
        name: "One",
        now: "2026-08-12T10:00:00.000Z",
        scope: standardScope,
        picks: { "slot-1": "song-1" },
      }),
  );
  assert.deepEqual(unavailable, { ok: false, error: "storage" });
});
