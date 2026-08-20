export interface LegacySongDiscoveryState {
  version: 1;
  favoriteSongIds: string[];
  recentSongIds: string[];
}

export interface SongDiscoveryState {
  version: 2;
  favoriteSongIds: string[];
  recentSongIds: string[];
  seenSongIds: string[];
}

export const SONG_DISCOVERY_STORAGE_VERSION = 2 as const;
const LEGACY_SONG_DISCOVERY_STORAGE_VERSION = 1 as const;

type SongDiscoveryStorageFailureReason =
  | "absent"
  | "unsupported-version"
  | "corrupt"
  | "invalid"
  | "read-failed"
  | "write-failed"
  | "conflict";

export type SongDiscoveryStorageReadResult =
  | { kind: "absent" }
  | { kind: "valid"; state: SongDiscoveryState }
  | { kind: "unsupported-version"; version: number }
  | { kind: "corrupt" }
  | { kind: "invalid" }
  | { kind: "read-failed" };

export type LegacySongDiscoveryStorageReadResult =
  | { kind: "absent" }
  | { kind: "valid"; state: LegacySongDiscoveryState }
  | { kind: "unsupported-version"; version: number }
  | { kind: "corrupt" }
  | { kind: "invalid" }
  | { kind: "read-failed" };

export type SongDiscoveryStorageLoadResult =
  | {
      ok: true;
      state: SongDiscoveryState;
      newSongIds: string[];
    }
  | {
      ok: false;
      reason: Exclude<SongDiscoveryStorageFailureReason, "absent" | "conflict">;
      newSongIds: [];
    };

export type SongDiscoveryStorageUpdateResult =
  | { ok: true; state: SongDiscoveryState }
  | {
      ok: false;
      reason: SongDiscoveryStorageFailureReason;
      version?: number;
    };

export function createEmptySongDiscoveryState(): SongDiscoveryState {
  return {
    version: SONG_DISCOVERY_STORAGE_VERSION,
    favoriteSongIds: [],
    recentSongIds: [],
    seenSongIds: [],
  };
}

/**
 * Loads the v2 document, creating it only when the v2 key is absent and the
 * legacy source is absent or exactly valid. First writes always mark the
 * current catalog as seen so no existing catalog is announced as new.
 */
export function loadSongDiscoveryState(
  storageKey: string,
  legacyStorageKey: string,
  catalogSongIds: readonly string[],
): SongDiscoveryStorageLoadResult {
  const current = readSongDiscoveryStorage(storageKey, catalogSongIds);
  if (current.kind === "valid") {
    return createLoadSuccess(current.state, catalogSongIds);
  }
  if (current.kind !== "absent") {
    return { ok: false, reason: toFailureReason(current), newSongIds: [] };
  }

  const legacy = readLegacySongDiscoveryStorage(
    legacyStorageKey,
    catalogSongIds,
  );
  if (legacy.kind !== "absent" && legacy.kind !== "valid") {
    return { ok: false, reason: toFailureReason(legacy), newSongIds: [] };
  }

  const state = createSeededSongDiscoveryState(
    catalogSongIds,
    legacy.kind === "valid" ? legacy.state : undefined,
  );
  if (!writeSongDiscoveryState(storageKey, state, catalogSongIds)) {
    return { ok: false, reason: "write-failed", newSongIds: [] };
  }

  return createLoadSuccess(state, catalogSongIds);
}

/** Reads only the independent v2 key. It never falls back to v1. */
export function readSongDiscoveryStorage(
  storageKey: string,
  catalogSongIds: readonly string[],
): SongDiscoveryStorageReadResult {
  const serialized = readSerializedStorageValue(storageKey);
  if (serialized === undefined) return { kind: "read-failed" };
  if (serialized === null) return { kind: "absent" };

  const value = parseSerializedValue(serialized);
  if (value === undefined) return { kind: "corrupt" };
  if (!isRecord(value)) return { kind: "invalid" };
  if (value.version !== SONG_DISCOVERY_STORAGE_VERSION) {
    return getVersionFailure(value.version);
  }

  const state = parseSongDiscoveryState(value, catalogSongIds);
  return state ? { kind: "valid", state } : { kind: "invalid" };
}

/** Reads the preserved v1 key solely as a one-time migration source. */
export function readLegacySongDiscoveryStorage(
  storageKey: string,
  catalogSongIds: readonly string[],
): LegacySongDiscoveryStorageReadResult {
  const serialized = readSerializedStorageValue(storageKey);
  if (serialized === undefined) return { kind: "read-failed" };
  if (serialized === null) return { kind: "absent" };

  const value = parseSerializedValue(serialized);
  if (value === undefined) return { kind: "corrupt" };
  if (!isRecord(value)) return { kind: "invalid" };
  if (value.version !== LEGACY_SONG_DISCOVERY_STORAGE_VERSION) {
    return getVersionFailure(value.version);
  }

  const state = parseLegacySongDiscoveryState(value, catalogSongIds);
  return state ? { kind: "valid", state } : { kind: "invalid" };
}

/**
 * Updates a valid v2 document from a fresh read. It never creates v2 on this
 * path, which prevents a stale interaction from bypassing initialization.
 */
export function updateStoredSongDiscoveryState(
  storageKey: string,
  catalogSongIds: readonly string[],
  update: (current: SongDiscoveryState) => SongDiscoveryState,
): SongDiscoveryStorageUpdateResult {
  const current = readSongDiscoveryStorage(storageKey, catalogSongIds);
  if (current.kind !== "valid") return createUpdateFailure(current);

  const next = update(current.state);
  return writeSongDiscoveryState(storageKey, next, catalogSongIds)
    ? { ok: true, state: normalizeSongDiscoveryState(next, catalogSongIds) }
    : { ok: false, reason: "write-failed" };
}

/**
 * The only operation that acknowledges a NEW batch. It re-reads v2 and
 * rejects a changed document rather than writing a stale React snapshot.
 */
export function markSongDiscoverySongsSeen(
  storageKey: string,
  catalogSongIds: readonly string[],
  expectedState: SongDiscoveryState,
): SongDiscoveryStorageUpdateResult {
  const current = readSongDiscoveryStorage(storageKey, catalogSongIds);
  if (current.kind !== "valid") return createUpdateFailure(current);
  if (!sameSongDiscoveryState(current.state, expectedState)) {
    return { ok: false, reason: "conflict" };
  }

  const next: SongDiscoveryState = {
    ...current.state,
    seenSongIds: normalizeCatalogSongIds(catalogSongIds),
  };
  return writeSongDiscoveryState(storageKey, next, catalogSongIds)
    ? { ok: true, state: next }
    : { ok: false, reason: "write-failed" };
}

export function getNewSongIds(
  state: SongDiscoveryState,
  catalogSongIds: readonly string[],
) {
  const seenSongIds = new Set(state.seenSongIds);
  return normalizeCatalogSongIds(catalogSongIds).filter(
    (songId) => !seenSongIds.has(songId),
  );
}

export function recordRecentSongId(
  state: SongDiscoveryState,
  songId: string,
  limit: number,
): SongDiscoveryState {
  return {
    ...state,
    recentSongIds: [
      songId,
      ...state.recentSongIds.filter((candidate) => candidate !== songId),
    ].slice(0, limit),
  };
}

function createLoadSuccess(
  state: SongDiscoveryState,
  catalogSongIds: readonly string[],
): SongDiscoveryStorageLoadResult {
  return {
    ok: true,
    state,
    newSongIds: getNewSongIds(state, catalogSongIds),
  };
}

function createSeededSongDiscoveryState(
  catalogSongIds: readonly string[],
  legacyState?: LegacySongDiscoveryState,
): SongDiscoveryState {
  return {
    version: SONG_DISCOVERY_STORAGE_VERSION,
    favoriteSongIds: legacyState?.favoriteSongIds ?? [],
    recentSongIds: legacyState?.recentSongIds ?? [],
    seenSongIds: normalizeCatalogSongIds(catalogSongIds),
  };
}

function writeSongDiscoveryState(
  storageKey: string,
  state: SongDiscoveryState,
  catalogSongIds: readonly string[],
) {
  const normalized = parseSongDiscoveryState(state, catalogSongIds);
  if (!normalized) return false;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return true;
  } catch {
    // Browsing modes and storage quotas can make localStorage unavailable.
    return false;
  }
}

function createUpdateFailure(
  result: Exclude<SongDiscoveryStorageReadResult, { kind: "valid" }>,
): SongDiscoveryStorageUpdateResult {
  const reason = toFailureReason(result);
  return result.kind === "unsupported-version"
    ? { ok: false, reason, version: result.version }
    : { ok: false, reason };
}

function toFailureReason<
  T extends
    | Exclude<SongDiscoveryStorageReadResult, { kind: "valid" }>
    | Exclude<LegacySongDiscoveryStorageReadResult, { kind: "valid" }>,
>(result: T): T["kind"] {
  return result.kind;
}

function parseSongDiscoveryState(
  value: unknown,
  catalogSongIds: readonly string[],
): SongDiscoveryState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "favoriteSongIds",
      "recentSongIds",
      "seenSongIds",
    ]) ||
    value.version !== SONG_DISCOVERY_STORAGE_VERSION ||
    !isStringArray(value.favoriteSongIds) ||
    !isStringArray(value.recentSongIds) ||
    !isStringArray(value.seenSongIds)
  ) {
    return null;
  }

  return {
    version: SONG_DISCOVERY_STORAGE_VERSION,
    favoriteSongIds: filterSongIds(value.favoriteSongIds, catalogSongIds),
    recentSongIds: filterSongIds(value.recentSongIds, catalogSongIds),
    seenSongIds: filterSongIds(value.seenSongIds, catalogSongIds),
  };
}

function parseLegacySongDiscoveryState(
  value: unknown,
  catalogSongIds: readonly string[],
): LegacySongDiscoveryState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["version", "favoriteSongIds", "recentSongIds"]) ||
    value.version !== LEGACY_SONG_DISCOVERY_STORAGE_VERSION ||
    !isStringArray(value.favoriteSongIds) ||
    !isStringArray(value.recentSongIds)
  ) {
    return null;
  }

  return {
    version: LEGACY_SONG_DISCOVERY_STORAGE_VERSION,
    favoriteSongIds: filterSongIds(value.favoriteSongIds, catalogSongIds),
    recentSongIds: filterSongIds(value.recentSongIds, catalogSongIds),
  };
}

function normalizeSongDiscoveryState(
  state: SongDiscoveryState,
  catalogSongIds: readonly string[],
) {
  return parseSongDiscoveryState(state, catalogSongIds) ?? state;
}

function sameSongDiscoveryState(
  left: SongDiscoveryState,
  right: SongDiscoveryState,
) {
  return (
    left.version === right.version &&
    sameStringArray(left.favoriteSongIds, right.favoriteSongIds) &&
    sameStringArray(left.recentSongIds, right.recentSongIds) &&
    sameStringArray(left.seenSongIds, right.seenSongIds)
  );
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function readSerializedStorageValue(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return undefined;
  }
}

function parseSerializedValue(serialized: string): unknown | undefined {
  try {
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

function getVersionFailure(
  version: unknown,
): { kind: "unsupported-version"; version: number } | { kind: "invalid" } {
  return typeof version === "number" && Number.isFinite(version)
    ? { kind: "unsupported-version", version }
    : { kind: "invalid" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function normalizeCatalogSongIds(catalogSongIds: readonly string[]) {
  return Array.from(
    new Set(catalogSongIds.filter((songId) => typeof songId === "string")),
  );
}

function filterSongIds(
  value: readonly string[],
  catalogSongIds: readonly string[],
) {
  const validSongIds = new Set(normalizeCatalogSongIds(catalogSongIds));
  return Array.from(
    new Set(value.filter((songId) => validSongIds.has(songId))),
  );
}
