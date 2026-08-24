import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { stripTypeScriptTypes } from "node:module";

const atlasRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(atlasRoot, "..", "..");
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
    const output = stripTypeScriptTypes(source, { mode: "transform" });
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
          dates: { start: "2026-06-20", end: "2026-06-20" },
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
    "equal-love::event-one",
  ]) {
    assert.equal(
      identity.parseNamespacedEntityId(malformed).ok,
      false,
      malformed,
    );
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

  const ready = restore.createRestorePlan({
    status: "valid",
    raw: JSON.stringify(validJourney()),
    expectedRevision: 3,
    replacement: validJourney(),
    summary: { journeyCount: 1, experienceEntryCount: 1 },
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.applyPlan.kind, "replace-journey-document");
});

test("baseline receipt matches all three current authoring files exactly", async () => {
  const observedTotals = { events: 0, performances: 0, setlistEntries: 0 };
  for (const source of ATLAS_C0_BASELINE_RECEIPT.sources) {
    const bytes = await readFile(join(repoRoot, source.sourcePath));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const events = JSON.parse(bytes.toString("utf8"));
    const performances = events.flatMap((event) => event.performances ?? []);
    const setlistEntries = performances.flatMap(
      (performance) => performance.setlist ?? [],
    );
    assert.equal(bytes.byteLength, source.byteLength, source.sourcePath);
    assert.equal(hash, source.sha256, source.sourcePath);
    assert.equal(events.length, source.eventCount, source.sourcePath);
    assert.deepEqual(
      events.map((event) => event.id),
      source.eventLocalIds,
      source.sourcePath,
    );
    assert.equal(
      performances.length,
      source.performanceCount,
      source.sourcePath,
    );
    assert.deepEqual(
      events.flatMap((event) =>
        (event.performances ?? []).map(
          (performance) => `${event.id}/${performance.id}`,
        ),
      ),
      source.performanceIds,
      source.sourcePath,
    );
    assert.equal(
      setlistEntries.length,
      source.setlistEntryCount,
      source.sourcePath,
    );
    assert.deepEqual(
      events.flatMap((event) =>
        (event.performances ?? []).map((performance) => ({
          eventLocalId: event.id,
          performanceLocalId: performance.id,
          setlistEntryCount: performance.setlist.length,
          setlistOrderRange: {
            first: performance.setlist[0].order,
            last: performance.setlist.at(-1).order,
          },
        })),
      ),
      source.setlistOrderRanges,
      source.sourcePath,
    );
    observedTotals.events += events.length;
    observedTotals.performances += performances.length;
    observedTotals.setlistEntries += setlistEntries.length;
  }
  assert.deepEqual(observedTotals, ATLAS_C0_BASELINE_RECEIPT.totals);
  assert.equal(
    ATLAS_C0_BASELINE_RECEIPT.sourceCommit,
    "60b3012d7412c10c1fe189dbbdca3ba1abb17810",
  );

  const equalLove = JSON.parse(
    await readFile(
      join(repoRoot, "src/projects/equal-love/live-experiences.json"),
      "utf8",
    ),
  );
  const eventOnly = equalLove.find((event) => event.id === "tokyo_dome_2027");
  assert.equal((eventOnly.performances ?? []).length, 0);
});
