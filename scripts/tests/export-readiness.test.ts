import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoActiveExportAnimations,
  waitForExportAnimationsReady,
  type ExportAnimationReadinessAnimation,
  type ExportAnimationReadinessTarget,
  type ExportImageReadinessTimers,
} from "../../src/utils/exportImageReadiness";

class ManualTimers implements ExportImageReadinessTimers {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  setTimeout(callback: () => void) {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  clearTimeout(timerId: unknown) {
    this.callbacks.delete(timerId as number);
  }

  fireNext() {
    const entry = this.callbacks.entries().next().value as
      | [number, () => void]
      | undefined;
    assert.ok(entry, "Expected a pending timer");
    const [id, callback] = entry;
    this.callbacks.delete(id);
    callback();
  }

  get pendingCount() {
    return this.callbacks.size;
  }
}

class TestAnimation implements ExportAnimationReadinessAnimation {
  pending = false;
  playState: ExportAnimationReadinessAnimation["playState"] = "running";
  readonly finished: Promise<void>;
  private readonly resolveFinished: () => void;
  private readonly rejectFinished: (error: Error) => void;

  constructor() {
    let resolveFinished = () => {};
    let rejectFinished: (error: Error) => void = () => {};
    this.finished = new Promise<void>((resolve, reject) => {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    this.resolveFinished = resolveFinished;
    this.rejectFinished = rejectFinished;
  }

  finish() {
    this.playState = "finished";
    this.resolveFinished();
  }

  resolveWithoutFinishing() {
    this.resolveFinished();
  }

  cancel() {
    this.playState = "idle";
    this.rejectFinished(new Error("cancelled"));
  }
}

function targetWith(
  animations: readonly ExportAnimationReadinessAnimation[],
): ExportAnimationReadinessTarget {
  return {
    getAnimations: () => animations,
  };
}

test("animation readiness resolves immediately without active animations", async () => {
  await waitForExportAnimationsReady({});
  await waitForExportAnimationsReady(
    targetWith([
      {
        finished: Promise.resolve(),
        playState: "finished",
      },
    ]),
  );
});

test("animation readiness waits for running animations and clears its timer", async () => {
  const animation = new TestAnimation();
  const timers = new ManualTimers();
  const readiness = waitForExportAnimationsReady(
    targetWith([animation]),
    250,
    timers,
  );

  assert.equal(timers.pendingCount, 1);
  animation.finish();
  await readiness;
  assert.equal(timers.pendingCount, 0);
});

test("cancelled animations are safe once their play state is idle", async () => {
  const animation = new TestAnimation();
  const readiness = waitForExportAnimationsReady(targetWith([animation]));

  animation.cancel();
  await readiness;
});

test("animation readiness fails closed on timeout", async () => {
  const animation = new TestAnimation();
  const timers = new ManualTimers();
  const readiness = waitForExportAnimationsReady(
    targetWith([animation]),
    250,
    timers,
  );

  timers.fireNext();
  await assert.rejects(readiness, /animation settle timed out/);
  assert.equal(timers.pendingCount, 0);
});

test("animation readiness rechecks the target immediately before capture", async () => {
  const animation = new TestAnimation();
  const readiness = waitForExportAnimationsReady(targetWith([animation]));

  animation.resolveWithoutFinishing();
  await assert.rejects(readiness, /still has 1 active animation/);
});

test("active paused or pending animations fail the capture assertion", () => {
  const paused = new TestAnimation();
  paused.playState = "paused";
  const pending = new TestAnimation();
  pending.playState = "idle";
  pending.pending = true;

  assert.throws(
    () => assertNoActiveExportAnimations(targetWith([paused, pending])),
    /still has 2 active animations/,
  );
});
