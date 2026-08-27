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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(atlasRoot, "src");
const compiledRoot = await mkdtemp(join(tmpdir(), "atlas-journey-ui-"));
const renderRoot = join(compiledRoot, "render");

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

function makeRelativeEsmImportsExecutable(source) {
  return source.replace(
    /(\bfrom\s+["']|\bimport\s*["'])(\.[^"']+)(["'])/g,
    (statement, prefix, specifier, suffix) =>
      /\.[^/]+$/.test(specifier)
        ? statement
        : `${prefix}${specifier}.js${suffix}`,
  );
}

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
  await writeFile(
    outputPath,
    makeRelativeEsmImportsExecutable(output.outputText),
    "utf8",
  );
}

async function compileRenderModule(relativePath, replacements = []) {
  const sourcePath = join(sourceRoot, relativePath);
  const outputPath = join(renderRoot, relativePath.replace(/\.tsx?$/, ".js"));
  let source = await readFile(sourcePath, "utf8");
  for (const [from, to] of replacements) {
    source = source.replaceAll(from, to);
  }
  let output = typescript.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.CommonJS,
      moduleResolution: typescript.ModuleResolutionKind.NodeNext,
      jsx: typescript.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  output = output.replaceAll(
    'require("react/jsx-runtime")',
    `require(${JSON.stringify(require.resolve("react/jsx-runtime"))})`,
  );
  output = output.replaceAll(
    'require("react")',
    `require(${JSON.stringify(require.resolve("react"))})`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}

await Promise.all([
  compileRenderModule("contracts/strict.ts"),
  compileRenderModule("contracts/identity.ts"),
  compileRenderModule("contracts/public-reference.ts"),
  compileRenderModule("contracts/journey-document.ts"),
  compileRenderModule("ports/journey-repository.ts"),
  compileRenderModule("ports/restore-plan.ts"),
  compileRenderModule("backup/backup-codec.ts"),
  compileRenderModule("features/journey/journey-controller.ts"),
  compileRenderModule("storage/journey-storage.ts"),
  compileRenderModule("i18n/shell/messages.ts"),
  compileRenderModule("i18n/shell/shell-routes.ts"),
  compileRenderModule("i18n/journey/translate.ts"),
  compileRenderModule("i18n/journey/messages.ts"),
  compileRenderModule("components/journey/InlineConfirmation.tsx"),
  compileRenderModule("components/journey/JourneyAlerts.tsx"),
  compileRenderModule("components/journey/JourneyBackupPanel.tsx"),
  compileRenderModule("components/journey/JourneyPageFrame.tsx"),
  compileRenderModule("components/journey/JourneyRecordCard.tsx"),
  compileRenderModule("components/journey/JourneyWorkspace.tsx"),
  compileRenderModule("components/journey/LocalEventCreator.tsx"),
  compileRenderModule("app/journey/page.tsx"),
  compileRenderModule("app/local-event/page.tsx"),
  compileRenderModule("components/shell/atlas-shell.tsx", [
    ["@/i18n/shell/messages", "../../i18n/shell/messages"],
    ["@/i18n/shell/shell-context", "../../i18n/shell/shell-context"],
    ["@/i18n/shell/shell-routes", "../../i18n/shell/shell-routes"],
  ]),
]);

await mkdir(join(renderRoot, "i18n/shell"), { recursive: true });
await writeFile(
  join(renderRoot, "i18n/shell/shell-context.js"),
  `
const { SHELL_MESSAGES } = require("./messages.js");
let locale = "en";
exports.__setShellLocale = (nextLocale) => { locale = nextLocale; };
exports.ShellProvider = ({ children }) => children;
exports.useShell = () => ({
  locale,
  messages: SHELL_MESSAGES[locale],
  setLocale: () => {},
  theme: "light",
  toggleTheme: () => {},
});
`,
  "utf8",
);
await mkdir(join(renderRoot, "node_modules/next"), { recursive: true });
await writeFile(
  join(renderRoot, "node_modules/next/navigation.js"),
  `
let pathname = "/";
exports.__setPathname = (nextPathname) => { pathname = nextPathname; };
exports.usePathname = () => pathname;
`,
  "utf8",
);
await writeFile(
  join(renderRoot, "node_modules/next/link.js"),
  `
const { createElement } = require(${JSON.stringify(require.resolve("react"))});
module.exports = {
  __esModule: true,
  default: ({ children, href, ...props }) =>
    createElement("a", { ...props, href }, children),
};
`,
  "utf8",
);
await mkdir(join(renderRoot, "components/journey"), { recursive: true });
await writeFile(
  join(renderRoot, "components/journey/journey-ui.module.css"),
  "",
  "utf8",
);

require.extensions[".css"] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_target, property) => String(property) },
  );
};

const renderShellContext = require(
  join(renderRoot, "i18n/shell/shell-context.js"),
);
const renderNavigation = require(
  join(renderRoot, "node_modules/next/navigation.js"),
);
const { AtlasShell: RenderAtlasShell } = require(
  join(renderRoot, "components/shell/atlas-shell.js"),
);
const RenderJourneyPage = require(
  join(renderRoot, "app/journey/page.js"),
).default;
const RenderLocalEventPage = require(
  join(renderRoot, "app/local-event/page.js"),
).default;
const renderBackup = require(join(renderRoot, "backup/backup-codec.js"));
const renderStorage = require(join(renderRoot, "storage/journey-storage.js"));
const { createJourneyBackupWorkflow } = require(
  join(renderRoot, "components/journey/JourneyBackupPanel.js"),
);

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

function replacementJourney() {
  return controller.createLocalCustomJourney(null, {
    journeyId: "journey-restored",
    localEventId: "local-event-restored",
    title: "Restored visible event",
    date: "2026-09-01",
    venueName: "Restored venue",
    intent: "interested",
    now: "2026-08-25T02:00:00.000Z",
  });
}

function backupFile(raw, size = renderBackup.utf8ByteLength(raw)) {
  let textCalls = 0;
  return {
    size,
    async text() {
      textCalls += 1;
      return raw;
    },
    get textCalls() {
      return textCalls;
    },
  };
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveValue) => {
    resolvePromise = resolveValue;
  });
  return { promise, resolve: resolvePromise };
}

function encodedReplacementBackup() {
  return renderBackup.encodeAtlasBackup({
    exportedAt: "2026-08-25T03:00:00.000Z",
    journey: replacementJourney(),
  });
}

function readForDocument(document) {
  return document === null
    ? { status: "absent" }
    : {
        status: "valid",
        raw: JSON.stringify(document),
        value: document,
      };
}

class WorkflowStorage {
  constructor(raw) {
    this.raw = raw;
    this.failNextSet = false;
    this.setCalls = [];
  }

  getItem(key) {
    assert.equal(key, renderStorage.ATLAS_JOURNEY_STORAGE_KEY_V1);
    return this.raw;
  }

  setItem(key, value) {
    assert.equal(key, renderStorage.ATLAS_JOURNEY_STORAGE_KEY_V1);
    this.setCalls.push(value);
    this.raw = value;
    if (this.failNextSet) {
      this.failNextSet = false;
      const error = new Error("workflow quota failure");
      error.name = "QuotaExceededError";
      throw error;
    }
  }

  removeItem(key) {
    assert.equal(key, renderStorage.ATLAS_JOURNEY_STORAGE_KEY_V1);
    this.raw = null;
  }
}

function createRestoreHarness({
  current = localJourney(),
  currentRead = readForDocument(current),
  repository,
} = {}) {
  let visibleRead = currentRead;
  let state = null;
  let focusRequests = 0;
  const committedReads = [];
  const activeRepository =
    repository ??
    new renderStorage.LocalStorageJourneyRepository(
      new WorkflowStorage(
        currentRead.status === "absent" ? null : currentRead.raw,
      ),
    );
  const workflow = createJourneyBackupWorkflow({
    getCurrent: () => visibleRead,
    getRepository: () => activeRepository,
    now: () => "2026-08-25T04:00:00.000Z",
    onCommittedRead(read) {
      committedReads.push(read);
      visibleRead = read;
    },
    onFocusRequest() {
      focusRequests += 1;
    },
    onStateChange(nextState) {
      state = nextState;
    },
  });
  let disconnect = workflow.connect();
  return {
    activeRepository,
    committedReads,
    get focusRequests() {
      return focusRequests;
    },
    get state() {
      return state;
    },
    get visibleDocument() {
      return visibleRead.status === "valid" ? visibleRead.value : null;
    },
    setVisibleDocument(next) {
      visibleRead = readForDocument(next);
    },
    setVisibleRead(next) {
      visibleRead = next;
    },
    cleanup() {
      disconnect();
    },
    setup() {
      disconnect = workflow.connect();
    },
    workflow,
  };
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
    assert.equal(
      Object.hasOwn(
        messages.JOURNEY_MESSAGES[locale],
        "restoreCapacityPendingTitle",
      ),
      false,
      `${locale} retains obsolete restoreCapacityPendingTitle`,
    );
    assert.equal(
      Object.hasOwn(
        messages.JOURNEY_MESSAGES[locale],
        "restoreCapacityPendingBody",
      ),
      false,
      `${locale} retains obsolete restoreCapacityPendingBody`,
    );
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

test("Journey locale and styles have no independent shell-era source", async () => {
  const translate = await readFile(
    join(sourceRoot, "i18n/journey/translate.ts"),
    "utf8",
  );
  const css = await readFile(
    join(sourceRoot, "components/journey/journey-ui.module.css"),
    "utf8",
  );

  assert.match(translate, /import type \{ ShellLocale \}/);
  assert.match(translate, /type JourneyLocale = ShellLocale/);
  assert.doesNotMatch(
    translate,
    /JOURNEY_LOCALES|resolveJourneyLocale|navigator\.languages?/,
  );
  assert.doesNotMatch(css, /\.navLink\b|\.languageField\b/);
});

function countRenderedTag(markup, tagName) {
  return [...markup.matchAll(new RegExp(`<${tagName}\\b`, "g"))].length;
}

test("both private routes compose one executable Atlas shell and follow its locale", () => {
  const routeCases = [
    {
      Component: RenderJourneyPage,
      pathname: "/journey/",
      titleKey: "journeyTitle",
    },
    {
      Component: RenderLocalEventPage,
      pathname: "/local-event/",
      titleKey: "localEventTitle",
    },
  ];

  for (const locale of ["zh-CN", "en", "ja", "ko"]) {
    renderShellContext.__setShellLocale(locale);
    for (const routeCase of routeCases) {
      renderNavigation.__setPathname(routeCase.pathname);
      const markup = renderToStaticMarkup(
        createElement(
          RenderAtlasShell,
          { familyNavigation: [] },
          createElement(routeCase.Component),
        ),
      );

      assert.equal(countRenderedTag(markup, "main"), 1, routeCase.pathname);
      assert.equal(countRenderedTag(markup, "header"), 1, routeCase.pathname);
      assert.equal(countRenderedTag(markup, "nav"), 1, routeCase.pathname);
      assert.equal(countRenderedTag(markup, "select"), 1, routeCase.pathname);
      assert.equal(
        [...markup.matchAll(/aria-current="page"/g)].length,
        1,
        routeCase.pathname,
      );
      assert.ok(markup.includes('id="atlas-main"'), routeCase.pathname);
      assert.ok(
        markup.includes(messages.JOURNEY_MESSAGES[locale][routeCase.titleKey]),
        `${routeCase.pathname} must render ${locale} Journey copy`,
      );
    }
  }
});

test("Journey exposes a native localized link to the static Memory route", () => {
  renderNavigation.__setPathname("/journey/");

  for (const locale of ["zh-CN", "en", "ja", "ko"]) {
    renderShellContext.__setShellLocale(locale);
    const markup = renderToStaticMarkup(
      createElement(
        RenderAtlasShell,
        { familyNavigation: [] },
        createElement(RenderJourneyPage),
      ),
    );
    const memoryLink = markup.match(
      /<a\b[^>]*href="\/memory\/"[^>]*>([^<]+)<\/a>/,
    );

    assert.ok(memoryLink, `${locale} Journey must link to /memory/`);
    assert.equal(
      memoryLink[1],
      messages.JOURNEY_MESSAGES[locale].createMemory,
      `${locale} Memory link needs a visible accessible label`,
    );
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

async function resolveRelativeTypeScriptSource(importer, specifier) {
  const base = resolve(dirname(importer), specifier);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      return { path: candidate, source: await readFile(candidate, "utf8") };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`${specifier} from ${importer} did not resolve to TS/TSX`);
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

test("private route entry imports resolve to real TSX sources without emitted-JS suffixes", async () => {
  const cases = [
    {
      page: join(sourceRoot, "app/journey/page.tsx"),
      target: "components/journey/JourneyWorkspace.tsx",
    },
    {
      page: join(sourceRoot, "app/local-event/page.tsx"),
      target: "components/journey/LocalEventCreator.tsx",
    },
  ];

  for (const routeCase of cases) {
    const source = await readFile(routeCase.page, "utf8");
    const relativeImports = typescript
      .preProcessFile(source)
      .importedFiles.map(({ fileName }) => fileName)
      .filter((specifier) => specifier.startsWith("."));
    assert.equal(relativeImports.length, 1);
    assert.doesNotMatch(relativeImports[0], /\.m?js$/);

    const resolvedImport = await resolveRelativeTypeScriptSource(
      routeCase.page,
      relativeImports[0],
    );
    assert.equal(
      relative(sourceRoot, resolvedImport.path).replaceAll("\\", "/"),
      routeCase.target,
    );
    const compiled = typescript.transpileModule(resolvedImport.source, {
      fileName: resolvedImport.path,
      compilerOptions: {
        target: typescript.ScriptTarget.ES2022,
        module: typescript.ModuleKind.ES2022,
        jsx: typescript.JsxEmit.ReactJSX,
      },
    });
    assert.ok(compiled.outputText.length > 0);
  }
});

test("the complete U2 module graph resolves TypeScript sources without emitted-JS suffixes", async () => {
  const roots = [
    join(sourceRoot, "app/journey"),
    join(sourceRoot, "app/local-event"),
    join(sourceRoot, "components/journey"),
    join(sourceRoot, "features/journey"),
    join(sourceRoot, "i18n/journey"),
  ];
  const files = (await Promise.all(roots.map(collectFiles)))
    .flat()
    .filter((path) => /\.tsx?$/.test(path));
  let resolvedEdges = 0;

  for (const importer of files) {
    const source = await readFile(importer, "utf8");
    const relativeImports = typescript
      .preProcessFile(source)
      .importedFiles.map(({ fileName }) => fileName)
      .filter(
        (specifier) => specifier.startsWith(".") && !specifier.endsWith(".css"),
      );

    for (const specifier of relativeImports) {
      assert.doesNotMatch(
        specifier,
        /\.m?js$/,
        `${relative(sourceRoot, importer)} imports emitted JavaScript`,
      );
      const resolvedImport = await resolveRelativeTypeScriptSource(
        importer,
        specifier,
      );
      assert.ok(resolvedImport.source.length > 0);
      resolvedEdges += 1;
    }
  }

  assert.ok(resolvedEdges > 20, "expected to exercise the U2 source graph");
});

test("restore workflow rejects cancelled, invalid, future, corrupt, and oversize inputs without apply", async () => {
  let preflightCalls = 0;
  let applyCalls = 0;
  const repository = {
    async read() {
      throw new Error("read must not run for rejected input");
    },
    async preflightReplaceEligibility() {
      preflightCalls += 1;
      throw new Error("preflight must not run for rejected input");
    },
    async applyReplacePlan() {
      applyCalls += 1;
      throw new Error("apply must not run for rejected input");
    },
  };
  const cases = [
    { raw: "{", status: "corrupt" },
    {
      raw: JSON.stringify({ schemaVersion: 2, future: true }),
      status: "future-version",
    },
    {
      raw: JSON.stringify({ productFamilySiteId: "atlas" }),
      status: "invalid",
    },
  ];
  for (const item of cases) {
    const harness = createRestoreHarness({ repository });
    await harness.workflow.selectFile(backupFile(item.raw));
    assert.equal(harness.state.status, "idle");
    assert.equal(harness.state.feedback.status, item.status);
    assert.equal(harness.state.session, null);
    assert.equal(await harness.workflow.apply(), "ignored");
  }

  const oversizeHarness = createRestoreHarness({ repository });
  const oversize = backupFile(
    encodedReplacementBackup(),
    renderBackup.ATLAS_BACKUP_MAX_BYTES + 1,
  );
  await oversizeHarness.workflow.selectFile(oversize);
  assert.equal(oversize.textCalls, 0, "File.size rejects before File.text");
  assert.equal(oversizeHarness.state.feedback.status, "oversize");

  const readFailureHarness = createRestoreHarness({ repository });
  await readFailureHarness.workflow.selectFile({
    size: 1,
    async text() {
      throw new Error("file read rejected");
    },
  });
  assert.equal(readFailureHarness.state.feedback.status, "unexpected");
  assert.match(readFailureHarness.state.feedback.error, /file read rejected/);

  const cancelledHarness = createRestoreHarness({ repository });
  cancelledHarness.workflow.beginPicker();
  await cancelledHarness.workflow.selectFile(null);
  assert.deepEqual(cancelledHarness.state, {
    status: "idle",
    feedback: null,
    session: null,
  });
  assert.equal(await cancelledHarness.workflow.apply(), "ignored");
  assert.equal(preflightCalls, 0);
  assert.equal(applyCalls, 0);
});

test("effect cleanup invalidates an in-flight file read before planning", async () => {
  let releaseFile;
  let preflightCalls = 0;
  const repository = {
    async read() {
      throw new Error("disposed workflow must not read storage");
    },
    async preflightReplaceEligibility() {
      preflightCalls += 1;
      throw new Error("disposed workflow must not preflight");
    },
    async applyReplacePlan() {
      throw new Error("disposed workflow must not apply");
    },
  };
  const harness = createRestoreHarness({ repository });
  const selection = harness.workflow.selectFile({
    size: 1,
    text: () =>
      new Promise((resolveText) => {
        releaseFile = resolveText;
      }),
  });
  harness.cleanup();
  releaseFile(encodedReplacementBackup());
  await selection;
  assert.equal(preflightCalls, 0);
  assert.equal(await harness.workflow.apply(), "ignored");
  assert.equal(harness.committedReads.length, 0);
  assert.equal(harness.focusRequests, 0);
});

test("Strict Effects setup-cleanup-setup reconnects the same workflow instance", async () => {
  const harness = createRestoreHarness();
  harness.cleanup();
  harness.setup();

  await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
  assert.equal(harness.state.status, "review");
  assert.equal(harness.state.session.eligibility.status, "eligible");
  assert.equal(harness.committedReads.length, 0);
});

test("a file text ticket from the first effect setup cannot publish after reconnect", async () => {
  const oldText = deferred();
  const harness = createRestoreHarness();
  const oldSelection = harness.workflow.selectFile({
    size: 1,
    text: () => oldText.promise,
  });

  harness.cleanup();
  harness.setup();
  await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
  const reconnectedReview = harness.state;
  assert.equal(reconnectedReview.status, "review");

  oldText.resolve("{");
  await oldSelection;
  assert.strictEqual(harness.state, reconnectedReview);
  assert.equal(harness.committedReads.length, 0);
  assert.equal(harness.focusRequests, 0);
});

test("an eligibility ticket from the first effect setup cannot publish after reconnect", async () => {
  const oldEligibility = deferred();
  const firstEligibilityStarted = deferred();
  let preflightCalls = 0;
  const repository = {
    async read() {
      throw new Error("eligibility-only test must not read");
    },
    async preflightReplaceEligibility({ plan }) {
      preflightCalls += 1;
      if (preflightCalls === 1) {
        firstEligibilityStarted.resolve();
        return oldEligibility.promise;
      }
      const raw = JSON.stringify(plan.replacement);
      return {
        status: "eligible",
        storageCapacity: "unknown",
        replacementByteLength: renderBackup.utf8ByteLength(raw),
        requiredStorageUnits: Math.max(
          raw.length,
          renderBackup.utf8ByteLength(raw),
        ),
      };
    },
    async applyReplacePlan() {
      throw new Error("eligibility-only test must not apply");
    },
  };
  const harness = createRestoreHarness({ repository });
  const oldSelection = harness.workflow.selectFile(
    backupFile(encodedReplacementBackup()),
  );
  await firstEligibilityStarted.promise;

  harness.cleanup();
  harness.setup();
  await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
  const reconnectedReview = harness.state;
  assert.equal(reconnectedReview.status, "review");

  oldEligibility.resolve({
    status: "ineligible",
    storageCapacity: "unknown",
    reason: "replacement-exceeds-authoritative-limit",
    replacementByteLength: renderBackup.ATLAS_BACKUP_MAX_BYTES + 1,
    requiredStorageUnits: renderBackup.ATLAS_BACKUP_MAX_BYTES + 1,
    error: "stale eligibility result",
  });
  await oldSelection;
  assert.strictEqual(harness.state, reconnectedReview);
  assert.equal(harness.focusRequests, 0);
  assert.equal(harness.committedReads.length, 0);
});

test("an apply ticket from the first effect setup cannot hand off after reconnect", async () => {
  const oldApply = deferred();
  const firstApplyStarted = deferred();
  let oldPlan = null;
  let readCalls = 0;
  const repository = {
    async read() {
      readCalls += 1;
      throw new Error("stale committed apply must not trigger reread");
    },
    async preflightReplaceEligibility({ plan }) {
      const raw = JSON.stringify(plan.replacement);
      return {
        status: "eligible",
        storageCapacity: "unknown",
        replacementByteLength: renderBackup.utf8ByteLength(raw),
        requiredStorageUnits: Math.max(
          raw.length,
          renderBackup.utf8ByteLength(raw),
        ),
      };
    },
    async applyReplacePlan(plan) {
      oldPlan = plan;
      firstApplyStarted.resolve();
      return oldApply.promise;
    },
  };
  const harness = createRestoreHarness({ repository });
  await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
  const oldApplication = harness.workflow.apply();
  await firstApplyStarted.promise;

  harness.cleanup();
  harness.setup();
  await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
  const reconnectedReview = harness.state;
  assert.equal(reconnectedReview.status, "review");

  oldApply.resolve({
    status: "committed",
    readback: {
      status: "valid",
      raw: JSON.stringify(oldPlan.replacement),
      value: oldPlan.replacement,
    },
  });
  assert.equal(await oldApplication, "ignored");
  assert.strictEqual(harness.state, reconnectedReview);
  assert.equal(readCalls, 0);
  assert.equal(harness.committedReads.length, 0);
  assert.equal(harness.focusRequests, 0);
});

test("eligible dry run is review-only until confirmation and successful handoff updates the visible document", async () => {
  const current = localJourney();
  const storage = new WorkflowStorage(JSON.stringify(current));
  const repository = new renderStorage.LocalStorageJourneyRepository(storage);
  const harness = createRestoreHarness({ current, repository });
  const selected = backupFile(encodedReplacementBackup());

  await harness.workflow.selectFile(selected);
  assert.equal(harness.state.status, "review");
  assert.equal(harness.state.session.eligibility.status, "eligible");
  assert.equal(harness.state.session.eligibility.storageCapacity, "unknown");
  assert.deepEqual(harness.state.session.dryRun.applyPlan.summary.journeys, {
    before: 1,
    after: 1,
    added: 1,
    updated: 0,
    deleted: 1,
    unchanged: 0,
  });
  assert.deepEqual(
    Object.keys(
      harness.state.session.dryRun.applyPlan.summary.experienceEntries,
    ).sort(),
    ["added", "after", "before", "deleted", "unchanged", "updated"],
  );
  assert.equal(storage.setCalls.length, 0, "dry run never applies");
  assert.equal(harness.committedReads.length, 0);

  harness.workflow.discard();
  assert.equal(harness.state.status, "idle");
  assert.equal(harness.focusRequests, 1);
  assert.equal(await harness.workflow.apply(), "ignored");
  assert.equal(storage.setCalls.length, 0);

  await harness.workflow.selectFile(selected);
  assert.equal(selected.textCalls, 2, "the same file can be selected again");
  assert.equal(await harness.workflow.apply(), "applied");
  assert.equal(harness.committedReads.length, 1);
  assert.equal(
    harness.visibleDocument.journeys[0].subject.fallback.title,
    "Restored visible event",
    "the authoritative read handoff updates parent-visible Journey state",
  );
  assert.equal(harness.state.feedback.status, "applied");
  assert.equal(harness.focusRequests, 2);
  assert.equal(storage.setCalls.length, 1);
  assert.equal(await harness.workflow.apply(), "ignored");
  assert.equal(storage.setCalls.length, 1, "a consumed plan cannot repeat");
  assert.equal(harness.committedReads.length, 1);
});

test("opaque Journey recovery is review-only, count-honest, and raw-bound", async () => {
  const cases = [
    ["{", "corrupt"],
    [JSON.stringify({ schemaVersion: 9 }), "future-version"],
    [JSON.stringify({ schemaVersion: 1, unexpected: true }), "invalid"],
  ];

  for (const [raw, status] of cases) {
    const storage = new WorkflowStorage(raw);
    const repository = new renderStorage.LocalStorageJourneyRepository(storage);
    const harness = createRestoreHarness({
      current: null,
      currentRead: {
        status,
        raw,
        ...(status === "future-version" ? { version: 9 } : {}),
      },
      repository,
    });

    await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
    assert.equal(harness.state.status, "review", status);
    assert.equal(
      harness.state.session.dryRun.applyPlan.kind,
      "recover-journey-document-from-raw",
    );
    assert.deepEqual(harness.state.session.dryRun.applyPlan.summary, {
      current: { status, countsAvailable: false },
      replacement: { journeys: 1, experienceEntries: 0 },
    });
    assert.equal(storage.setCalls.length, 0);
    assert.equal(await harness.workflow.apply(), "applied");
    assert.equal(harness.visibleDocument.revision, 0);
    assert.equal(harness.committedReads.length, 1);
    harness.cleanup();
  }

  const raw = "{";
  const staleStorage = new WorkflowStorage(raw);
  const staleRepository = new renderStorage.LocalStorageJourneyRepository(
    staleStorage,
  );
  const staleHarness = createRestoreHarness({
    current: null,
    currentRead: { status: "corrupt", raw },
    repository: staleRepository,
  });
  await staleHarness.workflow.selectFile(
    backupFile(encodedReplacementBackup()),
  );
  staleStorage.raw = " { ";
  assert.equal(await staleHarness.workflow.apply(), "rejected");
  assert.equal(staleHarness.state.feedback.status, "apply-result");
  assert.equal(staleHarness.state.feedback.result.status, "conflict");
  assert.equal(staleStorage.setCalls.length, 0);
  assert.equal(staleHarness.committedReads.length, 0);
});

test("read-failed Journey state cannot stage recovery from diagnostic raw", async () => {
  let preflightCalls = 0;
  const repository = {
    async read() {
      throw new Error("read must not run");
    },
    async preflightReplaceEligibility() {
      preflightCalls += 1;
      throw new Error("preflight must not run");
    },
    async applyReplacePlan() {
      throw new Error("apply must not run");
    },
  };
  const harness = createRestoreHarness({
    current: null,
    currentRead: {
      status: "read-failed",
      raw: "{",
      error: "SecurityError: blocked",
    },
    repository,
  });
  const file = backupFile(encodedReplacementBackup());
  await harness.workflow.selectFile(file);
  assert.equal(harness.state.status, "idle");
  assert.equal(harness.state.feedback.status, "unexpected");
  assert.equal(file.textCalls, 0);
  assert.equal(preflightCalls, 0);
  assert.equal(await harness.workflow.apply(), "ignored");
});

test("ineligible and stale restore plans fail closed without authoritative handoff", async () => {
  let applyCalls = 0;
  const ineligibleRepository = {
    async read() {
      throw new Error("read must not run");
    },
    async preflightReplaceEligibility() {
      return {
        status: "ineligible",
        storageCapacity: "unknown",
        reason: "replacement-exceeds-authoritative-limit",
        replacementByteLength: renderBackup.ATLAS_BACKUP_MAX_BYTES + 1,
        requiredStorageUnits: renderBackup.ATLAS_BACKUP_MAX_BYTES + 1,
        error: "authoritative limit",
      };
    },
    async applyReplacePlan() {
      applyCalls += 1;
      throw new Error("ineligible plan must not apply");
    },
  };
  const ineligible = createRestoreHarness({ repository: ineligibleRepository });
  await ineligible.workflow.selectFile(backupFile(encodedReplacementBackup()));
  assert.equal(ineligible.state.feedback.status, "ineligible");
  assert.equal(await ineligible.workflow.apply(), "ignored");
  assert.equal(applyCalls, 0);
  assert.equal(ineligible.committedReads.length, 0);

  const current = localJourney();
  const oldRaw = JSON.stringify(current);
  const storage = new WorkflowStorage(oldRaw);
  const stale = createRestoreHarness({
    current,
    repository: new renderStorage.LocalStorageJourneyRepository(storage),
  });
  await stale.workflow.selectFile(backupFile(encodedReplacementBackup()));
  assert.equal(stale.state.status, "review");
  stale.setVisibleDocument(
    controller.updateLocalCustomSubject(current, "journey-alpha", {
      title: "External visible revision",
      date: "2026-08-25",
      venueName: "Sydney Hall",
      now: "2026-08-25T03:30:00.000Z",
    }),
  );
  stale.workflow.invalidateForCurrentChange();
  assert.equal(stale.state.feedback.status, "stale");
  assert.equal(stale.focusRequests, 1);
  assert.equal(await stale.workflow.apply(), "ignored");
  assert.equal(storage.raw, oldRaw);
  assert.equal(storage.setCalls.length, 0);
  assert.equal(stale.committedReads.length, 0);
});

test("quota failure restores the exact old raw, consumes confirmation, and remains retryable", async () => {
  const current = localJourney();
  const oldRaw = `  ${JSON.stringify(current)}\r\n`;
  const storage = new WorkflowStorage(oldRaw);
  const repository = new renderStorage.LocalStorageJourneyRepository(storage);
  const harness = createRestoreHarness({ current, repository });
  const selected = backupFile(encodedReplacementBackup());

  await harness.workflow.selectFile(selected);
  storage.failNextSet = true;
  assert.equal(await harness.workflow.apply(), "rejected");
  assert.equal(harness.state.feedback.status, "apply-result");
  assert.equal(harness.state.feedback.result.status, "failure");
  assert.equal(harness.state.feedback.result.stage, "write");
  assert.deepEqual(harness.state.feedback.result.rollback, {
    status: "restored",
    raw: oldRaw,
  });
  assert.equal(storage.raw, oldRaw);
  assert.equal(harness.committedReads.length, 0);
  assert.equal(harness.focusRequests, 1);
  const callsAfterFailure = storage.setCalls.length;
  assert.equal(await harness.workflow.apply(), "ignored");
  assert.equal(storage.setCalls.length, callsAfterFailure);

  harness.workflow.beginPicker();
  await harness.workflow.selectFile(selected);
  assert.equal(harness.state.status, "review", "exact same file can retry");
  assert.equal(harness.committedReads.length, 0);
});

test("a storage revision conflict after review preserves the external raw and never hands off", async () => {
  const current = localJourney();
  const storage = new WorkflowStorage(JSON.stringify(current));
  const harness = createRestoreHarness({
    current,
    repository: new renderStorage.LocalStorageJourneyRepository(storage),
  });
  await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
  assert.equal(harness.state.status, "review");

  const externalDocument = controller.updateLocalCustomSubject(
    current,
    "journey-alpha",
    {
      title: "External stored revision",
      date: "2026-08-25",
      venueName: "Sydney Hall",
      now: "2026-08-25T03:45:00.000Z",
    },
  );
  const externalRaw = JSON.stringify(externalDocument);
  storage.raw = externalRaw;
  assert.equal(await harness.workflow.apply(), "rejected");
  assert.equal(harness.state.feedback.status, "apply-result");
  assert.equal(harness.state.feedback.result.status, "conflict");
  assert.equal(storage.raw, externalRaw);
  assert.equal(storage.setCalls.length, 0);
  assert.equal(harness.committedReads.length, 0);
  assert.equal(harness.focusRequests, 1);
});

test("unexpected apply errors discard the one-shot plan and request stable focus", async () => {
  let applyCalls = 0;
  const repository = {
    async read() {
      throw new Error("unexpected apply must not reach reread");
    },
    async preflightReplaceEligibility({ plan }) {
      const raw = JSON.stringify(plan.replacement);
      return {
        status: "eligible",
        storageCapacity: "unknown",
        replacementByteLength: renderBackup.utf8ByteLength(raw),
        requiredStorageUnits: Math.max(
          raw.length,
          renderBackup.utf8ByteLength(raw),
        ),
      };
    },
    async applyReplacePlan() {
      applyCalls += 1;
      throw new Error("unexpected repository rejection");
    },
  };
  const harness = createRestoreHarness({ repository });
  await harness.workflow.selectFile(backupFile(encodedReplacementBackup()));
  assert.equal(harness.state.status, "review");
  assert.equal(await harness.workflow.apply(), "rejected");
  assert.equal(harness.state.feedback.status, "unexpected");
  assert.match(harness.state.feedback.error, /unexpected repository rejection/);
  assert.equal(harness.focusRequests, 1);
  assert.equal(harness.committedReads.length, 0);
  assert.equal(await harness.workflow.apply(), "ignored");
  assert.equal(applyCalls, 1);
});

test("restore component uses authoritative P2/P1 gates and resets the real picker", async () => {
  const source = await readFile(
    join(sourceRoot, "components/journey/JourneyBackupPanel.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /navigator\.storage\.estimate/);
  assert.doesNotMatch(source, /StorageManager/);
  assert.match(source, /ATLAS_BACKUP_MAX_BYTES/);
  assert.match(source, /file\.size > ATLAS_BACKUP_MAX_BYTES/);
  assert.match(source, /dryRunAtlasBackupRestore/);
  assert.match(source, /preflightReplaceEligibility/);
  assert.match(source, /applyReplacePlan/);
  assert.match(source, /expectedJourneyStorage/);
  assert.match(source, /recover-journey-document-from-raw/);
  assert.match(source, /recoveryDryRunBody/);
  assert.match(source, /event\.currentTarget\.value = ""/);
  assert.match(source, /onRestoreCommitted/);
  assert.match(source, /const disconnect = workflow\.connect\(\)/);
  assert.doesNotMatch(source, /workflow\.dispose\(\)/);
  assert.doesNotMatch(
    source,
    /restoreCapacityPendingTitle|restoreCapacityPendingBody/,
  );
  assert.doesNotMatch(
    Object.values(messages.JOURNEY_MESSAGES.en).join("\n"),
    /\bREADY\b|capacity verified/i,
  );

  const workspace = await readFile(
    join(sourceRoot, "components/journey/JourneyWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /onRestoreCommitted/);
  assert.match(
    workspace,
    /acceptAuthoritativeRead\(restoredRead, null, false\)/,
  );
  assert.match(workspace, /isRecoverableUnreadable/);
  assert.match(workspace, /read\.status !== "read-failed"/);
  assert.match(workspace, /currentDeleteAllBinding/);
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
    "recoveryDryRunBody",
    "deleteUnreadableWarning",
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
  assert.match(frame, /useShell\(\)/);
  assert.doesNotMatch(frame, /useState|useEffect|navigator\.languages/);
  assert.doesNotMatch(frame, /<header|<nav|<main|<select/);
});
