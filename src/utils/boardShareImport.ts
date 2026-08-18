import type { StoredPicks } from "../schema/music";

/**
 * Decision layer for consuming a board-share link.
 *
 * The surrounding effect owns the side effects (reading location, clearing the
 * hash, loading the target board out of localStorage, opening the dialog).
 * Everything here is a pure function of an already-resolved payload.
 *
 * This module deliberately imports nothing but types. `createBoardSharePreviewDiff`
 * lives in the standalone `boardShareProtocol.mjs` that node scripts also load,
 * so it is injected rather than imported; that keeps the protocol as the single
 * source of truth while letting this decision layer compile and run under the
 * repository's TypeScript test runner.
 */

export interface BoardShareSlotLabel {
  id: string;
  label: string;
}

export interface BoardShareChange {
  slotId: string;
  slotLabel: string;
  currentTitle?: string;
  importedTitle?: string;
}

/**
 * Structural input contract. `ResolvedBoardShare` from `data/boardShare` is
 * assignable to this; it is restated here so the module stays import-free.
 */
export type ResolvedBoardShareInput =
  | { status: "import"; contextId?: string; picks: StoredPicks }
  | { status: "mismatch"; canonicalUrl: string; displayName: string }
  | { status: "invalid"; reason: string };

export type BoardShareDialogPlan =
  | { kind: "invalid"; unsupportedVersion: boolean }
  | { kind: "mismatch"; targetName: string; targetUrl: string }
  | { kind: "import"; changes: BoardShareChange[]; contextLabel?: string };

/** Shape of `createBoardSharePreviewDiff` from the protocol module. */
export type CreateBoardSharePreviewDiff = (snapshot: {
  slotIds: string[];
  currentPicks: Record<string, string>;
  importedPicks: Record<string, string>;
  currentContextId: string | null;
  importedContextId: string | null;
}) => {
  changes: Array<{
    slotId: string;
    currentSongId: string | undefined;
    importedSongId: string | undefined;
  }>;
  contextChanged: boolean;
};

export interface BoardShareDialogInput {
  resolved: ResolvedBoardShareInput;
  /** Location hash as it was before the effect cleared it, including "#". */
  originalHash: string;
  /** Raw experience slots, used as the label fallback. */
  slots: readonly BoardShareSlotLabel[];
  /** Localized slot presentation; takes precedence over `slots`. */
  uiSlots: readonly BoardShareSlotLabel[];
  uiContextOptions: readonly BoardShareSlotLabel[];
  /** Board currently stored for the *incoming* context, already sanitized. */
  currentPicks: StoredPicks;
  effectiveContextId?: string;
  getSongTitle: (songId: string) => string | undefined;
  createPreviewDiff: CreateBoardSharePreviewDiff;
}

/**
 * Rebuilds the canonical sister-site URL for a mismatched share, preserving
 * the original payload hash so the target site can consume it.
 */
export function buildBoardShareMismatchUrl(
  canonicalUrl: string,
  originalHash: string,
) {
  const targetUrl = new URL(canonicalUrl);
  targetUrl.hash = originalHash.startsWith("#")
    ? originalHash.slice(1)
    : originalHash;
  return targetUrl.toString();
}

export function planBoardShareDialog(
  input: BoardShareDialogInput,
): BoardShareDialogPlan {
  const { resolved } = input;

  if (resolved.status === "invalid") {
    return {
      kind: "invalid",
      unsupportedVersion: resolved.reason === "unsupported-version",
    };
  }

  if (resolved.status === "mismatch") {
    return {
      kind: "mismatch",
      targetName: resolved.displayName,
      targetUrl: buildBoardShareMismatchUrl(
        resolved.canonicalUrl,
        input.originalHash,
      ),
    };
  }

  const previewDiff = input.createPreviewDiff({
    slotIds: input.slots.map((slot) => slot.id),
    currentPicks: input.currentPicks,
    importedPicks: resolved.picks,
    currentContextId: input.effectiveContextId ?? null,
    importedContextId: resolved.contextId ?? null,
  });

  // Localized labels win; raw slot labels are the fallback so a slot missing
  // from the presentation layer still shows something meaningful.
  const uiSlotsById = new Map(input.uiSlots.map((slot) => [slot.id, slot]));
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));

  const changes = previewDiff.changes.map(
    ({ slotId, currentSongId, importedSongId }) => ({
      slotId,
      slotLabel:
        uiSlotsById.get(slotId)?.label ??
        slotsById.get(slotId)?.label ??
        slotId,
      currentTitle: currentSongId
        ? input.getSongTitle(currentSongId)
        : undefined,
      importedTitle: importedSongId
        ? input.getSongTitle(importedSongId)
        : undefined,
    }),
  );

  // Only name the context when the import actually moves the user to a
  // different one; otherwise the label is noise.
  const contextLabel =
    resolved.contextId && previewDiff.contextChanged
      ? input.uiContextOptions.find(
          (context) => context.id === resolved.contextId,
        )?.label
      : undefined;

  return { kind: "import", changes, contextLabel };
}
