import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getExperienceStorageKeys } from "../src/config/project";
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
  type PickAssistantSession,
} from "../src/utils/pickAssistant";
import {
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
} from "../src/utils/experienceEligibility";

const validSongIds = new Set(
  Array.from({ length: 30 }, (_, index) => `song-${index + 1}`),
);
const parseOptions = {
  schemaVersion: 1,
  expiresAfterMs: 1_000_000,
  maximumCandidates: 24,
  now: 10_000,
  validSongIds,
};

function finishTournament(candidateIds: string[]) {
  let session = createPickAssistantSession(candidateIds);
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

test("tie is stable and skip rotates without recording a preference", () => {
  let session = createPickAssistantSession([
    "song-1",
    "song-2",
    "song-3",
    "song-4",
  ]);
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
  const session = createPickAssistantSession(["song-1", "song-2", "song-3"]);
  const skipped = skipComparison(session);
  assert.equal(skipped, session);
  assert.deepEqual(deriveTournament(skipped), deriveTournament(session));
});

test("serialized session resumes exactly and undo restores the prior pair", () => {
  let session = createPickAssistantSession([
    "song-1",
    "song-2",
    "song-3",
    "song-4",
  ]);
  const originalPair = deriveTournament(session);
  session = recordComparison(session, "right");
  const snapshot = updatePickAssistantSnapshot(
    createPickAssistantSnapshot(1, 9_000, "initial"),
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
    ...createPickAssistantSnapshot(1, 9_500, "large"),
    shortlistIds: Array.from({ length: 25 }, (_, index) => `song-${index + 1}`),
  };
  assert.equal(
    parsePickAssistantSnapshot(JSON.stringify(tooMany), parseOptions).status,
    "corrupt",
  );

  const invalidSession: PickAssistantSession = {
    candidateIds: ["song-1", "song-2"],
    decisions: [{ leftId: "song-2", rightId: "song-1", outcome: "left" }],
  };
  const corrupt = {
    ...createPickAssistantSnapshot(1, 9_500, "invalid-session"),
    shortlistIds: invalidSession.candidateIds,
    session: invalidSession,
  };
  assert.equal(
    parsePickAssistantSnapshot(JSON.stringify(corrupt), parseOptions).status,
    "corrupt",
  );
});

test("expired storage is isolated until an explicit reset", () => {
  const expired = createPickAssistantSnapshot(1, 1_000, "expired");
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
    createPickAssistantSnapshot(1, 9_000, "initial"),
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
  const expected = createPickAssistantSnapshot(1, 9_000, "expected");
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
  const expected = createPickAssistantSnapshot(1, 9_000, "expected");
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
  const stale = createPickAssistantSnapshot(1, 9_000, "stale");
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
  const expected = createPickAssistantSnapshot(1, 9_000, "expected");
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
  const expected = createPickAssistantSnapshot(1, 9_000, "expected");
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
  const expected = createPickAssistantSnapshot(1, 9_000, "expected");
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
    createPickAssistantSnapshot(1, 9_000, "initial"),
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
