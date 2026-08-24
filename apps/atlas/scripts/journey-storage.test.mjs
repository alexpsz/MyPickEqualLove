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

for (const sourceDirectory of ["backup", "contracts", "ports", "storage"]) {
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
const backup = await load("backup/backup-codec.js");
const storageModule = await load("storage/journey-storage.js");

const { ATLAS_JOURNEY_STORAGE_KEY_V1, LocalStorageJourneyRepository } =
  storageModule;
const CAPACITY_PROBE_KEY_PREFIX = "atlas:journey-capacity-probe:v1:";

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
  operations = [];

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
    this.operations.push({ operation: "get", key });
    if (this.getQueue.length === 0) return this.valueFor(key);
    const step = this.getQueue.shift();
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(this, key) : step;
  }

  setItem(key, value) {
    this.setCalls.push({ key, value });
    this.operations.push({ operation: "set", key, value });
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
    this.operations.push({ operation: "remove", key });
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

function oversizedValidDocument(
  revision = 1,
  { journeyCount = 850, memoCharacter = "x" } = {},
) {
  const timestamp = "2026-08-25T00:00:00.000Z";
  return {
    schemaVersion: 1,
    revision,
    updatedAt: timestamp,
    journeys: Array.from({ length: journeyCount }, (_, index) => ({
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
          memo: memoCharacter.repeat(10_000),
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

function capacityInput(plan) {
  return { plan };
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

test("replacement capacity probe is advisory, private, uniquely keyed, and cleaned", async () => {
  const current = validDocument(0);
  const replacement = validDocument(1, "PRIVATE-REPLACEMENT-SENTINEL");
  const plan = readyReplacePlan(current, replacement);
  const durableRaw = ` ${JSON.stringify(current)}\r\n`;
  const storage = new TestStorage(durableRaw);
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(capacityInput(plan));

  assert.deepEqual(result, {
    status: "ready",
    advisory: true,
    replacementByteLength: backup.utf8ByteLength(JSON.stringify(replacement)),
    requiredStorageUnits: backup.utf8ByteLength(JSON.stringify(replacement)),
  });
  assert.equal("applyPlan" in result, false);
  const probeWrite = storage.setCalls[0];
  assert.match(
    probeWrite.key,
    /^atlas:journey-capacity-probe:v1:[\da-f-]{36}$/i,
  );
  assert.equal(probeWrite.value.length, result.requiredStorageUnits);
  assert.notEqual(probeWrite.value, JSON.stringify(replacement));
  assert.doesNotMatch(probeWrite.value, /PRIVATE-REPLACEMENT-SENTINEL/);
  assert.deepEqual(storage.removeCalls, [probeWrite.key]);
  assert.equal(storage.valueFor(probeWrite.key), null);
  assert.equal(storage.raw, durableRaw);
  assert.equal(
    storage.setCalls.some((call) => call.key === ATLAS_JOURNEY_STORAGE_KEY_V1),
    false,
  );
  assert.equal(
    storage.operations.find((operation) => operation.key === probeWrite.key)
      .operation,
    "set",
  );

  const second = await repository.preflightReplaceCapacity(capacityInput(plan));
  assert.equal(second.status, "ready");
  assert.notEqual(storage.setCalls[1].key, probeWrite.key);

  storage.getQueue.push(namedError("SecurityError", "durable read blocked"));
  const durableReadFailure = await repository.read();
  assert.equal(durableReadFailure.status, "read-failed");
  assert.equal(durableReadFailure.raw, null);
});

test("another context occupying the former fixed-key empty-read window is never overwritten", async () => {
  const legacyFixedKey = "atlas:journey-capacity-probe:v1";
  const storage = new TestStorage(JSON.stringify(validDocument(0)));
  storage.setQueue.push((target, value, key) => {
    target.setValue(legacyFixedKey, "external-fixed-key-value");
    target.setValue(key, value);
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(readyReplacePlan()),
  );

  assert.equal(result.status, "ready");
  assert.equal(storage.valueFor(legacyFixedKey), "external-fixed-key-value");
  assert.notEqual(storage.setCalls[0].key, legacyFixedKey);
  assert.equal(storage.getCalls.includes(legacyFixedKey), false);
  assert.equal(storage.removeCalls.includes(legacyFixedKey), false);
});

test("an ownership read/remove interleaving preserves the replacement and cannot report ready", async () => {
  const durableRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(durableRaw);
  storage.removeQueue.push((target, key) => {
    target.setValue(key, "external-during-cleanup");
  });
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.preflightReplaceCapacity(
    capacityInput(readyReplacePlan()),
  );
  const probeKey = storage.setCalls[0].key;

  assert.equal(result.status, "unavailable");
  assert.equal(result.stage, "probe-cleanup");
  assert.equal(result.applyPlan, null);
  assert.equal(storage.valueFor(probeKey), "external-during-cleanup");
  assert.equal(storage.raw, durableRaw);
});

test("quota failure after a partial unique probe write cleans only that probe", async () => {
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
  const probeKey = storage.setCalls[0].key;

  assert.equal(result.status, "capacity-failed");
  assert.equal(result.applyPlan, null);
  assert.equal(result.reason, "probe-quota-exceeded");
  assert.equal(storage.valueFor(probeKey), null);
  assert.deepEqual(storage.removeCalls, [probeKey]);
  assert.equal(storage.raw, durableRaw);
});

test("probe readback and cleanup failures remain unavailable", async () => {
  const readStorage = new TestStorage(JSON.stringify(validDocument(0)));
  readStorage.getQueue.push(
    namedError("SecurityError", "probe readback denied"),
  );
  const readResult = await new LocalStorageJourneyRepository(
    readStorage,
  ).preflightReplaceCapacity(capacityInput(readyReplacePlan()));
  assert.equal(readResult.status, "unavailable");
  assert.equal(readResult.stage, "probe-readback");
  assert.equal(readStorage.valueFor(readStorage.setCalls[0].key), null);

  const cleanupStorage = new TestStorage(JSON.stringify(validDocument(0)));
  cleanupStorage.removeQueue.push(
    namedError("SecurityError", "probe cleanup denied"),
  );
  const cleanupResult = await new LocalStorageJourneyRepository(
    cleanupStorage,
  ).preflightReplaceCapacity(capacityInput(readyReplacePlan()));
  assert.equal(cleanupResult.status, "unavailable");
  assert.equal(cleanupResult.stage, "probe-cleanup");
  assert.match(cleanupResult.error, /probe cleanup denied/);
  assert.notEqual(
    cleanupStorage.valueFor(cleanupStorage.setCalls[0].key),
    null,
  );
});

test("CJK and astral replacements use the conservative UTF-8 storage-unit count", async () => {
  for (const title of ["東京界界界", "推し😀🚀✨"]) {
    const replacement = validDocument(1, title);
    const raw = JSON.stringify(replacement);
    const storage = new TestStorage(JSON.stringify(validDocument(0)));
    const result = await new LocalStorageJourneyRepository(
      storage,
    ).preflightReplaceCapacity(
      capacityInput(readyReplacePlan(validDocument(0), replacement)),
    );

    assert.equal(result.status, "ready");
    assert.equal(result.replacementByteLength, backup.utf8ByteLength(raw));
    assert.equal(
      result.requiredStorageUnits,
      Math.max(raw.length, backup.utf8ByteLength(raw)),
    );
    assert.equal(storage.setCalls[0].value.length, result.requiredStorageUnits);
    assert.equal(result.requiredStorageUnits > raw.length, true);
  }
});

test("the authoritative hard cap rejects ASCII and multibyte boundary plans before probing", async () => {
  const cases = [
    oversizedValidDocument(),
    oversizedValidDocument(1, {
      journeyCount: 280,
      memoCharacter: "界",
    }),
  ];
  const asciiRaw = JSON.stringify(cases[0]);
  const cjkRaw = JSON.stringify(cases[1]);
  assert.equal(asciiRaw.length > backup.ATLAS_BACKUP_MAX_BYTES, true);
  assert.equal(cjkRaw.length < backup.ATLAS_BACKUP_MAX_BYTES, true);
  assert.equal(
    backup.utf8ByteLength(cjkRaw) > backup.ATLAS_BACKUP_MAX_BYTES,
    true,
  );

  for (const replacement of cases) {
    const storage = new TestStorage(JSON.stringify(validDocument(0)));
    const result = await new LocalStorageJourneyRepository(
      storage,
    ).preflightReplaceCapacity(
      capacityInput(readyReplacePlan(validDocument(0), replacement)),
    );
    assert.equal(result.status, "capacity-failed");
    assert.equal(result.reason, "replacement-exceeds-authoritative-limit");
    assert.equal(result.applyPlan, null);
    assert.equal(
      result.requiredStorageUnits > backup.ATLAS_BACKUP_MAX_BYTES,
      true,
    );
    assert.equal(storage.getCalls.length, 0);
    assert.equal(storage.setCalls.length, 0);
    assert.equal(storage.removeCalls.length, 0);
  }
});

test("caller limits and malformed plans cannot bypass the repository authority", async () => {
  const plan = readyReplacePlan();
  const callerStorage = new TestStorage(JSON.stringify(validDocument(0)));
  const callerResult = await new LocalStorageJourneyRepository(
    callerStorage,
  ).preflightReplaceCapacity({
    plan,
    maximumReplacementBytes: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(callerResult.status, "unavailable");
  assert.equal(callerResult.stage, "invalid-input");
  assert.equal(callerStorage.setCalls.length, 0);

  for (const invalidPlan of [
    { ...plan, replacement: validDocument(3, "Skipped revision") },
    { ...plan, extra: true },
    {
      ...plan,
      summary: {
        ...plan.summary,
        journeys: { ...plan.summary.journeys, extra: 1 },
      },
    },
  ]) {
    const storage = new TestStorage(JSON.stringify(validDocument(0)));
    const result = await new LocalStorageJourneyRepository(
      storage,
    ).preflightReplaceCapacity(capacityInput(invalidPlan));
    assert.equal(result.status, "unavailable");
    assert.equal(result.stage, "invalid-plan");
    assert.equal(storage.getCalls.length, 0);
    assert.equal(storage.setCalls.length, 0);
  }
});

test("direct replace and apply paths independently enforce cap, strict shape, summary, and CAS", async () => {
  const current = validDocument(0);
  const currentRaw = JSON.stringify(current);

  const directStorage = new TestStorage(currentRaw);
  const directResult = await new LocalStorageJourneyRepository(
    directStorage,
  ).replace(
    validatedReplace(
      { state: "present", revision: 0 },
      oversizedValidDocument(),
    ),
  );
  assert.equal(directResult.status, "failure");
  assert.match(directResult.error, /authoritative backup\/storage limit/);
  assert.equal(directStorage.setCalls.length, 0);
  assert.equal(directStorage.raw, currentRaw);

  const plan = readyReplacePlan(current, validDocument(1, "Replacement"));
  const extraPlanStorage = new TestStorage(currentRaw);
  const extraPlan = await new LocalStorageJourneyRepository(
    extraPlanStorage,
  ).applyReplacePlan({ ...plan, extra: true });
  assert.equal(extraPlan.status, "invalid-plan");
  assert.equal(extraPlan.reason, "invalid-shape");
  assert.equal(extraPlanStorage.getCalls.length, 0);

  const summaryStorage = new TestStorage(currentRaw);
  const falseSummary = {
    ...plan,
    summary: {
      ...plan.summary,
      journeys: {
        before: 1,
        after: 1,
        added: 0,
        updated: 0,
        deleted: 0,
        unchanged: 1,
      },
    },
  };
  const summaryResult = await new LocalStorageJourneyRepository(summaryStorage);
  const summaryPreflight = await summaryResult.preflightReplaceCapacity(
    capacityInput(falseSummary),
  );
  assert.equal(summaryPreflight.status, "ready");
  const summaryApply = await summaryResult.applyReplacePlan(falseSummary);
  assert.equal(summaryApply.status, "failure");
  assert.match(summaryApply.error, /summary does not match/);
  assert.equal(summaryStorage.setCalls.length, 1);
  assert.notEqual(summaryStorage.setCalls[0].key, ATLAS_JOURNEY_STORAGE_KEY_V1);

  const extraReplacementStorage = new TestStorage(currentRaw);
  const extraReplacementResult = await new LocalStorageJourneyRepository(
    extraReplacementStorage,
  ).applyReplacePlan({
    ...plan,
    replacement: { ...plan.replacement, extra: true },
  });
  assert.equal(extraReplacementResult.status, "failure");
  assert.match(extraReplacementResult.error, /strict parsing: invalid/);
  assert.equal(extraReplacementStorage.setCalls.length, 0);

  const staleStorage = new TestStorage(currentRaw);
  const staleRepository = new LocalStorageJourneyRepository(staleStorage);
  assert.equal(
    (await staleRepository.preflightReplaceCapacity(capacityInput(plan)))
      .status,
    "ready",
  );
  staleStorage.raw = JSON.stringify(validDocument(1, "External commit"));
  const staleResult = await staleRepository.applyReplacePlan(plan);
  assert.equal(staleResult.status, "conflict");
  assert.equal(
    staleStorage.setCalls.filter(
      (call) => call.key === ATLAS_JOURNEY_STORAGE_KEY_V1,
    ).length,
    0,
  );
});

test("a plan mutated after advisory readiness cannot bypass strict apply gates", async () => {
  const current = validDocument(0);
  const plan = readyReplacePlan(current, validDocument(1, "Replacement"));
  const storage = new TestStorage(JSON.stringify(current));
  const repository = new LocalStorageJourneyRepository(storage);
  const preflight = await repository.preflightReplaceCapacity(
    capacityInput(plan),
  );
  assert.equal(preflight.status, "ready");
  assert.equal("applyPlan" in preflight, false);

  plan.replacement = oversizedValidDocument();
  const apply = await repository.applyReplacePlan(plan);
  assert.equal(apply.status, "failure");
  assert.match(apply.error, /authoritative backup\/storage limit/);
  assert.equal(
    storage.setCalls.filter((call) => call.key === ATLAS_JOURNEY_STORAGE_KEY_V1)
      .length,
    0,
  );
});

test("real apply quota and readback failures after advisory readiness restore exact raw", async () => {
  const current = validDocument(0);
  const plan = readyReplacePlan(current, validDocument(1, "Replacement"));

  const quotaRaw = ` ${JSON.stringify(current)}\r\n`;
  const quotaStorage = new TestStorage(quotaRaw);
  const quotaRepository = new LocalStorageJourneyRepository(quotaStorage);
  assert.equal(
    (await quotaRepository.preflightReplaceCapacity(capacityInput(plan)))
      .status,
    "ready",
  );
  quotaStorage.setQueue.push((target, value, key) => {
    assert.equal(key, ATLAS_JOURNEY_STORAGE_KEY_V1);
    target.setValue(key, value);
    throw namedError("QuotaExceededError", "real replacement quota failure");
  });
  const quotaResult = await quotaRepository.applyReplacePlan(plan);
  assert.equal(quotaResult.status, "failure");
  assert.equal(quotaResult.stage, "write");
  assert.deepEqual(quotaResult.rollback, {
    status: "restored",
    raw: quotaRaw,
  });
  assert.equal(quotaStorage.raw, quotaRaw);

  const readbackRaw = `\n${JSON.stringify(current)}\n`;
  const readbackStorage = new TestStorage(readbackRaw);
  const readbackRepository = new LocalStorageJourneyRepository(readbackStorage);
  assert.equal(
    (await readbackRepository.preflightReplaceCapacity(capacityInput(plan)))
      .status,
    "ready",
  );
  readbackStorage.getQueue.push(readbackRaw, "not-json");
  const readbackResult = await readbackRepository.applyReplacePlan(plan);
  assert.equal(readbackResult.status, "failure");
  assert.equal(readbackResult.stage, "readback");
  assert.deepEqual(readbackResult.rollback, {
    status: "restored",
    raw: readbackRaw,
  });
  assert.equal(readbackStorage.raw, readbackRaw);
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
  assert.deepEqual(
    await repository.handleStorageEvent({
      key: `${CAPACITY_PROBE_KEY_PREFIX}external-probe-id`,
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
