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

    const value = JSON.parse(serialized) as Record<string, unknown>;
    const favoriteSongIds = readSongIds(
      value.favoriteSongIds ?? value.favorites,
      validSongIds,
    );
    const recentSongIds = readSongIds(
      value.recentSongIds ?? value.recent,
      validSongIds,
    );

    return {
      version: SONG_DISCOVERY_STORAGE_VERSION,
      favoriteSongIds,
      recentSongIds,
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
