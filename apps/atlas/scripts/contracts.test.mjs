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
const compiledRoot = await mkdtemp(join(tmpdir(), "atlas-c0-contracts-"));

after(async () => {
  await rm(compiledRoot, { recursive: true, force: true });
});

for (const sourceDirectory of ["contracts", "ports", "view-models"]) {
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

const identity = await load("contracts/identity.js");
const publicReference = await load("contracts/public-reference.js");
const projection = await load("contracts/public-atlas-projection.js");
const journey = await load("contracts/journey-document.js");
const memory = await load("contracts/memory-snapshot.js");
const restore = await load("ports/restore-plan.js");
const repository = await load("ports/journey-repository.js");
const { ATLAS_C0_BASELINE_RECEIPT } = await load(
  "contracts/baseline-receipt.js",
);

const sourceRevision = "atlas-projection-r1";
const fallback = {
  groupName: "＝LOVE",
  title: "Event title",
  date: "2026-06-20",
  venueName: "Venue",
};

function publicRef(entityId, overrides = {}) {
  return {
    entityId,
    sourceRevision,
    fallback,
    ...overrides,
  };
}

function evidence(included = 1, total = 1) {
  return {
    verificationStatus: "verified",
    sourceUrls: ["https://example.com/source"],
    coverage: { included, total },
    excluded: [],
    unresolved: [],
  };
}

function validProjection() {
  const groups = identity.PUBLIC_ATLAS_SITE_IDS.map((siteId) => {
    const eventLocalId = "shared-event";
    return {
      id: identity.createGroupEntityId(siteId, siteId),
      siteId,
      displayName: siteId,
      events: [
        {
          id: identity.createEventEntityId(siteId, eventLocalId),
          displayName: "Event title",
          venue: { displayName: "Venue" },
          dates: { start: "2026-06-20", end: "2026-06-21" },
          timezone: "Asia/Tokyo",
          lifecycle: "completed",
          performances: [
            {
              id: identity.createPerformanceEntityId(
                siteId,
                eventLocalId,
                "day",
              ),
              displayName: "Day",
              venue: { displayName: "Venue" },
              date: "2026-06-20",
              timezone: "Asia/Tokyo",
              lifecycle: "completed",
              setlist: [
                {
                  order: 1,
                  songRef: publicRef(
                    identity.createSongEntityId(siteId, "existing-song-id"),
                  ),
                },
              ],
              ...evidence(),
            },
          ],
          ...evidence(),
        },
      ],
    };
  });
  return {
    schemaVersion: 1,
    sourceCommit: "a".repeat(40),
    sourceRevision,
    groupCounts: Object.fromEntries(
      identity.PUBLIC_ATLAS_SITE_IDS.map((siteId) => [
        siteId,
        { events: 1, performances: 1, setlistEntries: 1 },
      ]),
    ),
    artifactHash: `sha256:${"b".repeat(64)}`,
    groups,
  };
}

function validJourney() {
  const createdAt = "2026-06-20T10:00:00.000Z";
  const updatedAt = "2026-06-21T10:00:00.000Z";
  return {
    schemaVersion: 1,
    revision: 3,
    updatedAt,
    journeys: [
      {
        id: "journey-one",
        subject: {
          kind: "public-reference",
          reference: publicRef(
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
              publicRef(
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

function validMemorySnapshot() {
  return {
    schemaVersion: 1,
    event: {
      groupName: "＝LOVE",
      eventName: "Event title",
      date: "2026-06-20",
      performanceName: "Day",
    },
    selected: {
      mode: { consent: true, value: "in-person" },
      highlights: [{ consent: true, value: "Encore" }],
      songs: [
        {
          consent: true,
          value: { groupName: "＝LOVE", title: "Song title" },
        },
      ],
      summary: { consent: true, value: "A public summary." },
    },
  };
}

test("namespaces prevent the same local id from colliding across all groups", () => {
  const performanceIds = identity.PUBLIC_ATLAS_SITE_IDS.map((siteId) =>
    identity.createPerformanceEntityId(siteId, "shared-event", "day"),
  );
  const songIds = identity.PUBLIC_ATLAS_SITE_IDS.map((siteId) =>
    identity.createSongEntityId(siteId, "existing-song-id"),
  );
  assert.equal(new Set(performanceIds).size, 3);
  assert.equal(new Set(songIds).size, 3);
  assert.match(songIds[0], /:song:existing-song-id$/);
});

test("malformed namespaces fail closed", () => {
  for (const malformed of [
    "equal-love:performance:day",
    "equal-love:event:event:extra",
    "equal-love:song:Uppercase",
    "unknown-site:event:event-one",
    "atlas:event:event-one",
    "equal-love::event-one",
  ]) {
    assert.equal(
      identity.parseNamespacedEntityId(malformed).ok,
      false,
      malformed,
    );
  }
});

test("Atlas private namespace is rejected by every public creator and reference", () => {
  const creatorCalls = [
    () => identity.createGroupEntityId("atlas", "atlas"),
    () => identity.createEventEntityId("atlas", "event-one"),
    () => identity.createPerformanceEntityId("atlas", "event-one", "day"),
    () => identity.createSongEntityId("atlas", "song-one"),
  ];
  for (const create of creatorCalls) {
    assert.throws(create, /equal-love, nearly-equal-joy, not-equal-me/);
  }

  const privateReferences = [
    ["atlas:group:atlas", "group"],
    ["atlas:event:event-one", "event"],
    ["atlas:performance:event-one:day", "performance"],
    ["atlas:song:song-one", "song"],
  ];
  for (const [entityId, kind] of privateReferences) {
    const result = publicReference.parsePublicEntityReference(
      publicRef(entityId),
      [kind],
    );
    assert.equal(result.ok, false, `${kind} must reject Atlas namespace`);
  }
});

test("all three public sites accept group, event, performance, and song refs", () => {
  for (const siteId of identity.PUBLIC_ATLAS_SITE_IDS) {
    const references = [
      [identity.createGroupEntityId(siteId, siteId), "group"],
      [identity.createEventEntityId(siteId, "event-one"), "event"],
      [
        identity.createPerformanceEntityId(siteId, "event-one", "day"),
        "performance",
      ],
      [identity.createSongEntityId(siteId, "song-one"), "song"],
    ];
    for (const [entityId, kind] of references) {
      assert.equal(
        publicReference.parsePublicEntityReference(publicRef(entityId), [kind])
          .ok,
        true,
        `${siteId}:${kind}`,
      );
    }
  }
});

test("missing public entities retain readable fallback and missing status", () => {
  const reference = publicRef(
    identity.createEventEntityId("equal-love", "shared-event"),
  );
  const parsed = publicReference.parsePublicEntityReference(reference, [
    "event",
  ]);
  assert.equal(parsed.ok, true);
  const resolution = publicReference.resolvePublicReference(
    parsed.value,
    () => undefined,
  );
  assert.equal(resolution.status, "missing");
  assert.deepEqual(resolution.fallback, fallback);
  assert.deepEqual(resolution.reference, reference);
});

test("Public Atlas Projection accepts only the strict v1 shape", () => {
  const valid = validProjection();
  assert.equal(
    projection.parsePublicAtlasProjection(JSON.stringify(valid)).status,
    "valid",
  );

  const futureRaw = JSON.stringify({ schemaVersion: 2, future: true });
  assert.deepEqual(projection.parsePublicAtlasProjection(futureRaw), {
    status: "future-version",
    raw: futureRaw,
    version: 2,
  });
  assert.deepEqual(projection.parsePublicAtlasProjection("{"), {
    status: "corrupt",
    raw: "{",
  });

  const invalid = structuredClone(valid);
  invalid.groups[0].events[0].unknown = "must fail";
  const invalidResult = projection.parsePublicAtlasProjection(
    JSON.stringify(invalid),
  );
  assert.equal(invalidResult.status, "invalid");
  assert.match(invalidResult.issue.path, /unknown$/);
});

test("Projection rejects malformed identity, ordering, and invented fields", () => {
  const malformed = validProjection();
  malformed.groups[0].events[0].performances[0].id =
    "equal-love:performance:day";
  assert.equal(
    projection.parsePublicAtlasProjection(JSON.stringify(malformed)).status,
    "invalid",
  );

  const unordered = validProjection();
  unordered.groups[0].events[0].performances[0].setlist.push({
    order: 1,
    songRef: publicRef(
      identity.createSongEntityId("equal-love", "second-song-id"),
    ),
  });
  assert.equal(
    projection.parsePublicAtlasProjection(JSON.stringify(unordered)).status,
    "invalid",
  );
});

test("Projection enforces parent Event date and timezone on performances", () => {
  const startBoundary = validProjection();
  assert.equal(
    projection.parsePublicAtlasProjection(JSON.stringify(startBoundary)).status,
    "valid",
  );

  const endBoundary = validProjection();
  endBoundary.groups[0].events[0].performances[0].date = "2026-06-21";
  assert.equal(
    projection.parsePublicAtlasProjection(JSON.stringify(endBoundary)).status,
    "valid",
  );

  const outsideRange = validProjection();
  outsideRange.groups[0].events[0].performances[0].date = "2026-06-22";
  const outsideResult = projection.parsePublicAtlasProjection(
    JSON.stringify(outsideRange),
  );
  assert.equal(outsideResult.status, "invalid");
  assert.match(outsideResult.issue.path, /\.date$/);

  const timezoneMismatch = validProjection();
  timezoneMismatch.groups[0].events[0].performances[0].timezone = "UTC";
  const timezoneResult = projection.parsePublicAtlasProjection(
    JSON.stringify(timezoneMismatch),
  );
  assert.equal(timezoneResult.status, "invalid");
  assert.match(timezoneResult.issue.path, /\.timezone$/);
});

test("Journey read states are distinct and preserve failing raw strings", async () => {
  const validRaw = JSON.stringify(validJourney());
  const validResult = journey.parseJourneyDocument(validRaw);
  assert.equal(validResult.status, "valid");
  assert.equal(validResult.raw, validRaw);
  assert.deepEqual(journey.parseJourneyDocument(null), { status: "absent" });

  const futureRaw = JSON.stringify({ schemaVersion: 9, future: true });
  assert.deepEqual(journey.parseJourneyDocument(futureRaw), {
    status: "future-version",
    raw: futureRaw,
    version: 9,
  });
  assert.deepEqual(journey.parseJourneyDocument("not-json"), {
    status: "corrupt",
    raw: "not-json",
  });

  const invalid = validJourney();
  invalid.journeys[0].unknown = true;
  const invalidRaw = JSON.stringify(invalid);
  const invalidResult = journey.parseJourneyDocument(invalidRaw);
  assert.equal(invalidResult.status, "invalid");
  assert.equal(invalidResult.raw, invalidRaw);

  const readFailed = await journey.readJourneyDocument(async () => {
    throw new Error("storage unavailable");
  }, validRaw);
  assert.deepEqual(readFailed, {
    status: "read-failed",
    raw: validRaw,
    error: "storage unavailable",
  });
});

test("Local Custom Event remains a Journey-local subject", () => {
  const local = validJourney();
  local.journeys[0].subject = {
    kind: "local-custom-event",
    localId: "my-local-event",
    fallback: {
      title: "My local event",
      date: "2026-06-20",
      venueName: "Local venue",
    },
  };
  const result = journey.parseJourneyDocument(JSON.stringify(local));
  assert.equal(result.status, "valid");
  assert.equal(result.value.journeys[0].subject.kind, "local-custom-event");
  assert.equal("reference" in result.value.journeys[0].subject, false);
});

test("Memory snapshot accepts only enumerated public or consented fields", () => {
  assert.equal(memory.parseMemorySnapshot(validMemorySnapshot()).ok, true);

  for (const sensitiveField of [
    "memo",
    "intent",
    "revision",
    "storageKey",
    "privateId",
    "unknown",
  ]) {
    const candidate = validMemorySnapshot();
    candidate[sensitiveField] = "must not leave Journey";
    const result = memory.parseMemorySnapshot(candidate);
    assert.equal(result.ok, false, sensitiveField);
    assert.equal(result.issue.path, `$.${sensitiveField}`);
  }

  const unconsented = validMemorySnapshot();
  unconsented.selected.mode = { consent: false, value: "in-person" };
  assert.equal(memory.parseMemorySnapshot(unconsented).ok, false);
});

test("Journey revisions distinguish absent from revision 0 and advance once", () => {
  assert.deepEqual(
    repository.validateJourneyRevisionTransition({ state: "absent" }, 0),
    { ok: true, nextRevision: 0 },
  );
  assert.deepEqual(
    repository.validateJourneyRevisionTransition(
      { state: "present", revision: 0 },
      1,
    ),
    { ok: true, nextRevision: 1 },
  );

  const next = validJourney();
  next.revision = 4;
  assert.equal(
    repository.validateCompareAndWriteJourneyInput({
      expectedRevision: { state: "present", revision: 3 },
      next,
    }).ok,
    true,
  );
  const equalRevision = validJourney();
  assert.equal(
    repository.validateCompareAndWriteJourneyInput({
      expectedRevision: { state: "present", revision: 3 },
      next: equalRevision,
    }).ok,
    false,
  );
  const skippedRevision = validJourney();
  skippedRevision.revision = 5;
  assert.equal(
    repository.validateReplaceJourneyInput({
      expectedRevision: { state: "present", revision: 3 },
      replacement: skippedRevision,
    }).ok,
    false,
  );

  const invalidTransitions = [
    [{ state: "absent" }, 1],
    [{ state: "absent", revision: 0 }, 0],
    [{ state: "present", revision: 3 }, 3],
    [{ state: "present", revision: 3 }, 2],
    [{ state: "present", revision: 3 }, 5],
    [{ state: "present", revision: -1 }, 0],
    [null, 0],
  ];
  for (const [expectedRevision, nextRevision] of invalidTransitions) {
    assert.equal(
      repository.validateJourneyRevisionTransition(
        expectedRevision,
        nextRevision,
      ).ok,
      false,
      JSON.stringify({ expectedRevision, nextRevision }),
    );
  }
});

test("restore cancellation and every failed input produce no apply plan", () => {
  const blocked = [
    { status: "cancelled" },
    { status: "corrupt", raw: "{" },
    { status: "future-version", raw: "{}", version: 2 },
    { status: "invalid", raw: "{}", reason: "shape" },
    {
      status: "capacity-failed",
      raw: "{}",
      requiredBytes: 100,
      availableBytes: 10,
    },
  ];
  for (const input of blocked) {
    assert.equal(
      restore.createRestorePlan(input).applyPlan,
      null,
      input.status,
    );
  }

  const current = validJourney();
  const replacement = structuredClone(current);
  replacement.revision = 4;
  const ready = restore.createRestorePlan({
    status: "valid",
    raw: JSON.stringify(replacement),
    expectedRevision: { state: "present", revision: 3 },
    current,
    replacement,
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.applyPlan.kind, "replace-journey-document");
  assert.deepEqual(ready.applyPlan.summary, {
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

  const invalidRevision = restore.createRestorePlan({
    status: "valid",
    raw: JSON.stringify(current),
    expectedRevision: { state: "present", revision: 3 },
    current,
    replacement: current,
  });
  assert.equal(invalidRevision.status, "invalid");
  assert.equal(invalidRevision.applyPlan, null);
});

test("whole-replace summary reports deletes and adds at equal totals", () => {
  const current = validJourney();
  const replacement = structuredClone(current);
  replacement.revision = 4;
  replacement.journeys[0].id = "journey-two";
  const result = restore.createRestorePlan({
    status: "valid",
    raw: JSON.stringify(replacement),
    expectedRevision: { state: "present", revision: 3 },
    current,
    replacement,
  });
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

test("whole-replace summary reports retained identities as updated", () => {
  const current = validJourney();
  const replacement = structuredClone(current);
  replacement.revision = 4;
  replacement.journeys[0].intent = "interested";
  replacement.journeys[0].experienceEntries[0].memo = "Changed private memo";
  const summary = restore.createRestoreSummary(current, replacement);
  assert.deepEqual(summary.journeys, {
    before: 1,
    after: 1,
    added: 0,
    updated: 1,
    deleted: 0,
    unchanged: 0,
  });
  assert.deepEqual(summary.experienceEntries, {
    before: 1,
    after: 1,
    added: 0,
    updated: 1,
    deleted: 0,
    unchanged: 0,
  });
});

test("historical baseline receipt is fixed and internally consistent", () => {
  assert.equal(
    ATLAS_C0_BASELINE_RECEIPT.sourceCommit,
    "60b3012d7412c10c1fe189dbbdca3ba1abb17810",
  );
  assert.deepEqual(
    ATLAS_C0_BASELINE_RECEIPT.sources.map((source) => ({
      siteId: source.siteId,
      sourcePath: source.sourcePath,
      byteLength: source.byteLength,
      sha256: source.sha256,
      eventCount: source.eventCount,
      performanceCount: source.performanceCount,
      setlistEntryCount: source.setlistEntryCount,
    })),
    [
      {
        siteId: "equal-love",
        sourcePath: "src/projects/equal-love/live-experiences.json",
        byteLength: 10513,
        sha256:
          "c272dd0d8b02ddd7001e852a0e830f8d8b0a7bd00bf16a74a59e90ae6e312649",
        eventCount: 2,
        performanceCount: 2,
        setlistEntryCount: 60,
      },
      {
        siteId: "nearly-equal-joy",
        sourcePath: "src/projects/nearly-equal-joy/live-experiences.json",
        byteLength: 14227,
        sha256:
          "20373a5cefd37b0d64b86ddaf835852fd814af6140bf32bc392b2126df7109cc",
        eventCount: 1,
        performanceCount: 2,
        setlistEntryCount: 57,
      },
      {
        siteId: "not-equal-me",
        sourcePath: "src/projects/not-equal-me/live-experiences.json",
        byteLength: 12799,
        sha256:
          "81b39e2287d36dc7db57ab543e99179eb6996a84847c049a3e7ea12e7e07465c",
        eventCount: 1,
        performanceCount: 2,
        setlistEntryCount: 55,
      },
    ],
  );

  const observedTotals = { events: 0, performances: 0, setlistEntries: 0 };
  for (const source of ATLAS_C0_BASELINE_RECEIPT.sources) {
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.equal(new Set(source.eventLocalIds).size, source.eventCount);
    assert.equal(new Set(source.performanceIds).size, source.performanceCount);
    assert.equal(source.setlistOrderRanges.length, source.performanceCount);
    assert.equal(
      source.setlistOrderRanges.reduce(
        (sum, performance) => sum + performance.setlistEntryCount,
        0,
      ),
      source.setlistEntryCount,
    );
    for (const performance of source.setlistOrderRanges) {
      assert.equal(
        performance.setlistOrderRange.last -
          performance.setlistOrderRange.first +
          1,
        performance.setlistEntryCount,
      );
      assert.ok(source.eventLocalIds.includes(performance.eventLocalId));
      assert.ok(
        source.performanceIds.includes(
          `${performance.eventLocalId}/${performance.performanceLocalId}`,
        ),
      );
    }
    observedTotals.events += source.eventCount;
    observedTotals.performances += source.performanceCount;
    observedTotals.setlistEntries += source.setlistEntryCount;
  }
  assert.deepEqual(observedTotals, ATLAS_C0_BASELINE_RECEIPT.totals);

  const equalLove = ATLAS_C0_BASELINE_RECEIPT.sources.find(
    (source) => source.siteId === "equal-love",
  );
  assert.ok(equalLove.eventLocalIds.includes("tokyo_dome_2027"));
  assert.equal(
    equalLove.performanceIds.some((id) => id.startsWith("tokyo_dome_2027/")),
    false,
  );
});
