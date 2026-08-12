export interface SongDiscoveryState {
  version: 1;
  favoriteSongIds: string[];
  recentSongIds: string[];
}

export const SONG_DISCOVERY_STORAGE_VERSION = 1 as const;

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
  try {
    const serialized = window.localStorage.getItem(storageKey);
    if (!serialized) return createEmptySongDiscoveryState();

    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== SONG_DISCOVERY_STORAGE_VERSION) {
      return createEmptySongDiscoveryState();
    }

    return {
      version: SONG_DISCOVERY_STORAGE_VERSION,
      favoriteSongIds: readSongIds(value.favoriteSongIds, validSongIds),
      recentSongIds: readSongIds(value.recentSongIds, validSongIds),
    };
  } catch {
    return createEmptySongDiscoveryState();
  }
}

export function saveSongDiscoveryState(
  storageKey: string,
  state: SongDiscoveryState,
) {
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing && hasUnsupportedStoredVersion(existing)) return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Browsing modes and storage quotas can make localStorage unavailable.
  }
}

export function toggleFavoriteSongId(
  state: SongDiscoveryState,
  songId: string,
): SongDiscoveryState {
  const isFavorite = state.favoriteSongIds.includes(songId);
  return {
    ...state,
    favoriteSongIds: isFavorite
      ? state.favoriteSongIds.filter((candidate) => candidate !== songId)
      : [songId, ...state.favoriteSongIds],
  };
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

function hasUnsupportedStoredVersion(serialized: string) {
  try {
    const value: unknown = JSON.parse(serialized);
    return isRecord(value) && value.version !== SONG_DISCOVERY_STORAGE_VERSION;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSongIds(value: unknown, validSongIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (songId): songId is string =>
          typeof songId === "string" && validSongIds.has(songId),
      ),
    ),
  );
}
