"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StoredPicks } from "../schema/music";
import {
  addBoardSnapshot,
  createEmptyBoardLibrary,
  deleteBoardSnapshot,
  getSnapshotsForScope,
  loadBoardLibrary,
  mutateStoredBoardLibrary,
  renameBoardSnapshot,
  type BoardLibraryDocument,
  type BoardLibraryError,
  type BoardLibraryMutationResult,
  type BoardScope,
  type BoardSnapshot,
  type StorageLoadStatus,
} from "../utils/boardStorage";
import { shouldResyncStorage } from "../utils/storageSyncPolicy";

/**
 * React wiring for the named-board library.
 *
 * Every decision lives in `boardStorage.ts` — snapshot validation, scope and
 * name uniqueness, capacity, and the read-before-write mutation. This hook only
 * holds the state those functions produce and keeps it in step with other tabs.
 */

export type BoardLibraryActionResult =
  | { ok: true; name: string }
  | { ok: false; error: BoardLibraryError | "storage" };

export interface UseBoardLibraryOptions {
  storageKey: string;
  projectId: string;
  scope: BoardScope;
  /** Narrows stored picks to what the current experience and context accept. */
  sanitizePicks: (picks: StoredPicks) => StoredPicks;
  /** Loading waits for hydration and never runs inside the export realm. */
  active: boolean;
}

export interface UseBoardLibraryResult {
  snapshots: BoardSnapshot[];
  writable: boolean;
  saveBoard: (name: string, picks: StoredPicks) => BoardLibraryActionResult;
  renameBoard: (snapshotId: string, name: string) => BoardLibraryActionResult;
  deleteBoard: (snapshotId: string) => BoardLibraryActionResult;
}

export function useBoardLibrary({
  storageKey,
  projectId,
  scope,
  sanitizePicks,
  active,
}: UseBoardLibraryOptions): UseBoardLibraryResult {
  const [document, setDocument] = useState<BoardLibraryDocument>(() =>
    createEmptyBoardLibrary(),
  );
  const [status, setStatus] = useState<StorageLoadStatus>("empty");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active) return;

    const sync = () => {
      const result = loadBoardLibrary(localStorage, storageKey, projectId);
      setDocument(result.document);
      setStatus(result.status);
      setLoaded(true);
    };
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
  }, [active, projectId, storageKey]);

  const snapshots = useMemo(
    () => getSnapshotsForScope(document, scope, sanitizePicks),
    [document, scope, sanitizePicks],
  );

  // A library that failed to load must not be written back; doing so would
  // overwrite a document this tab could not parse.
  const writable = loaded && (status === "empty" || status === "loaded");

  /** Shared shape of save/rename/delete: guard, mutate storage, adopt result. */
  const applyMutation = useCallback(
    (
      mutate: (current: BoardLibraryDocument) => BoardLibraryMutationResult,
    ): BoardLibraryActionResult => {
      if (!writable) return { ok: false, error: "storage" };

      const result = mutateStoredBoardLibrary(
        localStorage,
        storageKey,
        projectId,
        mutate,
      );
      if (!result.ok) return result;

      setDocument(result.document);
      setStatus("loaded");
      return { ok: true, name: result.snapshot.name };
    },
    [projectId, storageKey, writable],
  );

  const saveBoard = useCallback(
    (name: string, picks: StoredPicks) =>
      applyMutation((current) =>
        addBoardSnapshot(current, {
          id: window.crypto.randomUUID(),
          name,
          now: new Date().toISOString(),
          scope,
          picks: sanitizePicks(picks),
        }),
      ),
    [applyMutation, sanitizePicks, scope],
  );

  const renameBoard = useCallback(
    (snapshotId: string, name: string) =>
      applyMutation((current) =>
        renameBoardSnapshot(current, {
          snapshotId,
          name,
          now: new Date().toISOString(),
        }),
      ),
    [applyMutation],
  );

  const deleteBoard = useCallback(
    (snapshotId: string) =>
      applyMutation((current) => deleteBoardSnapshot(current, snapshotId)),
    [applyMutation],
  );

  return { snapshots, writable, saveBoard, renameBoard, deleteBoard };
}
