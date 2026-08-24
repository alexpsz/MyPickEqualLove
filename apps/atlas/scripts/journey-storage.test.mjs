import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(atlasRoot, "src");
const compiledRoot = await mkdtemp(join(tmpdir(), "atlas-p1-storage-"));

after(async () => {
  await rm(compiledRoot, { recursive: true, force: true });
});

for (const sourceDirectory of ["contracts", "ports", "storage"]) {
  const directory = join(sourceRoot, sourceDirectory);
  for (const fileName of await readdir(directory)) {
    if (!fileName.endsWith(".ts")) continue;
    const sourcePath = join(directory, fileName);
    const outputPath = join(
      compiledRoot,
      relative(sourceRoot, sourcePath).replace(/\.ts$/, ".js"),
    );
    await mkdir(dirname(outputPath), { recursive: true });
    const source = await readFile(sourcePath, "utf8");
    const output = typescript.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        target: typescript.ScriptTarget.ES2022,
        module: typescript.ModuleKind.ES2022,
        verbatimModuleSyntax: true,
      },
    }).outputText;
    await writeFile(outputPath, output, "utf8");
  }
}

async function load(relativePath) {
  return import(pathToFileURL(join(compiledRoot, relativePath)).href);
}

const journey = await load("contracts/journey-document.js");
const repositoryContract = await load("ports/journey-repository.js");
const restore = await load("ports/restore-plan.js");
const storageModule = await load("storage/journey-storage.js");

const { ATLAS_JOURNEY_STORAGE_KEY_V1, LocalStorageJourneyRepository } =
  storageModule;
const CAPACITY_PROBE_KEY = "atlas:journey-capacity-probe:v1";

function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

class TestStorage {
  constructor(raw = null) {
    this.values = new Map();
    if (raw !== null) this.values.set(ATLAS_JOURNEY_STORAGE_KEY_V1, raw);
  }

  getQueue = [];
  setQueue = [];
  removeQueue = [];
  getCalls = [];
  setCalls = [];
  removeCalls = [];

  get raw() {
    return this.valueFor(ATLAS_JOURNEY_STORAGE_KEY_V1);
  }

  set raw(value) {
    this.setValue(ATLAS_JOURNEY_STORAGE_KEY_V1, value);
  }

  valueFor(key) {
    return this.values.get(key) ?? null;
  }

  setValue(key, value) {
    if (value === null) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }

  getItem(key) {
    this.getCalls.push(key);
    if (this.getQueue.length === 0) return this.valueFor(key);
    const step = this.getQueue.shift();
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(this, key) : step;
  }

  setItem(key, value) {
    this.setCalls.push({ key, value });
    if (this.setQueue.length === 0) {
      this.setValue(key, value);
      return;
    }
    const step = this.setQueue.shift();
    if (step instanceof Error) throw step;
    if (typeof step === "function") {
      step(this, value, key);
      return;
    }
    this.setValue(key, value);
  }

  removeItem(key) {
    this.removeCalls.push(key);
    if (this.removeQueue.length === 0) {
      this.setValue(key, null);
      return;
    }
    const step = this.removeQueue.shift();
    if (step instanceof Error) throw step;
    if (typeof step === "function") {
      step(this, key);
      return;
    }
    this.setValue(key, null);
  }
}

function validDocument(revision = 0, title = "My local event") {
  const timestamp = "2026-08-25T00:00:00.000Z";
  return {
    schemaVersion: 1,
    revision,
    updatedAt: timestamp,
    journeys: [
      {
        id: "journey-one",
        subject: {
          kind: "local-custom-event",
          localId: "local-event-one",
          fallback: {
            title,
            date: "2026-08-25",
            venueName: "Local venue",
          },
        },
        intent: "planned",
        experienceEntries: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

function oversizedValidDocument(revision = 1) {
  const timestamp = "2026-08-25T00:00:00.000Z";
  return {
    schemaVersion: 1,
    revision,
    updatedAt: timestamp,
    journeys: Array.from({ length: 850 }, (_, index) => ({
      id: `journey-${index}`,
      subject: {
        kind: "local-custom-event",
        localId: `local-event-${index}`,
        fallback: {
          title: `Local event ${index}`,
          date: "2026-08-25",
          venueName: "Local venue",
        },
      },
      intent: "planned",
      experienceEntries: [
        {
          id: `entry-${index}`,
          mode: "archive",
          occurredAt: timestamp,
          memo: "x".repeat(10_000),
          highlights: [],
          songRefs: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  };
}

function validatedWrite(expectedRevision, next) {
  const result = repositoryContract.validateCompareAndWriteJourneyInput({
    expectedRevision,
    next,
  });
  assert.equal(result.ok, true);
  return result.value;
}

function validatedReplace(expectedRevision, replacement) {
  const result = repositoryContract.validateReplaceJourneyInput({
    expectedRevision,
    replacement,
  });
  assert.equal(result.ok, true);
  return result.value;
}

function readyReplacePlan(
  current = validDocument(0),
  replacement = validDocument(1),
) {
  const result = restore.createRestorePlan({
    status: "valid",
    raw: JSON.stringify(replacement),
    expectedRevision: { state: "present", revision: current.revision },
    current,
    replacement,
  });
  assert.equal(result.status, "ready");
  return result.applyPlan;
}

function capacityInput(plan, maximumReplacementBytes = 1_000_000) {
  return { plan, maximumReplacementBytes };
}

test("exports one versioned Atlas-only storage key", async () => {
  assert.equal(ATLAS_JOURNEY_STORAGE_KEY_V1, "atlas:journey-document:v1");
  assert.doesNotMatch(ATLAS_JOURNEY_STORAGE_KEY_V1, /mypick/i);

  const source = await readFile(
    join(sourceRoot, "storage", "journey-storage.ts"),
    "utf8",
  );
  assert.match(source, /window\.localStorage/);
  assert.doesNotMatch(source, /STORAGE_KEYS|mypick/i);
  assert.doesNotMatch(source, /navigator\.locks|\bWeb\s*Locks?\b/i);
  assert.doesNotMatch(
    source,
    /\b(?:auto.?merge|last.?write.?wins|cell.?union)\b/i,
  );
});

test("strict reads preserve every C0 read state and failing raw", async () => {
  const validRaw = JSON.stringify(validDocument());
  const invalid = validDocument();
  invalid.unknown = true;
  const invalidRaw = JSON.stringify(invalid);
  const cases = [
    [null, "absent"],
    [validRaw, "valid"],
    [JSON.stringify({ schemaVersion: 9 }), "future-version"],
    ["not-json", "corrupt"],
    [invalidRaw, "invalid"],
  ];

  for (const [raw, status] of cases) {
    const result = await new LocalStorageJourneyRepository(
      new TestStorage(raw),
    ).read();
    assert.equal(result.status, status);
    if (raw !== null) assert.equal(result.raw, raw);
  }

  const failing = new TestStorage(validRaw);
  const repository = new LocalStorageJourneyRepository(failing);
  assert.equal((await repository.read()).status, "valid");
  failing.getQueue.push(namedError("SecurityError", "storage denied"));
  assert.deepEqual(await repository.read(), {
    status: "read-failed",
    raw: validRaw,
    error: "SecurityError: storage denied",
  });
});

test("first compare-and-write creates absent storage at revision 0", async () => {
  const target = validDocument(0);
  const storage = new TestStorage();
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "absent" }, target),
  );

  assert.equal(result.status, "committed");
  assert.equal(result.readback.value.revision, 0);
  assert.equal(journey.parseJourneyDocument(storage.raw).status, "valid");
  assert.equal(storage.setCalls.length, 1);
});

test("present revision 0 advances normally to revision 1", async () => {
  const current = validDocument(0);
  const next = validDocument(1, "Updated event");
  const storage = new TestStorage(JSON.stringify(current));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "present", revision: 0 }, next),
  );

  assert.equal(result.status, "committed");
  assert.deepEqual(result.readback.value, next);
  assert.equal(storage.setCalls.length, 1);
});

test("C0 validation rejects equal, decreasing, skipped, and absent nonzero revisions", () => {
  const transitions = [
    [{ state: "present", revision: 3 }, 3],
    [{ state: "present", revision: 3 }, 2],
    [{ state: "present", revision: 3 }, 5],
    [{ state: "absent" }, 1],
  ];
  for (const [expectedRevision, revision] of transitions) {
    assert.equal(
      repositoryContract.validateCompareAndWriteJourneyInput({
        expectedRevision,
        next: validDocument(revision),
      }).ok,
      false,
    );
  }
});

test("a stale CAS conflicts without writing", async () => {
  const storage = new TestStorage(JSON.stringify(validDocument(1)));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite(
      { state: "present", revision: 0 },
      validDocument(1, "Stale change"),
    ),
  );

  assert.equal(result.status, "conflict");
  assert.equal(result.actual.status, "valid");
  assert.equal(result.actual.value.revision, 1);
  assert.deepEqual(result.rollback, { status: "not-required" });
  assert.equal(storage.setCalls.length, 0);
});

test("a stale absent expectation conflicts with actual revision 0 without mutation", async () => {
  const storage = new TestStorage(JSON.stringify(validDocument(0)));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "absent" }, validDocument(0, "Stale create")),
  );

  assert.equal(result.status, "conflict");
  assert.equal(result.actual.status, "valid");
  assert.equal(result.actual.value.revision, 0);
  assert.equal(storage.setCalls.length, 0);
  assert.equal(storage.removeCalls.length, 0);
});

test("future, corrupt, and invalid raw are never overwritten", async () => {
  const invalid = validDocument();
  invalid.unknown = true;
  const cases = [
    [JSON.stringify({ schemaVersion: 7 }), "future-version"],
    ["{", "corrupt"],
    [JSON.stringify(invalid), "invalid"],
  ];

  for (const [raw, expectedStatus] of cases) {
    const storage = new TestStorage(raw);
    const repository = new LocalStorageJourneyRepository(storage);
    const result = await repository.compareAndWrite(
      validatedWrite({ state: "absent" }, validDocument(0)),
    );
    assert.equal(result.status, "conflict");
    assert.equal(result.actual.status, expectedStatus);
    assert.equal(storage.raw, raw);
    assert.equal(storage.setCalls.length, 0);
  }
});

test("read-before-write failure is explicit and performs no rollback", async () => {
  const storage = new TestStorage();
  storage.getQueue.push(namedError("SecurityError", "blocked"));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "absent" }, validDocument(0)),
  );

  assert.deepEqual(result, {
    status: "failure",
    stage: "read-before-write",
    rawBefore: null,
    error: "SecurityError: blocked",
    rollback: { status: "not-required" },
  });
  assert.equal(storage.setCalls.length, 0);
});

test("write failure restores the exact previous raw and preserves quota errors", async () => {
  const oldRaw = `  ${JSON.stringify(validDocument(0))}\r\n`;
  const storage = new TestStorage(oldRaw);
  storage.setQueue.push((target, value) => {
    target.raw = value;
    throw namedError("QuotaExceededError", "quota full");
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "present", revision: 0 }, validDocument(1)),
  );

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "write");
  assert.equal(result.rawBefore, oldRaw);
  assert.equal(result.error, "QuotaExceededError: quota full");
  assert.deepEqual(result.rollback, { status: "restored", raw: oldRaw });
  assert.equal(storage.raw, oldRaw);
  assert.equal(storage.setCalls.at(-1).value, oldRaw);
});

test("write failure needs no rollback when the attempted value never took effect", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(oldRaw);
  storage.setQueue.push(namedError("QuotaExceededError", "quota full"));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "present", revision: 0 }, validDocument(1)),
  );

  assert.equal(result.status, "failure");
  assert.deepEqual(result.rollback, { status: "not-required" });
  assert.equal(storage.raw, oldRaw);
  assert.equal(storage.setCalls.length, 1);
});

test("write error never rolls an external value back to the old raw", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const externalRaw = JSON.stringify(validDocument(1, "External commit"));
  const storage = new TestStorage(oldRaw);
  storage.setQueue.push((target, value) => {
    target.raw = value;
    target.raw = externalRaw;
    throw namedError("QuotaExceededError", "write reported failure");
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite(
      { state: "present", revision: 0 },
      validDocument(1, "Attempted commit"),
    ),
  );

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "write");
  assert.equal(result.rollback.status, "failed");
  assert.match(result.rollback.error, /concurrent or external value/);
  assert.equal(storage.raw, externalRaw);
  assert.equal(storage.setCalls.length, 1);
  assert.notEqual(storage.setCalls.at(-1).value, oldRaw);
});

test("failed first write restores exact absence", async () => {
  const storage = new TestStorage();
  storage.setQueue.push((target, value) => {
    target.raw = value;
    throw namedError("QuotaExceededError", "quota full");
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "absent" }, validDocument(0)),
  );

  assert.equal(result.status, "failure");
  assert.deepEqual(result.rollback, { status: "restored", raw: null });
  assert.equal(storage.raw, null);
  assert.equal(storage.removeCalls.length, 1);
});

test("rollback failure is explicit after a write error", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(oldRaw);
  storage.setQueue.push(
    (target, value) => {
      target.raw = value;
      throw namedError("QuotaExceededError", "quota full");
    },
    namedError("SecurityError", "rollback denied"),
  );
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "present", revision: 0 }, validDocument(1)),
  );

  assert.equal(result.status, "failure");
  assert.deepEqual(result.rollback, {
    status: "failed",
    raw: oldRaw,
    error: "SecurityError: rollback denied",
  });
  assert.notEqual(storage.raw, oldRaw);
});

test("malformed readback rolls back the exact previous raw", async () => {
  const oldRaw = `\n${JSON.stringify(validDocument(0))}\n`;
  const storage = new TestStorage(oldRaw);
  storage.getQueue.push(oldRaw, "not-json");
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "present", revision: 0 }, validDocument(1)),
  );

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "readback");
  assert.deepEqual(result.rollback, { status: "restored", raw: oldRaw });
  assert.equal(storage.raw, oldRaw);
});

test("valid other-tab readback is preserved instead of being rolled back", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const externalRaw = JSON.stringify(validDocument(1, "Other tab content"));
  const storage = new TestStorage(oldRaw);
  storage.getQueue.push(oldRaw, (target) => {
    target.raw = externalRaw;
    return externalRaw;
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite(
      { state: "present", revision: 0 },
      validDocument(1, "Expected content"),
    ),
  );

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "readback");
  assert.match(result.error, /did not match/);
  assert.equal(result.rollback.status, "failed");
  assert.match(result.rollback.error, /concurrent or external value/);
  assert.equal(storage.raw, externalRaw);
  assert.equal(storage.setCalls.length, 1);
  assert.notEqual(storage.setCalls.at(-1).value, oldRaw);
});

test("readback exceptions are distinct from write failures and roll back", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(oldRaw);
  storage.getQueue.push(
    oldRaw,
    namedError("SecurityError", "readback blocked"),
  );
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "present", revision: 0 }, validDocument(1)),
  );

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "readback");
  assert.equal(result.error, "SecurityError: readback blocked");
  assert.deepEqual(result.rollback, { status: "restored", raw: oldRaw });
});

test("an unreadable rollback ownership check fails closed without writing old raw", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(oldRaw);
  storage.getQueue.push(
    oldRaw,
    namedError("SecurityError", "readback blocked"),
    namedError("SecurityError", "ownership check blocked"),
  );
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.compareAndWrite(
    validatedWrite({ state: "present", revision: 0 }, validDocument(1)),
  );

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "readback");
  assert.equal(result.rollback.status, "failed");
  assert.match(result.rollback.error, /current storage could not be read/);
  assert.notEqual(storage.raw, oldRaw);
  assert.equal(storage.setCalls.length, 1);
});

test("replace uses the same strict CAS and readback transaction", async () => {
  const current = validDocument(2);
  const replacement = validDocument(3, "Replacement");
  const storage = new TestStorage(JSON.stringify(current));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.replace(
    validatedReplace({ state: "present", revision: 2 }, replacement),
  );

  assert.equal(result.status, "committed");
  assert.deepEqual(result.readback.value, replacement);
});

test("delete-all reports deleted only after an absent readback", async () => {
  const current = validDocument(4);
  const storage = new TestStorage(JSON.stringify(current));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.deleteAll({
    expectedRevision: { state: "present", revision: 4 },
  });

  assert.deepEqual(result, {
    status: "deleted",
    readback: { status: "absent" },
  });
  assert.equal(storage.raw, null);
  assert.equal(storage.removeCalls.length, 1);
});

test("delete-all conflicts without removal when revision is stale", async () => {
  const storage = new TestStorage(JSON.stringify(validDocument(4)));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.deleteAll({
    expectedRevision: { state: "present", revision: 3 },
  });

  assert.equal(result.status, "conflict");
  assert.equal(storage.removeCalls.length, 0);
  assert.equal(storage.setCalls.length, 0);
});

test("delete-all write failure restores the exact original raw", async () => {
  const oldRaw = ` ${JSON.stringify(validDocument(0))}`;
  const storage = new TestStorage(oldRaw);
  storage.removeQueue.push((target) => {
    target.raw = null;
    throw namedError("SecurityError", "remove denied");
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.deleteAll({
    expectedRevision: { state: "present", revision: 0 },
  });

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "write");
  assert.deepEqual(result.rollback, { status: "restored", raw: oldRaw });
  assert.equal(storage.raw, oldRaw);
});

test("delete-all preserves another writer value observed after removal", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const externalRaw = JSON.stringify(validDocument(1, "External commit"));
  const storage = new TestStorage(oldRaw);
  storage.getQueue.push(oldRaw, (target) => {
    target.raw = externalRaw;
    return externalRaw;
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.deleteAll({
    expectedRevision: { state: "present", revision: 0 },
  });

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "readback");
  assert.equal(result.rollback.status, "failed");
  assert.match(result.rollback.error, /concurrent or external value/);
  assert.equal(storage.raw, externalRaw);
  assert.equal(storage.setCalls.length, 0);
});

test("P2 replace apply plan is executed through the repository transaction", async () => {
  const current = validDocument(0);
  const replacement = validDocument(1, "Restored event");
  const plan = restore.createRestorePlan({
    status: "valid",
    raw: JSON.stringify(replacement),
    expectedRevision: { state: "present", revision: 0 },
    current,
    replacement,
  });
  assert.equal(plan.status, "ready");

  const storage = new TestStorage(JSON.stringify(current));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.applyReplacePlan(plan.applyPlan);
  assert.equal(result.status, "committed");
  assert.deepEqual(result.readback.value, replacement);
});

test("invalid replace apply plan is rejected before storage access", async () => {
  const storage = new TestStorage(JSON.stringify(validDocument(0)));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.applyReplacePlan({
    kind: "replace-journey-document",
    expectedRevision: { state: "present", revision: 0 },
    replacement: validDocument(3),
    summary: {
      journeys: {
        before: 1,
        after: 1,
        added: 0,
        updated: 1,
        deleted: 0,
        unchanged: 0,
      },
      experienceEntries: {
        before: 0,
        after: 0,
        added: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
      },
    },
  });

  assert.equal(result.status, "invalid-plan");
  assert.equal(result.reason, "non-consecutive-revision");
  assert.equal(storage.getCalls.length, 0);
  assert.equal(storage.setCalls.length, 0);
});

test("replacement capacity probe writes an equal-length private placeholder and cleans it", async () => {
  const current = validDocument(0);
  const replacement = validDocument(1, "PRIVATE-REPLACEMENT-SENTINEL");
  const plan = readyReplacePlan(current, replacement);
  const durableRaw = ` ${JSON.stringify(current)}\r\n`;
  const storage = new TestStorage(durableRaw);
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(capacityInput(plan));

  assert.equal(result.status, "ready");
  assert.equal(result.applyPlan, plan);
  assert.equal(result.requiredStorageUnits, JSON.stringify(replacement).length);
  assert.equal(
    result.replacementByteLength,
    new TextEncoder().encode(JSON.stringify(replacement)).byteLength,
  );
  assert.equal(storage.setCalls.length, 1);
  assert.equal(storage.setCalls[0].key, CAPACITY_PROBE_KEY);
  assert.equal(storage.setCalls[0].value.length, result.requiredStorageUnits);
  assert.notEqual(storage.setCalls[0].value, JSON.stringify(replacement));
  assert.doesNotMatch(
    storage.setCalls[0].value,
    /PRIVATE-REPLACEMENT-SENTINEL/,
  );
  assert.deepEqual(storage.removeCalls, [CAPACITY_PROBE_KEY]);
  assert.equal(storage.valueFor(CAPACITY_PROBE_KEY), null);
  assert.equal(storage.raw, durableRaw);
  assert.equal(
    storage.setCalls.some((call) => call.key === ATLAS_JOURNEY_STORAGE_KEY_V1),
    false,
  );

  storage.getQueue.push(namedError("SecurityError", "durable read blocked"));
  const durableReadFailure = await repository.read();
  assert.equal(durableReadFailure.status, "read-failed");
  assert.equal(durableReadFailure.raw, null);
});

test("quota failure after a partial probe write cleans the probe and never reports ready", async () => {
  const durableRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(durableRaw);
  storage.setQueue.push((target, value, key) => {
    target.setValue(key, value);
    throw namedError("QuotaExceededError", "probe quota full");
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(readyReplacePlan()),
  );

  assert.equal(result.status, "capacity-failed");
  assert.equal(result.applyPlan, null);
  assert.equal(result.reason, "probe-quota-exceeded");
  assert.equal(storage.valueFor(CAPACITY_PROBE_KEY), null);
  assert.deepEqual(storage.removeCalls, [CAPACITY_PROBE_KEY]);
  assert.equal(storage.raw, durableRaw);
});

test("probe cleanup removal failure returns unavailable and never ready", async () => {
  const durableRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(durableRaw);
  storage.removeQueue.push(namedError("SecurityError", "probe cleanup denied"));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(readyReplacePlan()),
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.applyPlan, null);
  assert.equal(result.stage, "probe-cleanup");
  assert.match(result.error, /probe cleanup denied/);
  assert.notEqual(storage.valueFor(CAPACITY_PROBE_KEY), null);
  assert.equal(storage.raw, durableRaw);
});

test("an existing probe residue is preserved and blocks capacity readiness", async () => {
  const durableRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(durableRaw);
  storage.setValue(CAPACITY_PROBE_KEY, "existing-or-concurrent-probe");
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(readyReplacePlan()),
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.stage, "probe-occupied");
  assert.equal(result.applyPlan, null);
  assert.equal(
    storage.valueFor(CAPACITY_PROBE_KEY),
    "existing-or-concurrent-probe",
  );
  assert.equal(storage.setCalls.length, 0);
  assert.equal(storage.removeCalls.length, 0);
  assert.equal(storage.raw, durableRaw);
});

test("probe read exceptions fail closed without touching durable state", async () => {
  const durableRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(durableRaw);
  storage.getQueue.push(namedError("SecurityError", "probe read denied"));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(readyReplacePlan()),
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.stage, "probe-read");
  assert.equal(result.applyPlan, null);
  assert.equal(storage.setCalls.length, 0);
  assert.equal(storage.removeCalls.length, 0);
  assert.equal(storage.raw, durableRaw);
});

test("replacement byte-limit overflow and invalid plans never probe storage", async () => {
  const replacement = validDocument(1, "Capacity boundary");
  const plan = readyReplacePlan(validDocument(0), replacement);
  const replacementBytes = new TextEncoder().encode(
    JSON.stringify(replacement),
  ).byteLength;
  const capacityStorage = new TestStorage(JSON.stringify(validDocument(0)));
  const capacityRepository = new LocalStorageJourneyRepository(capacityStorage);
  const overLimit = await capacityRepository.preflightReplaceCapacity(
    capacityInput(plan, replacementBytes - 1),
  );
  assert.equal(overLimit.status, "capacity-failed");
  assert.equal(overLimit.reason, "replacement-exceeds-authorized-limit");
  assert.equal(overLimit.applyPlan, null);
  assert.equal(capacityStorage.getCalls.length, 0);
  assert.equal(capacityStorage.setCalls.length, 0);

  const invalidStorage = new TestStorage(JSON.stringify(validDocument(0)));
  const invalidRepository = new LocalStorageJourneyRepository(invalidStorage);
  const invalidPlan = {
    ...plan,
    replacement: validDocument(3, "Skipped revision"),
  };
  const invalid = await invalidRepository.preflightReplaceCapacity(
    capacityInput(invalidPlan),
  );
  assert.equal(invalid.status, "unavailable");
  assert.equal(invalid.stage, "invalid-plan");
  assert.equal(invalid.applyPlan, null);
  assert.equal(invalidStorage.getCalls.length, 0);
  assert.equal(invalidStorage.setCalls.length, 0);
});

test("the fixed probe allocation hard limit rejects oversized validated plans before allocation", async () => {
  const replacement = oversizedValidDocument();
  assert.equal(JSON.stringify(replacement).length > 8 * 1024 * 1024, true);
  const plan = readyReplacePlan(validDocument(0), replacement);
  const storage = new TestStorage(JSON.stringify(validDocument(0)));
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(plan, Number.MAX_SAFE_INTEGER),
  );

  assert.equal(result.status, "capacity-failed");
  assert.equal(result.reason, "replacement-exceeds-probe-hard-limit");
  assert.equal(result.replacementByteLength, null);
  assert.equal(result.requiredStorageUnits > 8 * 1024 * 1024, true);
  assert.equal(result.applyPlan, null);
  assert.equal(storage.getCalls.length, 0);
  assert.equal(storage.setCalls.length, 0);
  assert.equal(storage.removeCalls.length, 0);
});

test("a concurrent probe replacement is preserved and cannot report ready", async () => {
  const durableRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(durableRaw);
  storage.getQueue.push(null, (target, key) => {
    target.setValue(key, "external-probe-value");
    return "external-probe-value";
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(readyReplacePlan()),
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.stage, "probe-readback");
  assert.equal(result.applyPlan, null);
  assert.equal(storage.valueFor(CAPACITY_PROBE_KEY), "external-probe-value");
  assert.equal(storage.removeCalls.length, 0);
  assert.equal(storage.raw, durableRaw);
});

test("storage events reread only the exact Atlas key in the same storage area", async () => {
  const raw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(raw);
  const otherStorage = new TestStorage(raw);
  const repository = new LocalStorageJourneyRepository(storage);

  const exact = await repository.handleStorageEvent({
    key: ATLAS_JOURNEY_STORAGE_KEY_V1,
    storageArea: storage,
  });
  assert.equal(exact.status, "reread");
  assert.equal(exact.reason, "journey-key");
  assert.equal(exact.read.status, "valid");

  assert.deepEqual(
    await repository.handleStorageEvent({
      key: ATLAS_JOURNEY_STORAGE_KEY_V1,
      storageArea: otherStorage,
    }),
    { status: "ignored", reason: "different-storage-area" },
  );
  assert.deepEqual(
    await repository.handleStorageEvent({
      key: "atlas:other:v1",
      storageArea: storage,
    }),
    { status: "ignored", reason: "different-key" },
  );
  assert.equal(storage.setCalls.length, 0);
  assert.equal(storage.removeCalls.length, 0);
});

test("null-key clear events trigger a safe reread and never a write", async () => {
  const storage = new TestStorage();
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.handleStorageEvent({
    key: null,
    storageArea: storage,
  });

  assert.deepEqual(result, {
    status: "reread",
    reason: "storage-cleared",
    read: { status: "absent" },
  });
  assert.equal(storage.setCalls.length, 0);
  assert.equal(storage.removeCalls.length, 0);
});
