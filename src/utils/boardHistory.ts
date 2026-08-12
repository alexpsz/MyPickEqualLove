import type { StoredPicks } from "../schema/music";

export const BOARD_UNDO_LIMIT = 24;

export type BoardMutationKind =
  | "pick"
  | "clear"
  | "replace"
  | "sort"
  | "restore";

export interface BoardMutation {
  kind: BoardMutationKind;
  nextPicks: StoredPicks;
}

export interface BoardHistoryState {
  past: StoredPicks[];
  present: StoredPicks;
  future: StoredPicks[];
}

export type BoardHistoryAction =
  | { type: "reset"; picks: StoredPicks }
  | { type: "commit"; mutation: BoardMutation }
  | { type: "undo" }
  | { type: "redo" };

export function createBoardHistoryState(
  picks: StoredPicks = {},
): BoardHistoryState {
  return {
    past: [],
    present: cloneStoredPicks(picks),
    future: [],
  };
}

export function boardHistoryReducer(
  state: BoardHistoryState,
  action: BoardHistoryAction,
): BoardHistoryState {
  switch (action.type) {
    case "reset":
      return createBoardHistoryState(action.picks);
    case "commit":
      return commitBoardMutation(state, action.mutation);
    case "undo":
      return undoBoardMutation(state);
    case "redo":
      return redoBoardMutation(state);
  }
}

export function commitBoardMutation(
  state: BoardHistoryState,
  mutation: BoardMutation,
  historyLimit = BOARD_UNDO_LIMIT,
): BoardHistoryState {
  const nextPicks = cloneStoredPicks(mutation.nextPicks);
  if (sameStoredPicks(state.present, nextPicks)) {
    return state;
  }

  const boundedLimit = Math.max(1, Math.floor(historyLimit));
  const past = [...state.past, cloneStoredPicks(state.present)].slice(
    -boundedLimit,
  );

  return { past, present: nextPicks, future: [] };
}

export function undoBoardMutation(state: BoardHistoryState): BoardHistoryState {
  const previous = state.past[state.past.length - 1];
  if (!previous) {
    return state;
  }

  return {
    past: state.past.slice(0, -1),
    present: cloneStoredPicks(previous),
    future: [cloneStoredPicks(state.present), ...state.future],
  };
}

export function redoBoardMutation(state: BoardHistoryState): BoardHistoryState {
  const [next, ...future] = state.future;
  if (!next) {
    return state;
  }

  return {
    past: [...state.past, cloneStoredPicks(state.present)].slice(
      -BOARD_UNDO_LIMIT,
    ),
    present: cloneStoredPicks(next),
    future,
  };
}

export function sameStoredPicks(left: StoredPicks, right: StoredPicks) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([slotId, songId]) => right[slotId] === songId);
}

function cloneStoredPicks(picks: StoredPicks): StoredPicks {
  return { ...picks };
}
