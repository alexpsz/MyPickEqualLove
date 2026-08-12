import type { StoredPicks } from "../schema/music";

export const CURRENT_BOARD_SCHEMA_VERSION = 2;
export const BOARD_OPTIONS_SCHEMA_VERSION = 2;
export const BOARD_LIBRARY_SCHEMA_VERSION = 1;
export const BOARD_NAME_MAX_LENGTH = 40;
export const BOARD_SNAPSHOT_LIMIT_PER_SCOPE = 20;

const MAX_LIBRARY_ENTRIES = 200;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BoardScope {
  projectId: string;
  experienceId: string;
  contextId: string | null;
}

export interface BoardSnapshot extends BoardScope {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  picks: StoredPicks;
}

export interface BoardLibraryDocument {
  schemaVersion: typeof BOARD_LIBRARY_SCHEMA_VERSION;
  snapshots: BoardSnapshot[];
}

export interface BoardOptions {
  showTitles: boolean;
  transparentBg: boolean;
}

export type StorageLoadStatus =
  | "empty"
  | "loaded"
  | "migrated"
  | "invalid"
  | "unsupported"
  | "unavailable";

export interface StoredBoardLoadResult {
  picks: StoredPicks;
  status: StorageLoadStatus;
}

export interface StoredOptionsLoadResult {
  options: BoardOptions | null;
  status: StorageLoadStatus;
}

export interface BoardLibraryLoadResult {
  document: BoardLibraryDocument;
  status: StorageLoadStatus;
}

export type BoardLibraryError =
  | "empty-name"
  | "name-too-long"
  | "duplicate-name"
  | "duplicate-id"
  | "capacity"
  | "empty-board"
  | "not-found";

export type BoardLibraryMutationResult =
  | { ok: true; document: BoardLibraryDocument; snapshot: BoardSnapshot }
  | { ok: false; error: BoardLibraryError };

export type StoredBoardLibraryMutationResult =
  | BoardLibraryMutationResult
  | { ok: false; error: "storage" };

export function createEmptyBoardLibrary(): BoardLibraryDocument {
  return { schemaVersion: BOARD_LIBRARY_SCHEMA_VERSION, snapshots: [] };
}

export function loadStoredBoard({
  storage,
  versionedKey,
  legacyKey,
  sanitize,
}: {
  storage: StorageLike;
  versionedKey: string;
  legacyKey: string;
  sanitize: (picks: StoredPicks) => StoredPicks;
}): StoredBoardLoadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(versionedKey);
  } catch {
    return { picks: {}, status: "unavailable" };
  }

  if (serialized !== null) {
    return parseVersionedBoard(serialized, sanitize);
  }

  let legacySerialized: string | null;
  try {
    legacySerialized = storage.getItem(legacyKey);
  } catch {
    return { picks: {}, status: "unavailable" };
  }
  if (legacySerialized === null) {
    return { picks: {}, status: "empty" };
  }

  const legacyPicks = parseStoredPicksRecord(legacySerialized);
  if (!legacyPicks) {
    return { picks: {}, status: "invalid" };
  }

  const picks = sanitize(legacyPicks);
  const migrated = saveStoredBoard(storage, versionedKey, picks);
  return { picks, status: migrated ? "migrated" : "unavailable" };
}

export function saveStoredBoard(
  storage: StorageLike,
  versionedKey: string,
  picks: StoredPicks,
) {
  try {
    storage.setItem(
      versionedKey,
      JSON.stringify({
        schemaVersion: CURRENT_BOARD_SCHEMA_VERSION,
        picks,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadStoredOptions({
  storage,
  versionedKey,
  legacyKey,
}: {
  storage: StorageLike;
  versionedKey: string;
  legacyKey: string;
}): StoredOptionsLoadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(versionedKey);
  } catch {
    return { options: null, status: "unavailable" };
  }

  if (serialized !== null) {
    return parseVersionedOptions(serialized);
  }

  let legacySerialized: string | null;
  try {
    legacySerialized = storage.getItem(legacyKey);
  } catch {
    return { options: null, status: "unavailable" };
  }
  if (legacySerialized === null) {
    return { options: null, status: "empty" };
  }

  const options = parseOptionsPayload(legacySerialized, false);
  if (!options) {
    return { options: null, status: "invalid" };
  }

  const migrated = saveStoredOptions(storage, versionedKey, options);
  return { options, status: migrated ? "migrated" : "unavailable" };
}

export function saveStoredOptions(
  storage: StorageLike,
  versionedKey: string,
  options: BoardOptions,
) {
  try {
    storage.setItem(
      versionedKey,
      JSON.stringify({
        schemaVersion: BOARD_OPTIONS_SCHEMA_VERSION,
        ...options,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadBoardLibrary(
  storage: StorageLike,
  storageKey: string,
  expectedProjectId?: string,
): BoardLibraryLoadResult {
  let serialized: string | null;
  try {
    serialized = storage.getItem(storageKey);
  } catch {
    return { document: createEmptyBoardLibrary(), status: "unavailable" };
  }

  if (serialized === null) {
    return { document: createEmptyBoardLibrary(), status: "empty" };
  }
  return parseBoardLibrary(serialized, expectedProjectId);
}

export function parseBoardLibrary(
  serialized: string,
  expectedProjectId?: string,
): BoardLibraryLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return { document: createEmptyBoardLibrary(), status: "invalid" };
  }

  if (!isRecord(parsed)) {
    return { document: createEmptyBoardLibrary(), status: "invalid" };
  }
  if (parsed.schemaVersion !== BOARD_LIBRARY_SCHEMA_VERSION) {
    return { document: createEmptyBoardLibrary(), status: "unsupported" };
  }
  if (!Array.isArray(parsed.snapshots)) {
    return { document: createEmptyBoardLibrary(), status: "invalid" };
  }

  if (parsed.snapshots.length > MAX_LIBRARY_ENTRIES) {
    return { document: createEmptyBoardLibrary(), status: "invalid" };
  }

  const seenIds = new Set<string>();
  const scopeNameKeys = new Set<string>();
  const scopeCounts = new Map<string, number>();
  const snapshots: BoardSnapshot[] = [];
  for (const value of parsed.snapshots) {
    const snapshot = parseBoardSnapshot(value);
    if (
      !snapshot ||
      seenIds.has(snapshot.id) ||
      (expectedProjectId !== undefined &&
        snapshot.projectId !== expectedProjectId)
    ) {
      return { document: createEmptyBoardLibrary(), status: "invalid" };
    }
    const scopeKey = getBoardScopeKey(snapshot);
    const scopeNameKey = `${scopeKey}\u0000${snapshot.name.toLocaleLowerCase("en-US")}`;
    const nextScopeCount = (scopeCounts.get(scopeKey) ?? 0) + 1;
    if (
      scopeNameKeys.has(scopeNameKey) ||
      nextScopeCount > BOARD_SNAPSHOT_LIMIT_PER_SCOPE
    ) {
      return { document: createEmptyBoardLibrary(), status: "invalid" };
    }
    seenIds.add(snapshot.id);
    scopeNameKeys.add(scopeNameKey);
    scopeCounts.set(scopeKey, nextScopeCount);
    snapshots.push(snapshot);
  }

  return {
    document: { schemaVersion: BOARD_LIBRARY_SCHEMA_VERSION, snapshots },
    status: "loaded",
  };
}

export function saveBoardLibrary(
  storage: StorageLike,
  storageKey: string,
  document: BoardLibraryDocument,
) {
  try {
    storage.setItem(storageKey, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}

export function mutateStoredBoardLibrary(
  storage: StorageLike,
  storageKey: string,
  expectedProjectId: string,
  mutate: (document: BoardLibraryDocument) => BoardLibraryMutationResult,
): StoredBoardLibraryMutationResult {
  const latest = loadBoardLibrary(storage, storageKey, expectedProjectId);
  if (latest.status !== "empty" && latest.status !== "loaded") {
    return { ok: false, error: "storage" };
  }

  const result = mutate(latest.document);
  if (!result.ok) return result;
  if (!saveBoardLibrary(storage, storageKey, result.document)) {
    return { ok: false, error: "storage" };
  }

  return result;
}

export function getSnapshotsForScope(
  document: BoardLibraryDocument,
  scope: BoardScope,
  sanitize: (picks: StoredPicks) => StoredPicks,
) {
  return document.snapshots
    .filter((snapshot) => sameBoardScope(snapshot, scope))
    .map((snapshot) => ({ ...snapshot, picks: sanitize(snapshot.picks) }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function addBoardSnapshot(
  document: BoardLibraryDocument,
  input: {
    id: string;
    name: string;
    now: string;
    scope: BoardScope;
    picks: StoredPicks;
  },
  limit = BOARD_SNAPSHOT_LIMIT_PER_SCOPE,
): BoardLibraryMutationResult {
  const normalizedName = normalizeBoardName(input.name);
  const nameError = validateBoardName(normalizedName);
  if (nameError) return { ok: false, error: nameError };
  if (Object.keys(input.picks).length === 0) {
    return { ok: false, error: "empty-board" };
  }
  if (document.snapshots.some((snapshot) => snapshot.id === input.id)) {
    return { ok: false, error: "duplicate-id" };
  }
  if (document.snapshots.length >= MAX_LIBRARY_ENTRIES) {
    return { ok: false, error: "capacity" };
  }

  const scopedSnapshots = document.snapshots.filter((snapshot) =>
    sameBoardScope(snapshot, input.scope),
  );
  if (scopedSnapshots.length >= Math.max(1, Math.floor(limit))) {
    return { ok: false, error: "capacity" };
  }
  if (
    scopedSnapshots.some((snapshot) =>
      sameBoardName(snapshot.name, normalizedName),
    )
  ) {
    return { ok: false, error: "duplicate-name" };
  }

  const snapshot: BoardSnapshot = {
    id: input.id,
    name: normalizedName,
    createdAt: input.now,
    updatedAt: input.now,
    ...input.scope,
    picks: { ...input.picks },
  };

  return {
    ok: true,
    snapshot,
    document: {
      schemaVersion: BOARD_LIBRARY_SCHEMA_VERSION,
      snapshots: [...document.snapshots, snapshot],
    },
  };
}

export function renameBoardSnapshot(
  document: BoardLibraryDocument,
  input: {
    snapshotId: string;
    name: string;
    now: string;
  },
): BoardLibraryMutationResult {
  const target = document.snapshots.find(
    (snapshot) => snapshot.id === input.snapshotId,
  );
  if (!target) return { ok: false, error: "not-found" };

  const normalizedName = normalizeBoardName(input.name);
  const nameError = validateBoardName(normalizedName);
  if (nameError) return { ok: false, error: nameError };
  if (
    document.snapshots.some(
      (snapshot) =>
        snapshot.id !== target.id &&
        sameBoardScope(snapshot, target) &&
        sameBoardName(snapshot.name, normalizedName),
    )
  ) {
    return { ok: false, error: "duplicate-name" };
  }

  const snapshot = {
    ...target,
    name: normalizedName,
    updatedAt: input.now,
  };
  return {
    ok: true,
    snapshot,
    document: {
      schemaVersion: BOARD_LIBRARY_SCHEMA_VERSION,
      snapshots: document.snapshots.map((candidate) =>
        candidate.id === target.id ? snapshot : candidate,
      ),
    },
  };
}

export function deleteBoardSnapshot(
  document: BoardLibraryDocument,
  snapshotId: string,
): BoardLibraryMutationResult {
  const snapshot = document.snapshots.find(
    (candidate) => candidate.id === snapshotId,
  );
  if (!snapshot) return { ok: false, error: "not-found" };

  return {
    ok: true,
    snapshot,
    document: {
      schemaVersion: BOARD_LIBRARY_SCHEMA_VERSION,
      snapshots: document.snapshots.filter(
        (candidate) => candidate.id !== snapshotId,
      ),
    },
  };
}

export function normalizeBoardName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function sameBoardScope(left: BoardScope, right: BoardScope) {
  return (
    left.projectId === right.projectId &&
    left.experienceId === right.experienceId &&
    left.contextId === right.contextId
  );
}

export function getBoardScopeKey(scope: BoardScope) {
  return `${scope.projectId}\u0000${scope.experienceId}\u0000${scope.contextId ?? ""}`;
}

function parseVersionedBoard(
  serialized: string,
  sanitize: (picks: StoredPicks) => StoredPicks,
): StoredBoardLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return { picks: {}, status: "invalid" };
  }
  if (!isRecord(parsed)) return { picks: {}, status: "invalid" };
  if (parsed.schemaVersion !== CURRENT_BOARD_SCHEMA_VERSION) {
    return { picks: {}, status: "unsupported" };
  }

  const picks = parseStoredPicksValue(parsed.picks);
  if (!picks) return { picks: {}, status: "invalid" };
  return { picks: sanitize(picks), status: "loaded" };
}

function parseVersionedOptions(serialized: string): StoredOptionsLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return { options: null, status: "invalid" };
  }
  if (!isRecord(parsed)) return { options: null, status: "invalid" };
  if (parsed.schemaVersion !== BOARD_OPTIONS_SCHEMA_VERSION) {
    return { options: null, status: "unsupported" };
  }

  const options = parseOptionsValue(parsed);
  return {
    options,
    status: options ? "loaded" : "invalid",
  };
}

function parseOptionsPayload(serialized: string, versioned: boolean) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (versioned && parsed.schemaVersion !== BOARD_OPTIONS_SCHEMA_VERSION) {
    return null;
  }
  return parseOptionsValue(parsed);
}

function parseOptionsValue(
  value: Record<string, unknown>,
): BoardOptions | null {
  const showTitles = value.showTitles;
  const transparentBg = value.transparentBg;
  if (typeof showTitles !== "boolean" || typeof transparentBg !== "boolean") {
    return null;
  }
  return { showTitles, transparentBg };
}

function parseStoredPicksRecord(serialized: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
  return parseStoredPicksValue(parsed);
}

function parseStoredPicksValue(value: unknown): StoredPicks | null {
  if (!isRecord(value)) return null;
  const picks: StoredPicks = {};
  for (const [slotId, songId] of Object.entries(value)) {
    if (slotId.length > 0 && typeof songId === "string" && songId.length > 0) {
      picks[slotId] = songId;
    }
  }
  return picks;
}

function parseBoardSnapshot(value: unknown): BoardSnapshot | null {
  if (!isRecord(value)) return null;
  const { id, name, createdAt, updatedAt, projectId, experienceId, contextId } =
    value;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof name !== "string" ||
    validateBoardName(normalizeBoardName(name)) ||
    name !== normalizeBoardName(name) ||
    typeof createdAt !== "string" ||
    !isIsoTimestamp(createdAt) ||
    typeof updatedAt !== "string" ||
    !isIsoTimestamp(updatedAt) ||
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    typeof experienceId !== "string" ||
    experienceId.length === 0 ||
    (contextId !== null && typeof contextId !== "string")
  ) {
    return null;
  }

  const picks = parseStoredPicksValue(value.picks);
  if (!picks || Object.keys(picks).length === 0) return null;
  return {
    id,
    name,
    createdAt,
    updatedAt,
    projectId,
    experienceId,
    contextId,
    picks,
  };
}

function validateBoardName(name: string): BoardLibraryError | null {
  if (name.length === 0) return "empty-name";
  if (name.length > BOARD_NAME_MAX_LENGTH) return "name-too-long";
  return null;
}

function sameBoardName(left: string, right: string) {
  return left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US");
}

function isIsoTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
