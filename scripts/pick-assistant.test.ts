import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getExperienceStorageKeys } from "../src/config/project";
import { getExperienceContexts } from "../src/data/pickExperiences";
import { messages } from "../src/i18n/messages";
import type { PickExperience } from "../src/schema/pick-experience";
import {
  createPickAssistantSession,
  createPickAssistantSnapshot,
  deriveTournament,
  getBoardCandidateIds,
  parsePickAssistantSnapshot,
  planRankedPicks,
  recordComparison,
  samePickAssistantApplicationInputs,
  skipComparison,
  togglePickAssistantShortlistSong,
  undoComparison,
  updatePickAssistantSnapshot,
  type ComparisonOutcome,
  type PickAssistantSession,
} from "../src/utils/pickAssistant";
import {
  readLegacyPickAssistantShortlist,
  resetPickAssistantStorageSafely,
  savePickAssistantSnapshot,
  savePickAssistantSnapshotSafely,
} from "../src/utils/pickAssistantStorage";
import {
  boardHistoryReducer,
  createBoardHistoryState,
} from "../src/utils/boardHistory";
import {
  COMBINED_EXPERIENCE_CONTEXT_ID,
  getAssistantEligibleSongIds,
  getAssistantTargetCount,
} from "../src/utils/experienceEligibility";
import {
  planRandomSample,
  RANDOM_SAMPLE_MAX_SIZE,
  RANDOM_SAMPLE_MIN_SIZE,
} from "../src/utils/randomSample";

const validSongIds = new Set(
  Array.from({ length: 30 }, (_, index) => `song-${index + 1}`),
);
const parseOptions = {
  schemaVersion: 2,
  legacySchemaVersion: 1,
  expiresAfterMs: 1_000_000,
  maximumCandidates: 24,
  now: 10_000,
  validSongIds,
};

function candidateSongs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `song-${index + 1}`,
  }));
}

test("random samples are deterministic with an injected RNG and do not mutate candidates", () => {
  const songs = candidateSongs(4);
  const originalIds = songs.map((song) => song.id);
  const randomValues = [0.5, 0, 0.999];
  let randomIndex = 0;

  const sample = planRandomSample(songs, 3, () => randomValues[randomIndex++]);

  assert.deepEqual(
    sample.map((song) => song.id),
    ["song-3", "song-2", "song-4"],
  );
  assert.deepEqual(
    songs.map((song) => song.id),
    originalIds,
  );
  assert.equal(randomIndex, 3);
});

test("random sample size is bounded from 3 through 24", () => {
  const songs = candidateSongs(30);
  assert.equal(
    planRandomSample(songs, RANDOM_SAMPLE_MIN_SIZE, () => 0).length,
    3,
  );
  assert.equal(
    planRandomSample(songs, RANDOM_SAMPLE_MAX_SIZE, () => 0).length,
    24,
  );

  for (const size of [2, 25, 3.5, Number.NaN]) {
    assert.throws(() => planRandomSample(songs, size, () => 0), RangeError);
  }
});

test("random samples deduplicate candidates and return all when the pool is smaller", () => {
  const songs = [
    { id: "song-1", marker: "first" },
    { id: "song-2", marker: "second" },
    { id: "song-1", marker: "duplicate" },
    { id: "song-3", marker: "third" },
    { id: "song-4", marker: "fourth" },
    { id: "song-2", marker: "duplicate" },
  ];

  const sample = planRandomSample(songs, 24, () => 0);
  assert.deepEqual(
    sample.map((song) => song.id),
    ["song-1", "song-2", "song-3", "song-4"],
  );
  assert.equal(new Set(sample.map((song) => song.id)).size, sample.length);
  assert.equal(sample[0]?.marker, "first");
});

function finishTournament(
  candidateIds: string[],
  targetCount = candidateIds.length,
) {
  let session = createPickAssistantSession(candidateIds, targetCount);
  while (deriveTournament(session).status === "comparing") {
    session = recordComparison(session, "left");
  }
  return session;
}

test("merge tournament completes deterministically for even candidates", () => {
  const session = finishTournament(["song-1", "song-2", "song-3", "song-4"]);
  const state = deriveTournament(session);
  assert.equal(state.status, "complete");
  assert.deepEqual(state.status === "complete" ? state.orderedIds : [], [
    "song-1",
    "song-2",
    "song-3",
    "song-4",
  ]);
  assert.ok(session.decisions.length <= 5);
});

test("merge tournament carries an odd candidate into the next round", () => {
  const session = finishTournament([
    "song-1",
    "song-2",
    "song-3",
    "song-4",
    "song-5",
  ]);
  const state = deriveTournament(session);
  assert.equal(state.status, "complete");
  assert.deepEqual(state.status === "complete" ? state.orderedIds : [], [
    "song-1",
    "song-2",
    "song-3",
    "song-4",
    "song-5",
  ]);
});

function tournamentCandidateIds(count: number) {
  return Array.from({ length: count }, (_, index) => `candidate-${index + 1}`);
}

function reportedMaximumComparisons(count: number, targetCount = count) {
  return deriveTournament(
    createPickAssistantSession(tournamentCandidateIds(count), targetCount),
  ).maximumComparisons;
}

function playTournament(
  count: number,
  chooseOutcome: (step: number) => ComparisonOutcome,
  targetCount = count,
) {
  const candidateIds = tournamentCandidateIds(count);
  let session = createPickAssistantSession(candidateIds, targetCount);
  const maximumComparisons = deriveTournament(session).maximumComparisons;
  let step = 0;

  for (;;) {
    const answered = recordComparison(session, chooseOutcome(step));
    if (answered === session) break;
    session = answered;
    step += 1;
    assert.ok(
      session.decisions.length <= maximumComparisons,
      `${count} candidates exceeded the reported ceiling: ` +
        `${session.decisions.length} > ${maximumComparisons}`,
    );
  }

  const state = deriveTournament(session);
  if (state.status !== "complete") {
    throw new Error(`${count} candidates never completed`);
  }
  assert.equal(
    state.orderedIds.length,
    Math.min(count, targetCount),
    `${count} candidates settled the wrong number of places`,
  );
  assert.equal(
    new Set(state.orderedIds).size,
    state.orderedIds.length,
    `${count} candidates duplicated a song`,
  );
  for (const songId of state.orderedIds) {
    assert.ok(
      candidateIds.includes(songId),
      `${count} candidates invented ${songId}`,
    );
  }
  return state.orderedIds;
}

function deepestDecisionCount(session: PickAssistantSession): number {
  const state = deriveTournament(session);
  if (state.status === "complete") return state.decisionsMade;
  return Math.max(
    deepestDecisionCount(recordComparison(session, "left")),
    deepestDecisionCount(recordComparison(session, "right")),
  );
}

test("the reported comparison ceiling follows the executed merge plan", () => {
  const expected = new Map([
    [2, 1],
    [3, 3],
    [4, 5],
    [5, 9],
    [8, 17],
    [9, 25],
    [16, 49],
    [17, 65],
    [24, 89],
    [32, 129],
    [33, 161],
    [64, 321],
    [100, 589],
    [128, 769],
  ]);

  for (const [count, maximumComparisons] of expected) {
    assert.equal(
      reportedMaximumComparisons(count),
      maximumComparisons,
      `${count} candidates`,
    );
  }
});

test("no decision path can push progress past the reported ceiling", () => {
  let seed = 0x2f6e2b1;
  const randomOutcome = (): ComparisonOutcome => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (["left", "right", "tie"] as const)[seed % 3];
  };
  const alternating = (step: number): ComparisonOutcome =>
    step % 2 === 0 ? "left" : "right";
  const strategies: ((step: number) => ComparisonOutcome)[] = [
    () => "left",
    () => "right",
    alternating,
    randomOutcome,
  ];

  for (let count = 2; count <= 32; count += 1) {
    for (const chooseOutcome of strategies) {
      playTournament(count, chooseOutcome);
    }
  }

  // Replaying a decision list costs O(n^2), so the counts above the current cap
  // are swept with one strategy and the largest ones are only spot-checked.
  for (let count = 33; count <= 48; count += 1) {
    playTournament(count, alternating);
  }
  for (const count of [64, 100]) {
    playTournament(count, alternating);
  }
});

test("the reported comparison ceiling is reachable, not merely safe", () => {
  for (let count = 2; count <= 7; count += 1) {
    assert.equal(
      deepestDecisionCount(
        createPickAssistantSession(tournamentCandidateIds(count), count),
      ),
      reportedMaximumComparisons(count),
      `${count} candidates`,
    );
  }
});

/**
 * Answers every comparison from a fixed total order, which is what lets a test
 * say what the right answer was.
 */
function settleAgainstTruth(
  candidateIds: string[],
  targetCount: number,
  truth: readonly string[],
) {
  const rankOf = new Map(truth.map((songId, index) => [songId, index]));
  let session = createPickAssistantSession(candidateIds, targetCount);

  for (;;) {
    const state = deriveTournament(session);
    if (state.status !== "comparing") {
      return {
        orderedIds: state.orderedIds,
        decisionsMade: state.decisionsMade,
      };
    }
    const left = rankOf.get(state.pair.leftId) ?? Number.POSITIVE_INFINITY;
    const right = rankOf.get(state.pair.rightId) ?? Number.POSITIVE_INFINITY;
    session = recordComparison(session, left < right ? "left" : "right");
  }
}

function shuffled(values: readonly string[], seed: number) {
  const result = values.slice();
  let state = seed;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

test("ranking only the places the board needs still produces the true top of the order", () => {
  for (const count of [4, 7, 10, 17, 24, 33, 50]) {
    const truth = tournamentCandidateIds(count);
    for (const targetCount of [1, 2, 6, 10, count]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const settled = settleAgainstTruth(
          shuffled(truth, seed * count),
          targetCount,
          truth,
        );
        assert.deepEqual(
          settled.orderedIds,
          truth.slice(0, Math.min(targetCount, count)),
          `${count} candidates, target ${targetCount}, seed ${seed}`,
        );
      }
    }
  }
});

test("settling fewer places costs fewer comparisons and never more than the ceiling", () => {
  const truth = tournamentCandidateIds(50);
  const full = settleAgainstTruth(shuffled(truth, 7), 50, truth);
  const topTen = settleAgainstTruth(shuffled(truth, 7), 10, truth);

  assert.ok(
    topTen.decisionsMade < full.decisionsMade,
    `top ten cost ${topTen.decisionsMade}, full sort cost ${full.decisionsMade}`,
  );
  assert.ok(topTen.decisionsMade <= reportedMaximumComparisons(50, 10));
  assert.ok(full.decisionsMade <= reportedMaximumComparisons(50, 50));
});

test("the ceiling drops with the target and stays exact for the sizes people hit", () => {
  const expected = new Map([
    ["17/10", 54],
    ["17/17", 65],
    ["24/10", 71],
    ["31/10", 95],
    ["62/10", 200],
    ["85/10", 279],
    ["100/10", 329],
    ["100/100", 589],
    ["31/6", 80],
    ["85/6", 229],
  ]);

  for (const [label, maximumComparisons] of expected) {
    const [count, targetCount] = label.split("/").map(Number);
    assert.equal(
      reportedMaximumComparisons(count, targetCount),
      maximumComparisons,
      label,
    );
  }
});

test("a truncated ceiling is reachable too, not merely safe", () => {
  for (let count = 2; count <= 7; count += 1) {
    for (let targetCount = 1; targetCount <= count; targetCount += 1) {
      assert.equal(
        deepestDecisionCount(
          createPickAssistantSession(
            tournamentCandidateIds(count),
            targetCount,
          ),
        ),
        reportedMaximumComparisons(count, targetCount),
        `${count} candidates, target ${targetCount}`,
      );
    }
  }
});

test("a truncated session survives serialization, undo, and skip unchanged", () => {
  const truth = tournamentCandidateIds(20);
  const rankOf = new Map(truth.map((songId, index) => [songId, index]));
  const candidateIds = shuffled(truth, 99);
  const catalog = new Set(candidateIds);
  let session = createPickAssistantSession(candidateIds, 10);

  for (let step = 0; step < 12; step += 1) {
    const state = deriveTournament(session);
    if (state.status !== "comparing") break;
    session = recordComparison(
      session,
      (rankOf.get(state.pair.leftId) ?? 0) <
        (rankOf.get(state.pair.rightId) ?? 0)
        ? "left"
        : "right",
    );
  }

  const skipped = skipComparison(session);
  const restored = undoComparison(recordComparison(skipped, "left"));
  assert.deepEqual(deriveTournament(restored), deriveTournament(skipped));

  const snapshot = updatePickAssistantSnapshot(
    createPickAssistantSnapshot(2, 9_000, "truncated"),
    { shortlistIds: candidateIds, session },
    9_100,
    "truncated",
  );
  const parsed = parsePickAssistantSnapshot(JSON.stringify(snapshot), {
    ...parseOptions,
    maximumCandidates: 20,
    validSongIds: catalog,
  });

  if (parsed.status !== "valid") {
    throw new Error(
      `a truncated session did not survive storage: ${parsed.status}`,
    );
  }
  const resumed = parsed.snapshot.session;
  if (!resumed) throw new Error("the resumed snapshot lost its session");

  assert.equal(resumed.targetCount, 10);
  assert.deepEqual(deriveTournament(resumed), deriveTournament(session));
});

test("a pre-Top-K saved session hands back its shortlist instead of reading as damage", () => {
  const legacy = {
    schemaVersion: 1,
    revision: 4,
    updatedAt: 9_000,
    mutationId: "legacy",
    shortlistIds: ["song-1", "song-2", "song-3"],
    session: {
      candidateIds: ["song-1", "song-2", "song-3"],
      decisions: [{ leftId: "song-1", rightId: "song-2", outcome: "left" }],
    },
  };
  const options = {
    legacySchemaVersion: 1,
    expiresAfterMs: 1_000_000,
    maximumCandidates: 24,
    validSongIds,
    now: 10_000,
  };
  const storage = {
    getItem: (key: string) =>
      key === "legacy" ? JSON.stringify(legacy) : null,
  };

  assert.deepEqual(
    readLegacyPickAssistantShortlist(storage, "legacy", options),
    ["song-1", "song-2", "song-3"],
  );

  // A v2 document is not a legacy document, and neither is an expired,
  // unreadable, or unknown-song one.
  assert.equal(
    readLegacyPickAssistantShortlist(
      { getItem: () => JSON.stringify({ ...legacy, schemaVersion: 2 }) },
      "legacy",
      options,
    ),
    null,
  );
  assert.equal(
    readLegacyPickAssistantShortlist(
      { getItem: () => JSON.stringify(legacy) },
      "legacy",
      {
        ...options,
        now: 9_000 + options.expiresAfterMs + 1,
      },
    ),
    null,
  );
  assert.equal(
    readLegacyPickAssistantShortlist({ getItem: () => "{" }, "legacy", options),
    null,
  );
  assert.equal(
    readLegacyPickAssistantShortlist(
      { getItem: () => JSON.stringify({ ...legacy, shortlistIds: ["nope"] }) },
      "legacy",
      options,
    ),
    null,
  );
  assert.equal(
    readLegacyPickAssistantShortlist(
      { getItem: () => null },
      "legacy",
      options,
    ),
    null,
  );
});

test("ranking stops at the slot count only when every slot accepts every candidate", () => {
  const slotIds = ["slot-1", "slot-2", "slot-3"];
  const candidateIds = ["song-1", "song-2", "song-3", "song-4", "song-5"];

  assert.equal(
    getAssistantTargetCount({
      slotIds,
      candidateIds,
      isEligible: () => true,
    }),
    slotIds.length,
  );

  // One slot that draws on a narrower setlist is enough: filling it can need a
  // song the first three places never reach.
  assert.equal(
    getAssistantTargetCount({
      slotIds,
      candidateIds,
      isEligible: (songId, slotId) =>
        slotId !== "slot-3" || songId === "song-5",
    }),
    candidateIds.length,
  );

  // A board with more slots than candidates still asks for every place.
  assert.equal(
    getAssistantTargetCount({
      slotIds: ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"],
      candidateIds: ["song-1", "song-2"],
      isEligible: (songId) => songId === "song-1",
    }),
    6,
  );
});

test("a shortlist wider than the slots still fills every slot it can when eligibility is narrow", () => {
  const slotIds = ["slot-1", "slot-2"];
  const candidateIds = ["song-1", "song-2", "song-3", "song-4"];
  const isEligible = (songId: string, slotId: string) =>
    slotId === "slot-1" ? songId !== "song-4" : songId === "song-4";

  const targetCount = getAssistantTargetCount({
    slotIds,
    candidateIds,
    isEligible,
  });
  assert.equal(targetCount, candidateIds.length);

  const settled = deriveTournament(finishTournament(candidateIds, targetCount));
  if (settled.status !== "complete") throw new Error("the tournament stalled");
  const plan = planRankedPicks({
    orderedSongIds: settled.orderedIds,
    slotIds,
    isEligible,
  });

  assert.equal(settled.orderedIds.length, candidateIds.length);

  assert.deepEqual(plan.nextPicks, { "slot-1": "song-1", "slot-2": "song-4" });
});

test("tie is stable and skip rotates without recording a preference", () => {
  let session = createPickAssistantSession(
    ["song-1", "song-2", "song-3", "song-4"],
    4,
  );
  const firstPair = deriveTournament(session);
  session = skipComparison(session);
  const skippedPair = deriveTournament(session);
  assert.equal(session.decisions.length, 0);
  assert.notDeepEqual(skippedPair, firstPair);

  session = recordComparison(session, "tie");
  assert.deepEqual(session.decisions[0], {
    leftId: "song-3",
    rightId: "song-4",
    outcome: "tie",
  });
});

test("skip returns the same recoverable session when no other pair exists", () => {
  const session = createPickAssistantSession(["song-1", "song-2", "song-3"], 3);
  const skipped = skipComparison(session);
  assert.equal(skipped, session);
  assert.deepEqual(deriveTournament(skipped), deriveTournament(session));
});

test("serialized session resumes exactly and undo restores the prior pair", () => {
  let session = createPickAssistantSession(
    ["song-1", "song-2", "song-3", "song-4"],
    4,
  );
  const originalPair = deriveTournament(session);
  session = recordComparison(session, "right");
  const snapshot = updatePickAssistantSnapshot(
    createPickAssistantSnapshot(2, 9_000, "initial"),
    { shortlistIds: session.candidateIds, session },
    9_500,
    "saved",
  );
  const parsed = parsePickAssistantSnapshot(
    JSON.stringify(snapshot),
    parseOptions,
  );
  assert.equal(parsed.status, "valid");
  const restored = parsed.status === "valid" ? parsed.snapshot.session : null;
  assert.ok(restored);
  assert.deepEqual(deriveTournament(restored), deriveTournament(session));

  const undone = undoComparison(restored);
  assert.equal(undone.decisions.length, 0);
  assert.deepEqual(deriveTournament(undone), originalPair);
});

test("candidate limit and corrupt session are rejected", () => {
  const tooMany = {
    ...createPickAssistantSnapshot(2, 9_500, "large"),
    shortlistIds: Array.from({ length: 25 }, (_, index) => `song-${index + 1}`),
  };
  assert.equal(
    parsePickAssistantSnapshot(JSON.stringify(tooMany), parseOptions).status,
    "corrupt",
  );

  const invalidSession: PickAssistantSession = {
    candidateIds: ["song-1", "song-2"],
    targetCount: 2,
    decisions: [{ leftId: "song-2", rightId: "song-1", outcome: "left" }],
  };
  const corrupt = {
    ...createPickAssistantSnapshot(2, 9_500, "invalid-session"),
    shortlistIds: invalidSession.candidateIds,
    session: invalidSession,
  };
  assert.equal(
    parsePickAssistantSnapshot(JSON.stringify(corrupt), parseOptions).status,
    "corrupt",
  );
});

test("expired storage is isolated until an explicit reset", () => {
  const expired = createPickAssistantSnapshot(2, 1_000, "expired");
  assert.equal(
    parsePickAssistantSnapshot(JSON.stringify(expired), {
      ...parseOptions,
      now: 10_000,
      expiresAfterMs: 1_000,
    }).status,
    "expired",
  );
});

test("eligibility planner maximizes placements without duplicates", () => {
  const plan = planRankedPicks({
    orderedSongIds: ["flexible", "strict", "duplicate", "duplicate", "blocked"],
    slotIds: ["catalog", "strict-slot"],
    isEligible: (songId, slotId) =>
      songId !== "blocked" && (slotId === "catalog" || songId === "strict"),
  });
  assert.deepEqual(plan.nextPicks, {
    catalog: "flexible",
    "strict-slot": "strict",
  });
  assert.deepEqual(
    plan.skipped.map(({ songId, reason }) => [songId, reason]),
    [
      ["duplicate", "capacity"],
      ["duplicate", "duplicate"],
      ["blocked", "ineligible"],
    ],
  );
});

test("eligibility planner never moves a lower rank ahead of a higher rank", () => {
  const plan = planRankedPicks({
    orderedSongIds: ["high", "low"],
    slotIds: ["slot-1", "slot-2"],
    isEligible: (songId, slotId) =>
      songId === "high" || (songId === "low" && slotId === "slot-1"),
  });
  assert.deepEqual(plan.nextPicks, { "slot-1": "high" });
  assert.deepEqual(plan.placements, [
    { songId: "high", slotId: "slot-1", rank: 1 },
  ]);
  assert.deepEqual(plan.skipped, [
    { songId: "low", rank: 2, reason: "capacity" },
  ]);
});

test("eligibility planner matches the exhaustive monotone optimum", () => {
  for (let songCount = 1; songCount <= 3; songCount += 1) {
    for (let slotCount = 1; slotCount <= 3; slotCount += 1) {
      const songIds = Array.from(
        { length: songCount },
        (_, index) => `song-${index + 1}`,
      );
      const slotIds = Array.from(
        { length: slotCount },
        (_, index) => `slot-${index + 1}`,
      );
      const matrixSize = songCount * slotCount;
      for (let mask = 0; mask < 2 ** matrixSize; mask += 1) {
        const isEligible = (songId: string, slotId: string) => {
          const songIndex = songIds.indexOf(songId);
          const slotIndex = slotIds.indexOf(slotId);
          return Boolean(mask & (1 << (songIndex * slotCount + slotIndex)));
        };
        const plan = planRankedPicks({
          orderedSongIds: songIds,
          slotIds,
          isEligible,
        });
        assert.equal(
          plan.placements.length,
          getMaximumMonotonePlacementCount(songIds, slotIds, isEligible),
        );
        assert.deepEqual(
          plan.placements.map(({ rank }) => rank),
          [...plan.placements.map(({ rank }) => rank)].sort(
            (left, right) => left - right,
          ),
        );
      }
    }
  }
});

test("assistant application is one undoable and redoable board step", () => {
  const before = { "slot-1": "song-4", "slot-5": "song-8" };
  const after = { "slot-1": "song-1", "slot-2": "song-2" };
  let history = createBoardHistoryState(before);
  history = boardHistoryReducer(history, {
    type: "commit",
    mutation: { kind: "assistant", nextPicks: after },
  });
  assert.equal(history.past.length, 1);
  assert.deepEqual(history.present, after);

  history = boardHistoryReducer(history, { type: "undo" });
  assert.deepEqual(history.present, before);
  history = boardHistoryReducer(history, { type: "redo" });
  assert.deepEqual(history.present, after);
});

test("standard experiences keep the full project catalog available to the Assistant", () => {
  for (const projectId of PROJECT_IDS) {
    const catalogSongIds = loadProjectSongIds(projectId);
    const standardExperience = createStandardExperience(projectId);
    assert.deepEqual(
      getAssistantEligibleSongIds({
        experience: standardExperience,
        catalogSongIds,
      }),
      catalogSongIds,
    );
    assert.deepEqual(
      getAssistantEligibleSongIds({
        experience: standardExperience,
        catalogSongIds,
        contextId: "unknown",
      }),
      [],
    );
  }
});

test("every published Experience Pack derives Assistant candidates from the same configured eligibility set", () => {
  for (const projectId of PROJECT_IDS) {
    const catalogSongIds = loadProjectSongIds(projectId);
    const experiences = loadProjectExperiences(projectId).filter(
      (experience) => experience.status === "published",
    );

    for (const experience of experiences) {
      const contexts = getConfiguredContextIds(experience);
      for (const contextId of contexts) {
        const assistantSongIds = getAssistantEligibleSongIds({
          experience,
          catalogSongIds,
          contextId,
        });
        const strictSlots = experience.slots.filter(
          (slot) => slot.eligibility !== "catalog",
        );

        if (strictSlots.length === 0) {
          assert.deepEqual(assistantSongIds, catalogSongIds);
          assert.ok(
            experience.slots.every((slot) => slot.eligibility === "catalog"),
          );
          continue;
        }

        const expectedContextSongIds = getExpectedContextSongIds(
          experience,
          contextId,
          new Set(catalogSongIds),
        );
        assert.deepEqual(assistantSongIds, expectedContextSongIds);
        for (const slot of strictSlots) {
          const directSlotSongIds =
            slot.eligibility === "event-union"
              ? getExpectedEventUnionSongIds(
                  experience,
                  new Set(catalogSongIds),
                )
              : expectedContextSongIds;
          assert.deepEqual(directSlotSongIds, assistantSongIds);
        }
      }
    }
  }
});

test("verified anniversary contexts preserve exact unique eligibility counts and unions", () => {
  const cases = [
    {
      projectId: "equal-love" as const,
      experienceId: "kokuritsu_2026",
      counts: { day1: 29, day2: 30, both: 31 },
    },
    {
      projectId: "nearly-equal-joy" as const,
      experienceId: "joy_4th_anniversary_2026_afterglow",
      counts: { day: 27, night: 27, both: 27 },
    },
    {
      projectId: "not-equal-me" as const,
      experienceId: "not_equal_me_7th_anniversary_2026_afterglow",
      counts: { day: 27, night: 27, both: 37 },
    },
  ];

  for (const fixture of cases) {
    const experience = loadProjectExperiences(fixture.projectId).find(
      (candidate) => candidate.id === fixture.experienceId,
    );
    assert.ok(experience);
    const catalogSongIds = loadProjectSongIds(fixture.projectId);
    for (const [contextId, expectedCount] of Object.entries(fixture.counts)) {
      const actual = getAssistantEligibleSongIds({
        experience,
        catalogSongIds,
        contextId,
      });
      assert.equal(actual.length, expectedCount);
      assert.deepEqual(
        actual,
        getExpectedContextSongIds(
          experience,
          contextId,
          new Set(catalogSongIds),
        ),
      );
    }
  }
});

test("ordered anniversary setlists retain real repeats while eligibility stays unique", () => {
  const joy = loadProjectExperiences("nearly-equal-joy").find(
    (experience) => experience.id === "joy_4th_anniversary_2026_afterglow",
  );
  const notEqualMe = loadProjectExperiences("not-equal-me").find(
    (experience) =>
      experience.id === "not_equal_me_7th_anniversary_2026_afterglow",
  );
  assert.ok(joy?.performances);
  assert.ok(notEqualMe?.performances);

  const joyDay = joy.performances.find(
    (performance) => performance.id === "day",
  );
  const joyNight = joy.performances.find(
    (performance) => performance.id === "night",
  );
  const notEqualMeDay = notEqualMe.performances.find(
    (performance) => performance.id === "day",
  );
  const notEqualMeNight = notEqualMe.performances.find(
    (performance) => performance.id === "night",
  );
  assert.equal(joyDay?.setlist.length, 28);
  assert.equal(joyNight?.setlist.length, 29);
  assert.equal(notEqualMeDay?.setlist.length, 27);
  assert.equal(notEqualMeNight?.setlist.length, 28);
  assert.deepEqual(joyDay?.provenance?.repeatedSongIds, [
    "denwabangou-oshie-te",
  ]);
  assert.deepEqual(
    new Set(joyNight?.provenance?.repeatedSongIds),
    new Set(["denwabangou-oshie-te", "nearly-equal-joy"]),
  );
  assert.deepEqual(notEqualMeDay?.provenance?.repeatedSongIds, []);
  assert.deepEqual(notEqualMeNight?.provenance?.repeatedSongIds, [
    "not-equal-me",
  ]);
});

test("same-date day and night contexts render one date instead of a fake range", () => {
  for (const [projectId, experienceId, fullDate, shortDate] of [
    [
      "nearly-equal-joy",
      "joy_4th_anniversary_2026_afterglow",
      "2026.03.13",
      "3/13",
    ],
    [
      "not-equal-me",
      "not_equal_me_7th_anniversary_2026_afterglow",
      "2026.02.23",
      "2/23",
    ],
  ] as const) {
    const experience = loadProjectExperiences(projectId).find(
      (candidate) => candidate.id === experienceId,
    );
    assert.ok(experience);
    const combined = getExperienceContexts(experience).find(
      (context) => context.id === COMBINED_EXPERIENCE_CONTEXT_ID,
    );
    assert.ok(combined);
    assert.equal(combined.dateLabel, fullDate);
    assert.equal(combined.shortDateLabel, shortDate);
    assert.equal(combined.exportLabel, `昼・夜 · ${fullDate}`);
  }
});

test("exact anniversary experiences use fresh storage identities without migrating wishlist keys", () => {
  for (const [previousId, nextId] of [
    ["joy_4th_anniversary_2026", "joy_4th_anniversary_2026_afterglow"],
    [
      "not_equal_me_7th_anniversary_2026",
      "not_equal_me_7th_anniversary_2026_afterglow",
    ],
  ] as const) {
    assert.notEqual(
      getExperienceStorageKeys(previousId, "both").picks,
      getExperienceStorageKeys(nextId, "both").picks,
    );
    assert.notEqual(
      getExperienceStorageKeys(previousId, "both").assistant,
      getExperienceStorageKeys(nextId, "both").assistant,
    );
  }
});

test("context-bound Assistant eligibility fails closed for empty or unknown contexts", () => {
  const catalogSongIds = loadProjectSongIds("equal-love");
  const kokuritsu = loadProjectExperiences("equal-love").find(
    (experience) => experience.id === "kokuritsu_2026",
  );
  assert.ok(kokuritsu);
  for (const contextId of [undefined, "", "day3", "all"] as const) {
    assert.deepEqual(
      getAssistantEligibleSongIds({
        experience: kokuritsu,
        catalogSongIds,
        contextId,
      }),
      [],
    );
  }
});

test("Live random samples stay inside the current context eligibility", () => {
  const catalogSongIds = loadProjectSongIds("equal-love");
  const kokuritsu = loadProjectExperiences("equal-love").find(
    (experience) => experience.id === "kokuritsu_2026",
  );
  assert.ok(kokuritsu);

  for (const contextId of ["day1", "day2", "both"] as const) {
    const eligibleIds = getAssistantEligibleSongIds({
      experience: kokuritsu,
      catalogSongIds,
      contextId,
    });
    const eligibleIdSet = new Set(eligibleIds);
    const sample = planRandomSample(
      eligibleIds.map((id) => ({ id })),
      6,
      () => 0.5,
    );

    assert.equal(sample.length, 6);
    assert.equal(new Set(sample.map((song) => song.id)).size, sample.length);
    assert.ok(
      sample.every((song) => eligibleIdSet.has(song.id)),
      `${contextId} random sample escaped its eligible set`,
    );
  }
});

test("Assistant Search and the visible available count share one derived collection", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/PickExperienceClient.tsx"),
    "utf8",
  );
  assert.match(
    source,
    /searchSelectionMode === "assistant-shortlist"\s*\? assistantEligibleSongs/,
  );
  assert.match(
    source,
    /const eligibleSongsCount = assistantEligibleSongs\.length;/,
  );
  assert.match(source, /candidateEligibleSongIds=\{assistantEligibleSongIds\}/);
  assert.doesNotMatch(
    source,
    /searchSelectionMode === "assistant-shortlist"[\s\S]{0,160}\bSONGS\b/,
  );

  const searchSource = readFileSync(
    resolve(process.cwd(), "src/components/SearchModal.tsx"),
    "utf8",
  );
  assert.match(
    searchSource,
    /shouldShowGraduatedMemberFeaturesByDefault\(selectionMode\)/,
  );
});

test("random sample wiring only commits the current Assistant shortlist", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/PickExperienceClient.tsx"),
    "utf8",
  );
  const handlerStart = source.indexOf("const handleCreateRandomSample");
  const handlerEnd = source.indexOf(
    "\n  const handleRemoveCandidate",
    handlerStart,
  );
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);

  assert.match(
    handler,
    /planRandomSample\(\s*assistantEligibleSongs,\s*assistantRandomSampleSize,\s*Math\.random,/,
  );
  assert.match(handler, /commitPickAssistantUpdate\(randomSampleIds, null\)/);
  assert.doesNotMatch(
    handler,
    /commitUserMutation|commitBoardTransaction|setStoredPicks|nextPicks/,
    "creating a random sample must never write the board directly",
  );
  assert.match(source, /randomSampleCount=\{assistantRandomSampleCount\}/);
});

test("random sample UI stays explicit in all four locales", () => {
  assert.deepEqual(
    {
      en: messages.en["assistant.randomSampleLabel"],
      ja: messages.ja["assistant.randomSampleLabel"],
      "zh-CN": messages["zh-CN"]["assistant.randomSampleLabel"],
      ko: messages.ko["assistant.randomSampleLabel"],
    },
    {
      en: "Random sample",
      ja: "ランダムサンプル",
      "zh-CN": "随机样本",
      ko: "무작위 샘플",
    },
  );

  const modalSource = readFileSync(
    resolve(process.cwd(), "src/components/PickAssistantModal.tsx"),
    "utf8",
  );
  assert.ok(
    modalSource.match(/assistant\.randomSampleLabel/g)?.length === 2,
    "the random entry and its resulting shortlist must both carry the label",
  );
  assert.match(
    modalSource,
    /const canCreateRandomSample = randomSampleCount >= minimumCandidates/,
  );
});

test("the empty Assistant action stays centered when no board import action is available", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/PickAssistantModal.tsx"),
    "utf8",
  );
  const emptyStateStart = source.indexOf("if (shortlist.length === 0)");
  const emptyState = source.slice(
    emptyStateStart,
    source.indexOf("\n  return (\n", emptyStateStart),
  );

  assert.match(
    emptyState,
    /className=\{`mx-auto mt-6 grid max-w-sm gap-2 \$\{canImportCurrentBoard \? "sm:grid-cols-2" : ""\}`\}/,
    "the empty-state action group may split into columns only when both actions render",
  );
  assert.doesNotMatch(
    emptyState,
    /className="[^"]*sm:grid-cols-2[^"]*"/,
    "a single CTA must not be stranded in the left half of a two-column grid",
  );
  assert.match(
    emptyState,
    /ref=\{browseCandidatesRef\}[\s\S]*className="official-button official-button-primary w-full"/,
    "the centered CTA must retain its full-width mobile and touch-target behavior",
  );
});

test("current board songs become assistant candidates in slot order without duplicates", () => {
  const boardPicks = {
    "slot-1": "song-1",
    "slot-2": "song-2",
    "slot-3": "song-1",
  };
  const candidateIds = getBoardCandidateIds(boardPicks, [
    "slot-1",
    "slot-2",
    "slot-3",
  ]);
  assert.deepEqual(candidateIds, ["song-1", "song-2"]);

  const snapshot = updatePickAssistantSnapshot(
    createPickAssistantSnapshot(2, 9_000, "initial"),
    { shortlistIds: candidateIds, session: null },
    9_100,
    "board-import",
  );
  assert.deepEqual(snapshot.shortlistIds, ["song-1", "song-2"]);
});

test("assistant shortlist action adds board songs, updates the count, removes, and enforces the limit", () => {
  const boardPicks = { "slot-1": "song-1" };
  let shortlistIds: string[] = [];

  for (const songId of ["song-1", "song-2", "song-3"]) {
    const update = togglePickAssistantShortlistSong(shortlistIds, songId, 3);
    assert.equal(update.status, "updated");
    shortlistIds = update.shortlistIds;
  }
  assert.equal(shortlistIds.length, 3);
  assert.deepEqual(shortlistIds, ["song-1", "song-2", "song-3"]);
  assert.deepEqual(boardPicks, { "slot-1": "song-1" });

  const limited = togglePickAssistantShortlistSong(shortlistIds, "song-4", 3);
  assert.equal(limited.status, "limit");
  assert.deepEqual(limited.shortlistIds, shortlistIds);

  const removed = togglePickAssistantShortlistSong(shortlistIds, "song-1", 3);
  assert.equal(removed.status, "updated");
  assert.deepEqual(removed.shortlistIds, ["song-2", "song-3"]);
});

test("assistant keys are isolated by experience and context", () => {
  const keys = [
    getExperienceStorageKeys("standard").assistant,
    getExperienceStorageKeys("live-tour", "day-1").assistant,
    getExperienceStorageKeys("live-tour", "day-2").assistant,
    getExperienceStorageKeys("live-tour", "both").assistant,
    getExperienceStorageKeys("anniversary", "day-1").assistant,
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(
    getExperienceStorageKeys("live-tour", "day-1").assistant,
    keys[1],
  );
});

test("future and corrupt storage fail closed instead of being overwritten", () => {
  const expected = createPickAssistantSnapshot(2, 9_000, "expected");
  const next = updatePickAssistantSnapshot(
    expected,
    { shortlistIds: ["song-1"], session: null },
    9_500,
    "next",
  );
  for (const existing of ["{broken", JSON.stringify({ schemaVersion: 2 })]) {
    let stored = existing;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    const result = savePickAssistantSnapshot(
      storage,
      "assistant",
      expected,
      next,
      parseOptions,
    );
    assert.equal(result.status, "blocked");
    assert.equal(stored, existing);
  }
});

test("a failed shortlist write never reports success or changes persisted state", async () => {
  const expected = createPickAssistantSnapshot(2, 9_000, "expected");
  const next = updatePickAssistantSnapshot(
    expected,
    { shortlistIds: ["song-1"], session: null },
    9_500,
    "next",
  );
  const stored: string | null = null;
  const result = await savePickAssistantSnapshotSafely(
    {
      getItem: () => stored,
      setItem: () => {
        throw new Error("storage unavailable");
      },
    },
    "assistant",
    expected,
    next,
    parseOptions,
    {
      request: async <T>(_name: string, callback: () => T | PromiseLike<T>) =>
        callback(),
    },
  );
  assert.equal(result.status, "unavailable");
  assert.equal(stored, null);
});

test("a stale tab cannot overwrite a newer complete snapshot", () => {
  const stale = createPickAssistantSnapshot(2, 9_000, "stale");
  const newer = {
    ...updatePickAssistantSnapshot(
      stale,
      { shortlistIds: ["song-1"], session: null },
      9_200,
      "newer-1",
    ),
    revision: 4,
  };
  let stored = JSON.stringify(newer);
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  };
  const staleNext = updatePickAssistantSnapshot(
    stale,
    { shortlistIds: ["song-2"], session: null },
    9_500,
    "stale-next",
  );
  assert.equal(
    savePickAssistantSnapshot(
      storage,
      "assistant",
      stale,
      staleNext,
      parseOptions,
    ).status,
    "conflict",
  );
  assert.equal(stored, JSON.stringify(newer));
});

test("storage lock serializes concurrent writers and rejects the stale one", async () => {
  const expected = createPickAssistantSnapshot(2, 9_000, "expected");
  const first = updatePickAssistantSnapshot(
    expected,
    { shortlistIds: ["song-1"], session: null },
    9_100,
    "first",
  );
  const second = updatePickAssistantSnapshot(
    expected,
    { shortlistIds: ["song-2"], session: null },
    9_200,
    "second",
  );
  let stored: string | null = null;
  let queue = Promise.resolve();
  const locks = {
    request: async <T>(_name: string, callback: () => T | PromiseLike<T>) => {
      const previous = queue;
      let release: () => void = () => {};
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback();
      } finally {
        release();
      }
    },
  };
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  };

  const [firstResult, secondResult] = await Promise.all([
    savePickAssistantSnapshotSafely(
      storage,
      "assistant",
      expected,
      first,
      parseOptions,
      locks,
    ),
    savePickAssistantSnapshotSafely(
      storage,
      "assistant",
      expected,
      second,
      parseOptions,
      locks,
    ),
  ]);
  assert.deepEqual([firstResult.status, secondResult.status].sort(), [
    "conflict",
    "saved",
  ]);
  assert.equal(JSON.parse(stored ?? "{}").mutationId, "first");
});

test("fallback write verifies that its mutation was not replaced", async () => {
  const expected = createPickAssistantSnapshot(2, 9_000, "expected");
  const next = updatePickAssistantSnapshot(
    expected,
    { shortlistIds: ["song-1"], session: null },
    9_100,
    "next",
  );
  const replacement = updatePickAssistantSnapshot(
    expected,
    { shortlistIds: ["song-2"], session: null },
    9_200,
    "replacement",
  );
  let stored: string | null = null;
  let replaceBeforeVerification = false;
  const journal = new Map<string, string>();
  const storage = {
    get length() {
      return journal.size + (stored === null ? 0 : 1);
    },
    key: (index: number) =>
      [...(stored === null ? [] : ["assistant"]), ...journal.keys()][index] ??
      null,
    getItem: (key: string) => {
      if (key !== "assistant") return journal.get(key) ?? null;
      if (replaceBeforeVerification) return JSON.stringify(replacement);
      return stored;
    },
    setItem: (key: string, value: string) => {
      if (key === "assistant") {
        stored = value;
        replaceBeforeVerification = true;
      } else {
        journal.set(key, value);
      }
    },
    removeItem: (key: string) => {
      if (key === "assistant") stored = null;
      else journal.delete(key);
    },
  };
  const result = await savePickAssistantSnapshotSafely(
    storage,
    "assistant",
    expected,
    next,
    parseOptions,
  );
  assert.equal(result.status, "conflict");
});

test("reset shares the save lock and cannot revive an in-flight session", async () => {
  const expected = createPickAssistantSnapshot(2, 9_000, "expected");
  const next = updatePickAssistantSnapshot(
    expected,
    { shortlistIds: ["song-1"], session: null },
    9_100,
    "next",
  );
  let stored: string | null = JSON.stringify(expected);
  let queue = Promise.resolve();
  const locks = {
    request: async <T>(_name: string, callback: () => T | PromiseLike<T>) => {
      const previous = queue;
      let release: () => void = () => {};
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback();
      } finally {
        release();
      }
    },
  };
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
    removeItem: () => {
      stored = null;
    },
  };

  const [saveResult, resetResult] = await Promise.all([
    savePickAssistantSnapshotSafely(
      storage,
      "assistant",
      expected,
      next,
      parseOptions,
      locks,
    ),
    resetPickAssistantStorageSafely(storage, "assistant", locks),
  ]);
  assert.equal(saveResult.status, "saved");
  assert.equal(resetResult, "reset");
  assert.equal(stored, null);
});

test("application freshness gate rejects post-confirm context, board, or full snapshot changes", () => {
  const assistantSnapshot = updatePickAssistantSnapshot(
    createPickAssistantSnapshot(2, 9_000, "initial"),
    { shortlistIds: ["song-1", "song-2"], session: null },
    9_100,
    "complete",
  );
  const expected = {
    contextId: "day-1",
    boardPicks: { first: "song-1" },
    assistantSnapshot,
  };

  assert.equal(
    samePickAssistantApplicationInputs(expected, {
      contextId: "day-1",
      boardPicks: { first: "song-1" },
      assistantSnapshot: {
        ...assistantSnapshot,
        shortlistIds: assistantSnapshot.shortlistIds.slice(),
      },
    }),
    true,
  );
  assert.equal(
    samePickAssistantApplicationInputs(expected, {
      ...expected,
      contextId: "day-2",
    }),
    false,
  );
  assert.equal(
    samePickAssistantApplicationInputs(expected, {
      ...expected,
      boardPicks: { first: "song-2" },
    }),
    false,
  );
  assert.equal(
    samePickAssistantApplicationInputs(expected, {
      ...expected,
      assistantSnapshot: {
        ...assistantSnapshot,
        shortlistIds: ["song-2", "song-1"],
      },
    }),
    false,
  );
});

function getMaximumMonotonePlacementCount(
  songIds: string[],
  slotIds: string[],
  isEligible: (songId: string, slotId: string) => boolean,
) {
  const visit = (songIndex: number, slotIndex: number): number => {
    if (songIndex >= songIds.length || slotIndex >= slotIds.length) return 0;
    const skipSong = visit(songIndex + 1, slotIndex);
    const skipSlot = visit(songIndex, slotIndex + 1);
    const place = isEligible(songIds[songIndex], slotIds[slotIndex])
      ? 1 + visit(songIndex + 1, slotIndex + 1)
      : 0;
    return Math.max(skipSong, skipSlot, place);
  };
  return visit(0, 0);
}

const PROJECT_IDS = ["equal-love", "nearly-equal-joy", "not-equal-me"] as const;

type ProjectId = (typeof PROJECT_IDS)[number];

function loadProjectSongIds(projectId: ProjectId) {
  return loadJson<Array<{ id: string }>>(
    `src/projects/${projectId}/songs.json`,
  ).map((song) => song.id);
}

function loadProjectExperiences(projectId: ProjectId) {
  return loadJson<PickExperience[]>(
    `src/projects/${projectId}/live-experiences.json`,
  );
}

function loadJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), relativePath), "utf8"),
  ) as T;
}

function createStandardExperience(projectId: ProjectId): PickExperience {
  return {
    id: `${projectId}-standard-test`,
    projectId,
    slug: "",
    kind: "standard",
    status: "published",
    title: "Standard",
    subtitle: "Standard",
    description: "Standard",
    canonicalPath: "/",
    slots: [
      {
        id: "slot-1",
        label: "1",
        sortOrder: 1,
        eligibility: "catalog",
      },
    ],
    export: {
      title: "Standard",
      subtitle: "Standard",
      imageFileName: "standard.png",
      layout: "top10-grid",
    },
    share: { text: "Standard", hashtags: [] },
  };
}

function getConfiguredContextIds(experience: PickExperience) {
  const performances = experience.performances ?? [];
  if (performances.length === 0) return [undefined];
  const contextIds: Array<string | undefined> = performances.map(
    (performance) => performance.id,
  );
  if (experience.includeCombinedPerformance && performances.length > 1) {
    contextIds.push(COMBINED_EXPERIENCE_CONTEXT_ID);
  }
  return contextIds;
}

function getExpectedContextSongIds(
  experience: PickExperience,
  contextId: string | undefined,
  catalogSongIds: ReadonlySet<string>,
) {
  const performanceIds =
    contextId === COMBINED_EXPERIENCE_CONTEXT_ID
      ? (experience.performances ?? []).map((performance) => performance.id)
      : contextId
        ? [contextId]
        : [];
  return getExpectedSongIds(experience, performanceIds, catalogSongIds);
}

function getExpectedEventUnionSongIds(
  experience: PickExperience,
  catalogSongIds: ReadonlySet<string>,
) {
  return getExpectedSongIds(
    experience,
    (experience.performances ?? []).map((performance) => performance.id),
    catalogSongIds,
  );
}

function getExpectedSongIds(
  experience: PickExperience,
  performanceIds: readonly string[],
  catalogSongIds: ReadonlySet<string>,
) {
  const seenSongIds = new Set<string>();
  const songIds: string[] = [];
  for (const performanceId of performanceIds) {
    const performance = experience.performances?.find(
      (candidate) => candidate.id === performanceId,
    );
    assert.ok(performance);
    for (const entry of performance.setlist
      .slice()
      .sort((left, right) => left.order - right.order)) {
      if (!catalogSongIds.has(entry.songId) || seenSongIds.has(entry.songId)) {
        continue;
      }
      seenSongIds.add(entry.songId);
      songIds.push(entry.songId);
    }
  }
  return songIds;
}
