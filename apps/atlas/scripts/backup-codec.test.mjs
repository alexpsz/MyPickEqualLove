import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(atlasRoot, "src");
const compiledRoot = await mkdtemp(join(tmpdir(), "atlas-backup-codec-"));

after(async () => {
  await rm(compiledRoot, { recursive: true, force: true });
});

for (const sourceDirectory of ["backup", "contracts", "ports"]) {
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

const backup = await import(
  pathToFileURL(join(compiledRoot, "backup", "backup-codec.js")).href
);
const identity = await import(
  pathToFileURL(join(compiledRoot, "contracts", "identity.js")).href
);

const EXPORTED_AT = "2026-08-25T01:02:03.456Z";
const RESTORE_NOW = "2026-08-25T02:03:04.567Z";

function publicReference(entityId) {
  return {
    entityId,
    sourceRevision: "atlas-projection-r1",
    fallback: {
      groupName: "＝LOVE",
      title: "Event title",
      date: "2026-06-20",
      venueName: "Venue",
    },
  };
}

function journeyDocument({ revision = 3, journeyId = "journey-one" } = {}) {
  const createdAt = "2026-06-20T10:00:00.000Z";
  const updatedAt = "2026-06-21T10:00:00.000Z";
  return {
    schemaVersion: 1,
    revision,
    updatedAt,
    journeys: [
      {
        id: journeyId,
        subject: {
          kind: "public-reference",
          reference: publicReference(
            identity.createEventEntityId("equal-love", "shared-event"),
          ),
        },
        intent: "planned",
        experienceEntries: [
          {
            id: "entry-one",
            mode: "in-person",
            occurredAt: createdAt,
            memo: "A private memo",
            highlights: ["Encore"],
            songRefs: [
              publicReference(
                identity.createSongEntityId("equal-love", "existing-song-id"),
              ),
            ],
            createdAt,
            updatedAt,
          },
        ],
        createdAt,
        updatedAt,
      },
    ],
  };
}

function encodedBackup(journey = journeyDocument()) {
  return backup.encodeAtlasBackup({ exportedAt: EXPORTED_AT, journey });
}

function selected(raw, maximumBytes = backup.ATLAS_BACKUP_MAX_BYTES) {
  return {
    status: "selected",
    raw,
    limits: { maximumBytes },
  };
}

function dryRunInput({
  raw = encodedBackup(),
  current = journeyDocument(),
  now = RESTORE_NOW,
  expectedRevision = current === null
    ? { state: "absent" }
    : { state: "present", revision: current.revision },
  maximumBytes = backup.ATLAS_BACKUP_MAX_BYTES,
  availableBytes = 1_000_000,
} = {}) {
  return {
    import: selected(raw, maximumBytes),
    current,
    now,
    transaction: { expectedRevision, availableBytes },
  };
}

test("round trips the complete Atlas-only Journey envelope", () => {
  const raw = encodedBackup();
  const result = backup.parseAtlasBackup(raw);

  assert.equal(result.status, "valid");
  assert.equal(result.value.productFamilySiteId, "atlas");
  assert.equal(result.value.schemaVersion, 1);
  assert.equal(result.value.exportedAt, EXPORTED_AT);
  assert.deepEqual(result.value.journey, journeyDocument());
});

test("encode is stable and re-verifies the C0 Journey shape", () => {
  const candidate = journeyDocument();
  const first = backup.encodeAtlasBackup({
    exportedAt: EXPORTED_AT,
    journey: candidate,
  });
  const second = backup.encodeAtlasBackup({
    exportedAt: EXPORTED_AT,
    journey: candidate,
  });

  assert.equal(first, second);
  const invalidJourney = journeyDocument();
  invalidJourney.journeys[0].unknown = true;
  assert.throws(
    () =>
      backup.encodeAtlasBackup({
        exportedAt: EXPORTED_AT,
        journey: invalidJourney,
      }),
    /unknown field/,
  );
});

test("exportedAt cannot precede the complete Journey timestamp", () => {
  const earlyExportedAt = "2026-06-21T09:59:59.999Z";
  assert.throws(
    () =>
      backup.encodeAtlasBackup({
        exportedAt: earlyExportedAt,
        journey: journeyDocument(),
      }),
    /exportedAt cannot precede Journey updatedAt/,
  );

  const raw = JSON.parse(encodedBackup());
  raw.exportedAt = earlyExportedAt;
  const parsed = backup.parseAtlasBackup(JSON.stringify(raw));
  assert.equal(parsed.status, "invalid");
  assert.equal(parsed.issue.path, "$.exportedAt");
});

test("envelope keys are exact and cross-product backups fail closed", () => {
  const valid = JSON.parse(encodedBackup());
  valid.unknown = true;
  const unknown = backup.parseAtlasBackup(JSON.stringify(valid));
  assert.equal(unknown.status, "invalid");
  assert.equal(unknown.issue.path, "$.unknown");

  const crossProduct = JSON.parse(encodedBackup());
  crossProduct.productFamilySiteId = "equal-love";
  const result = backup.parseAtlasBackup(JSON.stringify(crossProduct));
  assert.equal(result.status, "invalid");
  assert.equal(result.issue.path, "$.productFamilySiteId");
});

test("future, corrupt, and invalid backup content retain raw diagnostics", () => {
  const futureRaw = JSON.stringify({ schemaVersion: 2, future: true });
  const future = backup.parseAtlasBackup(futureRaw);
  assert.deepEqual(future, {
    status: "future-version",
    raw: futureRaw,
    version: 2,
    issue: {
      path: "$.schemaVersion",
      message: "unsupported future backup schema version 2",
    },
  });

  const corrupt = backup.parseAtlasBackup("{");
  assert.deepEqual(corrupt, {
    status: "corrupt",
    raw: "{",
    issue: { path: "$", message: "backup is not valid JSON" },
  });

  const invalid = JSON.parse(encodedBackup());
  invalid.journey.revision = -1;
  const invalidRaw = JSON.stringify(invalid);
  const result = backup.parseAtlasBackup(invalidRaw);
  assert.equal(result.status, "invalid");
  assert.equal(result.raw, invalidRaw);
  assert.equal(result.issue.path, "$.revision");
});

test("UTF-8 preflight uses byte length, not JavaScript string length", () => {
  const raw = "あ";
  assert.equal(raw.length, 1);
  assert.equal(backup.utf8ByteLength(raw), 3);
  const exactlyFits = backup.preflightAtlasBackupImport(selected(raw, 3));
  assert.equal(exactlyFits.status, "corrupt");
  assert.equal(exactlyFits.importByteLength, 3);

  const oversize = backup.preflightAtlasBackupImport(selected(raw, 2));
  assert.deepEqual(oversize, {
    status: "oversize",
    raw,
    minimumImportByteLength: 3,
    importHardCapBytes: backup.ATLAS_BACKUP_MAX_BYTES,
    effectiveMaximumBytes: 2,
    issue: {
      path: "$.raw",
      message: "backup exceeds the effective import UTF-8 byte limit",
    },
  });
});

test("ASCII import hard-cap boundary cannot be raised by a caller", () => {
  const atHardCap = "a".repeat(backup.ATLAS_BACKUP_MAX_BYTES);
  const exactBoundary = backup.preflightAtlasBackupImport(
    selected(atHardCap, Number.MAX_SAFE_INTEGER),
  );
  assert.equal(exactBoundary.status, "corrupt");
  assert.equal(exactBoundary.importByteLength, backup.ATLAS_BACKUP_MAX_BYTES);

  const beyondHardCap = backup.preflightAtlasBackupImport(
    selected(`${atHardCap}a`, Number.MAX_SAFE_INTEGER),
  );
  assert.equal(beyondHardCap.status, "oversize");
  assert.equal(
    beyondHardCap.minimumImportByteLength,
    backup.ATLAS_BACKUP_MAX_BYTES + 1,
  );
  assert.equal(beyondHardCap.importHardCapBytes, backup.ATLAS_BACKUP_MAX_BYTES);
  assert.equal(
    beyondHardCap.effectiveMaximumBytes,
    backup.ATLAS_BACKUP_MAX_BYTES,
  );
});

test("multibyte import hard-cap boundary is counted without a UTF-8 buffer", () => {
  const exactBoundary = `${"あ".repeat(
    Math.floor(backup.ATLAS_BACKUP_MAX_BYTES / 3),
  )}aa`;
  assert.equal(
    backup.utf8ByteLength(exactBoundary),
    backup.ATLAS_BACKUP_MAX_BYTES,
  );
  assert.equal(
    backup.preflightAtlasBackupImport(
      selected(exactBoundary, Number.MAX_SAFE_INTEGER),
    ).status,
    "corrupt",
  );

  const beyondHardCap = backup.preflightAtlasBackupImport(
    selected(`${exactBoundary}あ`, Number.MAX_SAFE_INTEGER),
  );
  assert.equal(beyondHardCap.status, "oversize");
  assert.equal(
    beyondHardCap.minimumImportByteLength,
    backup.ATLAS_BACKUP_MAX_BYTES + 3,
  );
});

test("surrogate-pair import hard-cap boundary is counted without a UTF-8 buffer", () => {
  const exactBoundary = "😀".repeat(backup.ATLAS_BACKUP_MAX_BYTES / 4);
  assert.equal(
    backup.utf8ByteLength(exactBoundary),
    backup.ATLAS_BACKUP_MAX_BYTES,
  );
  assert.equal(
    backup.preflightAtlasBackupImport(
      selected(exactBoundary, Number.MAX_SAFE_INTEGER),
    ).status,
    "corrupt",
  );

  const beyondHardCap = backup.preflightAtlasBackupImport(
    selected(`${exactBoundary}😀`, Number.MAX_SAFE_INTEGER),
  );
  assert.equal(beyondHardCap.status, "oversize");
  assert.equal(
    beyondHardCap.minimumImportByteLength,
    backup.ATLAS_BACKUP_MAX_BYTES + 4,
  );
});

test("cancellation, import oversize, and replacement capacity failure never produce an apply plan", () => {
  const raw = encodedBackup();
  const current = journeyDocument();
  const currentBefore = structuredClone(current);
  const cancelled = backup.dryRunAtlasBackupRestore({
    ...dryRunInput({ current }),
    import: { status: "cancelled" },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.applyPlan, null);

  const oversize = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      current,
      raw,
      maximumBytes: backup.utf8ByteLength(raw) - 1,
    }),
  );
  assert.equal(oversize.status, "oversize");
  assert.equal(oversize.applyPlan, null);

  const capacity = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      current,
      raw,
      availableBytes: 0,
    }),
  );
  assert.equal(capacity.status, "capacity-failed");
  assert.equal(capacity.applyPlan, null);
  assert.equal(capacity.replacementByteLength > 0, true);
  assert.equal(capacity.availableBytes, 0);
  assert.deepEqual(current, currentBefore);
});

test("a restore to an absent document rebases revision to zero", () => {
  const imported = journeyDocument({ revision: 999 });
  const result = backup.dryRunAtlasBackupRestore(
    dryRunInput({ raw: encodedBackup(imported), current: null }),
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(result.applyPlan.expectedRevision, { state: "absent" });
  assert.equal(result.applyPlan.replacement.revision, 0);
  assert.equal(result.applyPlan.replacement.updatedAt, RESTORE_NOW);
});

test("a restore to a present document rebases revision continuously", () => {
  const current = journeyDocument({ revision: 7 });
  const result = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      current,
      raw: encodedBackup(journeyDocument({ revision: 0 })),
    }),
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(result.applyPlan.expectedRevision, {
    state: "present",
    revision: 7,
  });
  assert.equal(result.applyPlan.replacement.revision, 8);
});

test("storage capacity is measured from the canonical replacement, not envelope overhead", () => {
  const prettyRaw = JSON.stringify(JSON.parse(encodedBackup()), null, 2);
  const raw = `${" ".repeat(1024 * 1024)}${prettyRaw}`;
  const unbounded = backup.dryRunAtlasBackupRestore(
    dryRunInput({ raw, availableBytes: 1_000_000 }),
  );

  assert.equal(unbounded.status, "ready");
  assert.equal(
    backup.utf8ByteLength(raw) > unbounded.replacementByteLength,
    true,
  );
  const exactReplacementCapacity = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      raw,
      availableBytes: unbounded.replacementByteLength,
    }),
  );
  assert.equal(exactReplacementCapacity.status, "ready");
  assert.equal(
    exactReplacementCapacity.replacementByteLength,
    unbounded.replacementByteLength,
  );
});

test("replacement capacity failure returns replacement bytes and no apply plan", () => {
  const raw = encodedBackup();
  const ready = backup.dryRunAtlasBackupRestore(
    dryRunInput({ raw, availableBytes: 1_000_000 }),
  );
  assert.equal(ready.status, "ready");

  const rejected = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      raw,
      availableBytes: ready.replacementByteLength - 1,
    }),
  );
  assert.deepEqual(rejected, {
    status: "capacity-failed",
    raw,
    replacementByteLength: ready.replacementByteLength,
    availableBytes: ready.replacementByteLength - 1,
    issue: {
      path: "$.transaction.availableBytes",
      message:
        "canonical Journey replacement exceeds the available storage capacity",
    },
    applyPlan: null,
  });
});

test("revision digit changes are included in the replacement capacity threshold", () => {
  const raw = encodedBackup(journeyDocument({ revision: 0 }));
  const revisionNine = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      raw,
      current: journeyDocument({ revision: 8 }),
      availableBytes: 1_000_000,
    }),
  );
  const revisionTen = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      raw,
      current: journeyDocument({ revision: 9 }),
      availableBytes: 1_000_000,
    }),
  );
  assert.equal(revisionNine.status, "ready");
  assert.equal(revisionTen.status, "ready");
  assert.equal(
    revisionTen.replacementByteLength,
    revisionNine.replacementByteLength + 1,
  );

  const rejected = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      raw,
      current: journeyDocument({ revision: 9 }),
      availableBytes: revisionTen.replacementByteLength - 1,
    }),
  );
  assert.equal(rejected.status, "capacity-failed");
  assert.equal(
    rejected.replacementByteLength,
    revisionTen.replacementByteLength,
  );
  assert.equal(rejected.applyPlan, null);
});

test("old, high, and equal imported revisions never alter the next revision", () => {
  for (const importedRevision of [0, 7, 999]) {
    const result = backup.dryRunAtlasBackupRestore(
      dryRunInput({
        current: journeyDocument({ revision: 7 }),
        raw: encodedBackup(journeyDocument({ revision: importedRevision })),
      }),
    );
    assert.equal(result.status, "ready", String(importedRevision));
    assert.equal(result.applyPlan.replacement.revision, 8);
  }
});

test("transaction revision mismatch fails closed without an apply plan", () => {
  const result = backup.dryRunAtlasBackupRestore(
    dryRunInput({ expectedRevision: { state: "present", revision: 2 } }),
  );

  assert.equal(result.status, "invalid");
  assert.equal(result.applyPlan, null);
  assert.equal(result.issue.path, "$.transaction.expectedRevision");
});

test("dry-run rejects a restore time before the backup export", () => {
  const result = backup.dryRunAtlasBackupRestore(
    dryRunInput({ now: "2026-08-25T01:02:03.455Z" }),
  );

  assert.equal(result.status, "invalid");
  assert.equal(result.applyPlan, null);
  assert.equal(result.issue.path, "$.now");
});

test("dry-run summary reports Journey and experience adds, updates, deletes, and unchanged", () => {
  const current = journeyDocument();
  current.journeys.push({
    ...structuredClone(current.journeys[0]),
    id: "journey-delete",
    experienceEntries: [
      {
        ...structuredClone(current.journeys[0].experienceEntries[0]),
        id: "entry-delete",
      },
    ],
  });
  const imported = journeyDocument({ revision: 100 });
  imported.journeys[0].intent = "interested";
  imported.journeys[0].experienceEntries[0].memo = "Restored private memo";
  imported.journeys.push({
    ...structuredClone(imported.journeys[0]),
    id: "journey-add",
    experienceEntries: [
      {
        ...structuredClone(imported.journeys[0].experienceEntries[0]),
        id: "entry-add",
      },
    ],
  });
  const result = backup.dryRunAtlasBackupRestore(
    dryRunInput({ current, raw: encodedBackup(imported) }),
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(result.applyPlan.summary.journeys, {
    before: 2,
    after: 2,
    added: 1,
    updated: 1,
    deleted: 1,
    unchanged: 0,
  });
  assert.deepEqual(result.applyPlan.summary.experienceEntries, {
    before: 2,
    after: 2,
    added: 1,
    updated: 1,
    deleted: 1,
    unchanged: 0,
  });
});

test("dry-run summary retains unchanged Journey and experience entries", () => {
  const current = journeyDocument();
  const result = backup.dryRunAtlasBackupRestore(
    dryRunInput({
      current,
      raw: encodedBackup(journeyDocument({ revision: 1 })),
    }),
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(result.applyPlan.summary, {
    journeys: {
      before: 1,
      after: 1,
      added: 0,
      updated: 0,
      deleted: 0,
      unchanged: 1,
    },
    experienceEntries: {
      before: 1,
      after: 1,
      added: 0,
      updated: 0,
      deleted: 0,
      unchanged: 1,
    },
  });
});

test("equal totals with a whole replacement still show deletes and adds", () => {
  const current = journeyDocument({ journeyId: "journey-current" });
  const imported = journeyDocument({ journeyId: "journey-imported" });
  imported.journeys[0].experienceEntries[0].id = "entry-imported";
  const result = backup.dryRunAtlasBackupRestore(
    dryRunInput({ current, raw: encodedBackup(imported) }),
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(result.applyPlan.summary.journeys, {
    before: 1,
    after: 1,
    added: 1,
    updated: 0,
    deleted: 1,
    unchanged: 0,
  });
  assert.deepEqual(result.applyPlan.summary.experienceEntries, {
    before: 1,
    after: 1,
    added: 1,
    updated: 0,
    deleted: 1,
    unchanged: 0,
  });
});

test("backup codec has no Storage/window access and keeps dry-run inputs pure", async () => {
  const codecSource = await readFile(
    join(sourceRoot, "backup", "backup-codec.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    codecSource,
    /\b(?:window|localStorage|sessionStorage|Storage)\b/,
  );
  assert.doesNotMatch(codecSource, /\bTextEncoder\b/);
  assert.doesNotMatch(codecSource, /\.encode\s*\(/);

  const raw = encodedBackup();
  const current = journeyDocument();
  const currentBefore = structuredClone(current);
  assert.equal(backup.parseAtlasBackup(raw).status, "valid");
  assert.equal(
    backup.preflightAtlasBackupImport(selected(raw)).status,
    "ready",
  );
  assert.equal(
    backup.dryRunAtlasBackupRestore(dryRunInput({ current, raw })).status,
    "ready",
  );
  assert.deepEqual(current, currentBefore);
});
