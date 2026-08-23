import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PICK_SLOTS,
  getProjectBackupConfig,
  getProjectExperienceStorageKeys,
  getProjectStorageKeys,
  PICK_ASSISTANT_CONFIG,
} from "../../src/config/project";
import { LOCALE_STORAGE_KEY } from "../../src/i18n/locales";
import {
  getShareValidationProject,
  type ShareValidationExperience,
} from "../../src/projects/shareValidation";
import { PROJECT_IDS, type ProjectId } from "../../src/schema/project";
import {
  BACKUP_FORMAT,
  BACKUP_MAX_DOCUMENT_CHARACTERS,
  BACKUP_MAX_ENTRIES,
  BACKUP_MAX_ENTRY_CHARACTERS,
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
const EXPORTED_AT_MS = Date.parse(EXPORTED_AT);
const ASSISTANT_UPDATED_AT = EXPORTED_AT_MS - 60_000;

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

interface ProjectFixture {
  projectId: ProjectId;
  memberIds: string[];
  songIds: string[];
  standardKeys: ReturnType<typeof getProjectStorageKeys>;
  liveExperienceId: string;
  liveExperience: ShareValidationExperience;
  liveContextId: string;
  liveKeys: ReturnType<typeof getProjectExperienceStorageKeys>;
  liveEligibleSongIds: string[];
  liveIneligibleSongId: string;
}

function getFixture(projectId: ProjectId): ProjectFixture {
  const project = getShareValidationProject(projectId);
  const liveEntry = Object.entries(project.experiences).find(
    ([, experience]) =>
      experience.performances.length > 0 &&
      experience.slots.some(
        (slot) => slot.eligibility === "selected-performance",
      ),
  );
  assert.ok(liveEntry, `${projectId} needs a strict live fixture`);
  const [liveExperienceId, liveExperience] = liveEntry;
  const performance = liveExperience.performances[0];
  assert.ok(performance, `${projectId} needs a real performance`);
  const liveIneligibleSongId = project.songIds.find(
    (songId) => !performance.songIds.includes(songId),
  );
  assert.ok(liveIneligibleSongId, `${projectId} needs an ineligible song`);

  return {
    projectId,
    memberIds: project.memberIds,
    songIds: project.songIds,
    standardKeys: getProjectStorageKeys(projectId),
    liveExperienceId,
    liveExperience,
    liveContextId: performance.id,
    liveKeys: getProjectExperienceStorageKeys(
      projectId,
      liveExperienceId,
      performance.id,
    ),
    liveEligibleSongIds: performance.songIds,
    liveIneligibleSongId,
  };
}

function makeSnapshot(
  fixture: ProjectFixture,
  id: string,
  name: string,
  options: {
    experienceId?: string;
    contextId?: string | null;
    picks?: Record<string, string>;
  } = {},
) {
  return {
    id,
    name,
    createdAt: EXPORTED_AT,
    updatedAt: EXPORTED_AT,
    projectId: fixture.projectId,
    experienceId: options.experienceId ?? "standard",
    contextId: options.contextId ?? null,
    picks:
      options.picks ??
      ({ [DEFAULT_PICK_SLOTS[0].id]: fixture.songIds[0] } as Record<
        string,
        string
      >),
  };
}

function makeAssistant(
  candidateIds: readonly string[],
  schemaVersion: 1 | 2,
  overrides: Record<string, unknown> = {},
) {
  const session =
    schemaVersion === 1
      ? { candidateIds: [...candidateIds], decisions: [] }
      : {
          candidateIds: [...candidateIds],
          targetCount: 2,
          decisions: [],
        };
  return JSON.stringify({
    schemaVersion,
    revision: schemaVersion,
    updatedAt: ASSISTANT_UPDATED_AT,
    mutationId: `mutation-${schemaVersion}`,
    shortlistIds: [...candidateIds],
    session,
    ...overrides,
  });
}

function validEntries(projectId: ProjectId) {
  const fixture = getFixture(projectId);
  const standardSongs = fixture.songIds.slice(0, 3);
  const liveSongs = fixture.liveEligibleSongIds.slice(0, 3);
  assert.equal(standardSongs.length, 3);
  assert.equal(liveSongs.length, 3);
  const liveSlots = fixture.liveExperience.slots.slice(0, 2);
  assert.equal(liveSlots.length, 2);

  return {
    [fixture.standardKeys.picks]:
      `{\n  "${DEFAULT_PICK_SLOTS[0].id}": "${standardSongs[0]}"\n}`,
    [fixture.standardKeys.picksV2]: JSON.stringify({
      schemaVersion: 2,
      picks: {
        [DEFAULT_PICK_SLOTS[0].id]: standardSongs[0],
        [DEFAULT_PICK_SLOTS[1].id]: standardSongs[1],
      },
    }),
    [fixture.standardKeys.options]: JSON.stringify({
      showTitles: true,
      transparentBg: false,
      showQrCode: true,
    }),
    [fixture.standardKeys.optionsV2]: JSON.stringify({
      version: 2,
      showTitles: false,
      transparentBg: true,
      showQrCode: false,
      templateId: "spotlight",
      sizePresetId: "square",
    }),
    [fixture.standardKeys.theme]: "dark",
    [fixture.standardKeys.boardLibrary]: JSON.stringify({
      schemaVersion: 1,
      snapshots: [
        makeSnapshot(fixture, "board-a", "A board"),
        makeSnapshot(fixture, "board-b", "B board"),
      ],
    }),
    [fixture.standardKeys.songDiscovery]: JSON.stringify({
      version: 1,
      favoriteSongIds: [standardSongs[0]],
      recentSongIds: [standardSongs[1]],
    }),
    [fixture.standardKeys.songDiscoveryV2]: JSON.stringify({
      version: 2,
      favoriteSongIds: [standardSongs[0]],
      recentSongIds: [standardSongs[1]],
      seenSongIds: [standardSongs[0], standardSongs[1]],
    }),
    [fixture.standardKeys.onboarding]: JSON.stringify({
      version: 1,
      completed: true,
    }),
    [fixture.standardKeys.installHint]: JSON.stringify({
      schemaVersion: 1,
      hasCompletedPick: true,
      dismissed: false,
    }),
    [fixture.standardKeys.oshimen]: JSON.stringify({
      version: 1,
      projectId,
      memberId: fixture.memberIds[0],
    }),
    [fixture.standardKeys.assistantLegacy]: makeAssistant(standardSongs, 1),
    [fixture.standardKeys.assistant]: makeAssistant(standardSongs, 2),
    [fixture.liveKeys.picks]: JSON.stringify({
      [liveSlots[0].id]: liveSongs[0],
    }),
    [fixture.liveKeys.picksV2]: JSON.stringify({
      schemaVersion: 2,
      picks: {
        [liveSlots[0].id]: liveSongs[0],
        [liveSlots[1].id]: liveSongs[1],
      },
    }),
    [fixture.liveKeys.options]: JSON.stringify({
      showTitles: false,
      transparentBg: false,
    }),
    [fixture.liveKeys.optionsV2]: JSON.stringify({
      version: 2,
      showTitles: true,
      transparentBg: false,
      showQrCode: true,
      templateId: "classic",
      sizePresetId: "portrait",
    }),
    [fixture.liveKeys.assistantLegacy]: makeAssistant(liveSongs, 1),
    [fixture.liveKeys.assistant]: makeAssistant(liveSongs, 2),
    [fixture.liveKeys.context!]: fixture.liveContextId,
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

function currentStorage(storage: MemoryStorage, now = EXPORTED_AT_MS) {
  return {
    now,
    keys: storage.keys(),
    getItem: (key: string) => storage.getItem(key),
  };
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

function assertInvalidEntry(key: string, value: string) {
  assertFailure(
    parseDocument(documentWithEntries({ [key]: value })),
    "invalid-entry",
  );
}

test("round-trips every real Standard and Live key byte-for-byte", () => {
  const projectId = "equal-love";
  const entries = validEntries(projectId);
  const fixture = getFixture(projectId);
  const otherFixture = getFixture("not-equal-me");
  const source = new MemoryStorage({
    ...entries,
    unrelated_key: "leave me alone",
    [otherFixture.standardKeys.picks]: JSON.stringify({
      [DEFAULT_PICK_SLOTS[0].id]: otherFixture.songIds[0],
    }),
    [`${fixture.standardKeys.assistant}.__mutation__.pending`]: '{"version":1}',
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
    currentStorage(destination),
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
    currentStorage(destination),
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

test("full restore removes missing recognized keys, journals, and locale", () => {
  const fixture = getFixture("equal-love");
  const slotId = DEFAULT_PICK_SLOTS[0].id;
  const backupEntries = {
    [fixture.standardKeys.picks]: JSON.stringify({
      [slotId]: fixture.songIds[0],
    }),
  };
  const current = new MemoryStorage({
    [fixture.standardKeys.picks]: JSON.stringify({
      [slotId]: fixture.songIds[1],
    }),
    [fixture.standardKeys.picksV2]: JSON.stringify({
      schemaVersion: 2,
      picks: { [slotId]: fixture.songIds[2] },
    }),
    [`${fixture.standardKeys.assistant}.__mutation__.pending`]: '{"version":1}',
    [LOCALE_STORAGE_KEY]: "en",
    unrelated: "preserved",
  });
  const plan = planBackupRestore(
    documentWithEntries(backupEntries),
    currentStorage(current),
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
    [fixture.standardKeys.picks]: backupEntries[fixture.standardKeys.picks],
    unrelated: "preserved",
  });
});

test("a write that throws after mutating leaves zero partial changes", () => {
  const fixture = getFixture("equal-love");
  const slotId = DEFAULT_PICK_SLOTS[0].id;
  const before = {
    [fixture.standardKeys.picks]: JSON.stringify({
      [slotId]: fixture.songIds[0],
    }),
    [fixture.standardKeys.options]: '{"showTitles":true,"transparentBg":false}',
  };
  const storage = new FailAfterMutationStorage(before, 2);
  const document = documentWithEntries({
    [fixture.standardKeys.picks]: JSON.stringify({
      [slotId]: fixture.songIds[1],
    }),
    [fixture.standardKeys.options]: '{"showTitles":false,"transparentBg":true}',
  });
  const plan = planBackupRestore(
    document,
    currentStorage(storage),
    "equal-love",
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("restore did not plan");

  const result = applyBackupRestoreTransaction({ storage, plan });
  assert.deepEqual(result, { status: "write-failed", rollbackComplete: true });
  assert.deepEqual(storage.snapshot(), before);
});

test("freshness conflicts and read failures happen before the first write", () => {
  const fixture = getFixture("equal-love");
  const key = fixture.standardKeys.picks;
  const slotId = DEFAULT_PICK_SLOTS[0].id;
  const oldValue = JSON.stringify({ [slotId]: fixture.songIds[0] });
  const backupValue = JSON.stringify({ [slotId]: fixture.songIds[1] });
  const storage = new MemoryStorage({ [key]: oldValue });
  const plan = planBackupRestore(
    documentWithEntries({ [key]: backupValue }),
    currentStorage(storage),
    "equal-love",
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error("restore did not plan");

  storage.setItem(key, JSON.stringify({ [slotId]: fixture.songIds[2] }));
  storage.writes = 0;
  assert.deepEqual(applyBackupRestoreTransaction({ storage, plan }), {
    status: "conflict",
    key,
  });
  assert.equal(storage.writes, 0);

  const blockedStorage = new MemoryStorage({ [key]: oldValue });
  const blockedPlan = planBackupRestore(
    documentWithEntries({ [key]: backupValue }),
    currentStorage(blockedStorage),
    "equal-love",
  );
  assert.equal(blockedPlan.ok, true);
  if (!blockedPlan.ok) throw new Error("restore did not plan");
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
});

test("all three projects accept real Standard and Live keys only in their namespace", () => {
  for (const projectId of PROJECT_IDS) {
    const fixture = getFixture(projectId);
    const liveSlot = fixture.liveExperience.slots[0].id;
    const sourceEntries = {
      [fixture.standardKeys.picks]: JSON.stringify({
        [DEFAULT_PICK_SLOTS[0].id]: fixture.songIds[0],
      }),
      [fixture.liveKeys.picksV2]: JSON.stringify({
        schemaVersion: 2,
        picks: { [liveSlot]: fixture.liveEligibleSongIds[0] },
      }),
      [fixture.liveKeys.context!]: fixture.liveContextId,
    };
    const source = new MemoryStorage(sourceEntries);
    const document = createBackupDocument(
      {
        exportedAt: EXPORTED_AT,
        keys: source.keys(),
        getItem: (key) => source.getItem(key),
      },
      projectId,
    );
    assert.deepEqual(document.entries, sourceEntries, projectId);
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

test("rejects the document, version, field, namespace, and size matrix", () => {
  const fixture = getFixture("equal-love");
  const valid = documentWithEntries({
    [fixture.standardKeys.picks]: JSON.stringify({
      [DEFAULT_PICK_SLOTS[0].id]: fixture.songIds[0],
    }),
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
      entries: { [fixture.standardKeys.picks]: 7 },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({ ...valid, entries: { other_key: "{}" } }),
    "invalid-entry",
  );
  const otherFixture = getFixture("not-equal-me");
  assertFailure(
    parseDocument({
      ...valid,
      entries: { [otherFixture.standardKeys.picks]: "{}" },
    }),
    "invalid-entry",
  );
  assertFailure(
    parseDocument({ ...valid, entries: { [LOCALE_STORAGE_KEY]: "auto" } }),
    "invalid-entry",
  );
  assertFailure(
    parseBackupDocument(" ".repeat(BACKUP_MAX_DOCUMENT_CHARACTERS + 1)),
    "limit-exceeded",
  );
  assertFailure(
    parseDocument(
      documentWithEntries({
        [fixture.standardKeys.theme]: "x".repeat(
          BACKUP_MAX_ENTRY_CHARACTERS + 1,
        ),
      }),
    ),
    "limit-exceeded",
  );

  const tooManyEntries = Object.fromEntries(
    Array.from({ length: BACKUP_MAX_ENTRIES + 1 }, (_, index) => [
      `${getProjectBackupConfig("equal-love").storagePrefix}_future_${index}`,
      "{}",
    ]),
  );
  assertFailure(
    parseDocument({ ...valid, entries: tooManyEntries }),
    "limit-exceeded",
  );
});

test("rejects picks that hydration would drop or normalize", () => {
  const fixture = getFixture("equal-love");
  const slots = DEFAULT_PICK_SLOTS;
  assertInvalidEntry(
    fixture.standardKeys.picks,
    JSON.stringify({ unknown_slot: fixture.songIds[0] }),
  );
  assertInvalidEntry(
    fixture.standardKeys.picks,
    JSON.stringify({ [slots[0].id]: "unknown-song" }),
  );
  assertInvalidEntry(
    fixture.standardKeys.picksV2,
    JSON.stringify({
      schemaVersion: 2,
      picks: {
        [slots[0].id]: fixture.songIds[0],
        [slots[1].id]: fixture.songIds[0],
      },
    }),
  );

  const strictSlot = fixture.liveExperience.slots.find(
    (slot) => slot.eligibility === "selected-performance",
  );
  assert.ok(strictSlot);
  assertInvalidEntry(
    fixture.liveKeys.picksV2,
    JSON.stringify({
      schemaVersion: 2,
      picks: { [strictSlot.id]: fixture.liveIneligibleSongId },
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.picksV2,
    JSON.stringify({
      schemaVersion: 3,
      picks: { [slots[0].id]: fixture.songIds[0] },
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.picksV2,
    JSON.stringify({
      schemaVersion: 2,
      picks: {},
      unknown: true,
    }),
  );
});

test("rejects forged Live experience/context keys and false context values", () => {
  const fixture = getFixture("equal-love");
  const prefix = getProjectBackupConfig("equal-love").storagePrefix;
  const slot = fixture.liveExperience.slots[0].id;
  const validPicks = JSON.stringify({
    schemaVersion: 2,
    picks: { [slot]: fixture.liveEligibleSongIds[0] },
  });

  assertInvalidEntry(
    `${prefix}_live_forged_event_${fixture.liveContextId}_picks_v2`,
    validPicks,
  );
  assertInvalidEntry(
    `${prefix}_live_${fixture.liveExperienceId}_forged_context_picks_v2`,
    validPicks,
  );
  assertInvalidEntry(
    getProjectExperienceStorageKeys("equal-love", fixture.liveExperienceId)
      .picksV2,
    validPicks,
  );
  assertInvalidEntry(fixture.liveKeys.context!, "forged-context");
});

test("rejects saved boards whose scope or picks would be sanitized", () => {
  const fixture = getFixture("equal-love");
  const key = fixture.standardKeys.boardLibrary;
  const parseSnapshots = (snapshots: unknown[], schemaVersion = 1) =>
    parseDocument(
      documentWithEntries({
        [key]: JSON.stringify({ schemaVersion, snapshots }),
      }),
    );
  const duplicatePicks = {
    [DEFAULT_PICK_SLOTS[0].id]: fixture.songIds[0],
    [DEFAULT_PICK_SLOTS[1].id]: fixture.songIds[0],
  };
  const strictSlot = fixture.liveExperience.slots.find(
    (slot) => slot.eligibility === "selected-performance",
  );
  assert.ok(strictSlot);

  assertFailure(parseSnapshots([], 2), "invalid-entry");
  assertFailure(
    parseSnapshots([{ ...makeSnapshot(fixture, "a", "A"), unknown: true }]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots([
      { ...makeSnapshot(fixture, "a", "A"), projectId: "not-equal-me" },
    ]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots([
      makeSnapshot(fixture, "a", "A", { experienceId: "forged" }),
    ]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots([
      makeSnapshot(fixture, "a", "A", {
        experienceId: fixture.liveExperienceId,
        contextId: "forged",
      }),
    ]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots([
      makeSnapshot(fixture, "a", "A", {
        picks: { unknown_slot: fixture.songIds[0] },
      }),
    ]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots([
      makeSnapshot(fixture, "a", "A", {
        picks: { [DEFAULT_PICK_SLOTS[0].id]: "unknown-song" },
      }),
    ]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots([
      makeSnapshot(fixture, "a", "A", { picks: duplicatePicks }),
    ]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots([
      makeSnapshot(fixture, "a", "A", {
        experienceId: fixture.liveExperienceId,
        contextId: fixture.liveContextId,
        picks: { [strictSlot.id]: fixture.liveIneligibleSongId },
      }),
    ]),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots(
      Array.from({ length: 201 }, (_, index) =>
        makeSnapshot(fixture, `board-${index}`, `Board ${index}`),
      ),
    ),
    "invalid-entry",
  );
  assertFailure(
    parseSnapshots(
      Array.from({ length: 21 }, (_, index) =>
        makeSnapshot(fixture, `board-${index}`, `Board ${index}`),
      ),
    ),
    "invalid-entry",
  );
});

test("rejects discovery arrays that runtime would filter or deduplicate", () => {
  const fixture = getFixture("equal-love");
  assertInvalidEntry(
    fixture.standardKeys.songDiscovery,
    JSON.stringify({
      version: 1,
      favoriteSongIds: ["unknown-song"],
      recentSongIds: [],
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.songDiscoveryV2,
    JSON.stringify({
      version: 2,
      favoriteSongIds: [fixture.songIds[0], fixture.songIds[0]],
      recentSongIds: [],
      seenSongIds: [],
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.songDiscoveryV2,
    JSON.stringify({
      version: 3,
      favoriteSongIds: [],
      recentSongIds: [],
      seenSongIds: [],
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.songDiscoveryV2,
    JSON.stringify({
      version: 2,
      favoriteSongIds: [],
      recentSongIds: [],
      seenSongIds: [],
      unknown: true,
    }),
  );
});

test("rejects corrupt, ineligible, inconsistent, and expired Assistant state", () => {
  const fixture = getFixture("equal-love");
  const candidates = fixture.songIds.slice(0, 3);
  const liveCandidates = fixture.liveEligibleSongIds.slice(0, 3);

  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant([candidates[0], "unknown-song"], 2),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant(candidates, 2, { schemaVersion: 3 }),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant(candidates, 2, { unknown: true }),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant([candidates[0], candidates[0]], 2),
  );
  assertInvalidEntry(
    fixture.liveKeys.assistant,
    makeAssistant(
      [liveCandidates[0], fixture.liveIneligibleSongId, liveCandidates[1]],
      2,
    ),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant(candidates, 2, {
      session: {
        candidateIds: candidates,
        targetCount: 0,
        decisions: [],
      },
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant(candidates, 2, {
      session: {
        candidateIds: candidates,
        targetCount: 2,
        decisions: [
          {
            leftId: candidates[1],
            rightId: candidates[2],
            outcome: "left",
          },
        ],
      },
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant(candidates, 2, {
      session: {
        candidateIds: candidates,
        targetCount: 2,
        decisions: [],
        activePairKey: JSON.stringify([candidates[1], candidates[2]]),
      },
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistant,
    makeAssistant(candidates, 2, {
      session: {
        candidateIds: [candidates[1], candidates[0], candidates[2]],
        targetCount: 2,
        decisions: [],
      },
    }),
  );
  assertInvalidEntry(
    fixture.standardKeys.assistantLegacy,
    makeAssistant([], 1),
  );

  const expiredAtExport = makeAssistant(candidates, 2, {
    updatedAt: EXPORTED_AT_MS - PICK_ASSISTANT_CONFIG.expiresAfterMs - 1,
  });
  assertInvalidEntry(fixture.standardKeys.assistant, expiredAtExport);

  const document = documentWithEntries({
    [fixture.standardKeys.assistant]: makeAssistant(candidates, 2),
  });
  const parsed = parseDocument(document);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("fresh Assistant backup did not parse");
  const destination = new MemoryStorage();
  const plan = planBackupRestore(
    parsed.document,
    currentStorage(
      destination,
      ASSISTANT_UPDATED_AT + PICK_ASSISTANT_CONFIG.expiresAfterMs + 1,
    ),
  );
  assertFailure(plan, "invalid-entry");
  assert.equal(destination.writes, 0);
});

test("rejects invalid option versions and unknown option fields", () => {
  const fixture = getFixture("equal-love");
  assertInvalidEntry(
    fixture.standardKeys.optionsV2,
    '{"version":3,"showTitles":true,"transparentBg":false,"showQrCode":true,"templateId":"classic","sizePresetId":"portrait"}',
  );
  assertInvalidEntry(
    fixture.standardKeys.options,
    '{"showTitles":true,"transparentBg":false,"unknown":true}',
  );
});

test("validates onboarding, install hint, and oshimen documents exactly", () => {
  const fixture = getFixture("equal-love");
  const [memberId] = fixture.memberIds;
  assert.ok(memberId);

  const validDocuments = {
    [fixture.standardKeys.onboarding]: JSON.stringify({
      version: 1,
      completed: true,
    }),
    [fixture.standardKeys.installHint]: JSON.stringify({
      schemaVersion: 1,
      hasCompletedPick: false,
      dismissed: true,
    }),
    [fixture.standardKeys.oshimen]: JSON.stringify({
      version: 1,
      projectId: fixture.projectId,
      memberId,
    }),
  };
  assert.equal(parseDocument(documentWithEntries(validDocuments)).ok, true);

  for (const rawValue of [
    JSON.stringify({ version: 2, completed: true }),
    JSON.stringify({ version: 1, completed: false }),
    JSON.stringify({ version: 1, completed: true, extra: true }),
  ]) {
    assertInvalidEntry(fixture.standardKeys.onboarding, rawValue);
  }
  for (const rawValue of [
    JSON.stringify({
      schemaVersion: 2,
      hasCompletedPick: false,
      dismissed: false,
    }),
    JSON.stringify({
      schemaVersion: 1,
      hasCompletedPick: "yes",
      dismissed: false,
    }),
    JSON.stringify({
      schemaVersion: 1,
      hasCompletedPick: false,
      dismissed: false,
      extra: true,
    }),
  ]) {
    assertInvalidEntry(fixture.standardKeys.installHint, rawValue);
  }
  for (const rawValue of [
    JSON.stringify({ version: 2, projectId: fixture.projectId, memberId }),
    JSON.stringify({
      version: 1,
      projectId: fixture.projectId,
      memberId,
      extra: true,
    }),
    JSON.stringify({ version: 1, projectId: "not-equal-me", memberId }),
    JSON.stringify({
      version: 1,
      projectId: fixture.projectId,
      memberId: "unknown-member",
    }),
  ]) {
    assertInvalidEntry(fixture.standardKeys.oshimen, rawValue);
  }
});

test("new durable states plan add, overwrite, remove, and skip byte-exactly", () => {
  const fixture = getFixture("equal-love");
  const [memberId] = fixture.memberIds;
  assert.ok(memberId);
  const cases = [
    {
      key: fixture.standardKeys.onboarding,
      current: '{"version":1,"completed":true}',
      backup: '{ "version": 1, "completed": true }',
    },
    {
      key: fixture.standardKeys.installHint,
      current: '{"schemaVersion":1,"hasCompletedPick":false,"dismissed":true}',
      backup: '{"schemaVersion":1,"hasCompletedPick":true,"dismissed":false}',
    },
    {
      key: fixture.standardKeys.oshimen,
      current: JSON.stringify({
        version: 1,
        projectId: fixture.projectId,
        memberId,
      }),
      backup: `{"version":1,"projectId":"${fixture.projectId}","memberId":"${memberId}" }`,
    },
  ];

  for (const { key, current, backup } of cases) {
    for (const [expectedAction, documentEntries, currentEntries] of [
      ["add", { [key]: backup }, {}],
      ["overwrite", { [key]: backup }, { [key]: current }],
      ["remove", {}, { [key]: current }],
      ["skip", { [key]: backup }, { [key]: backup }],
    ] as const) {
      const storage = new MemoryStorage(currentEntries);
      const plan = planBackupRestore(
        documentWithEntries(documentEntries),
        currentStorage(storage),
        fixture.projectId,
      );
      assert.equal(plan.ok, true, `${key}/${expectedAction}`);
      if (!plan.ok) throw new Error("durable-state restore did not plan");
      assert.equal(
        plan.entries.find((entry) => entry.key === key)?.action,
        expectedAction,
        key,
      );
    }
  }
});

test("create and plan fail closed on unknown keys and storage failures", () => {
  const fixture = getFixture("equal-love");
  const prefix = getProjectBackupConfig("equal-love").storagePrefix;
  assert.throws(
    () =>
      createBackupDocument(
        {
          exportedAt: EXPORTED_AT,
          keys: [`${prefix}_future_state_v9`],
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
          keys: [fixture.standardKeys.picks],
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
  assert.throws(
    () =>
      createBackupDocument(
        {
          exportedAt: EXPORTED_AT,
          keys: [fixture.standardKeys.picks],
          getItem: () => JSON.stringify({ unknown_slot: fixture.songIds[0] }),
        },
        "equal-love",
      ),
    (error) =>
      error instanceof BackupDocumentError && error.code === "invalid-entry",
  );

  const empty = new MemoryStorage();
  const plan = planBackupRestore(
    documentWithEntries({}),
    {
      now: EXPORTED_AT_MS,
      keys: [`${prefix}_future_state_v9`],
      getItem: () => "{}",
    },
    "equal-love",
  );
  assertFailure(plan, "invalid-entry");
  assertFailure(
    planBackupRestore(
      documentWithEntries({}),
      { ...currentStorage(empty), now: Number.NaN },
      "equal-love",
    ),
    "storage-unavailable",
  );
});

test("saved-board dry-run distinguishes add, overwrite, skip, and removal", () => {
  const fixture = getFixture("equal-love");
  const key = fixture.standardKeys.boardLibrary;
  const unchanged = makeSnapshot(fixture, "same", "Same");
  const backupLibrary = {
    schemaVersion: 1,
    snapshots: [
      unchanged,
      makeSnapshot(fixture, "changed", "Changed in backup", {
        picks: { [DEFAULT_PICK_SLOTS[0].id]: fixture.songIds[1] },
      }),
      makeSnapshot(fixture, "added", "Added"),
    ],
  };
  const currentLibrary = {
    schemaVersion: 1,
    snapshots: [
      unchanged,
      makeSnapshot(fixture, "changed", "Old name", {
        picks: { [DEFAULT_PICK_SLOTS[0].id]: fixture.songIds[2] },
      }),
      makeSnapshot(fixture, "removed", "Removed"),
    ],
  };
  const storage = new MemoryStorage({ [key]: JSON.stringify(currentLibrary) });
  const plan = planBackupRestore(
    documentWithEntries({ [key]: JSON.stringify(backupLibrary) }),
    currentStorage(storage),
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
