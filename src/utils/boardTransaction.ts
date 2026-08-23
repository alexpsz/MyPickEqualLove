import type { StoredPicks } from "../schema/music";
import type { RestorePlanSuccess } from "./backupDocument";
import {
  boardHistoryReducer,
  createBoardHistoryState,
  sameStoredPicks,
  type BoardHistoryAction,
  type BoardHistoryState,
  type BoardMutation,
} from "./boardHistory";
import {
  importStoredBoard,
  loadStoredBoard,
  saveStoredBoard,
  type MutableStorageLike,
  type StorageLike,
  type StorageLoadStatus,
} from "./boardStorage";

export interface BoardStorageTarget {
  storage: StorageLike;
  versionedKey: string;
  legacyKey: string;
  sanitize: (picks: StoredPicks) => StoredPicks;
}

interface BoardTransactionInput {
  target: BoardStorageTarget;
  expectedPicks: StoredPicks;
  history: BoardHistoryState;
}

export type BoardTransactionResult =
  | {
      status: "committed";
      history: BoardHistoryState;
      picks: StoredPicks;
    }
  | {
      status: "noop";
      history: BoardHistoryState;
      picks: StoredPicks;
    }
  | {
      status: "conflict";
      latestPicks: StoredPicks;
      storageStatus: StorageLoadStatus;
    }
  | {
      status: "blocked";
      storageStatus: StorageLoadStatus;
    }
  | {
      status: "write-failed";
      rollbackComplete?: boolean;
    };

export type BackupRestoreTransactionResult =
  | { status: "committed"; changedEntries: number }
  | { status: "noop" }
  | { status: "conflict"; key: string }
  | { status: "blocked"; key?: string }
  | { status: "write-failed"; rollbackComplete: boolean };

interface BackupRestoreStorage extends MutableStorageLike {
  readonly length: number;
  key(index: number): string | null;
}

export type BoardStorageEventAction = "context" | "board" | "clear" | "ignore";

export interface BoardTransactionPublishEffects {
  invalidatePreview: () => void;
  publishHistory: (history: BoardHistoryState) => void;
  resetHistory: (picks: StoredPicks) => void;
  setStorageWritable: (writable: boolean) => void;
  onExternalBoardReset: () => void;
}

export function publishBoardTransactionResult(
  result: BoardTransactionResult,
  effects: BoardTransactionPublishEffects,
) {
  if (result.status === "committed") {
    effects.invalidatePreview();
    effects.publishHistory(result.history);
  } else if (result.status === "conflict") {
    effects.setStorageWritable(true);
    effects.invalidatePreview();
    effects.resetHistory(result.latestPicks);
    effects.onExternalBoardReset();
  } else if (result.status === "blocked") {
    effects.setStorageWritable(false);
  }
  return result.status;
}

export function commitBoardTransaction({
  target,
  expectedPicks,
  history,
  mutation,
}: BoardTransactionInput & {
  mutation: BoardMutation;
}): BoardTransactionResult {
  const freshness = readFreshBoard(target, expectedPicks);
  if (freshness.status !== "fresh") return freshness.result;

  const nextPicks = target.sanitize(mutation.nextPicks);
  const action = {
    type: "commit" as const,
    mutation: { ...mutation, nextPicks },
  };
  const nextHistory = boardHistoryReducer(history, action);
  if (nextHistory === history) {
    return { status: "noop", history, picks: expectedPicks };
  }

  if (!saveStoredBoard(target.storage, target.versionedKey, nextPicks)) {
    return { status: "write-failed" };
  }
  return { status: "committed", history: nextHistory, picks: nextPicks };
}

export function applyBoardHistoryTransaction({
  target,
  expectedPicks,
  history,
  action,
}: BoardTransactionInput & {
  action: Extract<BoardHistoryAction, { type: "undo" | "redo" }>;
}): BoardTransactionResult {
  const freshness = readFreshBoard(target, expectedPicks);
  if (freshness.status !== "fresh") return freshness.result;

  const nextHistory = boardHistoryReducer(history, action);
  if (nextHistory === history) {
    return { status: "noop", history, picks: expectedPicks };
  }
  const nextPicks = target.sanitize(nextHistory.present);
  if (!saveStoredBoard(target.storage, target.versionedKey, nextPicks)) {
    return { status: "write-failed" };
  }
  return {
    status: "committed",
    history: { ...nextHistory, present: nextPicks },
    picks: nextPicks,
  };
}

export function resetStoredBoardTransaction({
  target,
  expectedPicks,
  history,
  nextPicks,
}: BoardTransactionInput & { nextPicks: StoredPicks }): BoardTransactionResult {
  const freshness = readFreshBoard(target, expectedPicks);
  if (freshness.status !== "fresh") return freshness.result;

  const sanitizedPicks = target.sanitize(nextPicks);
  const historyIsCanonical =
    history.past.length === 0 &&
    history.future.length === 0 &&
    sameStoredPicks(history.present, sanitizedPicks);
  if (historyIsCanonical && sameStoredPicks(sanitizedPicks, expectedPicks)) {
    return { status: "noop", history, picks: expectedPicks };
  }
  if (!saveStoredBoard(target.storage, target.versionedKey, sanitizedPicks)) {
    return { status: "write-failed" };
  }
  return {
    status: "committed",
    history: createBoardHistoryState(sanitizedPicks),
    picks: sanitizedPicks,
  };
}

export function importBoardTransaction({
  storage,
  versionedKey,
  legacyKey,
  sanitize,
  expectedPicks,
  picks,
  context,
}: {
  storage: MutableStorageLike;
  versionedKey: string;
  legacyKey: string;
  sanitize: (picks: StoredPicks) => StoredPicks;
  expectedPicks: StoredPicks;
  picks: StoredPicks;
  context?: { key: string; value: string };
}): BoardTransactionResult {
  const target = { storage, versionedKey, legacyKey, sanitize };
  const freshness = readFreshBoard(target, expectedPicks);
  if (freshness.status !== "fresh") return freshness.result;

  const nextPicks = sanitize(picks);
  const result = importStoredBoard({
    storage,
    versionedKey,
    picks: nextPicks,
    context,
  });
  if (!result.ok) {
    return {
      status: "write-failed",
      rollbackComplete: result.rollbackComplete,
    };
  }
  return {
    status: "committed",
    history: createBoardHistoryState(nextPicks),
    picks: nextPicks,
  };
}

/**
 * Applies a previously reviewed backup plan as one local transaction.
 * Freshness is checked before the first mutation, and every attempted change
 * is restored to its exact prior string when a later write or verification
 * fails.
 */
export function applyBackupRestoreTransaction({
  storage,
  plan,
}: {
  storage: BackupRestoreStorage;
  plan: RestorePlanSuccess;
}): BackupRestoreTransactionResult {
  let latestKeys: string[];
  try {
    latestKeys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    )
      .filter((key): key is string => key !== null)
      .sort();
  } catch {
    return { status: "blocked" };
  }
  if (!sameStringList(latestKeys, plan.observedKeys)) {
    return { status: "conflict", key: "*" };
  }

  for (const entry of plan.entries) {
    let latest: string | null;
    try {
      latest = storage.getItem(entry.key);
    } catch {
      return { status: "blocked", key: entry.key };
    }
    if (latest !== entry.currentValue) {
      return { status: "conflict", key: entry.key };
    }
  }

  const changes = plan.entries.filter((entry) => entry.action !== "skip");
  if (changes.length === 0) return { status: "noop" };

  const attempted: typeof changes = [];
  for (const entry of changes) {
    attempted.push(entry);
    try {
      if (entry.backupValue === null) {
        storage.removeItem(entry.key);
      } else {
        storage.setItem(entry.key, entry.backupValue);
      }
      if (storage.getItem(entry.key) !== entry.backupValue) {
        return {
          status: "write-failed",
          rollbackComplete: rollbackBackupChanges(storage, attempted),
        };
      }
    } catch {
      return {
        status: "write-failed",
        rollbackComplete: rollbackBackupChanges(storage, attempted),
      };
    }
  }

  return { status: "committed", changedEntries: changes.length };
}

export function createEphemeralBoardReset(
  picks: StoredPicks,
  sanitize: (picks: StoredPicks) => StoredPicks,
) {
  const nextPicks = sanitize(picks);
  return {
    history: createBoardHistoryState(nextPicks),
    picks: nextPicks,
  };
}

export function getBoardStorageEventAction(
  eventKey: string | null,
  keys: { context?: string; picksV2: string },
): BoardStorageEventAction {
  if (eventKey === null) return "clear";
  if (keys.context && eventKey === keys.context) return "context";
  if (eventKey === keys.picksV2) return "board";
  return "ignore";
}

export function isWritableBoardStorageStatus(status: StorageLoadStatus) {
  return status === "empty" || status === "loaded" || status === "migrated";
}

function readFreshBoard(
  target: BoardStorageTarget,
  expectedPicks: StoredPicks,
):
  | { status: "fresh" }
  | {
      status: "stale";
      result: Extract<
        BoardTransactionResult,
        { status: "conflict" | "blocked" }
      >;
    } {
  const latest = loadStoredBoard({
    storage: target.storage,
    versionedKey: target.versionedKey,
    legacyKey: target.legacyKey,
    sanitize: target.sanitize,
  });
  if (!isWritableBoardStorageStatus(latest.status)) {
    return {
      status: "stale",
      result: { status: "blocked", storageStatus: latest.status },
    };
  }
  if (!sameStoredPicks(latest.picks, expectedPicks)) {
    return {
      status: "stale",
      result: {
        status: "conflict",
        latestPicks: latest.picks,
        storageStatus: latest.status,
      },
    };
  }
  return { status: "fresh" };
}

function rollbackBackupChanges(
  storage: MutableStorageLike,
  attempted: RestorePlanSuccess["entries"],
) {
  let rollbackComplete = true;
  // Clear attempted values first so quota pressure from newly added entries
  // cannot prevent a larger prior value from being restored.
  for (const entry of [...attempted].reverse()) {
    try {
      storage.removeItem(entry.key);
    } catch {
      rollbackComplete = false;
    }
  }
  for (const entry of attempted) {
    try {
      if (entry.currentValue !== null) {
        storage.setItem(entry.key, entry.currentValue);
      }
      if (storage.getItem(entry.key) !== entry.currentValue) {
        rollbackComplete = false;
      }
    } catch {
      rollbackComplete = false;
    }
  }
  return rollbackComplete;
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** Input for importing a board received from a share link. */
export interface ImportedBoardInput {
  contextId?: string;
  expectedPicks: StoredPicks;
  picks: StoredPicks;
}

export type BoardSessionMutationStatus = BoardTransactionResult["status"];

/** A no-op counts as success: the board already held the requested state. */
export function isSuccessfulBoardMutation(status: BoardSessionMutationStatus) {
  return status === "committed" || status === "noop";
}
