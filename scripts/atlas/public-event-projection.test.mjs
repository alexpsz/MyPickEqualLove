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
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import {
  DEFAULT_RECEIPT_PATH,
  DEFAULT_REPOSITORY_ROOT,
  FIXED_ARTIFACT_PATH,
  FIXED_AUTHORITY_CONTRACT_PATH,
  FIXED_BASELINE_CONTRACT_PATH,
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
const FIXTURE_AUTHORITY_ID = "authority:atlas-fixture";
const FIXTURE_APPROVER_ID = "principal:atlas-fixture-approver";

function fixtureOwnerId(siteId) {
  return `principal:fixture-${siteId}-owner`;
}

async function temporaryRoot(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function createLinkOrSkip(t, target, path, types) {
  let lastError;
  for (const type of types) {
    try {
      await symlink(target, path, type);
      return true;
    } catch (error) {
      if (!["EPERM", "EACCES", "UNKNOWN", "EINVAL"].includes(error?.code)) {
        throw error;
      }
      lastError = error;
    }
  }
  t.skip(`filesystem link creation unavailable: ${lastError?.code}`);
  return false;
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

function approvalFor(fixed, sourceSha256, songsSha256) {
  return {
    schemaVersion: 1,
    siteId: fixed.siteId,
    scope: "atlas-public-seed-v1",
    sourcePath: fixed.sourcePath,
    sourceSha256,
    songsPath: fixed.songsPath,
    songsSha256,
    atlasPublicSeedApproval: "approved",
    approvalAuthorityId: FIXTURE_AUTHORITY_ID,
    approverId: FIXTURE_APPROVER_ID,
    approvedAt: "2026-07-31T00:00:00.000Z",
    maintenanceOwnerId: fixtureOwnerId(fixed.siteId),
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
    maintenanceOwnerId: fixtureOwnerId(siteId),
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

async function deriveBaselineSource(root, fixed) {
  const bytes = await readFile(resolve(root, fixed.sourcePath));
  const events = JSON.parse(bytes);
  const eventLocalIds = events.map((event) => event.id);
  const performanceIds = [];
  const setlistOrderRanges = [];
  let setlistEntryCount = 0;
  for (const event of events) {
    for (const performance of event.performances ?? []) {
      performanceIds.push(`${event.id}/${performance.id}`);
      const orders = performance.setlist.map((entry) => entry.order);
      setlistOrderRanges.push({
        eventLocalId: event.id,
        performanceLocalId: performance.id,
        setlistEntryCount: performance.setlist.length,
        setlistOrderRange: { first: orders[0], last: orders.at(-1) },
      });
      setlistEntryCount += performance.setlist.length;
    }
  }
  return {
    siteId: fixed.siteId,
    sourcePath: fixed.sourcePath,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    eventCount: events.length,
    eventLocalIds,
    performanceCount: performanceIds.length,
    performanceIds,
    setlistEntryCount,
    setlistOrderRanges,
  };
}

async function createFixtureBaseline(root, sourceCommit) {
  const sources = [];
  for (const fixed of FIXED_SEEDS) {
    sources.push(await deriveBaselineSource(root, fixed));
  }
  return {
    sourceCommit,
    totals: sources.reduce(
      (totals, source) => ({
        events: totals.events + source.eventCount,
        performances: totals.performances + source.performanceCount,
        setlistEntries: totals.setlistEntries + source.setlistEntryCount,
      }),
      { events: 0, performances: 0, setlistEntries: 0 },
    ),
    sources,
  };
}

async function writeFixtureBaseline(root, baseline) {
  await writeFile(
    resolve(root, "apps/atlas/src/contracts/baseline-receipt.ts"),
    `export const ATLAS_C0_BASELINE_RECEIPT = ${JSON.stringify(
      baseline,
      null,
      2,
    )} as const;\n`,
    "utf8",
  );
}

async function writeFixtureAuthority(
  root,
  authorities = [
    {
      authorityId: FIXTURE_AUTHORITY_ID,
      approverIds: [FIXTURE_APPROVER_ID],
    },
  ],
) {
  const contract = {
    schemaVersion: 1,
    scope: "atlas-public-seed-approval-authority-v1",
    authorities,
  };
  const source = `
const AUTHORITY_ID_PATTERN = /^authority:[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const PRINCIPAL_ID_PATTERN = /^principal:[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
export const ATLAS_PUBLICATION_AUTHORITY_CONTRACT = Object.freeze(${JSON.stringify(contract, null, 2)});
export function isAtlasAuthorityId(value) {
  return typeof value === "string" && AUTHORITY_ID_PATTERN.test(value);
}
export function isAtlasGovernancePrincipalId(value) {
  return typeof value === "string" && PRINCIPAL_ID_PATTERN.test(value);
}
export function parseAtlasPublicationAuthorityContract(value) {
  if (value !== ATLAS_PUBLICATION_AUTHORITY_CONTRACT) {
    return { ok: false, reason: "not the configured fixture contract" };
  }
  return { ok: true, value };
}
export function isConfiguredAtlasPublicationApprover(authorityId, approverId, maintenanceOwnerId) {
  return isAtlasAuthorityId(authorityId) &&
    isAtlasGovernancePrincipalId(approverId) &&
    isAtlasGovernancePrincipalId(maintenanceOwnerId) &&
    approverId !== maintenanceOwnerId &&
    ATLAS_PUBLICATION_AUTHORITY_CONTRACT.authorities.some(
      (authority) => authority.authorityId === authorityId && authority.approverIds.includes(approverId),
    );
}
`;
  const path = resolve(root, FIXED_AUTHORITY_CONTRACT_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source.trimStart(), "utf8");
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
      refs.push(`${base}/publicAtlasEvidence/maintenanceOwnerId`);
    }
  });
  if (gateName === "sourceUseBoundary") return [`${fixed.approvalPath}#`];
  if (gateName === "claimLevelEvidence")
    return [...refs, `${fixed.songsPath}#`];
  if (gateName === "refreshInvalidationWithdrawal") {
    return [...refs, `${fixed.approvalPath}#/withdrawalState`];
  }
  if (gateName === "maintenanceOwner") {
    return [...refs, `${fixed.approvalPath}#/maintenanceOwnerId`];
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

async function syncApprovalBindings(fixture) {
  for (const fixed of FIXED_SEEDS) {
    const approvalPath = resolve(fixture.root, fixed.approvalPath);
    const approval = await readJson(approvalPath);
    approval.sourcePath = fixed.sourcePath;
    approval.sourceSha256 = sha256(
      await readFile(resolve(fixture.root, fixed.sourcePath)),
    );
    approval.songsPath = fixed.songsPath;
    approval.songsSha256 = sha256(
      await readFile(resolve(fixture.root, fixed.songsPath)),
    );
    approval.scope = "atlas-public-seed-v1";
    await writeJson(approvalPath, approval);
  }
}

async function commitFixture(
  fixture,
  paths,
  message = "fixture update",
  { syncApprovals = true } = {},
) {
  const stagedPaths = [...paths];
  if (syncApprovals) {
    await syncApprovalBindings(fixture);
    stagedPaths.push(...FIXED_SEEDS.map(({ approvalPath }) => approvalPath));
  }
  await git(fixture.root, ["add", "--", ...new Set(stagedPaths)]);
  await git(fixture.root, ["commit", "-q", "-m", message]);
  await updateReceiptHashes(fixture);
}

async function createGoFixture(
  t,
  { beforeHistoricalCommit, beforeGovernanceCommit } = {},
) {
  const root = await temporaryRoot(t, "atlas-e1-go-");
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.name", "Atlas Fixture"]);
  await git(root, ["config", "user.email", "atlas-fixture@example.invalid"]);
  const receipt = await readJson(DEFAULT_RECEIPT_PATH);
  const sourcePaths = [];
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
    sourcePaths.push(fixed.sourcePath, fixed.songsPath);
  }

  if (beforeHistoricalCommit) await beforeHistoricalCommit(root);

  await git(root, ["add", "--", ...sourcePaths]);
  await git(root, ["commit", "-q", "-m", "fixture historical sources"]);
  const historicalCommit = (
    await git(root, ["rev-parse", "HEAD"])
  ).stdout.trim();
  const baseline = await createFixtureBaseline(root, historicalCommit);

  for (const contractPath of FIXED_CONTRACT_PATHS.slice(0, 4)) {
    await copyRepositoryFile(root, contractPath);
  }
  await mkdir(dirname(resolve(root, FIXED_BASELINE_CONTRACT_PATH)), {
    recursive: true,
  });
  await writeFixtureBaseline(root, baseline);
  await writeFixtureAuthority(root);
  for (const fixed of FIXED_SEEDS) {
    const sourceSha256 = sha256(
      await readFile(resolve(root, fixed.sourcePath)),
    );
    const songsSha256 = sha256(await readFile(resolve(root, fixed.songsPath)));
    await writeJson(
      resolve(root, fixed.approvalPath),
      approvalFor(fixed, sourceSha256, songsSha256),
    );
    receipt.evidenceFiles.push({
      path: fixed.approvalPath,
      sha256: "0".repeat(64),
    });
  }
  if (beforeGovernanceCommit) await beforeGovernanceCommit(root);
  await git(root, [
    "add",
    "--",
    ...FIXED_CONTRACT_PATHS,
    ...FIXED_SEEDS.map(({ approvalPath }) => approvalPath),
  ]);
  await git(root, ["commit", "-q", "-m", "fixture governance evidence"]);

  receipt.historicalBaseline = {
    contractPath: FIXED_BASELINE_CONTRACT_PATH,
    sourceCommit: historicalCommit,
    totals: baseline.totals,
  };
  for (const [index, source] of baseline.sources.entries()) {
    receipt.seeds[index].baselineCounts = {
      events: source.eventCount,
      performances: source.performanceCount,
      setlistEntries: source.setlistEntryCount,
    };
  }
  const receiptPath = resolve(root, FIXED_RECEIPT_PATH);
  const fixture = {
    root,
    receipt,
    receiptPath,
    artifactPath: resolve(root, FIXED_ARTIFACT_PATH),
    auditDate: "2026-08-15",
    baseline,
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

test("production audit binds the approved baseline and returns a three-seed GO", async () => {
  const audit = await auditWorkspace({ auditDate: "2026-08-30" });
  assert.equal(audit.ok, true, audit.errors.join("\n"));
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
  assert.deepEqual(audit.errors, []);
  assert.deepEqual(
    audit.seedResults.map(({ seed }) => ({
      siteId: seed.siteId,
      decision: seed.decision,
      claimGate: seed.gates.claimLevelEvidence.status,
    })),
    [
      { siteId: "equal-love", decision: "GO", claimGate: "GO" },
      { siteId: "nearly-equal-joy", decision: "GO", claimGate: "GO" },
      { siteId: "not-equal-me", decision: "GO", claimGate: "GO" },
    ],
  );
  assert.equal(
    audit.seedResults[0].source.events.find(
      (event) => event.id === "tokyo_dome_2027",
    ).performances,
    undefined,
  );
  assert.deepEqual(
    audit.seedResults.flatMap(({ seed, source }) =>
      source.events.flatMap((event) =>
        (event.performances ?? []).map((performance) => ({
          id: `${seed.siteId}/${event.id}/${performance.id}`,
          startAt: performance.startAt,
        })),
      ),
    ),
    [
      {
        id: "equal-love/kokuritsu_2026/day1",
        startAt: "2026-06-20T08:30:00.000Z",
      },
      {
        id: "equal-love/kokuritsu_2026/day2",
        startAt: "2026-06-21T08:30:00.000Z",
      },
      {
        id: "nearly-equal-joy/joy_4th_anniversary_2026_afterglow/day",
        startAt: "2026-03-13T03:30:00.000Z",
      },
      {
        id: "nearly-equal-joy/joy_4th_anniversary_2026_afterglow/night",
        startAt: "2026-03-13T09:00:00.000Z",
      },
      {
        id: "not-equal-me/not_equal_me_7th_anniversary_2026_afterglow/day",
        startAt: "2026-02-23T03:30:00.000Z",
      },
      {
        id: "not-equal-me/not_equal_me_7th_anniversary_2026_afterglow/night",
        startAt: "2026-02-23T09:30:00.000Z",
      },
    ],
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
    assert.match(performance.startAt, /^2026-06-2[01]T08:30:00\.000Z$/);
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

test("unverified executable contract bytes never run top-level side effects", async (t) => {
  const cases = [
    {
      name: "authority",
      contractPath: FIXED_AUTHORITY_CONTRACT_PATH,
      execute: (fixture) => auditWorkspace(options(fixture)),
    },
    {
      name: "C0 baseline",
      contractPath: FIXED_BASELINE_CONTRACT_PATH,
      execute: (fixture) => auditWorkspace(options(fixture)),
    },
    {
      name: "C0 projection parser",
      contractPath: FIXED_CONTRACT_PATHS[0],
      execute: (fixture) => generateProjection(options(fixture)),
    },
  ];

  for (const testCase of cases) {
    const fixture = await createGoFixture(t);
    const sentinelPath = resolve(
      fixture.root,
      `${testCase.name.replaceAll(" ", "-")}-execution-sentinel.txt`,
    );
    const contractPath = resolve(fixture.root, testCase.contractPath);
    const original = await readFile(contractPath, "utf8");
    const sideEffect =
      `import { writeFileSync as writeAtlasBindingSentinel } from "node:fs";\n` +
      `writeAtlasBindingSentinel(${JSON.stringify(sentinelPath)}, "executed", "utf8");\n`;
    await writeFile(contractPath, `${sideEffect}${original}`, "utf8");

    const result = await testCase.execute(fixture);
    assert.equal(result.ok, false);
    assert.equal(
      result.errors.some((error) =>
        error.startsWith(`SCHEMA_DRIFT:${testCase.contractPath}:`),
      ),
      true,
      `${testCase.name}: ${result.errors.join("\n")}`,
    );
    assert.equal(
      result.errors.some((error) =>
        error.startsWith(
          `GIT_BLOB_DRIFT:${fixture.receipt.sourceCommit}:${testCase.contractPath}`,
        ),
      ),
      true,
      `${testCase.name}: ${result.errors.join("\n")}`,
    );
    assert.equal(
      result.errors.some((error) =>
        error.startsWith("CONTRACT_EXECUTION_BLOCKED:"),
      ),
      true,
      `${testCase.name}: ${result.errors.join("\n")}`,
    );
    await assert.rejects(readFile(sentinelPath), { code: "ENOENT" });
  }
});

test("dynamic contract execution waits for every source/evidence binding and JSON parse prerequisite", async (t) => {
  const cases = [
    {
      name: "source binding drift",
      mutate: async (fixture) => {
        const path = resolve(fixture.root, FIXED_SEEDS[0].sourcePath);
        await writeFile(
          path,
          Buffer.concat([await readFile(path), Buffer.from(" \n")]),
        );
      },
      expectedError: "SOURCE_DRIFT:",
    },
    {
      name: "approval evidence binding drift",
      mutate: async (fixture) => {
        const path = resolve(fixture.root, FIXED_SEEDS[0].approvalPath);
        await writeFile(
          path,
          Buffer.concat([await readFile(path), Buffer.from(" \n")]),
        );
      },
      expectedError: "EVIDENCE_DRIFT:",
    },
    {
      name: "source JSON parse failure",
      mutate: async (fixture) => {
        const repositoryPath = FIXED_SEEDS[0].sourcePath;
        await writeFile(resolve(fixture.root, repositoryPath), "{\n", "utf8");
        await git(fixture.root, ["add", "--", repositoryPath]);
        await git(fixture.root, [
          "commit",
          "-q",
          "-m",
          "fixture malformed fixed JSON",
        ]);
        await updateReceiptHashes(fixture);
      },
      expectedError: `SOURCE_SCHEMA:${FIXED_SEEDS[0].sourcePath}:`,
    },
  ];

  for (const testCase of cases) {
    let sentinelPath;
    const fixture = await createGoFixture(t, {
      beforeGovernanceCommit: async (root) => {
        sentinelPath = resolve(
          root,
          `${testCase.name.replaceAll(" ", "-")}-sentinel.txt`,
        );
        const contractPath = resolve(root, FIXED_AUTHORITY_CONTRACT_PATH);
        const original = await readFile(contractPath, "utf8");
        const sideEffect =
          `import { writeFileSync as writeAtlasAllBindingsSentinel } from "node:fs";\n` +
          `writeAtlasAllBindingsSentinel(${JSON.stringify(sentinelPath)}, "executed", "utf8");\n`;
        await writeFile(contractPath, `${sideEffect}${original}`, "utf8");
      },
    });
    await testCase.mutate(fixture);

    const audit = await auditWorkspace(options(fixture));
    assert.equal(audit.ok, false);
    assert.equal(
      audit.errors.some((error) => error.startsWith(testCase.expectedError)),
      true,
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
    assert.equal(
      audit.errors.some((error) =>
        error.startsWith("CONTRACT_EXECUTION_BLOCKED:"),
      ),
      true,
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
    assert.equal(
      audit.errors.some((error) =>
        error.startsWith(`SCHEMA_DRIFT:${FIXED_AUTHORITY_CONTRACT_PATH}:`),
      ),
      false,
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
    assert.equal(
      audit.errors.some(
        (error) =>
          error.startsWith("GIT_BLOB") &&
          error.includes(`:${FIXED_AUTHORITY_CONTRACT_PATH}`),
      ),
      false,
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
    await assert.rejects(readFile(sentinelPath), { code: "ENOENT" });
  }
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
  delete ownerApproval.maintenanceOwnerId;
  await writeJson(ownerPath, ownerApproval);
  await commitFixture(ownerMissing, [FIXED_SEEDS[2].approvalPath]);
  const ownerAudit = await auditWorkspace(options(ownerMissing));
  assert.equal(
    ownerAudit.errors.some((error) => error.startsWith("APPROVAL_SCHEMA:")),
    true,
  );
});

test("governance-closing text, cadence, TTL, and fail-closed actions are semantically bounded", async (t) => {
  const cases = [
    {
      name: "blank source owner",
      kind: "source",
      mutate: (events) => {
        events[0].publicAtlasEvidence.maintenanceOwnerId = "   ";
      },
      errorPrefix: "SOURCE_SCHEMA:",
    },
    {
      name: "overlong source owner",
      kind: "source",
      mutate: (events) => {
        events[0].publicAtlasEvidence.maintenanceOwnerId = "x".repeat(129);
      },
      errorPrefix: "SOURCE_SCHEMA:",
    },
    {
      name: "blank approval owner",
      kind: "approval",
      mutate: (approval) => {
        approval.maintenanceOwnerId = " \t ";
      },
      errorPrefix: "APPROVAL_SCHEMA:",
    },
    {
      name: "overlong approval owner",
      kind: "approval",
      mutate: (approval) => {
        approval.maintenanceOwnerId = "x".repeat(129);
      },
      errorPrefix: "APPROVAL_SCHEMA:",
    },
    {
      name: "blank approval authority",
      kind: "approval",
      mutate: (approval) => {
        approval.approvalAuthorityId = "   ";
      },
      errorPrefix: "APPROVAL_SCHEMA:",
    },
    {
      name: "overlong approval authority",
      kind: "approval",
      mutate: (approval) => {
        approval.approvalAuthorityId = "x".repeat(129);
      },
      errorPrefix: "APPROVAL_SCHEMA:",
    },
    ...["   ", "x".repeat(129), "never"].map((cadence) => ({
      name: `invalid cadence ${JSON.stringify(cadence)}`,
      kind: "source",
      mutate: (events) => {
        events[0].publicAtlasEvidence.refreshPolicy.refreshCadence = cadence;
      },
      errorPrefix: "SOURCE_SCHEMA:",
    })),
    {
      name: "TTL exceeds one year",
      kind: "source",
      mutate: (events) => {
        events[0].publicAtlasEvidence.refreshPolicy.staleAfterDays = 366;
      },
      errorPrefix: "SOURCE_SCHEMA:",
    },
    ...["onInvalidation", "onWithdrawal"].map((field) => ({
      name: `${field} is not exact HOLD`,
      kind: "source",
      mutate: (events) => {
        events[0].publicAtlasEvidence.refreshPolicy[field] = "hold";
      },
      errorPrefix: "SOURCE_SCHEMA:",
    })),
  ];

  for (const testCase of cases) {
    const fixture = await createGoFixture(t);
    const fixed = FIXED_SEEDS[0];
    const repositoryPath =
      testCase.kind === "source" ? fixed.sourcePath : fixed.approvalPath;
    const path = resolve(fixture.root, repositoryPath);
    const document = await readJson(path);
    testCase.mutate(document);
    await writeJson(path, document);
    await commitFixture(fixture, [repositoryPath], testCase.name);
    const audit = await auditWorkspace(options(fixture));
    assert.equal(
      audit.errors.some((error) => error.startsWith(testCase.errorPrefix)),
      true,
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
  }
});

test("claim GO requires verified nonempty HTTPS evidence on every Event and Performance", async (t) => {
  const cases = [
    {
      name: "empty Event URLs",
      mutate: (events) => {
        events[0].eventEvidence.sourceUrls = [];
      },
    },
    {
      name: "unverified Event",
      mutate: (events) => {
        events[0].eventEvidence.verificationStatus = "unverified";
      },
    },
    {
      name: "empty Performance URLs",
      mutate: (events) => {
        events[0].performances[0].sourceUrls = [];
      },
    },
    {
      name: "unverified Performance",
      mutate: (events) => {
        events[0].performances[0].verificationStatus = "unverified";
      },
    },
  ];
  for (const testCase of cases) {
    const fixture = await createGoFixture(t);
    const fixed = FIXED_SEEDS[1];
    const path = resolve(fixture.root, fixed.sourcePath);
    const events = await readJson(path);
    testCase.mutate(events);
    await writeJson(path, events);
    await commitFixture(fixture, [fixed.sourcePath], testCase.name);
    const audit = await auditWorkspace(options(fixture));
    assert.equal(
      audit.errors.some((error) =>
        error.startsWith(`CLAIM_EVIDENCE:${fixed.siteId}:`),
      ),
      true,
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
  }
});

test("approval scope and exact source/song identity cannot be replayed or mismatched", async (t) => {
  const fixed = FIXED_SEEDS[0];
  const cases = [
    [
      "source path",
      (approval) => (approval.sourcePath = FIXED_SEEDS[1].sourcePath),
    ],
    ["source hash", (approval) => (approval.sourceSha256 = "f".repeat(64))],
    [
      "songs path",
      (approval) => (approval.songsPath = FIXED_SEEDS[1].songsPath),
    ],
    ["songs hash", (approval) => (approval.songsSha256 = "e".repeat(64))],
    ["scope", (approval) => (approval.scope = "atlas-public-seed-v2")],
    [
      "unknown authority",
      (approval) => (approval.approvalAuthorityId = "authority:unknown"),
    ],
    [
      "unknown approver",
      (approval) => (approval.approverId = "principal:unknown-approver"),
    ],
    [
      "same approver and owner principal",
      (approval) => (approval.approverId = approval.maintenanceOwnerId),
    ],
    [
      "legacy authority alias",
      (approval) => (approval.approvalAuthorityId = "fixture-atlas-governance"),
    ],
    [
      "malformed approver alias",
      (approval) => (approval.approverId = "Fixture Approver"),
    ],
  ];
  for (const [name, mutate] of cases) {
    const fixture = await createGoFixture(t);
    const path = resolve(fixture.root, fixed.approvalPath);
    const approval = await readJson(path);
    mutate(approval);
    await writeJson(path, approval);
    await commitFixture(fixture, [fixed.approvalPath], name, {
      syncApprovals: false,
    });
    const audit = await auditWorkspace(options(fixture));
    assert.equal(
      audit.errors.some((error) => error.startsWith("APPROVAL_SCHEMA:")),
      true,
      `${name}: ${audit.errors.join("\n")}`,
    );
  }

  const emptyRoster = await createGoFixture(t);
  await copyRepositoryFile(emptyRoster.root, FIXED_AUTHORITY_CONTRACT_PATH);
  await commitFixture(
    emptyRoster,
    [FIXED_AUTHORITY_CONTRACT_PATH],
    "fixed empty authority roster",
  );
  const emptyRosterAudit = await auditWorkspace(options(emptyRoster));
  assert.equal(
    emptyRosterAudit.errors.some(
      (error) =>
        error.startsWith("APPROVAL_SCHEMA:") &&
        error.includes("fixed publication authority roster"),
    ),
    true,
    emptyRosterAudit.errors.join("\n"),
  );

  const replay = await createGoFixture(t);
  const sourcePath = resolve(replay.root, fixed.sourcePath);
  const events = await readJson(sourcePath);
  events[0].sourceNote = `${events[0].sourceNote} Fixture revision.`;
  await writeJson(sourcePath, events);
  await commitFixture(
    replay,
    [fixed.sourcePath],
    "source without new approval",
    {
      syncApprovals: false,
    },
  );
  const replayAudit = await auditWorkspace(options(replay));
  assert.equal(
    replayAudit.errors.some((error) => error.startsWith("APPROVAL_SCHEMA:")),
    true,
    replayAudit.errors.join("\n"),
  );
});

test("the frozen C0 historical receipt is re-derived from immutable Git blobs", async (t) => {
  const totals = await createGoFixture(t);
  totals.receipt.historicalBaseline.totals.events += 1;
  await writeJson(totals.receiptPath, totals.receipt);
  assert.equal(
    (await auditWorkspace(options(totals))).errors.some((error) =>
      error.startsWith("HISTORICAL_RECEIPT:totals"),
    ),
    true,
  );

  const counts = await createGoFixture(t);
  counts.receipt.seeds[0].baselineCounts.setlistEntries += 1;
  await writeJson(counts.receiptPath, counts.receipt);
  assert.equal(
    (await auditWorkspace(options(counts))).errors.some((error) =>
      error.startsWith("HISTORICAL_RECEIPT:equal-love:baselineCounts"),
    ),
    true,
  );

  const identity = await createGoFixture(t);
  const identityBaseline = structuredClone(identity.baseline);
  identityBaseline.sources[0].eventLocalIds[0] = "substituted_event";
  identityBaseline.sources[0].performanceIds =
    identityBaseline.sources[0].performanceIds.map((performanceId) =>
      performanceId.replace("kokuritsu_2026/", "substituted_event/"),
    );
  for (const receipt of identityBaseline.sources[0].setlistOrderRanges) {
    if (receipt.eventLocalId === "kokuritsu_2026") {
      receipt.eventLocalId = "substituted_event";
    }
  }
  await writeFixtureBaseline(identity.root, identityBaseline);
  await commitFixture(
    identity,
    [FIXED_BASELINE_CONTRACT_PATH],
    "baseline identity tamper",
  );
  assert.equal(
    (await auditWorkspace(options(identity))).errors.some((error) =>
      error.startsWith("HISTORICAL_SOURCE:equal-love:"),
    ),
    true,
  );

  const order = await createGoFixture(t);
  const orderBaseline = structuredClone(order.baseline);
  const range =
    orderBaseline.sources[1].setlistOrderRanges[0].setlistOrderRange;
  range.first += 1;
  range.last += 1;
  await writeFixtureBaseline(order.root, orderBaseline);
  await commitFixture(
    order,
    [FIXED_BASELINE_CONTRACT_PATH],
    "baseline order tamper",
  );
  assert.equal(
    (await auditWorkspace(options(order))).errors.some((error) =>
      error.startsWith("HISTORICAL_SOURCE:nearly-equal-joy:"),
    ),
    true,
  );
});

test("count-preserving protected fact drift is compared field-by-field against historical Git blobs", async (t) => {
  const fixed = FIXED_SEEDS[1];
  const cases = [
    {
      name: "Event ID",
      repositoryPath: fixed.sourcePath,
      mutate: (events) => {
        events[0].id = "changed_event";
      },
    },
    {
      name: "Performance ID",
      repositoryPath: fixed.sourcePath,
      mutate: (events) => {
        events[0].performances[0].id = "changed_performance";
      },
    },
    {
      name: "setlist order",
      repositoryPath: fixed.sourcePath,
      mutate: (events) => {
        for (const entry of events[0].performances[0].setlist) entry.order += 1;
        for (const excluded of events[0].performances[0].provenance
          .excludedEntries) {
          if (Object.hasOwn(excluded, "beforeSourceOrder")) {
            excluded.beforeSourceOrder += 1;
          }
        }
      },
    },
    {
      name: "song ID",
      repositoryPath: fixed.sourcePath,
      mutate: (events) => {
        events[0].performances[0].setlist[0].songId =
          events[0].performances[0].setlist[1].songId;
      },
    },
    {
      name: "date",
      repositoryPath: fixed.sourcePath,
      mutate: (events) => {
        events[0].eventEvidence.dates = ["2026-03-31"];
        for (const [index, performance] of events[0].performances.entries()) {
          performance.date = "2026-03-31";
          performance.startAt =
            index === 0
              ? "2026-03-31T03:30:00.000Z"
              : "2026-03-31T09:00:00.000Z";
        }
      },
    },
    {
      name: "venue",
      repositoryPath: fixed.sourcePath,
      mutate: (events) => {
        events[0].venue = "Changed fixture venue";
      },
    },
    {
      name: "referenced song canonicalPath",
      repositoryPath: fixed.songsPath,
      mutate: (songs) => {
        const referencedId = "nearly-equal-joy";
        const song = songs.find(({ id }) => id === referencedId);
        assert.ok(song, `fixture song ${referencedId} must exist`);
        song.canonicalPath = "/songs/changed-fixture-path/";
      },
    },
  ];

  for (const testCase of cases) {
    const fixture = await createGoFixture(t);
    const path = resolve(fixture.root, testCase.repositoryPath);
    const document = await readJson(path);
    testCase.mutate(document);
    await writeJson(path, document);
    await commitFixture(
      fixture,
      [testCase.repositoryPath],
      `protected fact drift: ${testCase.name}`,
    );
    const audit = await auditWorkspace(options(fixture));
    assert.equal(
      audit.errors.some((error) =>
        error.startsWith(`HISTORICAL_FACT_DRIFT:${fixed.siteId}:`),
      ),
      true,
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
    assert.deepEqual(
      audit.totals,
      {
        events: 4,
        performances: 6,
        setlistEntries: 172,
      },
      `${testCase.name}: ${audit.errors.join("\n")}`,
    );
    const generated = await generateProjection(options(fixture));
    assert.equal(generated.ok, false, testCase.name);
    await assert.rejects(readFile(fixture.artifactPath), { code: "ENOENT" });
  }
});

test("current and historical receipt commits must belong to the audited HEAD ancestry", async (t) => {
  const current = await createGoFixture(t);
  const currentTree = (
    await git(current.root, ["rev-parse", "HEAD^{tree}"])
  ).stdout.trim();
  const currentOrphan = (
    await git(current.root, [
      "commit-tree",
      currentTree,
      "-m",
      "current orphan",
    ])
  ).stdout.trim();
  current.receipt.sourceCommit = currentOrphan;
  await writeJson(current.receiptPath, current.receipt);
  assert.equal(
    (await auditWorkspace(options(current))).errors.some((error) =>
      error.startsWith("GIT_ANCESTRY:sourceCommit"),
    ),
    true,
  );

  const historical = await createGoFixture(t);
  const historicalTree = (
    await git(historical.root, [
      "rev-parse",
      `${historical.baseline.sourceCommit}^{tree}`,
    ])
  ).stdout.trim();
  const historicalOrphan = (
    await git(historical.root, [
      "commit-tree",
      historicalTree,
      "-m",
      "historical orphan",
    ])
  ).stdout.trim();
  const orphanBaseline = structuredClone(historical.baseline);
  orphanBaseline.sourceCommit = historicalOrphan;
  historical.receipt.historicalBaseline.sourceCommit = historicalOrphan;
  await writeFixtureBaseline(historical.root, orphanBaseline);
  await commitFixture(
    historical,
    [FIXED_BASELINE_CONTRACT_PATH],
    "bind orphan historical commit",
  );
  const historicalAudit = await auditWorkspace(options(historical));
  assert.equal(
    historicalAudit.errors.some((error) =>
      error.startsWith(`GIT_ANCESTRY:historical ${historicalOrphan}`),
    ),
    true,
    historicalAudit.errors.join("\n"),
  );
});

test("a fully bound orphan sourceCommit cannot execute committed contract side effects", async (t) => {
  let sentinelPath;
  const fixture = await createGoFixture(t, {
    beforeGovernanceCommit: async (root) => {
      sentinelPath = resolve(root, "orphan-contract-execution-sentinel.txt");
      const contractPath = resolve(root, FIXED_AUTHORITY_CONTRACT_PATH);
      const original = await readFile(contractPath, "utf8");
      const sideEffect =
        `import { writeFileSync as writeAtlasOrphanSentinel } from "node:fs";\n` +
        `writeAtlasOrphanSentinel(${JSON.stringify(sentinelPath)}, "executed", "utf8");\n`;
      await writeFile(contractPath, `${sideEffect}${original}`, "utf8");
    },
  });
  const currentTree = (
    await git(fixture.root, ["rev-parse", "HEAD^{tree}"])
  ).stdout.trim();
  const orphanCommit = (
    await git(fixture.root, [
      "commit-tree",
      currentTree,
      "-m",
      "fully bound orphan governance",
    ])
  ).stdout.trim();
  fixture.receipt.sourceCommit = orphanCommit;
  await writeJson(fixture.receiptPath, fixture.receipt);

  const audit = await auditWorkspace(options(fixture));
  assert.equal(audit.ok, false);
  assert.equal(
    audit.errors.some((error) => error.startsWith("GIT_ANCESTRY:sourceCommit")),
    true,
    audit.errors.join("\n"),
  );
  assert.equal(
    audit.errors.some((error) =>
      error.startsWith("CONTRACT_EXECUTION_BLOCKED:"),
    ),
    true,
    audit.errors.join("\n"),
  );
  assert.equal(
    audit.errors.some((error) => error.startsWith("SCHEMA_DRIFT:")),
    false,
    audit.errors.join("\n"),
  );
  assert.equal(
    audit.errors.some((error) => error.startsWith("GIT_BLOB")),
    false,
    audit.errors.join("\n"),
  );
  await assert.rejects(readFile(sentinelPath), { code: "ENOENT" });
});

test("approval timestamps accept canonical UTC seconds but reject normalized calendar dates", async (t) => {
  const fixed = FIXED_SEEDS[0];
  const seconds = await createGoFixture(t);
  const secondsPath = resolve(seconds.root, fixed.approvalPath);
  const secondsApproval = await readJson(secondsPath);
  secondsApproval.approvedAt = "2026-07-31T00:00:00Z";
  await writeJson(secondsPath, secondsApproval);
  await commitFixture(
    seconds,
    [fixed.approvalPath],
    "canonical seconds timestamp",
  );
  assert.equal((await auditWorkspace(options(seconds))).ok, true);

  for (const { approvedAt, expected } of [
    { approvedAt: "2026-02-30T00:00:00Z", expected: "canonical UTC" },
    { approvedAt: " 2026-07-31T00:00:00Z ", expected: "ISO UTC" },
  ]) {
    const invalid = await createGoFixture(t);
    const invalidPath = resolve(invalid.root, fixed.approvalPath);
    const invalidApproval = await readJson(invalidPath);
    invalidApproval.approvedAt = approvedAt;
    await writeJson(invalidPath, invalidApproval);
    await commitFixture(
      invalid,
      [fixed.approvalPath],
      "invalid canonical timestamp",
    );
    const invalidAudit = await auditWorkspace(options(invalid));
    assert.equal(
      invalidAudit.errors.some(
        (error) =>
          error.startsWith("APPROVAL_SCHEMA:") && error.includes(expected),
      ),
      true,
      `${approvedAt}: ${invalidAudit.errors.join("\n")}`,
    );
  }
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
      error.includes("physical path component is a symbolic link or junction"),
    ),
    true,
  );
});

test("an internal same-byte source-file symlink cannot satisfy fixed input trust", async (t) => {
  const fixture = await createGoFixture(t);
  const sourcePath = resolve(fixture.root, FIXED_SEEDS[0].sourcePath);
  const sourceBytes = await readFile(sourcePath);
  const sentinelPath = resolve(fixture.root, "same-byte-source-sentinel.json");
  await writeFile(sentinelPath, sourceBytes);
  assert.equal(sha256(await readFile(sentinelPath)), sha256(sourceBytes));
  await unlink(sourcePath);
  const linked = await createLinkOrSkip(t, sentinelPath, sourcePath, ["file"]);
  if (!linked) return;

  const audit = await auditWorkspace(options(fixture));
  assert.equal(audit.ok, false);
  assert.equal(
    audit.errors.some(
      (error) =>
        error.includes(FIXED_SEEDS[0].sourcePath) &&
        error.includes(
          "physical path component is a symbolic link or junction",
        ),
    ),
    true,
    audit.errors.join("\n"),
  );
  const generated = await generateProjection(options(fixture));
  assert.equal(generated.ok, false);
  await assert.rejects(readFile(fixture.artifactPath), { code: "ENOENT" });
});

test("an internal same-byte contract-directory junction cannot satisfy another fixed input path", async (t) => {
  const fixture = await createGoFixture(t);
  const contractsDirectory = resolve(fixture.root, "apps/atlas/src/contracts");
  const sentinelDirectory = resolve(
    fixture.root,
    "same-byte-contract-directory-sentinel",
  );
  await mkdir(sentinelDirectory, { recursive: true });
  for (const contractPath of FIXED_CONTRACT_PATHS) {
    await copyFile(
      resolve(fixture.root, contractPath),
      resolve(sentinelDirectory, basename(contractPath)),
    );
  }
  const representative = FIXED_CONTRACT_PATHS[0];
  assert.equal(
    sha256(await readFile(resolve(fixture.root, representative))),
    sha256(
      await readFile(resolve(sentinelDirectory, basename(representative))),
    ),
  );
  await rm(contractsDirectory, { recursive: true });
  const linked = await createLinkOrSkip(
    t,
    sentinelDirectory,
    contractsDirectory,
    process.platform === "win32" ? ["junction", "dir"] : ["dir"],
  );
  if (!linked) return;

  const audit = await auditWorkspace(options(fixture));
  assert.equal(audit.ok, false);
  assert.equal(
    audit.errors.some(
      (error) =>
        error.includes(representative) &&
        error.includes(
          "physical path component is a symbolic link or junction",
        ),
    ),
    true,
    audit.errors.join("\n"),
  );
  const checked = await checkProjection(options(fixture));
  assert.equal(checked.ok, false);
  await assert.rejects(readFile(fixture.artifactPath), { code: "ENOENT" });
});

test("the actual C0 parser rejects whitespace-only text and credential-bearing public URLs", async (t) => {
  const whitespace = await createGoFixture(t, {
    beforeHistoricalCommit: async (root) => {
      const path = resolve(root, FIXED_SEEDS[0].sourcePath);
      const events = await readJson(path);
      events[0].eventName = "   ";
      await writeJson(path, events);
    },
  });
  const whitespaceGenerate = await generateProjection(options(whitespace));
  assert.equal(whitespaceGenerate.ok, false);
  assert.equal(
    whitespaceGenerate.errors.some((error) =>
      error.includes("C0 parser rejected"),
    ),
    true,
  );

  const credentials = await createGoFixture(t, {
    beforeHistoricalCommit: async (root) => {
      const path = resolve(root, FIXED_SEEDS[1].sourcePath);
      const events = await readJson(path);
      events[0].performances[0].sourceUrls[0] =
        "https://user:password@example.com/source";
      await writeJson(path, events);
    },
  });
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

test("an in-repository generated-directory junction or symlink is rejected before sentinel access", async (t) => {
  const fixture = await createGoFixture(t);
  const targetDirectory = resolve(fixture.root, "artifact-parent-sentinel");
  const generatedDirectory = dirname(fixture.artifactPath);
  const sentinelPath = resolve(
    targetDirectory,
    "public-atlas-projection.v1.json",
  );
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(sentinelPath, "parent link sentinel", "utf8");
  const linked = await createLinkOrSkip(
    t,
    targetDirectory,
    generatedDirectory,
    process.platform === "win32" ? ["junction", "dir"] : ["dir"],
  );
  if (!linked) return;

  const checked = await checkProjection(options(fixture));
  assert.equal(checked.ok, false);
  assert.equal(checked.errors[0].startsWith("ARTIFACT_PATH:"), true);
  const generated = await generateProjection(options(fixture));
  assert.equal(generated.ok, false);
  assert.equal(generated.errors[0].startsWith("ARTIFACT_PATH:"), true);
  assert.equal(await readFile(sentinelPath, "utf8"), "parent link sentinel");
});

test("an artifact-file symlink is rejected without reading, unlinking, or overwriting its sentinel", async (t) => {
  const fixture = await createGoFixture(t);
  const sentinelPath = resolve(fixture.root, "artifact-file-sentinel.json");
  await mkdir(dirname(fixture.artifactPath), { recursive: true });
  await writeFile(sentinelPath, "artifact file sentinel", "utf8");
  const linked = await createLinkOrSkip(t, sentinelPath, fixture.artifactPath, [
    "file",
  ]);
  if (!linked) return;

  const checked = await checkProjection(options(fixture));
  assert.equal(checked.ok, false);
  assert.equal(checked.errors[0].startsWith("ARTIFACT_PATH:"), true);
  const generated = await generateProjection(options(fixture));
  assert.equal(generated.ok, false);
  assert.equal(generated.errors[0].startsWith("ARTIFACT_PATH:"), true);
  assert.equal(await readFile(sentinelPath, "utf8"), "artifact file sentinel");
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
