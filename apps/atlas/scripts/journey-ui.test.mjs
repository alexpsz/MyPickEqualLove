import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(atlasRoot, "src");
const compiledRoot = await mkdtemp(join(tmpdir(), "atlas-journey-ui-"));

after(async () => {
  await rm(compiledRoot, { recursive: true, force: true });
});

const pureSources = [
  "contracts/strict.ts",
  "contracts/identity.ts",
  "contracts/public-reference.ts",
  "contracts/journey-document.ts",
  "ports/journey-repository.ts",
  "features/journey/journey-controller.ts",
  "i18n/journey/translate.ts",
  "i18n/journey/messages.ts",
];

for (const relativePath of pureSources) {
  const sourcePath = join(sourceRoot, relativePath);
  const outputPath = join(compiledRoot, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");
  const output = typescript.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ES2022,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
    },
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output.outputText, "utf8");
}

const controller = await import(
  `${pathToFileURL(join(compiledRoot, "features/journey/journey-controller.js")).href}?${Date.now()}`
);
const journeyContract = await import(
  `${pathToFileURL(join(compiledRoot, "contracts/journey-document.js")).href}?${Date.now()}`
);
const messages = await import(
  `${pathToFileURL(join(compiledRoot, "i18n/journey/messages.js")).href}?${Date.now()}`
);

function localJourney({
  now = "2026-08-25T01:00:00.000Z",
  intent = "planned",
} = {}) {
  return controller.createLocalCustomJourney(null, {
    journeyId: "journey-alpha",
    localEventId: "local-event-alpha",
    title: "  Private   concert  ",
    date: "2026-08-25",
    venueName: "  Sydney   Hall ",
    intent,
    now,
  });
}

test("creates an exact C0 local Journey at absent revision zero", () => {
  const document = localJourney();
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.revision, 0);
  assert.equal(document.journeys.length, 1);
  assert.deepEqual(document.journeys[0], {
    id: "journey-alpha",
    subject: {
      kind: "local-custom-event",
      localId: "local-event-alpha",
      fallback: {
        title: "Private concert",
        date: "2026-08-25",
        venueName: "Sydney Hall",
      },
    },
    intent: "planned",
    experienceEntries: [],
    createdAt: "2026-08-25T01:00:00.000Z",
    updatedAt: "2026-08-25T01:00:00.000Z",
  });
  assert.equal(
    journeyContract.parseJourneyDocument(JSON.stringify(document)).status,
    "valid",
  );
  assert.deepEqual(controller.expectedJourneyRevision(null), {
    state: "absent",
  });
  assert.deepEqual(controller.expectedJourneyRevision(document), {
    state: "present",
    revision: 0,
  });
});

test("one Journey retains intent while three experience modes coexist", () => {
  let document = localJourney();
  const modes = ["in-person", "livestream", "archive"];
  for (const [index, mode] of modes.entries()) {
    document = controller.addJourneyExperienceEntry(document, "journey-alpha", {
      entryId: `entry-${index + 1}`,
      mode,
      occurredAt: `2026-08-2${index + 5}T0${index + 2}:00:00.000Z`,
      memo: ` memo ${index + 1} `,
      highlights: [" Opening ", "Opening", `Moment ${index + 1}`],
      now: `2026-08-25T01:0${index + 1}:00.000Z`,
    });
  }
  assert.equal(document.revision, 3);
  assert.equal(document.journeys.length, 1);
  assert.equal(document.journeys[0].intent, "planned");
  assert.deepEqual(
    document.journeys[0].experienceEntries.map((entry) => entry.mode),
    modes,
  );
  assert.ok(
    document.journeys[0].experienceEntries.every(
      (entry) => entry.songRefs.length === 0,
    ),
  );
  assert.deepEqual(document.journeys[0].experienceEntries[0].highlights, [
    "Opening",
    "Moment 1",
  ]);
});

test("intent, local details, experience edits, and deletes stay consecutive", () => {
  let document = localJourney();
  document = controller.updateJourneyIntent(
    document,
    "journey-alpha",
    null,
    "2026-08-25T01:01:00.000Z",
  );
  document = controller.updateLocalCustomSubject(document, "journey-alpha", {
    title: "Updated event",
    date: null,
    venueName: null,
    now: "2026-08-25T01:02:00.000Z",
  });
  document = controller.addJourneyExperienceEntry(document, "journey-alpha", {
    entryId: "entry-one",
    mode: "in-person",
    occurredAt: "2026-08-25T01:03:00.000Z",
    memo: "first",
    highlights: [],
    now: "2026-08-25T01:03:00.000Z",
  });
  document = controller.updateJourneyExperienceEntry(
    document,
    "journey-alpha",
    "entry-one",
    {
      mode: "archive",
      occurredAt: "2026-08-25T01:04:00.000Z",
      memo: "edited",
      highlights: ["Encore"],
      now: "2026-08-25T01:04:00.000Z",
    },
  );
  assert.equal(document.revision, 4);
  assert.equal(document.journeys[0].intent, null);
  assert.equal(document.journeys[0].subject.fallback.title, "Updated event");
  assert.equal(document.journeys[0].experienceEntries[0].mode, "archive");
  assert.equal(
    document.journeys[0].experienceEntries[0].createdAt,
    "2026-08-25T01:03:00.000Z",
  );

  document = controller.deleteJourneyExperienceEntry(
    document,
    "journey-alpha",
    "entry-one",
    "2026-08-25T01:05:00.000Z",
  );
  assert.equal(document.revision, 5);
  assert.equal(document.journeys[0].experienceEntries.length, 0);
  document = controller.deleteJourneyRecord(
    document,
    "journey-alpha",
    "2026-08-25T01:06:00.000Z",
  );
  assert.equal(document.revision, 6);
  assert.deepEqual(document.journeys, []);
});

test("timeline ordering prefers the latest real experience then subject date", () => {
  let first = localJourney({ now: "2026-08-25T01:00:00.000Z" });
  first = controller.addJourneyExperienceEntry(first, "journey-alpha", {
    entryId: "entry-one",
    mode: "archive",
    occurredAt: "2026-09-02T10:00:00.000Z",
    memo: "",
    highlights: [],
    now: "2026-08-25T01:01:00.000Z",
  });
  const secondDocument = controller.createLocalCustomJourney(null, {
    journeyId: "journey-beta",
    localEventId: "local-event-beta",
    title: "Later catalog date",
    date: "2026-09-01",
    venueName: null,
    intent: null,
    now: "2026-08-25T01:00:00.000Z",
  });
  const sorted = controller.sortJourneysForTimeline([
    secondDocument.journeys[0],
    first.journeys[0],
  ]);
  assert.deepEqual(
    sorted.map((journey) => journey.id),
    ["journey-alpha", "journey-beta"],
  );
});

test("revision bindings reject stale drafts after revision or session invalidation", () => {
  const opened = controller.bindJourneyInteraction(4, 8);
  assert.deepEqual(
    controller.validateJourneyInteractionBinding(
      opened,
      controller.bindJourneyInteraction(4, 8),
    ),
    { ok: true },
  );
  assert.deepEqual(
    controller.validateJourneyInteractionBinding(
      opened,
      controller.bindJourneyInteraction(5, 8),
    ),
    { ok: false, reason: "revision-changed" },
  );
  assert.deepEqual(
    controller.validateJourneyInteractionBinding(
      opened,
      controller.bindJourneyInteraction(4, 9),
    ),
    { ok: false, reason: "session-invalidated" },
  );
  assert.equal(controller.nextJourneyInteractionGeneration(8), 9);
  assert.deepEqual(controller.bindJourneyInteraction(null, 3), {
    revision: null,
    generation: 3,
  });
});

test("restore sessions clear on picker, invalidation, consumption, and repeat apply", () => {
  const opened = controller.bindJourneyInteraction(2, 5);
  const ready = controller.stageJourneyRestorePlan(opened, {
    expectedRevision: 2,
  });

  const consumed = controller.consumeJourneyRestorePlan(ready, opened);
  assert.equal(consumed.status, "consumed");
  assert.deepEqual(consumed.plan, { expectedRevision: 2 });
  assert.deepEqual(consumed.next, { status: "idle" });
  assert.equal(
    controller.consumeJourneyRestorePlan(consumed.next, opened).status,
    "empty",
    "a consumed plan cannot be applied twice",
  );

  const revisionChanged = controller.consumeJourneyRestorePlan(
    ready,
    controller.bindJourneyInteraction(3, 5),
  );
  assert.equal(revisionChanged.status, "stale");
  assert.deepEqual(revisionChanged.next, { status: "idle" });

  const sessionInvalidated = controller.consumeJourneyRestorePlan(
    ready,
    controller.bindJourneyInteraction(2, 6),
  );
  assert.equal(sessionInvalidated.status, "stale");
  assert.deepEqual(sessionInvalidated.next, { status: "idle" });
  assert.deepEqual(controller.clearJourneyRestorePlan(), { status: "idle" });
});

test("four Journey catalogs are exact, non-empty, and placeholder-compatible", () => {
  const locales = ["zh-CN", "en", "ja", "ko"];
  const englishKeys = Object.keys(messages.JOURNEY_MESSAGES.en).sort();
  for (const locale of locales) {
    assert.deepEqual(
      Object.keys(messages.JOURNEY_MESSAGES[locale]).sort(),
      englishKeys,
      `${locale} key drift`,
    );
    for (const [key, value] of Object.entries(
      messages.JOURNEY_MESSAGES[locale],
    )) {
      assert.ok(value.trim().length > 0, `${locale}.${key} is blank`);
      const enPlaceholders = [
        ...messages.JOURNEY_MESSAGES.en[key].matchAll(/\{([^}]+)\}/g),
      ]
        .map((match) => match[1])
        .sort();
      const placeholders = [...value.matchAll(/\{([^}]+)\}/g)]
        .map((match) => match[1])
        .sort();
      assert.deepEqual(
        placeholders,
        enPlaceholders,
        `${locale}.${key} placeholders`,
      );
    }
  }
});

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else files.push(path);
  }
  return files;
}

test("production U2 code delegates personal storage handling to P1", async () => {
  const roots = [
    join(sourceRoot, "app/journey"),
    join(sourceRoot, "app/local-event"),
    join(sourceRoot, "components/journey"),
    join(sourceRoot, "features/journey"),
    join(sourceRoot, "i18n/journey"),
  ];
  const files = (await Promise.all(roots.map(collectFiles))).flat();
  const source = (
    await Promise.all(files.map((path) => readFile(path, "utf8")))
  ).join("\n");
  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /mypick/i);
  assert.match(source, /createBrowserJourneyRepository/);
  assert.match(source, /handleStorageEvent/);
  assert.match(source, /addEventListener\("storage"/);
  assert.match(source, /removeEventListener\("storage"/);
  assert.match(source, /deleteAll/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});

test("private records use only fixed static routes with no personal id segment", async () => {
  const journeyPage = await readFile(
    join(sourceRoot, "app/journey/page.tsx"),
    "utf8",
  );
  const localPage = await readFile(
    join(sourceRoot, "app/local-event/page.tsx"),
    "utf8",
  );
  assert.match(journeyPage, /index:\s*false/);
  assert.match(localPage, /index:\s*false/);
  assert.equal(
    relative(sourceRoot, join(sourceRoot, "app/journey/page.tsx")).replaceAll(
      "\\",
      "/",
    ),
    "app/journey/page.tsx",
  );
  assert.equal(
    relative(
      sourceRoot,
      join(sourceRoot, "app/local-event/page.tsx"),
    ).replaceAll("\\", "/"),
    "app/local-event/page.tsx",
  );
  const routeFiles = await collectFiles(join(sourceRoot, "app"));
  assert.equal(
    routeFiles.filter((path) => /(?:journey|local-event).*\[.+\]/.test(path))
      .length,
    0,
  );
});

test("restore import fails closed while repository-owned capacity API is pending", async () => {
  const source = await readFile(
    join(sourceRoot, "components/journey/JourneyBackupPanel.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /navigator\.storage\.estimate/);
  assert.doesNotMatch(source, /file\.text\(\)/);
  assert.doesNotMatch(source, /dryRunAtlasBackupRestore/);
  assert.doesNotMatch(source, /applyReplacePlan/);
  assert.match(source, /restoreCapacityPendingTitle/);
  assert.match(source, /disabled\s*\n\s*type="file"/);
});

test("UI names every fail-closed state and remains keyboard/mobile bounded", async () => {
  const english = messages.JOURNEY_MESSAGES.en;
  for (const key of [
    "readCorruptTitle",
    "readFutureTitle",
    "importCapacity",
    "conflictTitle",
    "stageRead",
    "stageWrite",
    "stageReadback",
    "rollbackRestored",
    "rollbackFailed",
  ]) {
    assert.ok(english[key].length > 0, key);
  }
  const css = await readFile(
    join(sourceRoot, "components/journey/journey-ui.module.css"),
    "utf8",
  );
  const confirmations = await readFile(
    join(sourceRoot, "components/journey/InlineConfirmation.tsx"),
    "utf8",
  );
  assert.match(css, /@media \(max-width: 25rem\)/);
  assert.match(css, /min-height: 2\.75rem/);
  assert.match(css, /:focus-visible/);
  assert.match(confirmations, /confirmRef\.current\?\.focus\(\)/);
  assert.match(confirmations, /type="button"/);
  const frame = await readFile(
    join(sourceRoot, "components/journey/JourneyPageFrame.tsx"),
    "utf8",
  );
  assert.match(frame, /aria-current=/);
  assert.doesNotMatch(frame, /<main/);
});
