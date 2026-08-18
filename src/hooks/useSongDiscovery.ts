"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptySongDiscoveryState,
  loadSongDiscoveryState,
  recordRecentSongId,
  updateStoredSongDiscoveryState,
  type SongDiscoveryState,
} from "../utils/songDiscoveryStorage";
import { shouldResyncStorage } from "../utils/storageSyncPolicy";

/**
 * React wiring for the recently-viewed song list.
 *
 * Parsing, version gating and the read-before-write update all live in
 * `songDiscoveryStorage.ts`. This hook holds the resulting state and keeps it
 * in step with other tabs.
 */

export interface UseSongDiscoveryOptions {
  storageKey: string;
  validSongIds: ReadonlySet<string>;
  recentLimit: number;
  /** Loading waits for hydration and never runs inside the export realm. */
  active: boolean;
}

export interface UseSongDiscoveryResult {
  recentSongIds: string[];
  isRecentlyViewed: (songId: string) => boolean;
  /** Returns false when storage refused the write, so the caller can report it. */
  recordRecentlyViewed: (songId: string) => boolean;
}

export function useSongDiscovery({
  storageKey,
  validSongIds,
  recentLimit,
  active,
}: UseSongDiscoveryOptions): UseSongDiscoveryResult {
  const [state, setState] = useState<SongDiscoveryState>(
    createEmptySongDiscoveryState,
  );

  useEffect(() => {
    if (!active) return;

    const sync = () =>
      setState(loadSongDiscoveryState(storageKey, validSongIds));
    const handleStorage = (event: StorageEvent) => {
      if (
        shouldResyncStorage(event, {
          storage: localStorage,
          watchedKey: storageKey,
        })
      ) {
        sync();
      }
    };

    sync();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [active, storageKey, validSongIds]);

  const recordRecentlyViewed = useCallback(
    (songId: string) => {
      const result = updateStoredSongDiscoveryState(
        storageKey,
        validSongIds,
        (current) => recordRecentSongId(current, songId, recentLimit),
      );
      if (!result.ok) return false;

      setState(result.state);
      return true;
    },
    [recentLimit, storageKey, validSongIds],
  );

  // Search results test this per row, so keep a set rather than scanning the
  // array once per song.
  const recentSongIdSet = useMemo(
    () => new Set(state.recentSongIds),
    [state.recentSongIds],
  );
  const isRecentlyViewed = useCallback(
    (songId: string) => recentSongIdSet.has(songId),
    [recentSongIdSet],
  );

  return {
    recentSongIds: state.recentSongIds,
    isRecentlyViewed,
    recordRecentlyViewed,
  };
}
