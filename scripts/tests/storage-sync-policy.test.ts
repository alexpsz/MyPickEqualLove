import assert from "node:assert/strict";
import test from "node:test";

import {
  planAssistantSnapshotSync,
  resolveStorageSyncAction,
  shouldResyncStorage,
} from "../../src/utils/storageSyncPolicy";

const LOCAL = { name: "localStorage" };
const SESSION = { name: "sessionStorage" };
const KEY = "equal_love_standard_pick_assistant_v1";

function event(overrides: Partial<Parameters<typeof shouldResyncStorage>[0]>) {
  return {
    storageArea: LOCAL,
    key: KEY,
    newValue: null,
    ...overrides,
  };
}

test("events from another storage area are ignored", () => {
  assert.deepEqual(
    resolveStorageSyncAction(event({ storageArea: SESSION }), {
      storage: LOCAL,
      watchedKey: KEY,
    }),
    { kind: "ignore" },
  );
});

test("events for an unrelated key are ignored", () => {
  assert.deepEqual(
    resolveStorageSyncAction(event({ key: "some_other_key" }), {
      storage: LOCAL,
      watchedKey: KEY,
    }),
    { kind: "ignore" },
  );
});

test("a watched key change carries the new value through", () => {
  assert.deepEqual(
    resolveStorageSyncAction(event({ newValue: '{"a":1}' }), {
      storage: LOCAL,
      watchedKey: KEY,
    }),
    { kind: "apply", value: '{"a":1}' },
  );
});

test("a null key means the area was cleared and forces a reload", () => {
  // localStorage.clear() fires one event with key === null and no newValue.
  // Treating it as irrelevant would leave this tab showing deleted data.
  assert.deepEqual(
    resolveStorageSyncAction(event({ key: null, newValue: null }), {
      storage: LOCAL,
      watchedKey: KEY,
    }),
    { kind: "reload" },
  );
});

test("a watched key removal is an apply with a null value, not a reload", () => {
  assert.deepEqual(
    resolveStorageSyncAction(event({ key: KEY, newValue: null }), {
      storage: LOCAL,
      watchedKey: KEY,
    }),
    { kind: "apply", value: null },
  );
});

test("shouldResyncStorage collapses apply and reload for simple listeners", () => {
  const options = { storage: LOCAL, watchedKey: KEY };
  assert.equal(shouldResyncStorage(event({}), options), true);
  assert.equal(shouldResyncStorage(event({ key: null }), options), true);
  assert.equal(shouldResyncStorage(event({ key: "other" }), options), false);
  assert.equal(
    shouldResyncStorage(event({ storageArea: SESSION }), options),
    false,
  );
});

const snapshot = (revision: number) => ({ revision });
const never = () => false;
const always = () => true;

test("a missing document resets without reporting a storage issue", () => {
  assert.deepEqual(
    planAssistantSnapshotSync({
      incoming: { status: "missing" },
      current: snapshot(3),
      resultVisible: false,
      isSameSnapshot: never,
    }),
    { action: "reset", storageIssue: null, flagReview: false },
  );
});

test("a missing document prompts review only when a result is on screen", () => {
  const plan = planAssistantSnapshotSync({
    incoming: { status: "missing" },
    current: snapshot(3),
    resultVisible: true,
    isSameSnapshot: never,
  });
  assert.equal(plan.action === "reset" && plan.flagReview, true);
});

for (const status of ["corrupt", "future", "expired"] as const) {
  test(`a ${status} document resets, reports the issue, and never prompts review`, () => {
    // There is nothing coherent to review against, so prompting would be noise
    // even while the result panel is open.
    assert.deepEqual(
      planAssistantSnapshotSync({
        incoming: { status },
        current: snapshot(3),
        resultVisible: true,
        isSameSnapshot: never,
      }),
      { action: "reset", storageIssue: status, flagReview: false },
    );
  });
}

test("an identical snapshot is a no-op", () => {
  assert.deepEqual(
    planAssistantSnapshotSync({
      incoming: { status: "valid", snapshot: snapshot(4) },
      current: snapshot(4),
      resultVisible: true,
      isSameSnapshot: always,
    }),
    { action: "none" },
  );
});

test("a newer revision is adopted cleanly", () => {
  assert.deepEqual(
    planAssistantSnapshotSync({
      incoming: { status: "valid", snapshot: snapshot(5) },
      current: snapshot(4),
      resultVisible: false,
      isSameSnapshot: never,
    }),
    {
      action: "adopt",
      snapshot: snapshot(5),
      storageIssue: null,
      flagReview: false,
    },
  );
});

test("a non-advancing revision is adopted but flagged as a conflict", () => {
  // Equal revisions mean both tabs wrote from the same base, so the local view
  // is not a clean descendant of what is now stored.
  const equal = planAssistantSnapshotSync({
    incoming: { status: "valid", snapshot: snapshot(4) },
    current: snapshot(4),
    resultVisible: false,
    isSameSnapshot: never,
  });
  assert.equal(equal.action === "adopt" && equal.storageIssue, "conflict");

  const older = planAssistantSnapshotSync({
    incoming: { status: "valid", snapshot: snapshot(2) },
    current: snapshot(4),
    resultVisible: false,
    isSameSnapshot: never,
  });
  assert.equal(older.action === "adopt" && older.storageIssue, "conflict");
});

test("adopting while a result is visible prompts review", () => {
  const plan = planAssistantSnapshotSync({
    incoming: { status: "valid", snapshot: snapshot(9) },
    current: snapshot(4),
    resultVisible: true,
    isSameSnapshot: never,
  });
  assert.equal(plan.action === "adopt" && plan.flagReview, true);
});
