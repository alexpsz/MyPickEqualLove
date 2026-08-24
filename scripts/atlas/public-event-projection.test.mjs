import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";

import {
  DEFAULT_RECEIPT_PATH,
  DEFAULT_REPOSITORY_ROOT,
  GATE_NAMES,
  artifactHash,
  auditWorkspace,
  canonicalUtf8,
  checkProjection,
  generateProjection,
  sha256,
} from "./public-event-projection.mjs";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const temporaryRoots = [];

after(async () => {
  await Promise.all(
    temporaryRoots.map((temporaryRoot) =>
      rm(temporaryRoot, { recursive: true, force: true }),
    ),
  );
});

async function temporaryRoot(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
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

function publicEvidenceFor(event) {
  return {
    asOf: "2026-08-14",
    lastVerifiedAt: "2026-08-14",
    timezone: "Asia/Tokyo",
    lifecycle: event.id === "tokyo_dome_2027" ? "scheduled" : "completed",
    refreshPolicy: {
      refreshCadence: "on-source-change",
      staleAfterDays: 30,
      onInvalidation: "HOLD",
      onWithdrawal: "HOLD",
    },
    maintenanceOwner: "fixture-atlas-evidence-owner",
  };
}

function withoutPublicEvidence(events) {
  return events.map((event) => {
    const clone = structuredClone(event);
    delete clone.publicAtlasEvidence;
    return clone;
  });
}

async function updateSeedHash(root, seed, field, repositoryPath) {
  const bytes = await readFile(resolve(root, repositoryPath));
  seed[field] = sha256(bytes);
}

async function createGoFixture() {
  const root = await temporaryRoot("atlas-e1-go-");
  const receipt = await readJson(DEFAULT_RECEIPT_PATH);
  for (const contractFile of receipt.contractFiles) {
    await copyRepositoryFile(root, contractFile.path);
  }
  const originalSources = new Map();
  for (const seed of receipt.seeds) {
    await copyRepositoryFile(root, seed.sourcePath);
    await copyRepositoryFile(root, seed.songsPath);
    const sourcePath = resolve(root, seed.sourcePath);
    const events = await readJson(sourcePath);
    originalSources.set(seed.siteId, structuredClone(events));
    for (const event of events)
      event.publicAtlasEvidence = publicEvidenceFor(event);
    await writeJson(sourcePath, events);
    await updateSeedHash(root, seed, "sourceSha256", seed.sourcePath);
    await updateSeedHash(root, seed, "songsSha256", seed.songsPath);
    seed.decision = "GO";
    seed.withdrawalState = "active";
    for (const gateName of GATE_NAMES) {
      seed.gates[gateName] = {
        status: "GO",
        evidenceRefs: [`fixture/evidence/${seed.siteId}/${gateName}`],
        gap: null,
      };
    }
  }
  const receiptPath = resolve(
    root,
    "scripts/atlas/source-go-hold-receipt.v1.json",
  );
  await writeJson(receiptPath, receipt);
  return {
    root,
    receipt,
    receiptPath,
    artifactPath: resolve(
      root,
      "apps/atlas/src/generated/public-atlas-projection.v1.json",
    ),
    originalSources,
  };
}

async function rewriteReceipt(fixture, update) {
  const receipt = await readJson(fixture.receiptPath);
  update(receipt);
  await writeJson(fixture.receiptPath, receipt);
  fixture.receipt = receipt;
}

let c0ContractsPromise;
async function loadC0Contracts() {
  if (c0ContractsPromise) return c0ContractsPromise;
  c0ContractsPromise = (async () => {
    const compiledRoot = await temporaryRoot("atlas-e1-c0-");
    const sourceRoot = resolve(
      DEFAULT_REPOSITORY_ROOT,
      "apps/atlas/src/contracts",
    );
    for (const fileName of await readdir(sourceRoot)) {
      if (!fileName.endsWith(".ts")) continue;
      const sourcePath = resolve(sourceRoot, fileName);
      const outputPath = resolve(
        compiledRoot,
        fileName.replace(/\.ts$/, ".js"),
      );
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
    return {
      projection: await import(
        pathToFileURL(resolve(compiledRoot, "public-atlas-projection.js")).href
      ),
      baseline: await import(
        pathToFileURL(resolve(compiledRoot, "baseline-receipt.js")).href
      ),
    };
  })();
  return c0ContractsPromise;
}

test("production receipt matches the historical baseline and current facts, but every seed is HOLD", async () => {
  const audit = await auditWorkspace();
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.totals, {
    events: 4,
    performances: 6,
    setlistEntries: 172,
  });
  assert.match(audit.sourceRevision, /^sha256:[0-9a-f]{64}$/);
  assert.equal(audit.sourceRevision, (await auditWorkspace()).sourceRevision);
  assert.equal(
    audit.errors.some((error) => error.startsWith("SOURCE_DRIFT:")),
    false,
  );
  assert.equal(
    audit.errors.some((error) => error.startsWith("SCHEMA_DRIFT:")),
    false,
  );
  assert.deepEqual(
    audit.seedResults.map(({ seed, source }) => ({
      siteId: seed.siteId,
      decision: seed.decision,
      counts: source.counts,
      eventIds: source.events.map((event) => event.id),
      performanceIds: source.events.flatMap((event) =>
        (event.performances ?? []).map(
          (performance) => `${event.id}/${performance.id}`,
        ),
      ),
    })),
    [
      {
        siteId: "equal-love",
        decision: "HOLD",
        counts: { events: 2, performances: 2, setlistEntries: 60 },
        eventIds: ["kokuritsu_2026", "tokyo_dome_2027"],
        performanceIds: ["kokuritsu_2026/day1", "kokuritsu_2026/day2"],
      },
      {
        siteId: "nearly-equal-joy",
        decision: "HOLD",
        counts: { events: 1, performances: 2, setlistEntries: 57 },
        eventIds: ["joy_4th_anniversary_2026_afterglow"],
        performanceIds: [
          "joy_4th_anniversary_2026_afterglow/day",
          "joy_4th_anniversary_2026_afterglow/night",
        ],
      },
      {
        siteId: "not-equal-me",
        decision: "HOLD",
        counts: { events: 1, performances: 2, setlistEntries: 55 },
        eventIds: ["not_equal_me_7th_anniversary_2026_afterglow"],
        performanceIds: [
          "not_equal_me_7th_anniversary_2026_afterglow/day",
          "not_equal_me_7th_anniversary_2026_afterglow/night",
        ],
      },
    ],
  );
  const equalLoveTokyoDome = audit.seedResults[0].source.events.find(
    (event) => event.id === "tokyo_dome_2027",
  );
  assert.equal("performances" in equalLoveTokyoDome, false);

  const { baseline } = await loadC0Contracts();
  assert.equal(
    baseline.ATLAS_C0_BASELINE_RECEIPT.sourceCommit,
    audit.receipt.historicalBaseline.sourceCommit,
  );
  assert.deepEqual(
    baseline.ATLAS_C0_BASELINE_RECEIPT.totals,
    audit.receipt.historicalBaseline.totals,
  );
  assert.deepEqual(
    baseline.ATLAS_C0_BASELINE_RECEIPT.sources.map((source) => ({
      siteId: source.siteId,
      sha256: source.sha256,
      counts: {
        events: source.eventCount,
        performances: source.performanceCount,
        setlistEntries: source.setlistEntryCount,
      },
    })),
    audit.receipt.seeds.map((seed) => ({
      siteId: seed.siteId,
      sha256: seed.sourceSha256,
      counts: seed.baselineCounts,
    })),
  );
});

test("GO fixture projects exact IDs/order/counts, namespaces day/night, and passes the C0 parser", async () => {
  const fixture = await createGoFixture();
  const result = await generateProjection({
    repositoryRoot: fixture.root,
    receiptPath: fixture.receiptPath,
    artifactPath: fixture.artifactPath,
  });
  assert.equal(result.ok, true, result.errors?.join("\n"));
  const bytes = await readFile(fixture.artifactPath);
  const projection = JSON.parse(bytes);
  assert.deepEqual(projection.groupCounts, {
    "equal-love": { events: 2, performances: 2, setlistEntries: 60 },
    "nearly-equal-joy": { events: 1, performances: 2, setlistEntries: 57 },
    "not-equal-me": { events: 1, performances: 2, setlistEntries: 55 },
  });
  assert.deepEqual(
    projection.groups.map((group) => group.siteId),
    ["equal-love", "nearly-equal-joy", "not-equal-me"],
  );
  assert.deepEqual(
    projection.groups[0].events.map((event) => event.id),
    ["equal-love:event:kokuritsu_2026", "equal-love:event:tokyo_dome_2027"],
  );
  assert.deepEqual(
    projection.groups[0].events[0].performances.map(
      (performance) => performance.id,
    ),
    [
      "equal-love:performance:kokuritsu_2026:day1",
      "equal-love:performance:kokuritsu_2026:day2",
    ],
  );
  assert.deepEqual(projection.groups[0].events[1].performances, []);

  const dayNightIds = projection.groups
    .slice(1)
    .flatMap((group) =>
      group.events[0].performances.map((performance) => performance.id),
    );
  assert.equal(new Set(dayNightIds).size, 4);
  assert.equal(
    dayNightIds.some((id) => id.endsWith(":day")),
    true,
  );
  assert.equal(
    dayNightIds.some((id) => id.endsWith(":night")),
    true,
  );

  for (const group of projection.groups) {
    for (const event of group.events) {
      for (const performance of event.performances) {
        assert.equal(performance.timezone, event.timezone);
        assert.ok(performance.date >= event.dates.start);
        assert.ok(performance.date <= event.dates.end);
        for (const entry of performance.setlist) {
          assert.match(
            entry.songRef.entityId,
            new RegExp(`^${group.siteId}:song:`),
          );
          assert.equal(entry.songRef.sourceRevision, projection.sourceRevision);
        }
      }
    }
  }

  const { projection: c0Projection } = await loadC0Contracts();
  const parsed = c0Projection.parsePublicAtlasProjection(
    bytes.toString("utf8"),
  );
  assert.equal(parsed.status, "valid", JSON.stringify(parsed));
  assert.equal(
    await checkProjection({
      repositoryRoot: fixture.root,
      receiptPath: fixture.receiptPath,
      artifactPath: fixture.artifactPath,
    }).then((check) => check.ok),
    true,
  );
});

test("GO fixture adds governance metadata only and repeat generation is byte-identical with a canonical hash", async () => {
  const fixture = await createGoFixture();
  for (const seed of fixture.receipt.seeds) {
    const fixtureEvents = await readJson(
      resolve(fixture.root, seed.sourcePath),
    );
    assert.deepEqual(
      withoutPublicEvidence(fixtureEvents),
      fixture.originalSources.get(seed.siteId),
    );
  }

  const options = {
    repositoryRoot: fixture.root,
    receiptPath: fixture.receiptPath,
    artifactPath: fixture.artifactPath,
  };
  assert.equal((await generateProjection(options)).ok, true);
  const first = await readFile(fixture.artifactPath);
  assert.equal((await generateProjection(options)).ok, true);
  const second = await readFile(fixture.artifactPath);
  assert.deepEqual(second, first);

  const projection = JSON.parse(first);
  const payload = structuredClone(projection);
  delete payload.artifactHash;
  const expected = `sha256:${sha256(canonicalUtf8(payload))}`;
  assert.equal(projection.artifactHash, expected);
  assert.equal(artifactHash(projection), expected);
});

test("source byte drift is read-only in check and generate invalidates the stale artifact", async () => {
  const fixture = await createGoFixture();
  const options = {
    repositoryRoot: fixture.root,
    receiptPath: fixture.receiptPath,
    artifactPath: fixture.artifactPath,
  };
  assert.equal((await generateProjection(options)).ok, true);
  const artifactBefore = await readFile(fixture.artifactPath);
  const sourcePath = resolve(fixture.root, fixture.receipt.seeds[0].sourcePath);
  await writeFile(
    sourcePath,
    Buffer.concat([await readFile(sourcePath), Buffer.from(" \n")]),
  );

  const check = await checkProjection(options);
  assert.equal(check.ok, false);
  assert.equal(
    check.errors.some((error) => error.startsWith("SOURCE_DRIFT:")),
    true,
  );
  assert.deepEqual(await readFile(fixture.artifactPath), artifactBefore);

  const generate = await generateProjection(options);
  assert.equal(generate.ok, false);
  assert.equal(generate.invalidated, true);
  await assert.rejects(readFile(fixture.artifactPath), { code: "ENOENT" });
});

test("C0 schema drift and source schema drift fail closed", async () => {
  const contractFixture = await createGoFixture();
  const contractPath = resolve(
    contractFixture.root,
    contractFixture.receipt.contractFiles[0].path,
  );
  await writeFile(
    contractPath,
    Buffer.concat([await readFile(contractPath), Buffer.from("\n")]),
  );
  const contractCheck = await checkProjection({
    repositoryRoot: contractFixture.root,
    receiptPath: contractFixture.receiptPath,
    artifactPath: contractFixture.artifactPath,
  });
  assert.equal(contractCheck.ok, false);
  assert.equal(
    contractCheck.errors.some((error) => error.startsWith("SCHEMA_DRIFT:")),
    true,
  );

  const sourceFixture = await createGoFixture();
  const seed = sourceFixture.receipt.seeds[0];
  const sourcePath = resolve(sourceFixture.root, seed.sourcePath);
  const events = await readJson(sourcePath);
  events[0].performances[0].setlist[1].order =
    events[0].performances[0].setlist[0].order;
  await writeJson(sourcePath, events);
  await rewriteReceipt(sourceFixture, (receipt) => {
    receipt.seeds[0].sourceSha256 = sha256(
      Buffer.from(`${JSON.stringify(events, null, 2)}\n`, "utf8"),
    );
  });
  const sourceCheck = await checkProjection({
    repositoryRoot: sourceFixture.root,
    receiptPath: sourceFixture.receiptPath,
    artifactPath: sourceFixture.artifactPath,
  });
  assert.equal(sourceCheck.ok, false);
  assert.equal(
    sourceCheck.errors.some((error) => error.startsWith("SOURCE_SCHEMA:")),
    true,
  );
});

test("a hand-edited artifact fails both strict hash and deterministic byte checks", async () => {
  const fixture = await createGoFixture();
  const options = {
    repositoryRoot: fixture.root,
    receiptPath: fixture.receiptPath,
    artifactPath: fixture.artifactPath,
  };
  assert.equal((await generateProjection(options)).ok, true);
  const projection = await readJson(fixture.artifactPath);
  projection.groups[0].events[0].displayName = "hand edited";
  await writeJson(fixture.artifactPath, projection);
  const check = await checkProjection(options);
  assert.equal(check.ok, false);
  assert.equal(
    check.errors.some((error) => error.startsWith("ARTIFACT_INVALID:")),
    true,
  );
  assert.equal(
    check.errors.includes(
      "ARTIFACT_DRIFT:generated bytes do not match the deterministic projection",
    ),
    true,
  );
});

test("one HOLD seed or one withdrawn seed blocks all publication and leaves no artifact", async () => {
  for (const mode of ["HOLD", "withdrawn"]) {
    const fixture = await createGoFixture();
    const options = {
      repositoryRoot: fixture.root,
      receiptPath: fixture.receiptPath,
      artifactPath: fixture.artifactPath,
    };
    assert.equal((await generateProjection(options)).ok, true);
    await rewriteReceipt(fixture, (receipt) => {
      const seed = receipt.seeds[1];
      seed.decision = "HOLD";
      if (mode === "HOLD") {
        seed.gates.sourceUseBoundary = {
          status: "HOLD",
          evidenceRefs: [],
          gap: "Fixture approval was withdrawn.",
        };
      } else {
        seed.withdrawalState = "withdrawn";
      }
    });
    const check = await checkProjection(options);
    assert.equal(check.ok, false);
    assert.equal(
      check.errors.some((error) =>
        error.startsWith(
          mode === "HOLD"
            ? "SEED_HOLD:nearly-equal-joy"
            : "SEED_WITHDRAWAL:nearly-equal-joy:withdrawn",
        ),
      ),
      true,
    );
    assert.equal(
      check.errors.includes(
        "ARTIFACT_NOT_PUBLISHABLE:source receipt is not GO",
      ),
      true,
    );
    const generate = await generateProjection(options);
    assert.equal(generate.ok, false);
    assert.equal(generate.invalidated, true);
    await assert.rejects(readFile(fixture.artifactPath), { code: "ENOENT" });
  }
});

test("production generate stays HOLD and does not leave a publishable artifact", async () => {
  const artifactPath = resolve(
    await temporaryRoot("atlas-e1-production-hold-"),
    "public-atlas-projection.v1.json",
  );
  const result = await generateProjection({ artifactPath });
  assert.equal(result.ok, false);
  assert.equal(result.status, "HOLD");
  assert.equal(result.invalidated, false);
  await assert.rejects(readFile(artifactPath), { code: "ENOENT" });
});
