import type { StoredPicks } from "../schema/music";

/**
 * Pure, storage-free comparison for two already-validated board scopes.
 *
 * The caller owns payload validation and UI state. This module only answers
 * whether the two in-memory boards are comparable and, when they are, derives
 * the transparent overlap and rank score.
 */

export interface BoardComparisonSlot {
  id: string;
  sortOrder: number;
}

export interface BoardComparisonScope {
  projectId: string;
  experienceId: string;
  contextId?: string | null;
}

export interface BoardComparisonInput {
  slots: readonly BoardComparisonSlot[];
  current: {
    scope: BoardComparisonScope;
    picks: StoredPicks;
  };
  shared: {
    scope: BoardComparisonScope;
    picks: StoredPicks;
  };
}

export type BoardComparisonUnavailableReason =
  | "project-mismatch"
  | "experience-mismatch"
  | "context-mismatch"
  | "no-slots"
  | "current-incomplete"
  | "shared-incomplete"
  | "current-duplicate-song"
  | "shared-duplicate-song";

export interface BoardComparisonRankedSong {
  songId: string;
  rank: number;
}

export interface BoardComparisonSharedSong {
  songId: string;
  currentRank: number;
  sharedRank: number;
  rankDifference: number;
}

export interface AvailableBoardComparison {
  availability: "available";
  reason: null;
  compatibilityScore: number;
  shared: BoardComparisonSharedSong[];
  onlyCurrent: BoardComparisonRankedSong[];
  onlyShared: BoardComparisonRankedSong[];
}

export interface UnavailableBoardComparison {
  availability: "unavailable";
  reason: BoardComparisonUnavailableReason;
  compatibilityScore: null;
  shared: [];
  onlyCurrent: [];
  onlyShared: [];
}

export type BoardComparisonResult =
  | AvailableBoardComparison
  | UnavailableBoardComparison;

interface RankedBoard {
  entries: BoardComparisonRankedSong[];
  rankBySongId: Map<string, number>;
}

type RankedBoardStatus =
  | { status: "ready"; board: RankedBoard }
  | { status: "incomplete" }
  | { status: "duplicate-song" };

/**
 * Compares two complete boards for the exact same project, experience, and
 * normalized context. Each shared song contributes 70/N points, plus up to
 * 30/N points for rank closeness. N is the number of configured slots.
 */
export function compareBoardPicks(
  input: BoardComparisonInput,
): BoardComparisonResult {
  if (input.current.scope.projectId !== input.shared.scope.projectId) {
    return unavailable("project-mismatch");
  }

  if (input.current.scope.experienceId !== input.shared.scope.experienceId) {
    return unavailable("experience-mismatch");
  }

  if (
    normalizeContextId(input.current.scope.contextId) !==
    normalizeContextId(input.shared.scope.contextId)
  ) {
    return unavailable("context-mismatch");
  }

  const slots = input.slots
    .slice()
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    );
  if (slots.length === 0) return unavailable("no-slots");

  const current = rankBoard(slots, input.current.picks);
  if (current.status === "incomplete") return unavailable("current-incomplete");
  if (current.status === "duplicate-song") {
    return unavailable("current-duplicate-song");
  }

  const shared = rankBoard(slots, input.shared.picks);
  if (shared.status === "incomplete") return unavailable("shared-incomplete");
  if (shared.status === "duplicate-song") {
    return unavailable("shared-duplicate-song");
  }

  const sharedSongs: BoardComparisonSharedSong[] = [];
  const onlyCurrent: BoardComparisonRankedSong[] = [];
  const onlyShared: BoardComparisonRankedSong[] = [];

  for (const currentSong of current.board.entries) {
    const sharedRank = shared.board.rankBySongId.get(currentSong.songId);
    if (sharedRank === undefined) {
      onlyCurrent.push(currentSong);
      continue;
    }

    sharedSongs.push({
      songId: currentSong.songId,
      currentRank: currentSong.rank,
      sharedRank,
      rankDifference: Math.abs(currentSong.rank - sharedRank),
    });
  }

  for (const sharedSong of shared.board.entries) {
    if (!current.board.rankBySongId.has(sharedSong.songId)) {
      onlyShared.push(sharedSong);
    }
  }

  const slotCount = slots.length;
  const compatibilityScore = clampScore(
    Math.round(
      sharedSongs.reduce((score, song) => {
        const rankCloseness =
          slotCount === 1 ? 1 : 1 - song.rankDifference / (slotCount - 1);
        return score + 70 / slotCount + (30 / slotCount) * rankCloseness;
      }, 0),
    ),
  );

  return {
    availability: "available",
    reason: null,
    compatibilityScore,
    shared: sharedSongs,
    onlyCurrent,
    onlyShared,
  };
}

function normalizeContextId(contextId: string | null | undefined) {
  return contextId ?? null;
}

function rankBoard(
  slots: readonly BoardComparisonSlot[],
  picks: StoredPicks,
): RankedBoardStatus {
  const entries: BoardComparisonRankedSong[] = [];
  const rankBySongId = new Map<string, number>();

  for (const [index, slot] of slots.entries()) {
    const songId = picks[slot.id];
    if (!songId) return { status: "incomplete" };
    if (rankBySongId.has(songId)) return { status: "duplicate-song" };

    const rank = index + 1;
    entries.push({ songId, rank });
    rankBySongId.set(songId, rank);
  }

  return { status: "ready", board: { entries, rankBySongId } };
}

function unavailable(
  reason: BoardComparisonUnavailableReason,
): UnavailableBoardComparison {
  return {
    availability: "unavailable",
    reason,
    compatibilityScore: null,
    shared: [],
    onlyCurrent: [],
    onlyShared: [],
  };
}

function clampScore(score: number) {
  return Math.min(100, Math.max(0, score));
}
