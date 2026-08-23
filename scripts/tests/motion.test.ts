import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLE_OPACITY,
  APPLE_SPRING,
  APPLE_SPRING_GENTLE,
  BOARD_REVEAL_MOTION,
  MOTION_DURATION_MS,
  createBoardRevealSchedule,
  shouldStartBoardReveal,
} from "../../src/config/motion";

test("motion tokens retain the shared interaction timings", () => {
  assert.deepEqual(MOTION_DURATION_MS, {
    press: 100,
    fast: 140,
    overlayOpacity: 180,
    base: 220,
    slow: 360,
  });
  assert.deepEqual(APPLE_SPRING, {
    type: "spring",
    stiffness: 520,
    damping: 42,
    mass: 0.82,
  });
  assert.deepEqual(APPLE_SPRING_GENTLE, {
    type: "spring",
    stiffness: 420,
    damping: 38,
    mass: 0.9,
  });
  assert.equal(APPLE_OPACITY.duration, 0.18);
});

test("board reveal starts only on a hydrated incomplete-to-complete edge", () => {
  const completeEdge = {
    enabled: true,
    hydrated: true,
    isExportRealm: false,
    previousCount: 9,
    currentCount: 10,
    slotCount: 10,
  } as const;

  assert.equal(shouldStartBoardReveal(completeEdge), true);
  assert.equal(
    shouldStartBoardReveal({ ...completeEdge, previousCount: 6 }),
    true,
  );
  assert.equal(
    shouldStartBoardReveal({ ...completeEdge, previousCount: null }),
    false,
    "initial hydration must not reveal a restored complete board",
  );
  assert.equal(
    shouldStartBoardReveal({ ...completeEdge, previousCount: 10 }),
    false,
    "a stable complete board must not retrigger",
  );
  assert.equal(
    shouldStartBoardReveal({ ...completeEdge, currentCount: 9 }),
    false,
  );
  assert.equal(
    shouldStartBoardReveal({ ...completeEdge, enabled: false }),
    false,
    "non-standard boards must not reveal",
  );
  assert.equal(
    shouldStartBoardReveal({ ...completeEdge, hydrated: false }),
    false,
  );
  assert.equal(
    shouldStartBoardReveal({ ...completeEdge, isExportRealm: true }),
    false,
    "the export realm must remain motion-free",
  );
});

test("board reveal schedules ranks 1 through 10 exactly once", () => {
  const schedule = createBoardRevealSchedule(10, false);

  assert.deepEqual(
    schedule.map((step) => step.revealedCount),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.deepEqual(
    schedule.map((step) => step.atMs),
    [0, 90, 180, 270, 360, 450, 540, 630, 720, 810],
  );
  const finalStep = schedule.at(-1);
  assert.ok(finalStep);
  assert.equal(finalStep.atMs + BOARD_REVEAL_MOTION.settleMs, 1_030);
});

test("reduced motion reveals the complete board immediately", () => {
  assert.deepEqual(createBoardRevealSchedule(10, true), [
    { atMs: 0, revealedCount: 10 },
  ]);
  assert.deepEqual(createBoardRevealSchedule(0, false), []);
  assert.deepEqual(createBoardRevealSchedule(1.5, false), []);
});
