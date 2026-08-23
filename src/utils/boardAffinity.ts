import type { BoardComparisonResult } from "./boardComparison";

export const BOARD_AFFINITY_FORMULA_ID =
  "shared-song-count-times-board-size-minus-total-rank-distance-v1" as const;

export interface BoardAffinity {
  formulaId: typeof BOARD_AFFINITY_FORMULA_ID;
  boardSize: number;
  sharedSongCount: number;
  totalRankDistance: number;
  points: number;
}

/**
 * Derives an unnormalized, explainable affinity value from an available
 * in-memory board comparison.
 *
 * Each shared song contributes the board size, then loses one point for each
 * rank of distance between the two boards:
 *
 *   shared song count * board size - sum(|current rank - shared rank|)
 *
 * An unavailable comparison is returned as null, so project, experience, and
 * normalized-context mismatches can never produce an affinity value.
 */
export function deriveBoardAffinity(
  comparison: BoardComparisonResult,
): BoardAffinity | null {
  if (comparison.availability !== "available") return null;

  const boardSize = comparison.shared.length + comparison.onlyCurrent.length;
  const sharedBoardSize =
    comparison.shared.length + comparison.onlyShared.length;
  if (boardSize <= 0 || boardSize !== sharedBoardSize) return null;

  let totalRankDistance = 0;
  for (const song of comparison.shared) {
    if (
      !isRankWithinBoard(song.currentRank, boardSize) ||
      !isRankWithinBoard(song.sharedRank, boardSize) ||
      song.rankDifference !== Math.abs(song.currentRank - song.sharedRank)
    ) {
      return null;
    }
    totalRankDistance += song.rankDifference;
  }

  const sharedSongCount = comparison.shared.length;
  const points = sharedSongCount * boardSize - totalRankDistance;
  if (!Number.isSafeInteger(points) || points < 0) return null;

  return {
    formulaId: BOARD_AFFINITY_FORMULA_ID,
    boardSize,
    sharedSongCount,
    totalRankDistance,
    points,
  };
}

function isRankWithinBoard(rank: number, boardSize: number) {
  return Number.isSafeInteger(rank) && rank >= 1 && rank <= boardSize;
}
