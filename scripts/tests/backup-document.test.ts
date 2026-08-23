import assert from "node:assert/strict";
import test from "node:test";
import { getProjectBackupConfig } from "../../src/config/project";
import { LOCALE_STORAGE_KEY } from "../../src/i18n/locales";
import { PROJECT_IDS, type ProjectId } from "../../src/schema/project";
import {
  BACKUP_FORMAT,
  BACKUP_MAX_DOCUMENT_CHARACTERS,
  BACKUP_MAX_ENTRIES,
  BACKUP_VERSION,
  BackupDocumentError,
  createBackupDocument,
  parseBackupDocument,
  planBackupRestore,
  type BackupDocument,
  type BackupFailureCode,
} from "../../src/utils/backupDocument";
import { applyBackupRestoreTransaction } from "../../src/utils/boardTransaction";

const EXPORTED_AT = "2026-08-24T01:02:03.456Z";

class MemoryStorage {
  protected readonly data = new Map<string, string>();
  writes = 0;

  constructor(entries: Record<string, string> = {}) {
    Object.entries(entries).forEach(([key, value]) =>
      this.data.set(key, value),
    );
  }

  get length() {
    return this.data.size;
  }

  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.writes += 1;
    this.data.delete(key);
  }

  keys() {
    return [...this.data.keys()];
  }

  snapshot() {
    return Object.fromEntries(
      [...this.data.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }
}

class FailAfterMutationStorage extends MemoryStorage {
  constructor(
    entries: Record<string, string>,
    private readonly failOnWrite: number,
  ) {
    super(entries);
  }

  override setItem(key: string, value: string) {
    super.setItem(key, value);
    if (this.writes === this.failOnWrite) {
      throw new Error("simulated quota failure after mutation");
    }
  }
}

function makeSnapshot(
  projectId: ProjectId,
  id: string,
  name: string,
  songId = `${id}-song`,
) {
  return {
    id,
    name,
    createdAt: EXPORTED_AT,
    updatedAt: EXPORTED_AT,
    projectId,
    experienceId: "standard",
    contextId: null,
    picks: { "slot-1": songId },
  };
}

function validEntries(projectId: ProjectId) {
  const { storagePrefix } = getProjectBackupConfig(projectId);
  return {
    [`${storagePrefix}_mypicks_v1`]: '{\n  "slot-1": "song-愛"\n}',
    [`${storagePrefix}_mypicks_v2`]: JSON.stringify({
      schemaVersion: 2,
      picks: { "slot-1": "song-愛", "slot-2": "song-b" },
    }),
    [`${storagePrefix}_options_v1`]: JSON.stringify({
      showTitles: true,
      transparentBg: false,
      showQrCode: true,
    }),
    [`${storagePrefix}_options_v2`]: JSON.stringify({
      version: 2,
      showTitles: false,
      transparentBg: true,
      showQrCode: false,
      templateId: "spotlight",
      sizePresetId: "square",
    }),
    [`${storagePrefix}_theme_preference_v1`]: "dark",
    [`${storagePrefix}_board_library_v1`]: JSON.stringify({
      schemaVersion: 1,
      snapshots: [
        makeSnapshot(projectId, "board-a", "A board"),
        makeSnapshot(projectId, "board-b", "B board"),
      ],
    }),
    [`${storagePrefix}_song_discovery_v1`]: JSON.stringify({
      version: 1,
      favoriteSongIds: ["song-愛"],
      recentSongIds: ["song-b"],
    }),
    [`${storagePrefix}_song_discovery_v2`]: JSON.stringify({
      version: 2,
      favoriteSongIds: ["song-愛"],
      recentSongIds: ["song-b"],
      seenSongIds: ["song-愛", "song-b"],
    }),
    [`${storagePrefix}_standard_pick_assistant_v1`]: JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      updatedAt: 1_700_000_000_000,
      mutationId: "legacy-mutation",
      shortlistIds: ["song-愛", "song-b"],
      session: {
        candidateIds: ["song-愛", "song-b"],
        decisions: [],
      },
    }),
    [`${storagePrefix}_standard_pick_assistant_v2`]: JSON.stringify({
      schemaVersion: 2,
      revision: 2,
      updatedAt: 1_700_000_000_001,
      mutationId: "current-mutation",
      shortlistIds: ["song-愛", "song-b"],
      session: {
        candidateIds: ["song-愛", "song-b"],
        targetCount: 2,
        decisions: [],
      },
    }),
    [`${storagePrefix}_live_kokuritsu_2026_both_picks_v2`]: JSON.stringify({
      schemaVersion: 2,
      picks: { "memory-1": "song-愛" },
    }),
    [`${storagePrefix}_live_kokuritsu_2026_options_v2`]: JSON.stringify({
      schemaVersion: 2,
      showTitles: true,
      transparentBg: false,
      showQrCode: true,
    }),
    [`${storagePrefix}_live_kokuritsu_2026_context_v1`]: "both",
    [LOCALE_STORAGE_KEY]: "ja",
  };
}

function documentWithEntries(
  entries: Record<string, string>,
  projectId: ProjectId = "equal-love",
): BackupDocument {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    projectId,
    exportedAt: EXPORTED_AT,
    entries,
  };
}

function parseDocument(document: unknown, projectId: ProjectId = "equal-love") {
  return parseBackupDocument(JSON.stringify(document), projectId);
}

function assertFailure(
  result:
    | ReturnType<typeof parseBackupDocument>
    | ReturnType<typeof planBackupRestore>,
  code: BackupFailureCode,
) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a backup failure");
  assert.equal(result.error.code, code);
}

test("round-trips every included key byte-for-byte through dry-run and one transaction", () => {
  const projectId = "equal-love";
  const entries = validEntries(projectId);
  const { storagePrefix } = getProjectBackupConfig(projectId);
  const source = new MemoryStorage({
    ...entries,
    unrelated_key: "leave me alone",
    [`${getProjectBackupConfig("not-equal-me").storagePrefix}_mypicks_v1`]:
      '{"slot-1":"other-site"}',
    [`${storagePrefix}_standard_pick_assistant_v2.__mutation__.pending`]:
      '{"version":1}',
  });

  const created = createBackupDocument(
    {
      exportedAt: EXPORTED_AT,
      keys: source.keys(),
      getItem: (key) => source.getItem(key),
    },
    projectId,
  );
  assert.deepEqual(created.entries, entries);

  const parsed = parseBackupDocument(
    `${JSON.stringify(created, null, 2)}\n`,
    projectId,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("valid backup did not parse");

  const destination = new MemoryStorage();
  const plan = planBackupRestore(
    parsed.document,
    { keys: destination.keys(), getItem: (key) => destination.getItem(key) },
    projectId,
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("valid backup did not plan");
  assert.equal(destination.writes, 0, "dry-run must never write");
  assert.deepEqual(plan.summary, {
    add: Object.keys(entries).length,
    overwrite: 0,
    remove: 0,
    skip: 0,
  });
  assert.deepEqual(plan.boardSummary, {
    add: 2,
    overwrite: 0,
    skip: 0,
    remove: 0,
  });
  assert.equal(plan.localeIncluded, true);

  const result = applyBackupRestoreTransaction({ storage: destination, plan });
  assert.equal(result.status, "committed");
  assert.deepEqual(destination.snapshot(), entries);
  for (const [key, rawValue] of Object.entries(entries)) {
    assert.equal(destination.getItem(key), rawValue, key);
  }

  const noChangePlan = planBackupRestore(
    parsed.document,
    { keys: destination.keys(), getItem: (key) => destination.getItem(key) },
    projectId,
  );
  assert.equal(noChangePlan.ok, true);
  if (!noChangePlan.ok) throw new Error("second plan failed");
  assert.equal(noChangePlan.summary.skip, Object.keys(entries).length);
  assert.equal(
    applyBackupRestoreTransaction({ storage: destination, plan: noChangePlan })
      .status,
    "noop",
  );
});

test("full restore removes recognized keys, transient journals, and a missing locale override", () => {
  const { storagePrefix } = getProjectBackupConfig("equal-love");
  const backupEntries = {
    [`${storagePrefix}_mypicks_v1`]: '{"slot-1":"from-backup"}',
  };
  const current = new MemoryStorage({
    [`${storagePrefix}_mypicks_v1`]: '{"slot-1":"old"}',
    [`${storagePrefix}_mypicks_v2`]:
      '{"schemaVersion":2,"picks":{"slot-1":"newer-old"}}',
    [`${storagePrefix}_standard_pick_assistant_v2.__mutation__.pending`]:
      '{"version":1}',
    [LOCALE_STORAGE_KEY]: "en",
    unrelated: "preserved",
  });
  const plan = planBackupRestore(
    documentWithEntries(backupEntries),
    { keys: current.keys(), getItem: (key) => current.getItem(key) },
    "equal-love",
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("restore did not plan");
  assert.deepEqual(plan.summary, { add: 0, overwrite: 1, remove: 3, skip: 0 });
  assert.equal(plan.localeIncluded, false);
  assert.equal(current.writes, 0);

  assert.equal(
    applyBackupRestoreTransaction({ storage: current, plan }).status,
    "committed",
  );
  assert.deepEqual(current.snapshot(), {
    [`${storagePrefix}_mypicks_v1`]: '{"slot-1":"from-backup"}',
    unrelated: "preserved",
  });
});

test("a write that throws after mutating leaves zero partial changes", () => {
  const { storagePrefix } = getProjectBackupConfig("equal-love");
  const before = {
    [`${storagePrefix}_mypicks_v1`]: '{"slot-1":"old-a"}',
    [`${storagePrefix}_options_v1`]:
      '{"showTitles":true,"transparentBg":false}',
  };
  const storage = new FailAfterMutationStorage(before, 2);
  const document = documentWithEntries({
    [`${storagePrefix}_mypicks_v1`]: '{"slot-1":"new-a"}',
    [`${storagePrefix}_options_v1`]:
      '{"showTitles":false,"transparentBg":true}',
  });
  const plan = planBackupRestore(
    document,
    { keys: storage.keys(), getItem: (key) => storage.getItem(key) },
    "equal-love",
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("restore did not plan");

  const result = applyBackupRestoreTransaction({ storage, plan });
  assert.deepEqual(result, { status: "write-failed", rollbackComplete: true });
  assert.deepEqual(storage.snapshot(), before);
});

test("freshness conflicts and read failures happen before the first write", () => {
  const { storagePrefix } = getProjectBackupConfig("equal-love");
  const key = `${storagePrefix}_mypicks_v1`;
  const storage = new MemoryStorage({ [key]: '{"slot-1":"old"}' });
  const plan = planBackupRestore(
    documentWithEntries({ [key]: '{"slot-1":"backup"}' }),
    {
      keys: storage.keys(),
      getItem: (candidate) => storage.getItem(candidate),
    },
    "equal-love",
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("restore did not plan");

  storage.setItem(key, '{"slot-1":"changed-after-review"}');
  storage.writes = 0;
  assert.deepEqual(applyBackupRestoreTransaction({ storage, plan }), {
    status: "conflict",
    key,
  });
  assert.equal(storage.writes, 0);

  const blockedStorage = new MemoryStorage({ [key]: '{"slot-1":"old"}' });
  const blockedPlan = planBackupRestore(
    documentWithEntries({ [key]: '{"slot-1":"backup"}' }),
    {
      keys: blockedStorage.keys(),
      getItem: (candidate) => blockedStorage.getItem(candidate),
    },
    "equal-love",
  );
  assert.equal(blockedPlan.ok, true);
  if (!blockedPlan.ok) throw new Error("restore did not plan");
  const originalGet = blockedStorage.getItem.bind(blockedStorage);
  blockedStorage.getItem = () => {
    throw new Error("storage unavailable");
  };
  assert.deepEqual(
    applyBackupRestoreTransaction({
      storage: blockedStorage,
      plan: blockedPlan,
    }),
    { status: "blocked", key },
  );
  assert.equal(blockedStorage.writes, 0);
  blockedStorage.getItem = originalGet;
});

test("all three project IDs accept only their own storage namespace", () => {
  for (const projectId of PROJECT_IDS) {
    const { storagePrefix } = getProjectBackupConfig(projectId);
    const source = new MemoryStorage({
      [`${storagePrefix}_mypicks_v1`]: '{"slot-1":"song"}',
    });
    const document = createBackupDocument(
      {
        exportedAt: EXPORTED_AT,
        keys: source.keys(),
        getItem: (key) => source.getItem(key),
      },
      projectId,
    );
    assert.equal(parseDocument(document, projectId).ok, true, projectId);
    for (const otherProjectId of PROJECT_IDS) {
      if (otherProjectId === projectId) continue;
      assertFailure(
        parseDocument(document, otherProjectId),
        "project-mismatch",
      );
    }
  }
});

test("rejects the complete document and entry negative matrix", () => {
  const { storagePrefix } = getProjectBackupConfig("equal-love");
  const valid = documentWithEntries({
    [`${storagePrefix}_mypicks_v1`]: '{"slot-1":"song"}',
  });

  assertFailure(parseBackupDocument("{"), "invalid-json");
  assertFailure(
    parseDocument({ ...valid, format: "other" }),
    "unsupported-format",
  );
  assertFailure(parseDocument({ ...valid, version: 2 }), "unsupported-version");
  assertFailure(parseDocument({ ...valid, unknown: true }), "invalid-document");
  assertFailure(
    parseDocument({ ...valid, exportedAt: "yesterday" }),
    "invalid-document",
  );
  assertFailure(parseDocument({ ...valid, entries: [] }), "invalid-entry");
  assertFailure(
    parseDocument({
      ...valid,
      entries: { [`${storagePrefix}_mypicks_v1`]: 7 },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({ ...valid, entries: { other_key: "{}" } }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: {
        [`${getProjectBackupConfig("not-equal-me").storagePrefix}_mypicks_v1`]:
          "{}",
      },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: { [`${storagePrefix}_mypicks_v1`]: '{"slot-1":""}' },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: {
        [`${storagePrefix}_mypicks_v2`]:
          '{"schemaVersion":3,"picks":{"slot-1":"song"}}',
      },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: {
        [`${storagePrefix}_mypicks_v2`]:
          '{"schemaVersion":2,"picks":{},"unknown":true}',
      },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: {
        [`${storagePrefix}_options_v2`]:
          '{"version":3,"showTitles":true,"transparentBg":false,"templateId":"classic","sizePresetId":"portrait"}',
      },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: {
        [`${storagePrefix}_options_v1`]:
          '{"showTitles":true,"transparentBg":false,"unknown":true}',
      },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: {
        [`${storagePrefix}_song_discovery_v2`]:
          '{"version":2,"favoriteSongIds":[],"recentSongIds":[],"seenSongIds":[],"unknown":true}',
      },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: {
        [`${storagePrefix}_standard_pick_assistant_v2`]: JSON.stringify({
          schemaVersion: 3,
          revision: 0,
          updatedAt: 1,
          mutationId: "m",
          shortlistIds: [],
          session: null,
        }),
      },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({ ...valid, entries: { [LOCALE_STORAGE_KEY]: "auto" } }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({
      ...valid,
      entries: { [`${storagePrefix}_live_event_context_v1`]: "has spaces" },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseBackupDocument(" ".repeat(BACKUP_MAX_DOCUMENT_CHARACTERS + 1)),
    "limit-exceeded",
  );

  const tooManyEntries = Object.fromEntries(
    Array.from({ length: BACKUP_MAX_ENTRIES + 1 }, (_, index) => [
      `${storagePrefix}_live_event_${index}_picks_v1`,
      "{}",
    ]),
  );
  assertFailure(
    parseDocument({ ...valid, entries: tooManyEntries }),
    "limit-exceeded",
  );
});

test("rejects board library unknown fields, versions, project forgery, and both capacity limits", () => {
  const { storagePrefix } = getProjectBackupConfig("equal-love");
  const key = `${storagePrefix}_board_library_v1`;
  const withLibrary = (snapshots: unknown[], schemaVersion = 1) =>
    parseDocument(
      documentWithEntries({
        [key]: JSON.stringify({ schemaVersion, snapshots }),
      }),
    );

  assertFailure(withLibrary([], 2), "invalid-entry");
  assertFailure(
    withLibrary([{ ...makeSnapshot("equal-love", "a", "A"), unknown: true }]),
    "invalid-entry",
  );
  assertFailure(
    withLibrary([makeSnapshot("not-equal-me", "a", "A")]),
    "invalid-entry",
  );
  assertFailure(
    withLibrary(
      Array.from({ length: 201 }, (_, index) => ({
        ...makeSnapshot("equal-love", `board-${index}`, `Board ${index}`),
        experienceId: `experience-${index}`,
      })),
    ),
    "invalid-entry",
  );
  assertFailure(
    withLibrary(
      Array.from({ length: 21 }, (_, index) =>
        makeSnapshot("equal-love", `board-${index}`, `Board ${index}`),
      ),
    ),
    "invalid-entry",
  );
});

test("create and plan fail closed on unknown project keys and storage read errors", () => {
  const { storagePrefix } = getProjectBackupConfig("equal-love");
  assert.throws(
    () =>
      createBackupDocument(
        {
          exportedAt: EXPORTED_AT,
          keys: [`${storagePrefix}_future_state_v9`],
          getItem: () => "{}",
        },
        "equal-love",
      ),
    (error) =>
      error instanceof BackupDocumentError && error.code === "invalid-entry",
  );
  assert.throws(
    () =>
      createBackupDocument(
        {
          exportedAt: EXPORTED_AT,
          keys: [`${storagePrefix}_mypicks_v1`],
          getItem: () => {
            throw new Error("denied");
          },
        },
        "equal-love",
      ),
    (error) =>
      error instanceof BackupDocumentError &&
      error.code === "storage-unavailable",
  );

  const plan = planBackupRestore(
    documentWithEntries({}),
    {
      keys: [`${storagePrefix}_future_state_v9`],
      getItem: () => "{}",
    },
    "equal-love",
  );
  assertFailure(plan, "invalid-entry");
});

test("saved-board dry run distinguishes add, overwrite, skip, and removal", () => {
  const { storagePrefix } = getProjectBackupConfig("equal-love");
  const key = `${storagePrefix}_board_library_v1`;
  const unchanged = makeSnapshot("equal-love", "same", "Same");
  const backupLibrary = {
    schemaVersion: 1,
    snapshots: [
      unchanged,
      makeSnapshot("equal-love", "changed", "Changed in backup", "new-song"),
      makeSnapshot("equal-love", "added", "Added"),
    ],
  };
  const currentLibrary = {
    schemaVersion: 1,
    snapshots: [
      unchanged,
      makeSnapshot("equal-love", "changed", "Old name", "old-song"),
      makeSnapshot("equal-love", "removed", "Removed"),
    ],
  };
  const storage = new MemoryStorage({ [key]: JSON.stringify(currentLibrary) });
  const plan = planBackupRestore(
    documentWithEntries({ [key]: JSON.stringify(backupLibrary) }),
    {
      keys: storage.keys(),
      getItem: (candidate) => storage.getItem(candidate),
    },
    "equal-love",
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("board library did not plan");
  assert.deepEqual(plan.boardSummary, {
    add: 1,
    overwrite: 1,
    skip: 1,
    remove: 1,
  });
});
