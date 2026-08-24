import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import {
  DEFAULT_RECEIPT_PATH,
  DEFAULT_REPOSITORY_ROOT,
  FIXED_ARTIFACT_PATH,
  FIXED_CONTRACT_PATHS,
  FIXED_RECEIPT_PATH,
  FIXED_SEEDS,
  GATE_NAMES,
  artifactHash,
  auditWorkspace,
  canonicalUtf8,
  checkProjection,
  generateProjection,
  safeRepositoryPath,
  sha256,
} from "./public-event-projection.mjs";

const execFileAsync = promisify(execFile);

async function temporaryRoot(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyRepositoryFile(root, repositoryPath) {
  const target = resolve(root, repositoryPath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(DEFAULT_REPOSITORY_ROOT, repositoryPath), target);
}

async function git(root, args) {
  return execFileAsync("git", ["-c", "core.excludesFile=", ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function approvalFor(siteId) {
  return {
    schemaVersion: 1,
    siteId,
    atlasPublicSeedApproval: "approved",
    approvedAt: "2026-07-31T00:00:00.000Z",
    maintenanceOwner: `fixture-${siteId}-owner`,
    withdrawalState: "active",
  };
}

function publicEvidenceFor(event, siteId) {
  return {
    asOf: "2026-07-31",
    lastVerifiedAt: "2026-08-01",
    timezone: "Asia/Tokyo",
    lifecycle: event.id === "tokyo_dome_2027" ? "scheduled" : "completed",
    refreshPolicy: {
      refreshCadence: "on-source-change",
      staleAfterDays: 30,
      onInvalidation: "HOLD",
      onWithdrawal: "HOLD",
    },
    maintenanceOwner: `fixture-${siteId}-owner`,
  };
}

function addEqualLoveExclusions(events) {
  for (const performance of events[0].performances) {
    performance.provenance = {
      excludedEntries: [
        {
          sourceUrl: performance.sourceUrls[0],
          sourceOrder: 1,
          label: "Overture",
          reason: "non-catalog-intro",
        },
      ],
    };
  }
}

function gateRefs(fixed, events, gateName) {
  const refs = [];
  events.forEach((event, eventIndex) => {
    const base = `${fixed.sourcePath}#/${eventIndex}`;
    if (gateName === "claimLevelEvidence") {
      refs.push(`${base}/eventEvidence`);
      (event.performances ?? []).forEach((_performance, performanceIndex) => {
        refs.push(`${base}/performances/${performanceIndex}`);
      });
    }
    if (gateName === "temporalVerification") {
      refs.push(`${base}/publicAtlasEvidence/asOf`);
      refs.push(`${base}/publicAtlasEvidence/lastVerifiedAt`);
    }
    if (gateName === "timezoneAndLifecycle") {
      refs.push(`${base}/publicAtlasEvidence/timezone`);
      refs.push(`${base}/publicAtlasEvidence/lifecycle`);
    }
    if (gateName === "refreshInvalidationWithdrawal") {
      refs.push(`${base}/publicAtlasEvidence/refreshPolicy`);
    }
    if (gateName === "maintenanceOwner") {
      refs.push(`${base}/publicAtlasEvidence/maintenanceOwner`);
    }
  });
  if (gateName === "sourceUseBoundary") return [`${fixed.approvalPath}#`];
  if (gateName === "claimLevelEvidence")
    return [...refs, `${fixed.songsPath}#`];
  if (gateName === "refreshInvalidationWithdrawal") {
    return [...refs, `${fixed.approvalPath}#/withdrawalState`];
  }
  if (gateName === "maintenanceOwner") {
    return [...refs, `${fixed.approvalPath}#/maintenanceOwner`];
  }
  return refs;
}

async function updateReceiptHashes(fixture) {
  fixture.receipt.sourceCommit = (
    await git(fixture.root, ["rev-parse", "HEAD"])
  ).stdout.trim();
  for (const entry of fixture.receipt.contractFiles) {
    entry.sha256 = sha256(await readFile(resolve(fixture.root, entry.path)));
  }
  for (const entry of fixture.receipt.evidenceFiles) {
    entry.sha256 = sha256(await readFile(resolve(fixture.root, entry.path)));
  }
  for (const seed of fixture.receipt.seeds) {
    seed.sourceSha256 = sha256(
      await readFile(resolve(fixture.root, seed.sourcePath)),
    );
    seed.songsSha256 = sha256(
      await readFile(resolve(fixture.root, seed.songsPath)),
    );
  }
  await writeJson(fixture.receiptPath, fixture.receipt);
}

async function commitFixture(fixture, paths, message = "fixture update") {
  await git(fixture.root, ["add", "--", ...paths]);
  await git(fixture.root, ["commit", "-q", "-m", message]);
  await updateReceiptHashes(fixture);
}

async function createGoFixture(t) {
  const root = await temporaryRoot(t, "atlas-e1-go-");
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.name", "Atlas Fixture"]);
  await git(root, ["config", "user.email", "atlas-fixture@example.invalid"]);
  const receipt = await readJson(DEFAULT_RECEIPT_PATH);
  const committedPaths = [];

  for (const contractPath of FIXED_CONTRACT_PATHS) {
    await copyRepositoryFile(root, contractPath);
    committedPaths.push(contractPath);
  }
  receipt.evidenceFiles = [];
  for (const [index, fixed] of FIXED_SEEDS.entries()) {
    await copyRepositoryFile(root, fixed.sourcePath);
    await copyRepositoryFile(root, fixed.songsPath);
    const sourcePath = resolve(root, fixed.sourcePath);
    const events = await readJson(sourcePath);
    for (const event of events) {
      event.publicAtlasEvidence = publicEvidenceFor(event, fixed.siteId);
    }
    if (fixed.siteId === "equal-love") addEqualLoveExclusions(events);
    await writeJson(sourcePath, events);

    const approval = approvalFor(fixed.siteId);
    await writeJson(resolve(root, fixed.approvalPath), approval);
    receipt.evidenceFiles.push({
      path: fixed.approvalPath,
      sha256: "0".repeat(64),
    });
    const seed = receipt.seeds[index];
    seed.decision = "GO";
    seed.withdrawalState = "active";
    for (const gateName of GATE_NAMES) {
      seed.gates[gateName] = {
        status: "GO",
        evidenceRefs: gateRefs(fixed, events, gateName),
        gap: null,
      };
    }
    committedPaths.push(fixed.sourcePath, fixed.songsPath, fixed.approvalPath);
  }

  await git(root, ["add", "--", ...committedPaths]);
  await git(root, ["commit", "-q", "-m", "fixture evidence commit"]);
  const receiptPath = resolve(root, FIXED_RECEIPT_PATH);
  const fixture = {
    root,
    receipt,
    receiptPath,
    artifactPath: resolve(root, FIXED_ARTIFACT_PATH),
    auditDate: "2026-08-15",
  };
  await updateReceiptHashes(fixture);
  return fixture;
}

function options(fixture, overrides = {}) {
  return {
    repositoryRoot: fixture.root,
    receiptPath: fixture.receiptPath,
    artifactPath: fixture.artifactPath,
    auditDate: fixture.auditDate,
    ...overrides,
  };
}

test("production audit binds the real baseline commit and remains a named three-seed HOLD", async () => {
  const audit = await auditWorkspace({ auditDate: "2026-08-25" });
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.totals, {
    events: 4,
    performances: 6,
    setlistEntries: 172,
  });
  assert.equal(
    audit.errors.some((error) => error.startsWith("GIT_")),
    false,
  );
  assert.equal(
    audit.errors.some((error) => error.startsWith("EVIDENCE_")),
    false,
  );
  assert.equal(
    audit.errors.some((error) => error.startsWith("COVERAGE_HOLD:equal-love")),
    true,
  );
  assert.deepEqual(
    audit.seedResults.map(({ seed }) => ({
      siteId: seed.siteId,
      decision: seed.decision,
      claimGate: seed.gates.claimLevelEvidence.status,
    })),
    [
      { siteId: "equal-love", decision: "HOLD", claimGate: "HOLD" },
      { siteId: "nearly-equal-joy", decision: "HOLD", claimGate: "GO" },
      { siteId: "not-equal-me", decision: "HOLD", claimGate: "GO" },
    ],
  );
  assert.equal(
    audit.seedResults[0].source.events.find(
      (event) => event.id === "tokyo_dome_2027",
    ).performances,
    undefined,
  );
});

test("receipt paths are fixed ordered allowlists and traversal is platform-independent", async (t) => {
  const root = await temporaryRoot(t, "atlas-e1-path-");
  assert.throws(() => safeRepositoryPath(root, "../outside.json"), /traversal/);
  assert.throws(
    () => safeRepositoryPath(root, "..\\outside.json"),
    /traversal/,
  );

  for (const mutate of [
    (receipt) => {
      receipt.seeds[0].sourcePath =
        "src/projects/not-equal-me/live-experiences.json";
    },
    (receipt) => {
      [receipt.contractFiles[0], receipt.contractFiles[1]] = [
        receipt.contractFiles[1],
        receipt.contractFiles[0],
      ];
    },
    (receipt) => {
      receipt.evidenceFiles[0].path = "scripts/atlas/evidence/other.json";
    },
  ]) {
    const fixture = await createGoFixture(t);
    mutate(fixture.receipt);
    await writeJson(fixture.receiptPath, fixture.receipt);
    await assert.rejects(auditWorkspace(options(fixture)), /fixed|allowlist/);
  }
});

test("a true fixture Git commit and real approval records generate C0-valid deterministic coverage", async (t) => {
  const fixture = await createGoFixture(t);
  const firstResult = await generateProjection(options(fixture));
  assert.equal(firstResult.ok, true, firstResult.errors?.join("\n"));
  const first = await readFile(fixture.artifactPath);
  const projection = JSON.parse(first);
  assert.deepEqual(projection.groupCounts, {
    "equal-love": { events: 2, performances: 2, setlistEntries: 60 },
    "nearly-equal-joy": { events: 1, performances: 2, setlistEntries: 57 },
    "not-equal-me": { events: 1, performances: 2, setlistEntries: 55 },
  });
  for (const performance of projection.groups[0].events[0].performances) {
    assert.deepEqual(performance.coverage, { included: 30, total: 31 });
    assert.equal(performance.excluded.length, 1);
    assert.equal(performance.excluded[0].sourceId, "source-order:1");
  }
  assert.deepEqual(projection.groups[0].events[1].performances, []);
  assert.equal(artifactHash(projection), projection.artifactHash);
  const payload = structuredClone(projection);
  delete payload.artifactHash;
  assert.equal(
    projection.artifactHash,
    `sha256:${sha256(canonicalUtf8(payload))}`,
  );
  assert.equal((await generateProjection(options(fixture))).ok, true);
  assert.deepEqual(await readFile(fixture.artifactPath), first);
  assert.equal((await checkProjection(options(fixture))).ok, true);
});

test("wrong or missing Git commit and wrong blob/hash all fail closed", async (t) => {
  const wrongCommit = await createGoFixture(t);
  wrongCommit.receipt.sourceCommit = "0".repeat(40);
  await writeJson(wrongCommit.receiptPath, wrongCommit.receipt);
  const missingCommitAudit = await auditWorkspace(options(wrongCommit));
  assert.equal(missingCommitAudit.ok, false);
  assert.equal(
    missingCommitAudit.errors.some((error) => error.startsWith("GIT_COMMIT:")),
    true,
  );

  const wrongBlob = await createGoFixture(t);
  const sourcePath = resolve(wrongBlob.root, FIXED_SEEDS[0].sourcePath);
  await writeFile(
    sourcePath,
    Buffer.concat([await readFile(sourcePath), Buffer.from(" \n")]),
  );
  wrongBlob.receipt.seeds[0].sourceSha256 = sha256(await readFile(sourcePath));
  await writeJson(wrongBlob.receiptPath, wrongBlob.receipt);
  const blobAudit = await auditWorkspace(options(wrongBlob));
  assert.equal(
    blobAudit.errors.some((error) => error.startsWith("GIT_BLOB_DRIFT:")),
    true,
  );

  const wrongHash = await createGoFixture(t);
  wrongHash.receipt.seeds[0].sourceSha256 = "f".repeat(64);
  await writeJson(wrongHash.receiptPath, wrongHash.receipt);
  const hashAudit = await auditWorkspace(options(wrongHash));
  assert.equal(
    hashAudit.errors.some((error) => error.startsWith("SOURCE_DRIFT:")),
    true,
  );
  assert.equal(
    hashAudit.errors.some((error) => error.startsWith("GIT_BLOB_HASH:")),
    true,
  );

  const schemaDrift = await createGoFixture(t);
  const contractPath = resolve(schemaDrift.root, FIXED_CONTRACT_PATHS[0]);
  await writeFile(
    contractPath,
    Buffer.concat([await readFile(contractPath), Buffer.from("\n")]),
  );
  const schemaAudit = await auditWorkspace(options(schemaDrift));
  assert.equal(
    schemaAudit.errors.some((error) => error.startsWith("SCHEMA_DRIFT:")),
    true,
  );
  assert.equal(
    schemaAudit.errors.some((error) => error.startsWith("GIT_BLOB_DRIFT:")),
    true,
  );
});

test("evidence refs resolve real JSON pointers with gate semantics and independent approval", async (t) => {
  const missing = await createGoFixture(t);
  await unlink(resolve(missing.root, FIXED_SEEDS[0].approvalPath));
  const missingAudit = await auditWorkspace(options(missing));
  assert.equal(
    missingAudit.errors.some((error) => error.startsWith("EVIDENCE_MISSING:")),
    true,
  );

  const circular = await createGoFixture(t);
  circular.receipt.seeds[0].gates.sourceUseBoundary.evidenceRefs = [
    `${FIXED_RECEIPT_PATH}#`,
  ];
  await writeJson(circular.receiptPath, circular.receipt);
  const circularAudit = await auditWorkspace(options(circular));
  assert.equal(
    circularAudit.errors.some(
      (error) =>
        error.startsWith("EVIDENCE_REF:equal-love:sourceUseBoundary:") ||
        error.startsWith("EVIDENCE_SET:equal-love:sourceUseBoundary:"),
    ),
    true,
  );

  const wrongGate = await createGoFixture(t);
  wrongGate.receipt.seeds[0].gates.temporalVerification.evidenceRefs = [
    `${FIXED_SEEDS[0].approvalPath}#/approvedAt`,
  ];
  await writeJson(wrongGate.receiptPath, wrongGate.receipt);
  const wrongGateAudit = await auditWorkspace(options(wrongGate));
  assert.equal(
    wrongGateAudit.errors.some((error) =>
      error.startsWith("EVIDENCE_REF:equal-love:temporalVerification:"),
    ),
    true,
  );
});

test("approval site, withdrawal, and owner are committed evidence rather than receipt assertions", async (t) => {
  const wrongSite = await createGoFixture(t);
  const wrongSitePath = resolve(wrongSite.root, FIXED_SEEDS[0].approvalPath);
  const wrongSiteApproval = await readJson(wrongSitePath);
  wrongSiteApproval.siteId = "not-equal-me";
  await writeJson(wrongSitePath, wrongSiteApproval);
  await commitFixture(wrongSite, [FIXED_SEEDS[0].approvalPath]);
  const wrongSiteAudit = await auditWorkspace(options(wrongSite));
  assert.equal(
    wrongSiteAudit.errors.some((error) => error.startsWith("APPROVAL_SCHEMA:")),
    true,
  );

  const withdrawn = await createGoFixture(t);
  const withdrawnPath = resolve(withdrawn.root, FIXED_SEEDS[1].approvalPath);
  const withdrawnApproval = await readJson(withdrawnPath);
  withdrawnApproval.withdrawalState = "withdrawn";
  await writeJson(withdrawnPath, withdrawnApproval);
  withdrawn.receipt.seeds[1].withdrawalState = "withdrawn";
  withdrawn.receipt.seeds[1].decision = "HOLD";
  await commitFixture(withdrawn, [FIXED_SEEDS[1].approvalPath]);
  const withdrawnAudit = await auditWorkspace(options(withdrawn));
  assert.equal(
    withdrawnAudit.errors.some((error) =>
      error.startsWith("SEED_WITHDRAWAL:nearly-equal-joy:withdrawn"),
    ),
    true,
  );

  const ownerMissing = await createGoFixture(t);
  const ownerPath = resolve(ownerMissing.root, FIXED_SEEDS[2].approvalPath);
  const ownerApproval = await readJson(ownerPath);
  delete ownerApproval.maintenanceOwner;
  await writeJson(ownerPath, ownerApproval);
  await commitFixture(ownerMissing, [FIXED_SEEDS[2].approvalPath]);
  const ownerAudit = await auditWorkspace(options(ownerMissing));
  assert.equal(
    ownerAudit.errors.some((error) => error.startsWith("APPROVAL_SCHEMA:")),
    true,
  );
});

test("freshness is GO before/on expiry and HOLD after expiry or for future evidence", async (t) => {
  const fixture = await createGoFixture(t);
  assert.equal(
    (await auditWorkspace(options(fixture, { auditDate: "2026-08-30" }))).ok,
    true,
  );
  assert.equal(
    (await auditWorkspace(options(fixture, { auditDate: "2026-08-31" }))).ok,
    true,
  );
  assert.equal(
    (
      await auditWorkspace(options(fixture, { auditDate: "2026-09-01" }))
    ).errors.some((error) => error.includes("stale after 2026-08-31")),
    true,
  );
  assert.equal(
    (
      await auditWorkspace(options(fixture, { auditDate: "2026-07-30" }))
    ).errors.some((error) => error.includes("cannot be after auditDate")),
    true,
  );

  const reversed = await createGoFixture(t);
  const reversedPath = resolve(reversed.root, FIXED_SEEDS[0].sourcePath);
  const reversedEvents = await readJson(reversedPath);
  reversedEvents[0].publicAtlasEvidence.asOf = "2026-08-02";
  await writeJson(reversedPath, reversedEvents);
  await commitFixture(reversed, [FIXED_SEEDS[0].sourcePath]);
  const reversedAudit = await auditWorkspace(options(reversed));
  assert.equal(
    reversedAudit.errors.some((error) =>
      error.includes("must be <= lastVerifiedAt"),
    ),
    true,
  );

  assert.equal((await generateProjection(options(fixture))).ok, true);
  const freshArtifact = await readFile(fixture.artifactPath);
  const staleCheck = await checkProjection(
    options(fixture, { auditDate: "2026-09-01" }),
  );
  assert.equal(staleCheck.ok, false);
  assert.equal(
    staleCheck.errors.some((error) => error.includes("stale after 2026-08-31")),
    true,
  );
  assert.deepEqual(await readFile(fixture.artifactPath), freshArtifact);
  const staleGenerate = await generateProjection(
    options(fixture, { auditDate: "2026-09-01" }),
  );
  assert.equal(staleGenerate.ok, false);
  assert.equal(staleGenerate.invalidated, true);
  await assert.rejects(readFile(fixture.artifactPath), { code: "ENOENT" });
});

test("coverage and parent date closure reject gaps, conflicting exclusions, and in-range non-member dates", async (t) => {
  const gap = await createGoFixture(t);
  const gapPath = resolve(gap.root, FIXED_SEEDS[0].sourcePath);
  const gapEvents = await readJson(gapPath);
  delete gapEvents[0].performances[0].provenance;
  await writeJson(gapPath, gapEvents);
  await commitFixture(gap, [FIXED_SEEDS[0].sourcePath]);
  const gapAudit = await auditWorkspace(options(gap));
  assert.equal(
    gapAudit.errors.some((error) =>
      error.startsWith("COVERAGE_HOLD:equal-love"),
    ),
    true,
  );

  const conflict = await createGoFixture(t);
  const conflictPath = resolve(conflict.root, FIXED_SEEDS[0].sourcePath);
  const conflictEvents = await readJson(conflictPath);
  conflictEvents[0].performances[0].provenance.excludedEntries[0].beforeSourceOrder = 2;
  await writeJson(conflictPath, conflictEvents);
  await commitFixture(conflict, [FIXED_SEEDS[0].sourcePath]);
  const conflictAudit = await auditWorkspace(options(conflict));
  assert.equal(
    conflictAudit.errors.some((error) =>
      error.includes("exactly one of sourceOrder or beforeSourceOrder"),
    ),
    true,
  );

  const duplicate = await createGoFixture(t);
  const duplicatePath = resolve(duplicate.root, FIXED_SEEDS[0].sourcePath);
  const duplicateEvents = await readJson(duplicatePath);
  duplicateEvents[0].performances[0].provenance.excludedEntries.push({
    ...duplicateEvents[0].performances[0].provenance.excludedEntries[0],
  });
  await writeJson(duplicatePath, duplicateEvents);
  await commitFixture(duplicate, [FIXED_SEEDS[0].sourcePath]);
  const duplicateAudit = await auditWorkspace(options(duplicate));
  assert.equal(
    duplicateAudit.errors.some((error) =>
      error.includes("conflicts with an included or excluded order"),
    ),
    true,
  );

  const date = await createGoFixture(t);
  const datePath = resolve(date.root, FIXED_SEEDS[0].sourcePath);
  const dateEvents = await readJson(datePath);
  dateEvents[0].eventEvidence.dates = ["2026-06-20", "2026-06-22"];
  dateEvents[0].performances[1].date = "2026-06-21";
  await writeJson(datePath, dateEvents);
  await commitFixture(date, [FIXED_SEEDS[0].sourcePath]);
  const dateAudit = await auditWorkspace(options(date));
  assert.equal(
    dateAudit.errors.some((error) =>
      error.includes("exact member of parent eventEvidence.dates"),
    ),
    true,
  );
});

test("realpath containment rejects a source symlink escape when the platform permits it", async (t) => {
  const fixture = await createGoFixture(t);
  const outside = await temporaryRoot(t, "atlas-e1-outside-");
  const outsideFile = resolve(outside, "outside.json");
  await writeFile(outsideFile, "[]\n", "utf8");
  const sourcePath = resolve(fixture.root, FIXED_SEEDS[0].sourcePath);
  await unlink(sourcePath);
  try {
    await symlink(outsideFile, sourcePath, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) {
      t.skip(`symlink creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const audit = await auditWorkspace(options(fixture));
  assert.equal(
    audit.errors.some((error) =>
      error.includes("realpath escapes the repository"),
    ),
    true,
  );
});

test("the actual C0 parser rejects whitespace-only text and credential-bearing public URLs", async (t) => {
  const whitespace = await createGoFixture(t);
  const whitespacePath = resolve(whitespace.root, FIXED_SEEDS[0].sourcePath);
  const whitespaceEvents = await readJson(whitespacePath);
  whitespaceEvents[0].eventName = "   ";
  await writeJson(whitespacePath, whitespaceEvents);
  await commitFixture(whitespace, [FIXED_SEEDS[0].sourcePath]);
  const whitespaceGenerate = await generateProjection(options(whitespace));
  assert.equal(whitespaceGenerate.ok, false);
  assert.equal(
    whitespaceGenerate.errors.some((error) =>
      error.includes("C0 parser rejected"),
    ),
    true,
  );

  const credentials = await createGoFixture(t);
  const credentialPath = resolve(credentials.root, FIXED_SEEDS[1].sourcePath);
  const credentialEvents = await readJson(credentialPath);
  credentialEvents[0].performances[0].sourceUrls[0] =
    "https://user:password@example.com/source";
  await writeJson(credentialPath, credentialEvents);
  await commitFixture(credentials, [FIXED_SEEDS[1].sourcePath]);
  const credentialGenerate = await generateProjection(options(credentials));
  assert.equal(credentialGenerate.ok, false);
  assert.equal(
    credentialGenerate.errors.some((error) =>
      error.includes("C0 parser rejected"),
    ),
    true,
  );
});

test("artifactPath accepts only the exact generated path and never mutates arbitrary files", async (t) => {
  const fixture = await createGoFixture(t);
  const outsideRoot = await temporaryRoot(t, "atlas-e1-artifact-outside-");
  const outsidePath = resolve(outsideRoot, "sentinel.json");
  const internalPath = resolve(
    fixture.root,
    "apps/atlas/src/generated/other.json",
  );
  await writeFile(outsidePath, "outside sentinel", "utf8");
  await mkdir(dirname(internalPath), { recursive: true });
  await writeFile(internalPath, "internal sentinel", "utf8");
  for (const artifactPath of [outsidePath, internalPath]) {
    const generate = await generateProjection(
      options(fixture, { artifactPath }),
    );
    assert.equal(generate.ok, false);
    assert.equal(generate.errors[0].startsWith("ARTIFACT_PATH:"), true);
    const check = await checkProjection(options(fixture, { artifactPath }));
    assert.equal(check.ok, false);
    assert.equal(check.errors[0].startsWith("ARTIFACT_PATH:"), true);
  }
  assert.equal(await readFile(outsidePath, "utf8"), "outside sentinel");
  assert.equal(await readFile(internalPath, "utf8"), "internal sentinel");
});

test("check detects a hand edit and one receipt HOLD invalidates the exact artifact", async (t) => {
  const fixture = await createGoFixture(t);
  assert.equal((await generateProjection(options(fixture))).ok, true);
  const projection = await readJson(fixture.artifactPath);
  projection.groups[0].events[0].displayName = "hand edited";
  await writeJson(fixture.artifactPath, projection);
  const editedCheck = await checkProjection(options(fixture));
  assert.equal(editedCheck.ok, false);
  assert.equal(
    editedCheck.errors.some((error) => error.startsWith("ARTIFACT_")),
    true,
  );

  assert.equal((await generateProjection(options(fixture))).ok, true);
  fixture.receipt.seeds[1].gates.sourceUseBoundary = {
    status: "HOLD",
    evidenceRefs: [],
    gap: "Fixture approval is under review.",
  };
  fixture.receipt.seeds[1].decision = "HOLD";
  await writeJson(fixture.receiptPath, fixture.receipt);
  const holdGenerate = await generateProjection(options(fixture));
  assert.equal(holdGenerate.ok, false);
  assert.equal(holdGenerate.invalidated, true);
  await assert.rejects(readFile(fixture.artifactPath), { code: "ENOENT" });
});
