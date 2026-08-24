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

function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

class TestStorage {
  constructor(raw = null) {
    this.raw = raw;
  }

  getQueue = [];
  setQueue = [];
  removeQueue = [];
  getCalls = [];
  setCalls = [];
  removeCalls = [];

  getItem(key) {
    this.getCalls.push(key);
    if (this.getQueue.length === 0) return this.raw;
    const step = this.getQueue.shift();
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(this) : step;
  }

  setItem(key, value) {
    this.setCalls.push({ key, value });
    if (this.setQueue.length === 0) {
      this.raw = value;
      return;
    }
    const step = this.setQueue.shift();
    if (step instanceof Error) throw step;
    if (typeof step === "function") {
      step(this, value);
      return;
    }
    this.raw = value;
  }

  removeItem(key) {
    this.removeCalls.push(key);
    if (this.removeQueue.length === 0) {
      this.raw = null;
      return;
    }
    const step = this.removeQueue.shift();
    if (step instanceof Error) throw step;
    if (typeof step === "function") {
      step(this);
      return;
    }
    this.raw = null;
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

test("valid but mismatched readback rolls back instead of claiming success", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const mismatched = JSON.stringify(validDocument(1, "Other tab content"));
  const storage = new TestStorage(oldRaw);
  storage.getQueue.push(oldRaw, mismatched);
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
  assert.deepEqual(result.rollback, { status: "restored", raw: oldRaw });
  assert.equal(storage.raw, oldRaw);
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

test("delete-all non-absent readback fails and restores old raw", async () => {
  const oldRaw = JSON.stringify(validDocument(0));
  const storage = new TestStorage(oldRaw);
  storage.getQueue.push(oldRaw, oldRaw);
  const repository = new LocalStorageJourneyRepository(storage);
  const result = await repository.deleteAll({
    expectedRevision: { state: "present", revision: 0 },
  });

  assert.equal(result.status, "failure");
  assert.equal(result.stage, "readback");
  assert.deepEqual(result.rollback, { status: "restored", raw: oldRaw });
  assert.equal(storage.raw, oldRaw);
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
