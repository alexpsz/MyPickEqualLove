import assert from "node:assert/strict";
import test from "node:test";

import {
  compareBoardPicks,
  type BoardComparisonInput,
  type BoardComparisonSlot,
} from "../../src/utils/boardComparison";
import type { StoredPicks } from "../../src/schema/music";

const SLOTS: BoardComparisonSlot[] = [
  { id: "slot-1", sortOrder: 1 },
  { id: "slot-2", sortOrder: 2 },
  { id: "slot-3", sortOrder: 3 },
  { id: "slot-4", sortOrder: 4 },
];

function compare({
  slots = SLOTS,
  currentPicks,
  sharedPicks,
  currentContextId,
  sharedContextId,
  currentProjectId = "equal-love",
  sharedProjectId = "equal-love",
  currentExperienceId = "standard",
  sharedExperienceId = "standard",
}: {
  slots?: BoardComparisonSlot[];
  currentPicks: StoredPicks;
  sharedPicks: StoredPicks;
  currentContextId?: string | null;
  sharedContextId?: string | null;
  currentProjectId?: string;
  sharedProjectId?: string;
  currentExperienceId?: string;
  sharedExperienceId?: string;
}) {
  const input: BoardComparisonInput = {
    slots,
    current: {
      scope: {
        projectId: currentProjectId,
        experienceId: currentExperienceId,
        contextId: currentContextId,
      },
      picks: currentPicks,
    },
    shared: {
      scope: {
        projectId: sharedProjectId,
        experienceId: sharedExperienceId,
        contextId: sharedContextId,
      },
      picks: sharedPicks,
    },
  };
  return compareBoardPicks(input);
}

test("identical complete boards score 100", () => {
  const picks = {
    "slot-1": "song-a",
    "slot-2": "song-b",
    "slot-3": "song-c",
    "slot-4": "song-d",
  };
  const result = compare({ currentPicks: picks, sharedPicks: picks });

  assert.equal(result.availability, "available");
  if (result.availability !== "available") return;
  assert.equal(result.compatibilityScore, 100);
  assert.equal(result.shared.length, 4);
  assert.deepEqual(result.onlyCurrent, []);
  assert.deepEqual(result.onlyShared, []);
});

test("boards with no shared songs score zero", () => {
  const result = compare({
    currentPicks: {
      "slot-1": "song-a",
      "slot-2": "song-b",
      "slot-3": "song-c",
      "slot-4": "song-d",
    },
    sharedPicks: {
      "slot-1": "song-e",
      "slot-2": "song-f",
      "slot-3": "song-g",
      "slot-4": "song-h",
    },
  });

  assert.equal(result.availability, "available");
  if (result.availability !== "available") return;
  assert.equal(result.compatibilityScore, 0);
  assert.deepEqual(result.shared, []);
  assert.equal(result.onlyCurrent.length, 4);
  assert.equal(result.onlyShared.length, 4);
});

test("a partial overlap exposes all three lists and the fixed formula", () => {
  const result = compare({
    currentPicks: {
      "slot-1": "song-a",
      "slot-2": "song-b",
      "slot-3": "song-c",
      "slot-4": "song-d",
    },
    sharedPicks: {
      "slot-1": "song-a",
      "slot-2": "song-x",
      "slot-3": "song-c",
      "slot-4": "song-y",
    },
  });

  assert.equal(result.availability, "available");
  if (result.availability !== "available") return;

  // N = 4. Each same-rank shared song adds 70/4 + 30/4 = 25.
  assert.equal(result.compatibilityScore, 50);
  assert.deepEqual(result.shared, [
    {
      songId: "song-a",
      currentRank: 1,
      sharedRank: 1,
      rankDifference: 0,
    },
    {
      songId: "song-c",
      currentRank: 3,
      sharedRank: 3,
      rankDifference: 0,
    },
  ]);
  assert.deepEqual(result.onlyCurrent, [
    { songId: "song-b", rank: 2 },
    { songId: "song-d", rank: 4 },
  ]);
  assert.deepEqual(result.onlyShared, [
    { songId: "song-x", rank: 2 },
    { songId: "song-y", rank: 4 },
  ]);
});

test("reversed ranks retain overlap points but reduce rank-closeness points", () => {
  const result = compare({
    currentPicks: {
      "slot-1": "song-a",
      "slot-2": "song-b",
      "slot-3": "song-c",
      "slot-4": "song-d",
    },
    sharedPicks: {
      "slot-1": "song-d",
      "slot-2": "song-c",
      "slot-3": "song-b",
      "slot-4": "song-a",
    },
  });

  assert.equal(result.availability, "available");
  if (result.availability !== "available") return;

  // 70 overlap points + 5 + 5 rank-closeness points for the middle two songs.
  assert.equal(result.compatibilityScore, 80);
  assert.deepEqual(
    result.shared.map((song) => song.rankDifference),
    [3, 1, 1, 3],
  );
});

test("undefined and null contexts normalize together, but different contexts block comparison", () => {
  const picks = {
    "slot-1": "song-a",
    "slot-2": "song-b",
    "slot-3": "song-c",
    "slot-4": "song-d",
  };
  const normalized = compare({
    currentPicks: picks,
    sharedPicks: picks,
    currentContextId: undefined,
    sharedContextId: null,
  });
  assert.equal(normalized.availability, "available");

  const mismatch = compare({
    currentPicks: picks,
    sharedPicks: picks,
    currentContextId: "day-1",
    sharedContextId: "day-2",
  });
  assert.deepEqual(mismatch, {
    availability: "unavailable",
    reason: "context-mismatch",
    compatibilityScore: null,
    shared: [],
    onlyCurrent: [],
    onlyShared: [],
  });
});

test("either incomplete board is unavailable", () => {
  const complete = {
    "slot-1": "song-a",
    "slot-2": "song-b",
    "slot-3": "song-c",
    "slot-4": "song-d",
  };

  assert.equal(
    compare({
      currentPicks: { ...complete, "slot-4": "" },
      sharedPicks: complete,
    }).reason,
    "current-incomplete",
  );
  assert.equal(
    compare({
      currentPicks: complete,
      sharedPicks: { ...complete, "slot-4": "" },
    }).reason,
    "shared-incomplete",
  );
});

test("duplicate song ids block comparison on either board", () => {
  const complete = {
    "slot-1": "song-a",
    "slot-2": "song-b",
    "slot-3": "song-c",
    "slot-4": "song-d",
  };

  assert.equal(
    compare({
      currentPicks: { ...complete, "slot-4": "song-a" },
      sharedPicks: complete,
    }).reason,
    "current-duplicate-song",
  );
  assert.equal(
    compare({
      currentPicks: complete,
      sharedPicks: { ...complete, "slot-4": "song-a" },
    }).reason,
    "shared-duplicate-song",
  );
});

test("one-slot boards receive the full rank-closeness component", () => {
  const result = compare({
    slots: [{ id: "only-slot", sortOrder: 1 }],
    currentPicks: { "only-slot": "song-a" },
    sharedPicks: { "only-slot": "song-a" },
  });

  assert.equal(result.availability, "available");
  if (result.availability !== "available") return;
  assert.equal(result.compatibilityScore, 100);
  assert.deepEqual(result.shared, [
    {
      songId: "song-a",
      currentRank: 1,
      sharedRank: 1,
      rankDifference: 0,
    },
  ]);
});
