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
      );
    await writeFile(outputPath, output, "utf8");
  }
}

for (const sourceDirectory of [
  "components/events",
  "contracts",
  "features/events",
  "i18n/events",
]) {
  await compileDirectory(sourceDirectory);
}

async function load(relativePath) {
  return import(pathToFileURL(join(compiledRoot, relativePath)).href);
}

const identity = await load("contracts/identity.js");
const projectionContract = await load("contracts/public-atlas-projection.js");
const events = await load("features/events/event-presentation.js");
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
            timezone: "Asia/Tokyo",
            lifecycle: "completed",
            setlist: [
              {
                order: 1,
                songRef: songReference("equal-love", "song-one", "Song One"),
              },
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
      "equal-love": { events: 2, performances: 2, setlistEntries: 1 },
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

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test("maps only C0-accepted projection shapes without changing their evidence", () => {
  const projection = parsedFixture();
  const before = JSON.stringify(projection);
  const summaries = events.mapEventList(projection);
  const tokyoDome = summaries.find(
    (event) => event.eventName === "Tokyo Dome 2027",
  );

  assert.ok(tokyoDome);
  assert.equal(tokyoDome.isEventOnly, true);
  assert.equal(tokyoDome.performanceCount, 0);
  assert.deepEqual(tokyoDome.evidence.coverage, { included: 0, total: 1 });
  assert.equal(tokyoDome.evidence.unresolved.length, 1);
  assert.equal(tokyoDome.recordAction.kind, "record-event");

  const detail = events.mapEventDetail(projection, tokyoDome.eventId);
  assert.ok(detail);
  assert.equal(detail.isEventOnly, true);
  assert.deepEqual(detail.performances, []);
  assert.equal(JSON.stringify(projection), before);
});

test("keeps a missing setlist empty and exposes its coverage and unresolved state", () => {
  const projection = parsedFixture();
  const festival = projection.groups[0].events.find(
    (event) => event.displayName === "Festival 2026",
  );
  assert.ok(festival);
  const night = festival.performances.find(
    (performance) => performance.displayName === "Night",
  );
  assert.ok(night);

  const detail = events.mapPerformanceDetail(projection, night.id);
  assert.ok(detail);
  assert.equal(detail.isSetlistAvailable, false);
  assert.deepEqual(detail.setlist, []);
  assert.deepEqual(detail.evidence.coverage, { included: 0, total: 1 });
  assert.equal(detail.evidence.unresolved.length, 1);
  assert.equal(detail.recordAction.kind, "record-performance");
});

test("uses a song deep link only for one exact caller-supplied canonical mapping", () => {
  const projection = parsedFixture();
  const festival = projection.groups[0].events.find(
    (event) => event.displayName === "Festival 2026",
  );
  assert.ok(festival);
  const day = festival.performances.find(
    (performance) => performance.displayName === "Day",
  );
  assert.ok(day);
  const songReference = day.setlist[0].songRef;
  const exactMapping = {
    entityId: songReference.entityId,
    sourceRevision: songReference.sourceRevision,
    canonicalHref: "https://mypick.example/songs/song-one/",
  };

  const exact = events.mapPerformanceDetail(projection, day.id, {
    canonicalSongLinks: [exactMapping],
  });
  assert.ok(exact);
  assert.equal(
    exact.setlist[0].canonicalSongHref,
    "https://mypick.example/songs/song-one/",
  );

  const wrongRevision = events.mapPerformanceDetail(projection, day.id, {
    canonicalSongLinks: [{ ...exactMapping, sourceRevision: "older-revision" }],
  });
  assert.ok(wrongRevision);
  assert.equal(wrongRevision.setlist[0].canonicalSongHref, null);

  const ambiguous = events.mapPerformanceDetail(projection, day.id, {
    canonicalSongLinks: [
      exactMapping,
      { ...exactMapping, canonicalHref: "https://mypick.example/songs/other/" },
    ],
  });
  assert.ok(ambiguous);
  assert.equal(ambiguous.setlist[0].canonicalSongHref, null);
});

test("supplies complete zh-CN, en, ja, and ko event copy", () => {
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
    ]) {
      assert.equal(typeof catalog[key], "string", `${locale}:${key}`);
      assert.notEqual(catalog[key], "", `${locale}:${key}`);
    }
  }
});

test("renders C0 evidence, true empty states, and an injectable record action", () => {
  const projection = parsedFixture();
  const summaries = events.mapEventList(projection);
  const tokyoDome = summaries.find(
    (event) => event.eventName === "Tokyo Dome 2027",
  );
  assert.ok(tokyoDome);
  const festival = projection.groups[0].events.find(
    (event) => event.displayName === "Festival 2026",
  );
  assert.ok(festival);
  const night = festival.performances.find(
    (performance) => performance.displayName === "Night",
  );
  assert.ok(night);

  const receivedActions = [];
  const onRecord = (action) => receivedActions.push(action);
  const eventDetail = events.mapEventDetail(projection, tokyoDome.eventId);
  const nightDetail = events.mapPerformanceDetail(projection, night.id);
  assert.ok(eventDetail);
  assert.ok(nightDetail);

  const listMarkup = renderToStaticMarkup(
    react.createElement(EventsList, {
      events: summaries,
      locale: "en",
      onRecord,
    }),
  );
  const eventMarkup = renderToStaticMarkup(
    react.createElement(EventDetail, {
      event: eventDetail,
      locale: "en",
      onRecord,
    }),
  );
  const performanceMarkup = renderToStaticMarkup(
    react.createElement(PerformanceDetail, {
      performance: nightDetail,
      locale: "en",
      onRecord,
    }),
  );

  assert.match(listMarkup, /data-events-evidence/);
  assert.match(listMarkup, /data-coverage/);
  assert.match(listMarkup, /data-unresolved-items/);
  assert.match(listMarkup, /data-record-action="record-event"/);
  assert.match(eventMarkup, /data-event-only/);
  assert.match(eventMarkup, /This event explicitly has zero performances/);
  assert.match(performanceMarkup, /data-setlist-empty/);
  assert.match(performanceMarkup, /No public setlist is available/);

  const actionTree = RecordActionButton({
    action: tokyoDome.recordAction,
    messages: messages.getEventsMessages("en"),
    onRecord,
  });
  const [recordButton] = react.Children.toArray(actionTree.props.children);
  assert.equal(recordButton.props.type, "button");
  recordButton.props.onClick();
  assert.deepEqual(receivedActions, [tokyoDome.recordAction]);
});

test("holds routes, generated artifacts, navigation, and persistence outside E2", async () => {
  const componentDirectory = join(sourceRoot, "components", "events");
  const featureDirectory = join(sourceRoot, "features", "events");
  const i18nDirectory = join(sourceRoot, "i18n", "events");
  const files = [
    ...(await readdir(componentDirectory)).map((fileName) =>
      join(componentDirectory, fileName),
    ),
    ...(await readdir(featureDirectory)).map((fileName) =>
      join(featureDirectory, fileName),
    ),
    ...(await readdir(i18nDirectory)).map((fileName) =>
      join(i18nDirectory, fileName),
    ),
  ];
  const source = (
    await Promise.all(files.map((filePath) => readFile(filePath, "utf8")))
  ).join("\n");

  assert.equal(await exists(join(sourceRoot, "app", "events")), false);
  assert.equal(await exists(join(sourceRoot, "app", "performances")), false);
  assert.equal(await exists(join(sourceRoot, "generated")), false);
  assert.doesNotMatch(
    source,
    /\b(?:localStorage|sessionStorage|JourneyRepository|journey-storage)\b/,
  );
  assert.doesNotMatch(source, /\b(?:parsePublicAtlasProjection|JSON\.parse)\b/);
  assert.doesNotMatch(source, /(?:next\/link|next\/navigation|<nav\b)/i);
  assert.doesNotMatch(
    source,
    /(?:sitemap|robots|manifest|src\/generated|\/app\/(?:events|performances))/i,
  );
  assert.doesNotMatch(source, /\b(?:Mock|Demo)\b/);
});

test("keeps detail actions keyboard-ready and evidence structurally visible at narrow widths", async () => {
  const evidenceSource = await readFile(
    join(sourceRoot, "components", "events", "EventEvidence.tsx"),
    "utf8",
  );
  const actionSource = await readFile(
    join(sourceRoot, "components", "events", "RecordActionButton.tsx"),
    "utf8",
  );
  const eventDetailSource = await readFile(
    join(sourceRoot, "components", "events", "EventDetail.tsx"),
    "utf8",
  );
  const performanceDetailSource = await readFile(
    join(sourceRoot, "components", "events", "PerformanceDetail.tsx"),
    "utf8",
  );

  assert.match(evidenceSource, /data-coverage/);
  assert.match(evidenceSource, /data-unresolved-items/);
  assert.match(evidenceSource, /minWidth:\s*0/);
  assert.match(actionSource, /type="button"/);
  assert.match(actionSource, /minHeight:\s*44/);
  assert.match(eventDetailSource, /aria-labelledby/);
  assert.match(eventDetailSource, /data-event-only/);
  assert.match(performanceDetailSource, /data-setlist-empty/);
  assert.match(performanceDetailSource, /data-c0-song-fallback/);
});
