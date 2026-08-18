/**
 * Decision layer for cross-tab `storage` events.
 *
 * Four listeners in PickExperienceClient share the same relevance rules, and
 * the Pick Assistant additionally has to reconcile an incoming snapshot with
 * the one already in memory. Both are pure decisions; the listeners keep the
 * DOM wiring and the state writes.
 */

/** Only the fields these policies read, so tests need no real StorageEvent. */
export interface StorageEventLike {
  storageArea: unknown;
  key: string | null;
  newValue: string | null;
}

export type StorageSyncAction =
  /** Not our storage, or not a key we watch. */
  | { kind: "ignore" }
  /**
   * `key === null` means the whole area was cleared, and `newValue` carries no
   * per-key information. The listener must re-read storage rather than trust
   * the event.
   */
  | { kind: "reload" }
  /** A watched key changed; `value` is the event's new value for it. */
  | { kind: "apply"; value: string | null };

/**
 * Decides whether a `storage` event should trigger a resync for `watchedKey`.
 *
 * Note `key === null` is deliberately treated as relevant: `localStorage.clear()`
 * fires one event with a null key, and skipping it would leave this tab showing
 * data another tab already deleted.
 */
export function resolveStorageSyncAction(
  event: StorageEventLike,
  options: { storage: unknown; watchedKey: string },
): StorageSyncAction {
  if (event.storageArea !== options.storage) {
    return { kind: "ignore" };
  }
  if (event.key === null) {
    return { kind: "reload" };
  }
  if (event.key === options.watchedKey) {
    return { kind: "apply", value: event.newValue };
  }
  return { kind: "ignore" };
}

/** Convenience for listeners that re-read storage either way. */
export function shouldResyncStorage(
  event: StorageEventLike,
  options: { storage: unknown; watchedKey: string },
) {
  return resolveStorageSyncAction(event, options).kind !== "ignore";
}

export type AssistantSnapshotStatus =
  | "missing"
  | "valid"
  | "corrupt"
  | "future"
  | "expired";

export interface AssistantSnapshotLike {
  revision: number;
}

/** Statuses that are surfaced to the user as a storage issue. */
export type AssistantSnapshotIssue = "corrupt" | "future" | "expired";

export type AssistantSnapshotSyncPlan<T> =
  /**
   * Replace in-memory state with an empty snapshot. `missing` is a clean
   * deletion by another tab, so it reports no issue.
   */
  | {
      action: "reset";
      storageIssue: AssistantSnapshotIssue | null;
      flagReview: boolean;
    }
  /** Adopt `snapshot`, which the plan carries so callers need no re-narrowing. */
  | {
      action: "adopt";
      snapshot: T;
      storageIssue: "conflict" | null;
      flagReview: boolean;
    }
  /** Incoming snapshot is identical to what is already held. */
  | { action: "none" };

/**
 * Reconciles a snapshot observed in another tab with the one held here.
 *
 * The caller clears its pending apply-baseline *before* consulting this, even
 * when the result is `none`: another tab has touched the document, so a
 * baseline captured earlier can no longer be trusted.
 */
export function planAssistantSnapshotSync<T extends AssistantSnapshotLike>({
  incoming,
  current,
  resultVisible,
  isSameSnapshot,
}: {
  incoming:
    | { status: "valid"; snapshot: T }
    | { status: Exclude<AssistantSnapshotStatus, "valid"> };
  current: T;
  resultVisible: boolean;
  /**
   * Deep equality for snapshots. Injected because the real comparison lives in
   * `pickAssistant.ts` alongside the snapshot type; reimplementing it here
   * would create a second source of truth for what "unchanged" means.
   */
  isSameSnapshot: (left: T, right: T) => boolean;
}): AssistantSnapshotSyncPlan<T> {
  if (incoming.status === "missing") {
    // Another tab cleared the document. Reset, but only interrupt the user
    // with a review prompt when they are actually looking at a result.
    return { action: "reset", storageIssue: null, flagReview: resultVisible };
  }

  if (incoming.status !== "valid") {
    // Corrupt/future/expired: surface the reason and do not prompt for review,
    // because there is nothing coherent to review against.
    return {
      action: "reset",
      storageIssue: incoming.status,
      flagReview: false,
    };
  }

  if (isSameSnapshot(incoming.snapshot, current)) {
    return { action: "none" };
  }

  // A revision that did not advance means both tabs wrote from the same base,
  // so the local view is not a clean descendant of what is now stored.
  const conflicting = incoming.snapshot.revision <= current.revision;
  return {
    action: "adopt",
    snapshot: incoming.snapshot,
    storageIssue: conflicting ? "conflict" : null,
    flagReview: resultVisible,
  };
}
