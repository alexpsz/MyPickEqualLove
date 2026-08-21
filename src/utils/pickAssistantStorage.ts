import {
  createPickAssistantSnapshot,
  parsePickAssistantSnapshot,
  samePickAssistantSnapshots,
  type PickAssistantSnapshot,
  type PickAssistantSnapshotResult,
} from "./pickAssistant";

export interface PickAssistantStorageOptions {
  schemaVersion: number;
  expiresAfterMs: number;
  maximumCandidates: number;
  validSongIds: ReadonlySet<string>;
  now?: number;
}

export type PickAssistantWriteResult =
  | { status: "saved" }
  | { status: "blocked"; reason: "corrupt" | "future" | "expired" }
  | { status: "conflict" }
  | { status: "unavailable" };

export type PickAssistantResetResult = "reset" | "conflict" | "unavailable";

interface LockManagerLike {
  request<T>(name: string, callback: () => T | PromiseLike<T>): Promise<T>;
}

type JournalStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
type AssistantStorage = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem" | "key" | "length">>;
type AssistantResetStorage = Pick<Storage, "getItem" | "removeItem"> &
  Partial<Pick<Storage, "setItem" | "key" | "length">>;

interface JournalEntry {
  version: 1;
  operation: "save" | "reset";
  expectedRaw: string | null;
  mutationId: string;
  createdAt: number;
}

const JOURNAL_TTL_MS = 60_000;

export function loadPickAssistantSnapshot(
  storage: Pick<Storage, "getItem">,
  key: string,
  options: PickAssistantStorageOptions,
): PickAssistantSnapshotResult {
  try {
    return parsePickAssistantSnapshot(storage.getItem(key), {
      ...options,
      now: options.now ?? Date.now(),
    });
  } catch {
    return { status: "corrupt" };
  }
}

export function savePickAssistantSnapshot(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  expected: PickAssistantSnapshot,
  next: PickAssistantSnapshot,
  options: PickAssistantStorageOptions,
): PickAssistantWriteResult {
  let actualResult: PickAssistantSnapshotResult;
  try {
    actualResult = parsePickAssistantSnapshot(storage.getItem(key), {
      ...options,
      now: options.now ?? Date.now(),
    });
  } catch {
    return { status: "unavailable" };
  }

  if (
    actualResult.status === "corrupt" ||
    actualResult.status === "future" ||
    actualResult.status === "expired"
  ) {
    return { status: "blocked", reason: actualResult.status };
  }

  if (actualResult.status === "valid") {
    if (!samePickAssistantSnapshots(actualResult.snapshot, expected)) {
      return { status: "conflict" };
    }
  } else if (!isInitialEmptySnapshot(expected)) {
    return { status: "conflict" };
  }

  try {
    storage.setItem(key, JSON.stringify(next));
    const verified = parsePickAssistantSnapshot(storage.getItem(key), {
      ...options,
      now: options.now ?? Date.now(),
    });
    return verified.status === "valid" &&
      samePickAssistantSnapshots(verified.snapshot, next)
      ? { status: "saved" }
      : { status: "conflict" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function savePickAssistantSnapshotSafely(
  storage: AssistantStorage,
  key: string,
  expected: PickAssistantSnapshot,
  next: PickAssistantSnapshot,
  options: PickAssistantStorageOptions,
  locks?: LockManagerLike,
): Promise<PickAssistantWriteResult> {
  const writeInsideCriticalSection = () =>
    savePickAssistantSnapshot(storage, key, expected, next, options);

  if (locks) {
    try {
      return await locks.request(
        getPickAssistantLockName(key),
        writeInsideCriticalSection,
      );
    } catch {
      return { status: "unavailable" };
    }
  }

  if (!isJournalStorage(storage)) return { status: "unavailable" };

  let expectedRaw: string | null;
  try {
    expectedRaw = storage.getItem(key);
  } catch {
    return { status: "unavailable" };
  }
  return runJournaledMutation(
    storage,
    key,
    "save",
    expectedRaw,
    options.now ?? Date.now(),
    writeInsideCriticalSection,
    () => ({ status: "conflict" }),
    () => ({ status: "unavailable" }),
  );
}

export async function resetPickAssistantStorageSafely(
  storage: AssistantResetStorage,
  key: string,
  locks?: LockManagerLike,
): Promise<PickAssistantResetResult> {
  const resetInsideCriticalSection = (): PickAssistantResetResult => {
    try {
      storage.removeItem(key);
      return storage.getItem(key) === null ? "reset" : "conflict";
    } catch {
      return "unavailable";
    }
  };

  if (locks) {
    try {
      return await locks.request(
        getPickAssistantLockName(key),
        resetInsideCriticalSection,
      );
    } catch {
      return "unavailable";
    }
  }

  if (!isJournalStorage(storage)) return "unavailable";

  let expectedRaw: string | null;
  try {
    expectedRaw = storage.getItem(key);
  } catch {
    return "unavailable";
  }
  return runJournaledMutation(
    storage,
    key,
    "reset",
    expectedRaw,
    Date.now(),
    resetInsideCriticalSection,
    () => "conflict",
    () => "unavailable",
  );
}

function runJournaledMutation<T>(
  storage: JournalStorage,
  key: string,
  operation: JournalEntry["operation"],
  expectedRaw: string | null,
  now: number,
  mutate: () => T,
  conflict: () => T,
  unavailable: () => T,
): T {
  const mutationId = createMutationId();
  const journalKey = `${getJournalPrefix(key)}${mutationId}`;
  const entry: JournalEntry = {
    version: 1,
    operation,
    expectedRaw,
    mutationId,
    createdAt: now,
  };

  try {
    storage.setItem(journalKey, JSON.stringify(entry));
    if (storage.getItem(key) !== expectedRaw) {
      return conflict();
    }

    const siblings = getActiveJournalEntries(storage, key, expectedRaw, now);
    if (
      siblings.length !== 1 ||
      siblings[0].mutationId !== mutationId ||
      storage.getItem(key) !== expectedRaw
    ) {
      return conflict();
    }
    return mutate();
  } catch {
    return unavailable();
  } finally {
    try {
      storage.removeItem(journalKey);
    } catch {
      // A leftover journal entry expires and is removed by a later mutation.
    }
  }
}

function getActiveJournalEntries(
  storage: JournalStorage,
  key: string,
  expectedRaw: string | null,
  now: number,
) {
  const prefix = getJournalPrefix(key);
  const entries: JournalEntry[] = [];
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  );
  for (const candidateKey of keys) {
    if (!candidateKey?.startsWith(prefix)) continue;
    const entry = parseJournalEntry(storage.getItem(candidateKey));
    if (!entry || now - entry.createdAt > JOURNAL_TTL_MS) {
      storage.removeItem(candidateKey);
      continue;
    }
    if (entry.expectedRaw === expectedRaw) entries.push(entry);
  }
  return entries.sort((left, right) =>
    left.mutationId.localeCompare(right.mutationId),
  );
}

function parseJournalEntry(serialized: string | null): JournalEntry | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as Partial<JournalEntry>;
    return value.version === 1 &&
      (value.operation === "save" || value.operation === "reset") &&
      (typeof value.expectedRaw === "string" || value.expectedRaw === null) &&
      typeof value.mutationId === "string" &&
      typeof value.createdAt === "number"
      ? (value as JournalEntry)
      : null;
  } catch {
    return null;
  }
}

function isJournalStorage(
  storage: AssistantStorage | AssistantResetStorage,
): storage is JournalStorage {
  return (
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function" &&
    typeof storage.key === "function" &&
    typeof storage.length === "number"
  );
}

function isInitialEmptySnapshot(snapshot: PickAssistantSnapshot) {
  return (
    snapshot.revision === 0 &&
    snapshot.shortlistIds.length === 0 &&
    snapshot.session === null
  );
}

/**
 * Recovers just the shortlist from a pre-Top-K saved session.
 *
 * The comparisons themselves cannot come across: the tournament now settles
 * only the places the board needs, so an old decision list describes a
 * different set of questions. Dropping them is a migration, not damage, and
 * the caller says so rather than reporting corrupted data. The old key is left
 * untouched so nothing is destroyed on a read path.
 */
export function readLegacyPickAssistantShortlist(
  storage: Pick<Storage, "getItem">,
  key: string,
  options: {
    legacySchemaVersion: number;
    expiresAfterMs: number;
    maximumCandidates: number;
    validSongIds: ReadonlySet<string>;
    now?: number;
  },
): string[] | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (
    !isPlainRecord(value) ||
    value.schemaVersion !== options.legacySchemaVersion ||
    !Number.isFinite(value.updatedAt) ||
    (value.updatedAt as number) <= 0 ||
    !Array.isArray(value.shortlistIds)
  ) {
    return null;
  }

  if (
    (options.now ?? Date.now()) - (value.updatedAt as number) >
    options.expiresAfterMs
  ) {
    return null;
  }

  const shortlistIds: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value.shortlistIds) {
    if (
      typeof candidate !== "string" ||
      !options.validSongIds.has(candidate) ||
      seen.has(candidate)
    ) {
      return null;
    }
    seen.add(candidate);
    shortlistIds.push(candidate);
  }

  return shortlistIds.length > 0 &&
    shortlistIds.length <= options.maximumCandidates
    ? shortlistIds
    : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPickAssistantLockName(key: string) {
  return `mypick-pick-assistant:${key}`;
}

function getJournalPrefix(key: string) {
  return `${key}.__mutation__.`;
}

export function createEmptyPickAssistantSnapshot(
  schemaVersion: number,
  now = Date.now(),
) {
  return createPickAssistantSnapshot(schemaVersion, now, createMutationId());
}

export function createMutationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
