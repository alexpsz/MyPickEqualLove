"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parsePickAssistantSnapshot,
  samePickAssistantSnapshots,
  updatePickAssistantSnapshot,
  type PickAssistantSession,
  type PickAssistantSnapshot,
} from "../utils/pickAssistant";
import {
  createEmptyPickAssistantSnapshot,
  createMutationId,
  loadPickAssistantSnapshot,
  savePickAssistantSnapshotSafely,
} from "../utils/pickAssistantStorage";
import {
  planAssistantSnapshotSync,
  resolveStorageSyncAction,
} from "../utils/storageSyncPolicy";

/**
 * Persistence boundary for the Pick Assistant snapshot.
 *
 * Owns the snapshot, its storage issue, the in-flight write flag and the
 * cross-tab listener. The tournament rules live in `pickAssistant.ts` and the
 * reconciliation rules in `storageSyncPolicy.ts`; this hook only sequences the
 * reads and writes around them.
 *
 * What stays with the caller: the review prompt, the pending apply baseline and
 * any status copy. Those are UI flow, and the hook reports the two moments that
 * drive them through `onReload` and `onExternalChange`.
 */

export type AssistantStorageIssue =
  | "corrupt"
  | "future"
  | "expired"
  | "conflict"
  | "unavailable";

export interface PickAssistantStorageOptions {
  schemaVersion: number;
  expiresAfterMs: number;
  maximumCandidates: number;
  validSongIds: ReadonlySet<string>;
}

export interface UseAssistantSnapshotOptions {
  storageKey: string;
  schemaVersion: number;
  storageOptions: PickAssistantStorageOptions;
  active: boolean;
  /** A fresh load replaced the snapshot; any pending review state is stale. */
  onReload?: () => void;
  /** Another tab changed the document. `flagReview` mirrors the sync policy. */
  onExternalChange?: (change: { flagReview: boolean }) => void;
  /** Whether a result is on screen; decides if an external change prompts review. */
  isResultVisible: () => boolean;
}

export interface UseAssistantSnapshotResult {
  snapshot: PickAssistantSnapshot;
  storageIssue: AssistantStorageIssue | null;
  mutationPending: boolean;
  /** Compare-and-swap write. Resolves false when the write did not land. */
  commit: (
    shortlistIds: string[],
    session: PickAssistantSession | null,
  ) => Promise<boolean>;
  /** Snapshot as of now, for async paths that re-read freshness before acting. */
  getSnapshot: () => PickAssistantSnapshot;
  /** Adopts a snapshot re-read during a freshness check. */
  adopt: (snapshot: PickAssistantSnapshot) => void;
  /** Drops back to an empty snapshot and records why. */
  reset: (issue: AssistantStorageIssue | null) => void;
  /** False once the storage key changed, invalidating an in-flight result. */
  isCurrentKey: (key: string) => boolean;
}

export function useAssistantSnapshot({
  storageKey,
  schemaVersion,
  storageOptions,
  active,
  onReload,
  onExternalChange,
  isResultVisible,
}: UseAssistantSnapshotOptions): UseAssistantSnapshotResult {
  const [snapshot, setSnapshot] = useState<PickAssistantSnapshot>(() =>
    createEmptyPickAssistantSnapshot(schemaVersion),
  );
  const [storageIssue, setStorageIssue] =
    useState<AssistantStorageIssue | null>(null);
  const [mutationPending, setMutationPending] = useState(false);

  // The commit path compares against the snapshot as of the moment it starts,
  // which a state value read inside an async closure cannot provide.
  const snapshotRef = useRef(snapshot);
  const mutationPendingRef = useRef(false);
  // Guards a write whose storage key changed while it was in flight, which
  // happens when the user switches Live context mid-save.
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const callbacksRef = useRef({ onReload, onExternalChange, isResultVisible });
  callbacksRef.current = { onReload, onExternalChange, isResultVisible };

  const adopt = useCallback((next: PickAssistantSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    if (!active) return;

    callbacksRef.current.onReload?.();
    const result = loadPickAssistantSnapshot(
      localStorage,
      storageKey,
      storageOptions,
    );
    if (result.status === "valid") {
      adopt(result.snapshot);
      setStorageIssue(null);
      return;
    }

    adopt(createEmptyPickAssistantSnapshot(schemaVersion));
    setStorageIssue(result.status === "missing" ? null : result.status);
  }, [active, adopt, schemaVersion, storageKey, storageOptions]);

  useEffect(() => {
    if (!active) return;

    const handleStorage = (event: StorageEvent) => {
      const sync = resolveStorageSyncAction(event, {
        storage: localStorage,
        watchedKey: storageKey,
      });
      if (sync.kind === "ignore") return;

      // A cleared area carries no per-key value, so re-read storage instead of
      // trusting the event payload.
      const incoming =
        sync.kind === "apply"
          ? parsePickAssistantSnapshot(sync.value, {
              ...storageOptions,
              now: Date.now(),
            })
          : loadPickAssistantSnapshot(localStorage, storageKey, storageOptions);

      const plan = planAssistantSnapshotSync({
        incoming,
        current: snapshotRef.current,
        resultVisible: callbacksRef.current.isResultVisible(),
        isSameSnapshot: samePickAssistantSnapshots,
      });

      // The caller clears its pending baseline either way: another tab touched
      // the document even when the snapshot itself is unchanged.
      callbacksRef.current.onExternalChange?.({
        flagReview: plan.action !== "none" && plan.flagReview,
      });
      if (plan.action === "none") return;

      adopt(
        plan.action === "adopt"
          ? plan.snapshot
          : createEmptyPickAssistantSnapshot(schemaVersion),
      );
      setStorageIssue(plan.storageIssue);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [active, adopt, schemaVersion, storageKey, storageOptions]);

  const commit = useCallback(
    async (
      shortlistIds: string[],
      session: PickAssistantSession | null,
    ): Promise<boolean> => {
      if (storageIssue || mutationPendingRef.current) return false;

      const targetKey = storageKey;
      const expected = snapshotRef.current;
      const next = updatePickAssistantSnapshot(
        expected,
        { shortlistIds, session },
        Date.now(),
        createMutationId(),
      );

      mutationPendingRef.current = true;
      setMutationPending(true);
      try {
        const result = await savePickAssistantSnapshotSafely(
          localStorage,
          targetKey,
          expected,
          next,
          storageOptions,
          navigator.locks,
        );
        // The context changed while the write was in flight; the result belongs
        // to a document this hook no longer represents.
        if (storageKeyRef.current !== targetKey) return false;

        if (result.status === "saved") {
          adopt(next);
          setStorageIssue(null);
          return true;
        }

        setStorageIssue(
          result.status === "blocked" ? result.reason : result.status,
        );
        return false;
      } finally {
        mutationPendingRef.current = false;
        setMutationPending(false);
      }
    },
    [adopt, storageIssue, storageKey, storageOptions],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const reset = useCallback(
    (issue: AssistantStorageIssue | null) => {
      adopt(createEmptyPickAssistantSnapshot(schemaVersion));
      setStorageIssue(issue);
    },
    [adopt, schemaVersion],
  );

  const isCurrentKey = useCallback(
    (key: string) => storageKeyRef.current === key,
    [],
  );

  return {
    snapshot,
    storageIssue,
    mutationPending,
    commit,
    getSnapshot,
    adopt,
    reset,
    isCurrentKey,
  };
}
