"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterStoredPicksForExperience,
  getDefaultExperienceContextId,
  getExperienceContext,
  getExperienceContexts,
  getStorageKeysForExperience,
} from "../data/pickExperiences";
import type { PickExperience } from "../schema/pick-experience";
import type { StoredPicks } from "../schema/music";
import {
  createBoardHistoryState,
  type BoardHistoryState,
  type BoardMutationKind,
} from "../utils/boardHistory";
import { loadStoredBoard } from "../utils/boardStorage";
import {
  applyBoardHistoryTransaction,
  commitBoardTransaction,
  createEphemeralBoardReset,
  getBoardStorageEventAction,
  importBoardTransaction,
  isWritableBoardStorageStatus,
  resetStoredBoardTransaction,
  type BoardTransactionResult,
} from "../utils/boardTransaction";
import { isExportRealmHash } from "../utils/exportCapture";

export type BoardSessionMutationStatus = BoardTransactionResult["status"];

interface UseExperienceBoardSessionOptions {
  experience: PickExperience;
  onBeforeHydrated?: (
    storageKeys: ReturnType<typeof getStorageKeysForExperience>,
  ) => void;
  onContextWillActivate?: () => void;
  onInvalidatePreview: () => void;
  onStorageUnavailable: () => void;
  onExternalBoardReset: () => void;
}

export interface ImportedBoardInput {
  contextId?: string;
  expectedPicks: StoredPicks;
  picks: StoredPicks;
}

export function useExperienceBoardSession({
  experience,
  onBeforeHydrated,
  onContextWillActivate,
  onInvalidatePreview,
  onStorageUnavailable,
  onExternalBoardReset,
}: UseExperienceBoardSessionOptions) {
  const contextOptions = useMemo(
    () => getExperienceContexts(experience),
    [experience],
  );
  const defaultContextId = useMemo(
    () => getDefaultExperienceContextId(experience),
    [experience],
  );
  const [contextId, setContextId] = useState<string | undefined>(
    defaultContextId,
  );
  const activeContext = useMemo(
    () => getExperienceContext(experience, contextId),
    [contextId, experience],
  );
  const effectiveContextId = activeContext?.id;
  const storageKeys = useMemo(
    () => getStorageKeysForExperience(experience, effectiveContextId),
    [effectiveContextId, experience],
  );
  const [boardHistory, setBoardHistory] = useState<BoardHistoryState>(() =>
    createBoardHistoryState(),
  );
  const [boardStorageWritable, setBoardStorageWritable] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isExportRealm, setIsExportRealm] = useState(false);
  const storedPicksRef = useRef<StoredPicks>({});
  const historyRef = useRef(boardHistory);
  const callbacksRef = useRef({
    onBeforeHydrated,
    onContextWillActivate,
    onInvalidatePreview,
    onStorageUnavailable,
    onExternalBoardReset,
  });
  callbacksRef.current = {
    onBeforeHydrated,
    onContextWillActivate,
    onInvalidatePreview,
    onStorageUnavailable,
    onExternalBoardReset,
  };

  const publishHistory = useCallback((nextHistory: BoardHistoryState) => {
    historyRef.current = nextHistory;
    storedPicksRef.current = nextHistory.present;
    setBoardHistory(nextHistory);
  }, []);

  const resetHistory = useCallback(
    (picks: StoredPicks) => publishHistory(createBoardHistoryState(picks)),
    [publishHistory],
  );

  const sanitizeForContext = useCallback(
    (candidatePicks: StoredPicks, targetContextId?: string) =>
      filterStoredPicksForExperience({
        experience,
        storedPicks: candidatePicks,
        contextId: targetContextId,
      }),
    [experience],
  );

  useEffect(() => {
    const exportRealm =
      window.parent !== window && isExportRealmHash(window.location.hash);
    setIsExportRealm(exportRealm);
    if (exportRealm) {
      setContextId(defaultContextId);
      resetHistory({});
      setHydrated(true);
      return;
    }

    const timer = window.setTimeout(() => {
      let initialContextId = defaultContextId;
      const defaultStorageKeys = getStorageKeysForExperience(
        experience,
        defaultContextId,
      );

      if (defaultStorageKeys.context) {
        let savedContextId: string | null = null;
        try {
          savedContextId = localStorage.getItem(defaultStorageKeys.context);
        } catch {
          savedContextId = null;
        }
        if (
          savedContextId &&
          contextOptions.some((context) => context.id === savedContextId)
        ) {
          initialContextId = savedContextId;
        }
      }

      const initialStorageKeys = getStorageKeysForExperience(
        experience,
        initialContextId,
      );
      setContextId(initialContextId);
      const boardResult = loadStoredBoard({
        storage: localStorage,
        versionedKey: initialStorageKeys.picksV2,
        legacyKey: initialStorageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, initialContextId),
      });
      resetHistory(boardResult.picks);
      const writable = isWritableBoardStorageStatus(boardResult.status);
      setBoardStorageWritable(writable);
      callbacksRef.current.onBeforeHydrated?.(initialStorageKeys);
      setHydrated(true);
      if (!writable) callbacksRef.current.onStorageUnavailable();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    contextOptions,
    defaultContextId,
    experience,
    resetHistory,
    sanitizeForContext,
  ]);

  const activateExperienceContext = useCallback(
    (requestedContextId: string | null | undefined, persist: boolean) => {
      const nextContextId = contextOptions.some(
        (context) => context.id === requestedContextId,
      )
        ? (requestedContextId ?? defaultContextId)
        : defaultContextId;
      const nextStorageKeys = getStorageKeysForExperience(
        experience,
        nextContextId,
      );

      callbacksRef.current.onInvalidatePreview();
      callbacksRef.current.onContextWillActivate?.();
      setContextId(nextContextId);

      if (persist && nextStorageKeys.context && nextContextId) {
        try {
          localStorage.setItem(nextStorageKeys.context, nextContextId);
        } catch {
          // Preserve the existing best-effort context preference behavior.
        }
      }

      const boardResult = loadStoredBoard({
        storage: localStorage,
        versionedKey: nextStorageKeys.picksV2,
        legacyKey: nextStorageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, nextContextId),
      });
      const writable = isWritableBoardStorageStatus(boardResult.status);
      setBoardStorageWritable(writable);
      resetHistory(boardResult.picks);
      if (!writable) callbacksRef.current.onStorageUnavailable();
    },
    [
      contextOptions,
      defaultContextId,
      experience,
      resetHistory,
      sanitizeForContext,
    ],
  );

  useEffect(() => {
    if (!hydrated || isExportRealm) return;

    const syncActiveBoard = () => {
      const result = loadStoredBoard({
        storage: localStorage,
        versionedKey: storageKeys.picksV2,
        legacyKey: storageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, effectiveContextId),
      });
      const writable = isWritableBoardStorageStatus(result.status);
      setBoardStorageWritable(writable);
      if (!writable) {
        callbacksRef.current.onStorageUnavailable();
        return;
      }
      callbacksRef.current.onInvalidatePreview();
      resetHistory(result.picks);
      callbacksRef.current.onExternalBoardReset();
    };
    const syncStoredContext = () => {
      if (!storageKeys.context) return false;
      let nextContextId: string | null = null;
      try {
        nextContextId = localStorage.getItem(storageKeys.context);
      } catch {
        callbacksRef.current.onStorageUnavailable();
        return true;
      }
      activateExperienceContext(nextContextId, false);
      return true;
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      switch (getBoardStorageEventAction(event.key, storageKeys)) {
        case "context":
          syncStoredContext();
          return;
        case "clear":
          if (!syncStoredContext()) syncActiveBoard();
          return;
        case "board":
          syncActiveBoard();
          return;
        case "ignore":
          return;
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [
    activateExperienceContext,
    effectiveContextId,
    hydrated,
    isExportRealm,
    resetHistory,
    sanitizeForContext,
    storageKeys,
  ]);

  const createTransactionTarget = useCallback(
    () => ({
      storage: localStorage,
      versionedKey: storageKeys.picksV2,
      legacyKey: storageKeys.picks,
      sanitize: (candidatePicks: StoredPicks) =>
        sanitizeForContext(candidatePicks, effectiveContextId),
    }),
    [
      effectiveContextId,
      sanitizeForContext,
      storageKeys.picks,
      storageKeys.picksV2,
    ],
  );

  const publishTransaction = useCallback(
    (result: BoardTransactionResult) => {
      if (result.status === "committed") {
        callbacksRef.current.onInvalidatePreview();
        publishHistory(result.history);
      } else if (result.status === "conflict") {
        setBoardStorageWritable(true);
        callbacksRef.current.onInvalidatePreview();
        resetHistory(result.latestPicks);
      } else if (result.status === "blocked") {
        setBoardStorageWritable(false);
      }
      return result.status;
    },
    [publishHistory, resetHistory],
  );

  const commitUserMutation = useCallback(
    (kind: BoardMutationKind, nextPicks: StoredPicks) => {
      if (!boardStorageWritable) return "blocked" as const;
      return publishTransaction(
        commitBoardTransaction({
          target: createTransactionTarget(),
          expectedPicks: storedPicksRef.current,
          history: historyRef.current,
          mutation: { kind, nextPicks },
        }),
      );
    },
    [boardStorageWritable, createTransactionTarget, publishTransaction],
  );

  const applyHistoryAction = useCallback(
    (type: "undo" | "redo") => {
      if (!boardStorageWritable) return "blocked" as const;
      return publishTransaction(
        applyBoardHistoryTransaction({
          target: createTransactionTarget(),
          expectedPicks: storedPicksRef.current,
          history: historyRef.current,
          action: { type },
        }),
      );
    },
    [boardStorageWritable, createTransactionTarget, publishTransaction],
  );

  const resetBoardWithoutHistory = useCallback(
    (nextPicks: StoredPicks) => {
      if (!boardStorageWritable) return "blocked" as const;
      return publishTransaction(
        resetStoredBoardTransaction({
          target: createTransactionTarget(),
          expectedPicks: storedPicksRef.current,
          history: historyRef.current,
          nextPicks,
        }),
      );
    },
    [boardStorageWritable, createTransactionTarget, publishTransaction],
  );

  const importBoard = useCallback(
    ({
      contextId: nextContextId,
      expectedPicks,
      picks,
    }: ImportedBoardInput) => {
      const targetStorageKeys = getStorageKeysForExperience(
        experience,
        nextContextId,
      );
      const result = importBoardTransaction({
        storage: localStorage,
        versionedKey: targetStorageKeys.picksV2,
        legacyKey: targetStorageKeys.picks,
        sanitize: (candidatePicks) =>
          sanitizeForContext(candidatePicks, nextContextId),
        expectedPicks,
        picks,
        context:
          targetStorageKeys.context && nextContextId
            ? { key: targetStorageKeys.context, value: nextContextId }
            : undefined,
      });
      if (result.status === "committed") {
        callbacksRef.current.onInvalidatePreview();
        setContextId(nextContextId);
        setBoardStorageWritable(true);
        publishHistory(result.history);
      } else if (result.status === "blocked") {
        setBoardStorageWritable(false);
      }
      return result;
    },
    [experience, publishHistory, sanitizeForContext],
  );

  const resetFromFreshness = useCallback(
    (picks: StoredPicks) => {
      callbacksRef.current.onInvalidatePreview();
      resetHistory(sanitizeForContext(picks, effectiveContextId));
    },
    [effectiveContextId, resetHistory, sanitizeForContext],
  );

  const injectEphemeralBoard = useCallback(
    (nextContextId: string | undefined, picks: StoredPicks) => {
      const reset = createEphemeralBoardReset(picks, (candidatePicks) =>
        sanitizeForContext(candidatePicks, nextContextId),
      );
      setContextId(nextContextId);
      publishHistory(reset.history);
    },
    [publishHistory, sanitizeForContext],
  );

  const markBoardStorageUnavailable = useCallback(
    () => setBoardStorageWritable(false),
    [],
  );

  return {
    contextOptions,
    defaultContextId,
    contextId,
    activeContext,
    effectiveContextId,
    storageKeys,
    boardHistory,
    storedPicks: boardHistory.present,
    storedPicksRef,
    boardStorageWritable,
    hydrated,
    isExportRealm,
    activateExperienceContext,
    commitUserMutation,
    applyHistoryAction,
    resetBoardWithoutHistory,
    importBoard,
    resetFromFreshness,
    injectEphemeralBoard,
    markBoardStorageUnavailable,
  };
}

export function isSuccessfulBoardMutation(status: BoardSessionMutationStatus) {
  return status === "committed" || status === "noop";
}
