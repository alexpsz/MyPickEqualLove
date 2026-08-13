export interface SongDiscoveryState {
  version: 1;
  favoriteSongIds: string[];
  recentSongIds: string[];
}

export const SONG_DISCOVERY_STORAGE_VERSION = 1 as const;

export type SongDiscoveryStorageReadResult =
  | { kind: "absent"; state: SongDiscoveryState }
  | { kind: "valid"; state: SongDiscoveryState }
  | { kind: "unsupported-version"; version: number }
  | { kind: "corrupt" }
  | { kind: "invalid" }
  | { kind: "read-failed" };

export type SongDiscoveryStorageUpdateResult =
  | { ok: true; state: SongDiscoveryState }
  | {
      ok: false;
      reason:
        | "unsupported-version"
        | "corrupt"
        | "invalid"
        | "read-failed"
        | "write-failed";
      version?: number;
    };

export function createEmptySongDiscoveryState(): SongDiscoveryState {
  return {
    version: SONG_DISCOVERY_STORAGE_VERSION,
    favoriteSongIds: [],
    recentSongIds: [],
  };
}

export function loadSongDiscoveryState(
  storageKey: string,
  validSongIds: ReadonlySet<string>,
): SongDiscoveryState {
  const result = readSongDiscoveryStorage(storageKey, validSongIds);
  return result.kind === "absent" || result.kind === "valid"
    ? result.state
    : createEmptySongDiscoveryState();
}

export function readSongDiscoveryStorage(
  storageKey: string,
  validSongIds: ReadonlySet<string>,
): SongDiscoveryStorageReadResult {
  let serialized: string | null;
  try {
    serialized = window.localStorage.getItem(storageKey);
  } catch {
    return { kind: "read-failed" };
  }

  if (serialized === null) {
    return { kind: "absent", state: createEmptySongDiscoveryState() };
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { kind: "corrupt" };
  }

  if (!isRecord(value)) return { kind: "invalid" };
  if (value.version !== SONG_DISCOVERY_STORAGE_VERSION) {
    return typeof value.version === "number" && Number.isFinite(value.version)
      ? { kind: "unsupported-version", version: value.version }
      : { kind: "invalid" };
  }
  if (
    !isStringArray(value.favoriteSongIds) ||
    !isStringArray(value.recentSongIds)
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "valid",
    state: {
      version: SONG_DISCOVERY_STORAGE_VERSION,
      favoriteSongIds: filterSongIds(value.favoriteSongIds, validSongIds),
      recentSongIds: filterSongIds(value.recentSongIds, validSongIds),
    },
  };
}

export function saveSongDiscoveryState(
  storageKey: string,
  state: SongDiscoveryState,
) {
  const validSongIds = new Set([
    ...state.favoriteSongIds,
    ...state.recentSongIds,
  ]);
  const current = readSongDiscoveryStorage(storageKey, validSongIds);
  if (current.kind !== "absent" && current.kind !== "valid") {
    return false;
  }
  return writeSongDiscoveryState(storageKey, state);
}

export function updateStoredSongDiscoveryState(
  storageKey: string,
  validSongIds: ReadonlySet<string>,
  update: (current: SongDiscoveryState) => SongDiscoveryState,
): SongDiscoveryStorageUpdateResult {
  const current = readSongDiscoveryStorage(storageKey, validSongIds);
  if (current.kind !== "absent" && current.kind !== "valid") {
    return current.kind === "unsupported-version"
      ? {
          ok: false,
          reason: current.kind,
          version: current.version,
        }
      : { ok: false, reason: current.kind };
  }

  const next = update(current.state);
  return writeSongDiscoveryState(storageKey, next)
    ? { ok: true, state: next }
    : { ok: false, reason: "write-failed" };
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

function writeSongDiscoveryState(
  storageKey: string,
  state: SongDiscoveryState,
) {
  if (
    state.version !== SONG_DISCOVERY_STORAGE_VERSION ||
    !isStringArray(state.favoriteSongIds) ||
    !isStringArray(state.recentSongIds)
  ) {
    return false;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    // Browsing modes and storage quotas can make localStorage unavailable.
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function filterSongIds(
  value: readonly string[],
  validSongIds: ReadonlySet<string>,
) {
  return Array.from(
    new Set(value.filter((songId) => validSongIds.has(songId))),
  );
}
