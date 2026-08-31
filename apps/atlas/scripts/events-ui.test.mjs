import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const react = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(atlasRoot, "src");
const compiledRoot = await mkdtemp(join(tmpdir(), "atlas-events-ui-"));
const reactJsxRuntimeUrl = pathToFileURL(
  require.resolve("react/jsx-runtime"),
).href;

after(async () => {
  await rm(compiledRoot, { recursive: true, force: true });
});

async function compileDirectory(sourceDirectory) {
  const directory = join(sourceRoot, sourceDirectory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = join(sourceDirectory, entry.name);
    if (entry.isDirectory()) {
      await compileDirectory(relativePath);
      continue;
    }
    if (
      !entry.isFile() ||
      (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx"))
    ) {
      continue;
    }

    const sourcePath = join(sourceRoot, relativePath);
    const outputPath = join(
      compiledRoot,
      relative(sourceRoot, sourcePath).replace(/\.tsx?$/, ".js"),
    );
    await mkdir(dirname(outputPath), { recursive: true });
    const source = await readFile(sourcePath, "utf8");
    const output = typescript
      .transpileModule(source, {
        fileName: sourcePath,
        compilerOptions: {
          target: typescript.ScriptTarget.ES2022,
          module: typescript.ModuleKind.ES2022,
          jsx: typescript.JsxEmit.ReactJSX,
          verbatimModuleSyntax: true,
        },
      })
      .outputText.replaceAll(
        '"react/jsx-runtime"',
        JSON.stringify(reactJsxRuntimeUrl),
      )
      .replace(
        /(from\s+["'](?:\.\.?\/)[^"']+)(["'])/g,
        (match, specifier, quote) =>
          /\.[cm]?js$/.test(specifier) ? match : `${specifier}.js${quote}`,
      );
    await writeFile(outputPath, output, "utf8");
  }
}

for (const sourceDirectory of [
  "components/events",
  "contracts",
  "features/events",
  "features/journey",
  "i18n/events",
  "ports",
]) {
  await compileDirectory(sourceDirectory);
}

async function load(relativePath) {
  return import(pathToFileURL(join(compiledRoot, relativePath)).href);
}

const identity = await load("contracts/identity.js");
const projectionContract = await load("contracts/public-atlas-projection.js");
const events = await load("features/events/event-presentation.js");
const recordTime = await load("features/events/event-record-time.js");
const recorder = await load("features/events/public-experience-recorder.js");
const messages = await load("i18n/events/messages.js");
const { EventsList } = await load("components/events/EventsList.js");
const { EventDetail } = await load("components/events/EventDetail.js");
const { PerformanceDetail } = await load(
  "components/events/PerformanceDetail.js",
);
const { RecordActionButton } = await load(
  "components/events/RecordActionButton.js",
);

const sourceRevision = "atlas-events-ui-r1";
const canonicalSiteOrigins = { "equal-love": "https://mypick.example" };

function evidence(overrides = {}) {
  return {
    verificationStatus: "verified",
    sourceUrls: ["https://example.com/source"],
    coverage: { included: 1, total: 1 },
    excluded: [],
    unresolved: [],
    ...overrides,
  };
}

function songReference(siteId, localId, title) {
  return {
    entityId: identity.createSongEntityId(siteId, localId),
    sourceRevision,
    fallback: {
      groupName: "＝LOVE",
      title,
      date: "2026-06-20",
      venueName: null,
    },
  };
}

function emptyGroup(siteId) {
  return {
    id: identity.createGroupEntityId(siteId, siteId),
    siteId,
    displayName: siteId,
    events: [],
  };
}

function acceptedProjectionFixture() {
  const eventLocalId = "festival-2026";
  const daySong = songReference("equal-love", "song-one", "Song One");
  const equalLove = {
    id: identity.createGroupEntityId("equal-love", "equal-love"),
    siteId: "equal-love",
    displayName: "＝LOVE",
    events: [
      {
        id: identity.createEventEntityId("equal-love", "tokyo-dome-2027"),
        displayName: "Tokyo Dome 2027",
        venue: { displayName: "Tokyo Dome" },
        dates: { start: "2027-01-01", end: "2027-01-01" },
        timezone: "Asia/Tokyo",
        lifecycle: "scheduled",
        performances: [],
        ...evidence({
          verificationStatus: "partial",
          sourceUrls: ["https://example.com/tokyo-dome"],
          coverage: { included: 0, total: 1 },
          excluded: [
            {
              kind: "performance",
              sourceId: "tokyo-dome-2027",
              reason: "No public performance record was accepted.",
            },
          ],
          unresolved: [
            {
              kind: "source",
              sourceValue: "official schedule",
              reason: "Publication authority remains unresolved.",
            },
          ],
        }),
      },
      {
        id: identity.createEventEntityId("equal-love", eventLocalId),
        displayName: "Festival 2026",
        venue: { displayName: "Example Hall" },
        dates: { start: "2026-06-20", end: "2026-06-21" },
        timezone: "Asia/Tokyo",
        lifecycle: "completed",
        performances: [
          {
            id: identity.createPerformanceEntityId(
              "equal-love",
              eventLocalId,
              "day",
            ),
            displayName: "Day",
            venue: { displayName: "Example Hall" },
            date: "2026-06-20",
            startAt: "2026-06-20T08:30:00.000Z",
            timezone: "Asia/Tokyo",
            lifecycle: "completed",
            setlist: [
              { order: 1, songRef: daySong },
              { order: 2, songRef: daySong },
            ],
            ...evidence(),
          },
          {
            id: identity.createPerformanceEntityId(
              "equal-love",
              eventLocalId,
              "night",
            ),
            displayName: "Night",
            venue: { displayName: "Example Hall" },
            date: "2026-06-21",
            timezone: "Asia/Tokyo",
            lifecycle: "completed",
            setlist: [],
            ...evidence({
              verificationStatus: "partial",
              coverage: { included: 0, total: 1 },
              unresolved: [
                {
                  kind: "song",
                  sourceValue: "setlist",
                  reason: "No accepted song list is available.",
                },
              ],
            }),
          },
        ],
        ...evidence(),
      },
    ],
  };
  const groups = [
    equalLove,
    emptyGroup("nearly-equal-joy"),
    emptyGroup("not-equal-me"),
  ];

  return {
    schemaVersion: 1,
    sourceCommit: "a".repeat(40),
    sourceRevision,
    groupCounts: {
      "equal-love": { events: 2, performances: 2, setlistEntries: 2 },
      "nearly-equal-joy": { events: 0, performances: 0, setlistEntries: 0 },
      "not-equal-me": { events: 0, performances: 0, setlistEntries: 0 },
    },
    artifactHash: `sha256:${"b".repeat(64)}`,
    groups,
  };
}

function parsedFixture() {
  const raw = JSON.stringify(acceptedProjectionFixture());
  const result = projectionContract.parsePublicAtlasProjection(raw);
  assert.equal(result.status, "valid");
  return result.value;
}

function findFixtureRecords(projection) {
  const eventsForEqualLove = projection.groups[0].events;
  const tokyoDome = eventsForEqualLove.find(
    (event) => event.displayName === "Tokyo Dome 2027",
  );
  const festival = eventsForEqualLove.find(
    (event) => event.displayName === "Festival 2026",
  );
  assert.ok(tokyoDome);
  assert.ok(festival);

  const day = festival.performances.find(
    (performance) => performance.displayName === "Day",
  );
  const night = festival.performances.find(
    (performance) => performance.displayName === "Night",
  );
  assert.ok(day);
  assert.ok(night);
  return { day, festival, night, tokyoDome };
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function walkTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    paths.push(entryPath);
    if (entry.isDirectory()) {
      paths.push(...(await walkTree(entryPath)));
    }
  }
  return paths;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertIdReferenceTargets(markup) {
  const identifiers = new Set(
    [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]),
  );
  const references = [...markup.matchAll(/\saria-labelledby="([^"]+)"/g)].map(
    (match) => match[1],
  );

  for (const reference of references) {
    assert.ok(identifiers.has(reference), `missing IDREF target: ${reference}`);
  }
}

function headingPattern(level, id) {
  return new RegExp(`<h${level}[^>]*id="${escapeRegularExpression(id)}"`);
}

function contrastRatio(foreground, background) {
  const channelToLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) =>
      channelToLinear(Number.parseInt(hex.slice(offset, offset + 2), 16)),
    );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("maps only C0-accepted projection shapes without changing their evidence", () => {
  const projection = parsedFixture();
  const before = JSON.stringify(projection);
  const summaries = events.mapEventList(projection);
  const { tokyoDome } = findFixtureRecords(projection);
  const tokyoDomeSummary = summaries.find(
    (event) => event.eventId === tokyoDome.id,
  );

  assert.ok(tokyoDomeSummary);
  assert.equal(tokyoDomeSummary.isEventOnly, true);
  assert.equal(tokyoDomeSummary.performanceCount, 0);
  assert.equal(tokyoDomeSummary.timezone, "Asia/Tokyo");
  assert.deepEqual(tokyoDomeSummary.evidence.coverage, {
    included: 0,
    total: 1,
  });
  assert.equal(tokyoDomeSummary.evidence.unresolved.length, 1);
  assert.equal(tokyoDomeSummary.recordAction.kind, "record-event");

  const detail = events.mapEventDetail(projection, tokyoDomeSummary.eventId);
  assert.ok(detail);
  assert.equal(detail.isEventOnly, true);
  assert.deepEqual(detail.performances, []);
  assert.equal(JSON.stringify(projection), before);
});

test("keeps a missing setlist empty and exposes its coverage and unresolved state", () => {
  const projection = parsedFixture();
  const { night } = findFixtureRecords(projection);
  const detail = events.mapPerformanceDetail(projection, night.id);

  assert.ok(detail);
  assert.equal(detail.isSetlistAvailable, false);
  assert.deepEqual(detail.setlist, []);
  assert.deepEqual(detail.evidence.coverage, { included: 0, total: 1 });
  assert.equal(detail.evidence.unresolved.length, 1);
  assert.equal(detail.recordAction.kind, "record-performance");
  assert.equal(detail.recordAction.officialStartAt, null);
  assert.equal(detail.recordAction.timezone, "Asia/Tokyo");
});

test("uses official startAt only for in-person performance records", () => {
  const projection = parsedFixture();
  const { day, night } = findFixtureRecords(projection);
  const dayAction = events.mapPerformanceDetail(
    projection,
    day.id,
  ).recordAction;
  const nightAction = events.mapPerformanceDetail(
    projection,
    night.id,
  ).recordAction;

  assert.equal(dayAction.kind, "record-performance");
  assert.equal(dayAction.officialStartAt, "2026-06-20T08:30:00.000Z");
  assert.equal(dayAction.timezone, "Asia/Tokyo");
  assert.deepEqual(
    recordTime.resolvePerformanceOccurredAt(dayAction, "in-person", ""),
    {
      status: "resolved",
      occurredAt: "2026-06-20T08:30:00.000Z",
      source: "official",
    },
  );
  assert.deepEqual(
    recordTime.resolvePerformanceOccurredAt(
      dayAction,
      "in-person",
      "2030-01-01T00:00",
    ),
    {
      status: "resolved",
      occurredAt: "2026-06-20T08:30:00.000Z",
      source: "official",
    },
  );

  for (const mode of ["livestream", "archive"]) {
    assert.deepEqual(
      recordTime.resolvePerformanceOccurredAt(dayAction, mode, ""),
      { status: "invalid-personal-time" },
    );
    const personalOccurredAt = "2026-06-20T12:00";
    assert.deepEqual(
      recordTime.resolvePerformanceOccurredAt(
        dayAction,
        mode,
        personalOccurredAt,
      ),
      {
        status: "resolved",
        occurredAt: new Date(personalOccurredAt).toISOString(),
        source: "personal",
      },
    );
  }

  assert.equal(nightAction.kind, "record-performance");
  assert.deepEqual(
    recordTime.resolvePerformanceOccurredAt(nightAction, "in-person", ""),
    { status: "invalid-personal-time" },
  );
  assert.deepEqual(
    recordTime.resolvePerformanceOccurredAt(
      nightAction,
      "in-person",
      "not-a-time",
    ),
    { status: "invalid-personal-time" },
  );
  const explicitMissingStartAtTime = "2026-06-21T18:30";
  assert.deepEqual(
    recordTime.resolvePerformanceOccurredAt(
      nightAction,
      "in-person",
      explicitMissingStartAtTime,
    ),
    {
      status: "resolved",
      occurredAt: new Date(explicitMissingStartAtTime).toISOString(),
      source: "personal",
    },
  );
});

test("fails closed for canonical song links without one exact policy-bound mapping", () => {
  const projection = parsedFixture();
  const { day } = findFixtureRecords(projection);
  const songReference = day.setlist[0].songRef;
  const exactMapping = {
    entityId: songReference.entityId,
    sourceRevision: songReference.sourceRevision,
    canonicalHref: "https://mypick.example/songs/song-one/",
  };
  const mappedHref = (canonicalSongLinks, canonicalSongSiteOrigins) => {
    const detail = events.mapPerformanceDetail(projection, day.id, {
      canonicalSongLinks,
      canonicalSongSiteOrigins,
    });
    assert.ok(detail);
    return detail.setlist[0].canonicalSongHref;
  };

  assert.equal(
    mappedHref([exactMapping], canonicalSiteOrigins),
    exactMapping.canonicalHref,
  );
  assert.equal(mappedHref([exactMapping]), null);
  assert.equal(
    mappedHref([exactMapping], { "equal-love": "https://foreign.example" }),
    null,
  );
  assert.equal(
    mappedHref([exactMapping], {
      "equal-love": "https://mypick.example/policy",
    }),
    null,
  );
  assert.equal(
    mappedHref(
      [{ ...exactMapping, sourceRevision: "older-revision" }],
      canonicalSiteOrigins,
    ),
    null,
  );

  for (const canonicalHref of [
    "https://user:secret@mypick.example/songs/song-one/",
    "https://foreign.example/songs/song-one/",
    "https://mypick.example/songs/song-one/?source=atlas",
    "https://mypick.example/songs/song-one/#details",
    "https://mypick.example/songs/another-song/",
    "https://mypick.example/songs/song-one",
    "http://mypick.example/songs/song-one/",
  ]) {
    assert.equal(
      mappedHref([{ ...exactMapping, canonicalHref }], canonicalSiteOrigins),
      null,
      canonicalHref,
    );
  }

  assert.equal(
    mappedHref(
      [
        exactMapping,
        {
          ...exactMapping,
          canonicalHref: "https://mypick.example/songs/song-one/",
        },
      ],
      canonicalSiteOrigins,
    ),
    null,
  );
  assert.equal(
    mappedHref(
      [exactMapping, { ...exactMapping, sourceRevision: "older-revision" }],
      canonicalSiteOrigins,
    ),
    null,
  );
});

test("resolves an exact-revision Event reference for Memory and fails closed when stale", () => {
  const projection = parsedFixture();
  const { tokyoDome } = findFixtureRecords(projection);
  const reference = events.mapEventDetail(projection, tokyoDome.id).recordAction
    .reference;
  const options = {
    canonicalEventLinks: [
      {
        entityId: tokyoDome.id,
        sourceRevision,
        canonicalHref: "https://mypick.example/live/tokyo-dome-2027/",
      },
    ],
    canonicalSongSiteOrigins: canonicalSiteOrigins,
    groupNames: { "equal-love": "=LOVE" },
  };
  const resolved = events.resolveStaticPublicReference(
    projection,
    reference,
    options,
  );
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.groupName, "=LOVE");
  assert.equal(resolved.event.name, "Tokyo Dome 2027");
  assert.equal(resolved.performance, null);
  assert.equal(
    resolved.canonicalEventHref,
    "https://mypick.example/live/tokyo-dome-2027/",
  );
  assert.equal(
    events.resolveStaticPublicReference(
      projection,
      { ...reference, sourceRevision: "older-revision" },
      options,
    ).status,
    "stale",
  );
});

test("supplies complete localized lifecycle and evidence-kind labels", () => {
  assert.deepEqual(messages.EVENTS_LOCALES, ["zh-CN", "en", "ja", "ko"]);
  for (const locale of messages.EVENTS_LOCALES) {
    const catalog = messages.getEventsMessages(locale);
    for (const key of [
      "events",
      "recordEvent",
      "recordPerformance",
      "eventOnlyDescription",
      "noSetlist",
      "coverage",
      "unresolved",
      "noCanonicalSongLink",
      "lifecycleScheduled",
      "lifecyclePostponed",
      "lifecycleCancelled",
      "lifecycleCompleted",
      "lifecycleUnknown",
      "excludedKindEvent",
      "excludedKindPerformance",
      "excludedKindSetlistEntry",
      "unresolvedKindVenue",
      "unresolvedKindSong",
      "unresolvedKindSource",
    ]) {
      assert.equal(typeof catalog[key], "string", `${locale}:${key}`);
      assert.notEqual(catalog[key], "", `${locale}:${key}`);
    }
    assert.equal(
      messages.getLifecycleLabel(catalog, "scheduled"),
      catalog.lifecycleScheduled,
    );
    assert.equal(
      messages.getExcludedKindLabel(catalog, "performance"),
      catalog.excludedKindPerformance,
    );
    assert.equal(
      messages.getUnresolvedKindLabel(catalog, "source"),
      catalog.unresolvedKindSource,
    );
  }
});

test("renders C0 states and localized fields in all four locales", () => {
  const projection = parsedFixture();
  const summaries = events.mapEventList(projection);
  const { day, festival, night, tokyoDome } = findFixtureRecords(projection);
  const festivalDetail = events.mapEventDetail(projection, festival.id);
  const eventOnlyDetail = events.mapEventDetail(projection, tokyoDome.id);
  const dayDetail = events.mapPerformanceDetail(projection, day.id);
  const nightDetail = events.mapPerformanceDetail(projection, night.id);
  assert.ok(festivalDetail);
  assert.ok(eventOnlyDetail);
  assert.ok(dayDetail);
  assert.ok(nightDetail);

  const receivedActions = [];
  const onRecord = (action) => receivedActions.push(action);

  for (const locale of messages.EVENTS_LOCALES) {
    const catalog = messages.getEventsMessages(locale);
    const listMarkup = renderToStaticMarkup(
      react.createElement(EventsList, { events: summaries, locale, onRecord }),
    );
    const festivalMarkup = renderToStaticMarkup(
      react.createElement(EventDetail, {
        event: festivalDetail,
        locale,
        onRecord,
      }),
    );
    const eventOnlyMarkup = renderToStaticMarkup(
      react.createElement(EventDetail, {
        event: eventOnlyDetail,
        locale,
        onRecord,
      }),
    );
    const dayMarkup = renderToStaticMarkup(
      react.createElement(PerformanceDetail, {
        performance: dayDetail,
        locale,
        onRecord,
      }),
    );
    const nightMarkup = renderToStaticMarkup(
      react.createElement(PerformanceDetail, {
        performance: nightDetail,
        locale,
        onRecord,
      }),
    );

    assert.match(listMarkup, /data-events-evidence/);
    assert.match(listMarkup, /Asia\/Tokyo/);
    assert.ok(listMarkup.includes(catalog.lifecycleScheduled), locale);
    assert.match(listMarkup, /data-record-action="record-event"/);
    assert.ok(festivalMarkup.includes(catalog.lifecycleCompleted), locale);
    assert.match(festivalMarkup, /Asia\/Tokyo/);
    assert.ok(
      eventOnlyMarkup.includes(catalog.excludedKindPerformance),
      locale,
    );
    assert.ok(eventOnlyMarkup.includes(catalog.unresolvedKindSource), locale);
    assert.doesNotMatch(eventOnlyMarkup, /performance: tokyo-dome-2027/);
    assert.doesNotMatch(eventOnlyMarkup, /source: official schedule/);
    assert.match(eventOnlyMarkup, /data-event-only/);
    assert.ok(dayMarkup.includes("Song One"), locale);
    assert.ok(dayMarkup.includes(dayDetail.eventDateRange), locale);
    assert.match(nightMarkup, /data-setlist-empty/);
    assert.ok(nightMarkup.includes(catalog.unresolvedKindSong), locale);
    assert.ok(nightMarkup.includes(catalog.noSetlist), locale);
  }

  const actionTree = RecordActionButton({
    action: eventOnlyDetail.recordAction,
    messages: messages.getEventsMessages("en"),
    onRecord,
  });
  const [recordButton] = react.Children.toArray(actionTree.props.children);
  assert.equal(recordButton.props.type, "button");
  recordButton.props.onClick();
  assert.deepEqual(receivedActions, [eventOnlyDetail.recordAction]);
});

test("uses contextual evidence heading depth and resolves every aria-labelledby IDREF", () => {
  const projection = parsedFixture();
  const summaries = events.mapEventList(projection);
  const { day, festival } = findFixtureRecords(projection);
  const festivalDetail = events.mapEventDetail(projection, festival.id);
  const dayDetail = events.mapPerformanceDetail(projection, day.id);
  assert.ok(festivalDetail);
  assert.ok(dayDetail);

  const listMarkup = renderToStaticMarkup(
    react.createElement(EventsList, { events: summaries, locale: "en" }),
  );
  const eventMarkup = renderToStaticMarkup(
    react.createElement(EventDetail, { event: festivalDetail, locale: "en" }),
  );
  const performanceMarkup = renderToStaticMarkup(
    react.createElement(PerformanceDetail, {
      performance: dayDetail,
      locale: "en",
    }),
  );

  const listEvidenceId = `event-summary-${festival.id}-evidence`;
  const eventEvidenceId = `event-detail-${festival.id}-evidence`;
  const nestedEvidenceId = `performance-summary-${day.id}-evidence`;
  const performanceEvidenceId = `performance-detail-${day.id}-evidence`;
  assert.match(listMarkup, headingPattern(3, listEvidenceId));
  assert.match(listMarkup, headingPattern(4, `${listEvidenceId}-sources`));
  assert.match(eventMarkup, headingPattern(2, eventEvidenceId));
  assert.match(eventMarkup, headingPattern(3, `${eventEvidenceId}-sources`));
  assert.match(eventMarkup, headingPattern(4, nestedEvidenceId));
  assert.match(eventMarkup, headingPattern(5, `${nestedEvidenceId}-sources`));
  assert.match(performanceMarkup, headingPattern(2, performanceEvidenceId));
  assert.match(
    performanceMarkup,
    headingPattern(3, `${performanceEvidenceId}-sources`),
  );

  assertIdReferenceTargets(listMarkup);
  assertIdReferenceTargets(eventMarkup);
  assertIdReferenceTargets(performanceMarkup);
});

test("renders repeated accepted song references at distinct orders without key warnings", () => {
  const projection = parsedFixture();
  const { day } = findFixtureRecords(projection);
  const dayDetail = events.mapPerformanceDetail(projection, day.id);
  assert.ok(dayDetail);
  assert.equal(dayDetail.setlist.length, 2);
  assert.deepEqual(
    dayDetail.setlist.map((song) => song.order),
    [1, 2],
  );

  const originalConsoleError = console.error;
  const consoleErrors = [];
  console.error = (...values) => {
    consoleErrors.push(values.map(String).join(" "));
  };
  try {
    const markup = renderToStaticMarkup(
      react.createElement(PerformanceDetail, {
        performance: dayDetail,
        locale: "en",
      }),
    );
    assert.equal((markup.match(/Song One/g) ?? []).length, 2);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(
    consoleErrors.filter((message) => /unique[\s\S]*key/i.test(message)).length,
    0,
  );
});

test("wires static Event routes from strict generated artifacts and keeps one Journey writer", async () => {
  for (const route of [
    "app/events/page.tsx",
    "app/events/[siteId]/[eventLocalId]/page.tsx",
    "app/events/[siteId]/[eventLocalId]/[performanceLocalId]/page.tsx",
  ]) {
    assert.equal(await exists(join(sourceRoot, route)), true, route);
  }
  for (const artifact of [
    "generated/public-atlas-projection.v1.json",
    "generated/canonical-mypick-links.v1.json",
  ]) {
    assert.equal(await exists(join(sourceRoot, artifact)), true, artifact);
  }

  const reader = await readFile(
    join(sourceRoot, "adapters/generated-public-projection-reader.ts"),
    "utf8",
  );
  assert.match(reader, /parsePublicAtlasProjection/);
  assert.doesNotMatch(reader, /live-experiences\.json/);

  const canonicalLinks = await readFile(
    join(sourceRoot, "config/canonical-mypick-links.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    canonicalLinks,
    /live-experiences\.json|projects\/registry|songRoutes|\bPROJECTS\b/,
  );

  const recordForm = await readFile(
    join(sourceRoot, "components/events/EventRecordForm.tsx"),
    "utf8",
  );
  assert.doesNotMatch(recordForm, /localStorage|sessionStorage/);
  assert.match(recordForm, /createBrowserJourneyRepository/);
  assert.match(recordForm, /recordPublicExperience/);
  assert.match(recordForm, /recordPublicEventIntent/);

  const recorder = await readFile(
    join(sourceRoot, "features/events/public-experience-recorder.ts"),
    "utf8",
  );
  assert.equal(
    (recorder.match(/repository\.compareAndWrite/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(recorder, /localStorage|sessionStorage/);
  assert.doesNotMatch(recorder, /\b(?:Mock|Demo)\b/);
});

test("performance recording owns its native-control geometry and keeps the moment optional", async () => {
  const recordForm = await readFile(
    join(sourceRoot, "components/events/EventRecordForm.tsx"),
    "utf8",
  );
  const performancePage = await readFile(
    join(sourceRoot, "components/events/PublicPerformancePage.tsx"),
    "utf8",
  );
  const recordTimeSource = await readFile(
    join(sourceRoot, "features/events/event-record-time.ts"),
    "utf8",
  );
  const controlSource = await readFile(
    join(sourceRoot, "components/journey/JourneyFormControls.tsx"),
    "utf8",
  );
  const controlCss = await readFile(
    join(sourceRoot, "components/journey/journey-ui.module.css"),
    "utf8",
  );
  const globalCss = await readFile(join(sourceRoot, "app/globals.css"), "utf8");

  const directRuleBodies = (className) =>
    [...controlCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) =>
        match[1]
          .split(",")
          .some((selector) => selector.trim() === `.${className}`),
      )
      .map((match) => match[2])
      .join("\n");

  assert.match(controlSource, /styles\.nativeControl/);
  assert.match(controlSource, /styles\.temporalControl/);
  for (const className of ["nativeControl", "temporalControl"]) {
    const rules = directRuleBodies(className);
    assert.match(rules, /min-height:\s*2\.75rem/);
    assert.match(rules, /border-radius:\s*var\(--atlas-radius-sm\)/);
    assert.match(rules, /padding:\s*0\.6rem 0\.7rem/);
    assert.match(rules, /background:\s*var\(--atlas-surface\)/);
  }
  assert.doesNotMatch(controlCss, /\.field \.nativeControl/);

  assert.match(recordForm, /noValidate/);
  assert.match(recordForm, /resolvePerformanceOccurredAt/);
  assert.match(recordForm, /usesOfficialPerformanceStart/);
  assert.match(recordForm, /<time dateTime=/);
  assert.match(recordForm, /messages\.officialStartTimeHint/);
  assert.match(
    recordForm,
    /onChange=\{\(event\) => \{[\s\S]*?setMode\([\s\S]*?setValidationError\(null\);[\s\S]*?\}\}/,
  );
  assert.match(recordTimeSource, /mode === "in-person"/);
  assert.match(recordTimeSource, /action\.officialStartAt !== null/);
  assert.match(recordTimeSource, /Number\.isNaN\(parsed\.getTime\(\)\)/);
  assert.match(recordForm, /messages\.experienceTimeRequired/);
  assert.match(recordForm, /messages\.highlightHint/);
  assert.doesNotMatch(
    recordForm,
    /messages\.highlightRequired|validationError === "highlight"|setValidationError\("highlight"\)/,
  );
  const highlightField = recordForm.slice(
    recordForm.indexOf('className="atlas-event-record__highlight"'),
    recordForm.indexOf('className="atlas-event-record__songs"'),
  );
  assert.doesNotMatch(highlightField, /\brequired\b/);
  assert.ok(
    recordForm.indexOf('setStatus("saving")') >
      recordForm.indexOf('setValidationError("experienceTime")'),
  );
  const optionalMomentLabels = {
    "zh-CN": "最难忘的一刻（选填）",
    en: "One standout moment (optional)",
    ja: "心に残った瞬間（任意）",
    ko: "기억에 남은 순간 (선택 사항)",
  };
  const officialTimeLabels = {
    "zh-CN": ["官方开演时间", "现场记录将使用此场次的官方开演时间。"],
    en: [
      "Official start time",
      "In-person records use this performance’s official start time.",
    ],
    ja: [
      "公式開演時刻",
      "現地参加の記録には、この公演の公式開演時刻を使用します。",
    ],
    ko: [
      "공식 공연 시작 시간",
      "현장 참여 기록에는 이 공연의 공식 시작 시간을 사용합니다.",
    ],
  };
  for (const locale of messages.EVENTS_LOCALES) {
    const catalog = messages.getEventsMessages(locale);
    assert.ok(catalog.experienceTimeRequired.length > 0);
    assert.equal(catalog.officialStartTime, officialTimeLabels[locale][0]);
    assert.equal(catalog.officialStartTimeHint, officialTimeLabels[locale][1]);
    assert.equal(catalog.highlight, optionalMomentLabels[locale]);
    assert.ok(catalog.highlightHint.length > 0);
    assert.notEqual(catalog.experienceTimeRequired, catalog.saveFailed);
  }

  assert.ok(
    performancePage.indexOf("<EventRecordForm") <
      performancePage.indexOf('<details className="atlas-events__setlist">'),
  );
  assert.match(
    globalCss,
    /\.atlas-events__record-hero h1\s*\{[\s\S]*?font-size:\s*clamp\(2rem,\s*5vw,\s*2\.75rem\)/,
  );
  assert.match(
    globalCss,
    /\.atlas-events__setlist summary,[\s\S]*?min-height:\s*2\.75rem/,
  );
  assert.match(
    globalCss,
    /\.atlas-events__primary\s*\{[\s\S]*?border-radius:\s*var\(--atlas-radius-sm\)/,
  );
});

test("records a new public performance and its first experience in one CAS with no partial Journey", async () => {
  const projection = parsedFixture();
  const { day } = findFixtureRecords(projection);
  const reference = events.mapPerformanceDetail(projection, day.id).recordAction
    .reference;
  const writes = [];
  const repository = {
    async read() {
      return { status: "absent" };
    },
    async compareAndWrite(input) {
      writes.push(input);
      return {
        status: "failure",
        stage: "write",
        rawBefore: null,
        error: "quota",
        rollback: { status: "not-required" },
      };
    },
  };

  const result = await recorder.recordPublicExperience(repository, {
    reference,
    journeyId: "public_performance_test",
    entryId: "experience_test",
    mode: "in-person",
    occurredAt: "2026-06-20T09:30:00.000Z",
    highlight: "The opening song",
    songRefs: day.setlist.slice(0, 1).map((entry) => entry.songRef),
    now: "2026-08-27T12:00:00.000Z",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "write-failed");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].expectedRevision, { state: "absent" });
  assert.equal(writes[0].next.revision, 0);
  assert.equal(writes[0].next.journeys.length, 1);
  assert.equal(writes[0].next.journeys[0].experienceEntries.length, 1);
  assert.deepEqual(writes[0].next.journeys[0].experienceEntries[0].highlights, [
    "The opening song",
  ]);
});

test("saves a blank optional moment as zero highlights with no empty string", async () => {
  const projection = parsedFixture();
  const { day } = findFixtureRecords(projection);
  const reference = events.mapPerformanceDetail(projection, day.id).recordAction
    .reference;
  let committedDocument = null;
  const repository = {
    async read() {
      return { status: "absent" };
    },
    async compareAndWrite(input) {
      committedDocument = input.next;
      return {
        status: "committed",
        readback: {
          status: "valid",
          raw: JSON.stringify(input.next),
          value: input.next,
        },
      };
    },
  };

  const result = await recorder.recordPublicExperience(repository, {
    reference,
    journeyId: "public_performance_without_moment",
    entryId: "experience_without_moment",
    mode: "in-person",
    occurredAt: "2026-06-20T09:30:00.000Z",
    highlight: "  \n  ",
    songRefs: [],
    now: "2026-08-27T12:00:00.000Z",
  });

  assert.equal(result.status, "saved");
  assert.deepEqual(
    committedDocument.journeys[0].experienceEntries[0].highlights,
    [],
  );
  assert.equal(
    JSON.stringify(committedDocument).includes('"highlights":[""]'),
    false,
  );
});

test("uses F0 token pairs and narrow-width-safe presentation contracts", async () => {
  const componentDirectory = join(sourceRoot, "components", "events");
  const recordActionSource = await readFile(
    join(componentDirectory, "RecordActionButton.tsx"),
    "utf8",
  );
  const componentFiles = (await walkTree(componentDirectory)).filter(
    (filePath) => filePath.endsWith(".tsx"),
  );
  const source = (
    await Promise.all(
      componentFiles.map((filePath) => readFile(filePath, "utf8")),
    )
  ).join("\n");

  for (const [token, fallback] of [
    ["--atlas-text", "#111827"],
    ["--atlas-text-muted", "#4b5563"],
    ["--atlas-border", "#d1d5db"],
    ["--atlas-surface", "#ffffff"],
  ]) {
    assert.match(
      source,
      new RegExp(`var\\(${escapeRegularExpression(token)}, ${fallback}\\)`),
      token,
    );
  }

  for (const line of source.split("\n")) {
    if (/(?:#111827|#4b5563|#1d4ed8|#3559c7|#d1d5db|#ffffff)/.test(line)) {
      assert.match(line, /var\(--atlas-[a-z-]+, #[0-9a-f]{6}\)/i, line);
    }
  }

  assert.match(
    recordActionSource,
    /background:\s*"var\(--atlas-accent, #3559c7\)"/,
  );
  assert.match(
    recordActionSource,
    /color:\s*"var\(--atlas-on-accent, #ffffff\)"/,
  );
  assert.doesNotMatch(
    recordActionSource,
    /--atlas-action-(?:background|foreground)/,
  );

  const frozenF0AccentPairs = [
    { theme: "light", accent: "#3559c7", onAccent: "#ffffff" },
    { theme: "dark", accent: "#9eb6ff", onAccent: "#172033" },
  ];
  for (const { accent, onAccent, theme } of frozenF0AccentPairs) {
    assert.ok(
      contrastRatio(onAccent, accent) >= 4.5,
      `${theme} F0 accent/on-accent contrast must meet 4.5:1`,
    );
  }

  assert.ok(contrastRatio("#111827", "#ffffff") >= 4.5);
  assert.ok(contrastRatio("#4b5563", "#ffffff") >= 4.5);
  assert.ok(contrastRatio("#1d4ed8", "#ffffff") >= 4.5);
  assert.match(source, /minWidth:\s*0/);
  assert.match(source, /maxWidth:\s*"100%"/);
  assert.match(source, /minHeight:\s*44/);
  assert.match(source, /type="button"/);
});
