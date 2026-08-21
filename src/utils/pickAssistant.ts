import type { StoredPicks } from "../schema/music";
import { sameStoredPicks } from "./boardHistory";

export type ComparisonOutcome = "left" | "right" | "tie";

export interface ComparisonDecision {
  leftId: string;
  rightId: string;
  outcome: ComparisonOutcome;
}

export interface PickAssistantSession {
  candidateIds: string[];
  /**
   * How many places the board actually needs filled. The tournament settles
   * that prefix and stops: ranking songs that cannot reach the board is work
   * nobody asked for.
   */
  targetCount: number;
  decisions: ComparisonDecision[];
  activePairKey?: string;
}

export interface PickAssistantSnapshot {
  schemaVersion: number;
  revision: number;
  updatedAt: number;
  mutationId: string;
  shortlistIds: string[];
  session: PickAssistantSession | null;
}

export interface PickAssistantApplicationInputs {
  contextId?: string;
  boardPicks: StoredPicks;
  assistantSnapshot: PickAssistantSnapshot;
}

export type PickAssistantSnapshotStatus =
  | "missing"
  | "valid"
  | "corrupt"
  | "future"
  | "expired";

export type PickAssistantSnapshotResult =
  | { status: "missing" }
  | { status: "valid"; snapshot: PickAssistantSnapshot }
  | { status: "corrupt" | "future" | "expired" };

export interface TournamentPair {
  leftId: string;
  rightId: string;
}

export type TournamentState =
  | {
      status: "comparing";
      pair: TournamentPair;
      decisionsMade: number;
      maximumComparisons: number;
    }
  | {
      status: "complete";
      orderedIds: string[];
      decisionsMade: number;
      maximumComparisons: number;
    };

export interface RankedPickPlacement {
  songId: string;
  slotId: string;
  rank: number;
}

export interface RankedPickSkip {
  songId: string;
  rank: number;
  reason: "duplicate" | "ineligible" | "capacity";
}

export interface RankedPickPlan {
  nextPicks: Record<string, string>;
  placements: RankedPickPlacement[];
  skipped: RankedPickSkip[];
}

interface MergeJob {
  index: number;
  left: string[];
  right: string[];
  leftIndex: number;
  rightIndex: number;
  merged: string[];
}

interface AvailablePair extends TournamentPair {
  jobIndex: number;
  key: string;
}

interface TournamentReplay {
  complete: boolean;
  orderedIds?: string[];
  availablePairs: AvailablePair[];
}

export function createPickAssistantSnapshot(
  schemaVersion: number,
  now: number,
  mutationId: string,
): PickAssistantSnapshot {
  return {
    schemaVersion,
    revision: 0,
    updatedAt: now,
    mutationId,
    shortlistIds: [],
    session: null,
  };
}

export function updatePickAssistantSnapshot(
  current: PickAssistantSnapshot,
  update: Pick<PickAssistantSnapshot, "shortlistIds" | "session">,
  now: number,
  mutationId: string,
): PickAssistantSnapshot {
  return {
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    mutationId,
    shortlistIds: update.shortlistIds.slice(),
    session: update.session,
  };
}

export function parsePickAssistantSnapshot(
  serialized: string | null,
  options: {
    schemaVersion: number;
    expiresAfterMs: number;
    maximumCandidates: number;
    now: number;
    validSongIds: ReadonlySet<string>;
  },
): PickAssistantSnapshotResult {
  if (serialized === null) return { status: "missing" };

  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return { status: "corrupt" };
  }

  if (!isRecord(value) || !Number.isInteger(value.schemaVersion)) {
    return { status: "corrupt" };
  }
  if ((value.schemaVersion as number) > options.schemaVersion) {
    return { status: "future" };
  }
  if (value.schemaVersion !== options.schemaVersion) {
    return { status: "corrupt" };
  }
  if (
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Number.isFinite(value.updatedAt) ||
    (value.updatedAt as number) <= 0 ||
    typeof value.mutationId !== "string" ||
    value.mutationId.length === 0 ||
    !Array.isArray(value.shortlistIds) ||
    value.shortlistIds.length > options.maximumCandidates
  ) {
    return { status: "corrupt" };
  }

  if (options.now - (value.updatedAt as number) > options.expiresAfterMs) {
    return { status: "expired" };
  }

  const shortlistIds = parseUniqueSongIds(
    value.shortlistIds,
    options.validSongIds,
  );
  if (!shortlistIds) return { status: "corrupt" };

  const session = parseSession(value.session, shortlistIds);
  if (session === undefined) return { status: "corrupt" };

  const snapshot: PickAssistantSnapshot = {
    schemaVersion: value.schemaVersion as number,
    revision: value.revision as number,
    updatedAt: value.updatedAt as number,
    mutationId: value.mutationId,
    shortlistIds,
    session,
  };

  if (session) {
    try {
      deriveTournament(session);
    } catch {
      return { status: "corrupt" };
    }
  }

  return { status: "valid", snapshot };
}

export function samePickAssistantSnapshots(
  left: PickAssistantSnapshot,
  right: PickAssistantSnapshot,
) {
  if (
    left.schemaVersion !== right.schemaVersion ||
    left.revision !== right.revision ||
    left.updatedAt !== right.updatedAt ||
    left.mutationId !== right.mutationId ||
    left.shortlistIds.length !== right.shortlistIds.length ||
    left.shortlistIds.some(
      (songId, index) => songId !== right.shortlistIds[index],
    )
  ) {
    return false;
  }

  if (!left.session || !right.session) {
    return left.session === right.session;
  }

  return (
    left.session.activePairKey === right.session.activePairKey &&
    left.session.targetCount === right.session.targetCount &&
    left.session.candidateIds.length === right.session.candidateIds.length &&
    left.session.candidateIds.every(
      (songId, index) => songId === right.session?.candidateIds[index],
    ) &&
    left.session.decisions.length === right.session.decisions.length &&
    left.session.decisions.every((decision, index) => {
      const other = right.session?.decisions[index];
      return Boolean(
        other &&
        decision.leftId === other.leftId &&
        decision.rightId === other.rightId &&
        decision.outcome === other.outcome,
      );
    })
  );
}

export function samePickAssistantApplicationInputs(
  left: PickAssistantApplicationInputs,
  right: PickAssistantApplicationInputs,
) {
  return (
    left.contextId === right.contextId &&
    sameStoredPicks(left.boardPicks, right.boardPicks) &&
    samePickAssistantSnapshots(left.assistantSnapshot, right.assistantSnapshot)
  );
}

export function createPickAssistantSession(
  candidateIds: readonly string[],
  targetCount: number,
): PickAssistantSession {
  if (
    candidateIds.length < 2 ||
    new Set(candidateIds).size !== candidateIds.length
  ) {
    throw new Error("A tournament requires at least two unique candidates");
  }
  if (!Number.isInteger(targetCount) || targetCount < 1) {
    throw new Error("A tournament needs a positive whole target count");
  }
  return {
    candidateIds: candidateIds.slice(),
    targetCount,
    decisions: [],
  };
}

/**
 * The most comparisons a shortlist of this size can cost before the board's
 * places are settled. Callers show it before anyone commits to a session.
 */
export function getMaximumPickComparisons(
  candidateCount: number,
  targetCount: number,
) {
  return getMaximumMergeComparisons(candidateCount, targetCount);
}

export function getBoardCandidateIds(
  boardPicks: StoredPicks,
  slotIds: readonly string[],
) {
  const seen = new Set<string>();
  return slotIds.flatMap((slotId) => {
    const songId = boardPicks[slotId];
    if (!songId || seen.has(songId)) return [];
    seen.add(songId);
    return [songId];
  });
}

export function togglePickAssistantShortlistSong(
  shortlistIds: readonly string[],
  songId: string,
  maximumCandidates: number,
) {
  if (shortlistIds.includes(songId)) {
    return {
      status: "updated" as const,
      shortlistIds: shortlistIds.filter(
        (candidateId) => candidateId !== songId,
      ),
    };
  }
  if (shortlistIds.length >= maximumCandidates) {
    return {
      status: "limit" as const,
      shortlistIds: shortlistIds.slice(),
    };
  }
  return {
    status: "updated" as const,
    shortlistIds: [...shortlistIds, songId],
  };
}

export function deriveTournament(
  session: PickAssistantSession,
): TournamentState {
  const replay = replayTournament(session);
  const maximumComparisons = getMaximumMergeComparisons(
    session.candidateIds.length,
    session.targetCount,
  );

  if (replay.complete) {
    return {
      status: "complete",
      orderedIds: replay.orderedIds ?? [],
      decisionsMade: session.decisions.length,
      maximumComparisons,
    };
  }

  const activePair =
    replay.availablePairs.find((pair) => pair.key === session.activePairKey) ??
    replay.availablePairs[0];
  if (!activePair) throw new Error("Tournament has no available comparison");

  return {
    status: "comparing",
    pair: { leftId: activePair.leftId, rightId: activePair.rightId },
    decisionsMade: session.decisions.length,
    maximumComparisons,
  };
}

export function recordComparison(
  session: PickAssistantSession,
  outcome: ComparisonOutcome,
): PickAssistantSession {
  const before = replayTournament(session);
  if (before.complete) return session;
  const activePair =
    before.availablePairs.find((pair) => pair.key === session.activePairKey) ??
    before.availablePairs[0];
  if (!activePair) throw new Error("Tournament has no available comparison");

  const nextBase: PickAssistantSession = {
    ...session,
    decisions: [
      ...session.decisions,
      {
        leftId: activePair.leftId,
        rightId: activePair.rightId,
        outcome,
      },
    ],
    activePairKey: undefined,
  };
  const after = replayTournament(nextBase);
  if (after.complete) return nextBase;

  const nextPair =
    after.availablePairs.find(
      (pair) => pair.jobIndex === activePair.jobIndex,
    ) ??
    after.availablePairs.find((pair) => pair.jobIndex > activePair.jobIndex) ??
    after.availablePairs[0];

  return { ...nextBase, activePairKey: nextPair?.key };
}

export function skipComparison(
  session: PickAssistantSession,
): PickAssistantSession {
  const replay = replayTournament(session);
  if (replay.complete || replay.availablePairs.length < 2) return session;

  const currentIndex = Math.max(
    0,
    replay.availablePairs.findIndex(
      (pair) => pair.key === session.activePairKey,
    ),
  );
  const nextPair =
    replay.availablePairs[(currentIndex + 1) % replay.availablePairs.length];
  return { ...session, activePairKey: nextPair.key };
}

export function undoComparison(
  session: PickAssistantSession,
): PickAssistantSession {
  const undone = session.decisions[session.decisions.length - 1];
  if (!undone) return session;
  return {
    ...session,
    decisions: session.decisions.slice(0, -1),
    activePairKey: getPairKey(undone.leftId, undone.rightId),
  };
}

export function planRankedPicks(options: {
  orderedSongIds: readonly string[];
  slotIds: readonly string[];
  isEligible: (songId: string, slotId: string) => boolean;
}): RankedPickPlan {
  const uniqueSongIds: string[] = [];
  const skipped: RankedPickSkip[] = [];
  const seen = new Set<string>();

  options.orderedSongIds.forEach((songId, index) => {
    if (seen.has(songId)) {
      skipped.push({ songId, rank: index + 1, reason: "duplicate" });
      return;
    }
    seen.add(songId);
    uniqueSongIds.push(songId);
  });

  const matches = findMonotoneMatches(
    uniqueSongIds,
    options.slotIds,
    options.isEligible,
  );
  const slotToSong = new Map(
    matches.map(({ songIndex, slotIndex }) => [
      options.slotIds[slotIndex],
      uniqueSongIds[songIndex],
    ]),
  );
  const matchedSongIndexes = new Set(matches.map((match) => match.songIndex));

  uniqueSongIds.forEach((songId, index) => {
    if (matchedSongIndexes.has(index)) return;
    const hasEligibleSlot = options.slotIds.some((slotId) =>
      options.isEligible(songId, slotId),
    );
    skipped.push({
      songId,
      rank: index + 1,
      reason: hasEligibleSlot ? "capacity" : "ineligible",
    });
  });

  const placements = matches.map(({ songIndex, slotIndex }) => ({
    songId: uniqueSongIds[songIndex],
    slotId: options.slotIds[slotIndex],
    rank: songIndex + 1,
  }));

  return {
    nextPicks: Object.fromEntries(
      options.slotIds.flatMap((slotId) => {
        const songId = slotToSong.get(slotId);
        return songId ? [[slotId, songId]] : [];
      }),
    ),
    placements,
    skipped: skipped.sort((left, right) => left.rank - right.rank),
  };
}

interface MonotoneMatch {
  songIndex: number;
  slotIndex: number;
}

function findMonotoneMatches(
  songIds: readonly string[],
  slotIds: readonly string[],
  isEligible: (songId: string, slotId: string) => boolean,
) {
  const memo = new Map<string, MonotoneMatch[]>();

  const solve = (songIndex: number, slotIndex: number): MonotoneMatch[] => {
    if (songIndex >= songIds.length || slotIndex >= slotIds.length) return [];
    const key = `${songIndex}:${slotIndex}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const candidates = [
      solve(songIndex + 1, slotIndex),
      solve(songIndex, slotIndex + 1),
    ];
    if (isEligible(songIds[songIndex], slotIds[slotIndex])) {
      candidates.push([
        { songIndex, slotIndex },
        ...solve(songIndex + 1, slotIndex + 1),
      ]);
    }

    const best = candidates.reduce((currentBest, candidate) =>
      isBetterMonotoneMatch(candidate, currentBest) ? candidate : currentBest,
    );
    memo.set(key, best);
    return best;
  };

  return solve(0, 0);
}

function isBetterMonotoneMatch(
  candidate: MonotoneMatch[],
  current: MonotoneMatch[],
) {
  if (candidate.length !== current.length) {
    return candidate.length > current.length;
  }
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index].songIndex !== current[index].songIndex) {
      return candidate[index].songIndex < current[index].songIndex;
    }
  }
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index].slotIndex !== current[index].slotIndex) {
      return candidate[index].slotIndex < current[index].slotIndex;
    }
  }
  return false;
}

function replayTournament(session: PickAssistantSession): TournamentReplay {
  if (
    session.candidateIds.length < 2 ||
    new Set(session.candidateIds).size !== session.candidateIds.length
  ) {
    throw new Error("Invalid tournament candidates");
  }

  const targetCount = resolveTargetCount(session);
  let runs = session.candidateIds.map((candidateId) => [candidateId]);
  let decisionIndex = 0;

  while (runs.length > 1) {
    const jobs = createMergeJobs(runs, targetCount);

    while (decisionIndex < session.decisions.length) {
      const availablePairs = getAvailablePairs(jobs, targetCount);
      if (availablePairs.length === 0) break;
      const decision = session.decisions[decisionIndex];
      const matchingPair = availablePairs.find(
        (pair) =>
          pair.leftId === decision.leftId && pair.rightId === decision.rightId,
      );
      if (!matchingPair) throw new Error("Decision does not match tournament");
      applyDecision(jobs[matchingPair.jobIndex], decision.outcome, targetCount);
      decisionIndex += 1;
    }

    const availablePairs = getAvailablePairs(jobs, targetCount);
    if (availablePairs.length > 0) {
      if (decisionIndex !== session.decisions.length) {
        throw new Error("Tournament decision replay stopped early");
      }
      return { complete: false, availablePairs };
    }

    runs = jobs.map((job) => job.merged);
  }

  if (decisionIndex !== session.decisions.length) {
    throw new Error("Tournament contains extra decisions");
  }
  return {
    complete: true,
    orderedIds: runs[0] ?? [],
    availablePairs: [],
  };
}

/**
 * One bottom-up merge round: adjacent runs pair up and a trailing odd run
 * passes through untouched. The executed tournament and its reported maximum
 * must consume runs identically, so both read this plan instead of restating
 * it.
 */
function planMergeRound<TRun>(runs: readonly TRun[]) {
  const pairs: { left: TRun; right: TRun | null }[] = [];
  for (let index = 0; index < runs.length; index += 2) {
    pairs.push({ left: runs[index], right: runs[index + 1] ?? null });
  }
  return pairs;
}

function createMergeJobs(runs: string[][], targetCount: number): MergeJob[] {
  return planMergeRound(runs).map(({ left, right }, index) => {
    const job: MergeJob = {
      index,
      left,
      right: right ?? [],
      leftIndex: 0,
      rightIndex: 0,
      merged: [],
    };
    completeMergeJobIfPossible(job, targetCount);
    return job;
  });
}

function getAvailablePairs(
  jobs: MergeJob[],
  targetCount: number,
): AvailablePair[] {
  return jobs.flatMap((job) => {
    completeMergeJobIfPossible(job, targetCount);
    const leftId = job.left[job.leftIndex];
    const rightId = job.right[job.rightIndex];
    return leftId && rightId
      ? [
          {
            leftId,
            rightId,
            jobIndex: job.index,
            key: getPairKey(leftId, rightId),
          },
        ]
      : [];
  });
}

function applyDecision(
  job: MergeJob,
  outcome: ComparisonOutcome,
  targetCount: number,
) {
  const leftId = job.left[job.leftIndex];
  const rightId = job.right[job.rightIndex];
  if (!leftId || !rightId) throw new Error("Merge job is already complete");

  if (outcome === "left" || outcome === "tie") {
    job.merged.push(leftId);
    job.leftIndex += 1;
  }
  if (outcome === "right" || outcome === "tie") {
    job.merged.push(rightId);
    job.rightIndex += 1;
  }
  completeMergeJobIfPossible(job, targetCount);
}

/**
 * Settles everything this merge can settle without another comparison.
 *
 * A side that has run out leaves the other side's tail already in order. And
 * once the run holds the whole target prefix, nothing left can reach it, so
 * both sides are abandoned where they stand. That truncation is what keeps a
 * long shortlist from costing a full sort, and it is safe because every run is
 * already ordered: no item can enter the final prefix without first being in
 * its own run's prefix.
 */
function completeMergeJobIfPossible(job: MergeJob, targetCount: number) {
  if (job.leftIndex >= job.left.length && job.rightIndex < job.right.length) {
    const room = targetCount - job.merged.length;
    job.merged.push(...job.right.slice(job.rightIndex, job.rightIndex + room));
    job.rightIndex = job.right.length;
  }
  if (job.rightIndex >= job.right.length && job.leftIndex < job.left.length) {
    const room = targetCount - job.merged.length;
    job.merged.push(...job.left.slice(job.leftIndex, job.leftIndex + room));
    job.leftIndex = job.left.length;
  }
  if (job.merged.length >= targetCount) {
    job.merged.length = targetCount;
    job.leftIndex = job.left.length;
    job.rightIndex = job.right.length;
  }
}

function resolveTargetCount(session: PickAssistantSession) {
  return Math.min(session.targetCount, session.candidateIds.length);
}

function getMaximumMergeComparisons(
  candidateCount: number,
  targetCount: number,
) {
  if (candidateCount < 2 || targetCount < 1) return 0;
  const cap = Math.min(targetCount, candidateCount);

  let runLengths = Array.from({ length: candidateCount }, () => 1);
  let maximum = 0;

  while (runLengths.length > 1) {
    runLengths = planMergeRound(runLengths).map(({ left, right }) => {
      if (right === null) return Math.min(left, cap);
      maximum += Math.min(left + right - 1, cap);
      return Math.min(left + right, cap);
    });
  }

  return maximum;
}

function getPairKey(leftId: string, rightId: string) {
  return JSON.stringify([leftId, rightId]);
}

function parseSession(
  value: unknown,
  shortlistIds: string[],
): PickAssistantSession | null | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !Array.isArray(value.candidateIds) ||
    !Array.isArray(value.decisions) ||
    !Number.isInteger(value.targetCount) ||
    (value.targetCount as number) < 1 ||
    (value.activePairKey !== undefined &&
      typeof value.activePairKey !== "string")
  ) {
    return undefined;
  }

  if (
    value.candidateIds.length !== shortlistIds.length ||
    value.candidateIds.some(
      (candidateId, index) => candidateId !== shortlistIds[index],
    )
  ) {
    return undefined;
  }

  const decisions: ComparisonDecision[] = [];
  for (const decision of value.decisions) {
    if (
      !isRecord(decision) ||
      typeof decision.leftId !== "string" ||
      typeof decision.rightId !== "string" ||
      !isComparisonOutcome(decision.outcome)
    ) {
      return undefined;
    }
    decisions.push({
      leftId: decision.leftId,
      rightId: decision.rightId,
      outcome: decision.outcome,
    });
  }

  return {
    candidateIds: shortlistIds.slice(),
    targetCount: value.targetCount as number,
    decisions,
    activePairKey: value.activePairKey as string | undefined,
  };
}

function parseUniqueSongIds(
  values: unknown[],
  validSongIds: ReadonlySet<string>,
) {
  const songIds: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (
      typeof value !== "string" ||
      !validSongIds.has(value) ||
      seen.has(value)
    ) {
      return null;
    }
    seen.add(value);
    songIds.push(value);
  }
  return songIds;
}

function isComparisonOutcome(value: unknown): value is ComparisonOutcome {
  return value === "left" || value === "right" || value === "tie";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
