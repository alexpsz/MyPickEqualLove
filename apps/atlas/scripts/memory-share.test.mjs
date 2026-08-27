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
import { dirname, join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const react = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(atlasRoot, "src");
const compiledRoot = await mkdtemp(join(tmpdir(), "atlas-memory-share-"));
const reactJsxRuntimeUrl = pathToFileURL(
  require.resolve("react/jsx-runtime"),
).href;

after(async () => {
  await rm(compiledRoot, { recursive: true, force: true });
});

async function compileFile(relativePath) {
  const sourcePath = join(sourceRoot, relativePath);
  const outputPath = join(compiledRoot, relativePath.replace(/\.tsx?$/, ".js"));
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

async function compileDirectory(relativeDirectory) {
  const directory = join(sourceRoot, relativeDirectory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await compileDirectory(relativePath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      await compileFile(relativePath);
    }
  }
}

await compileDirectory("contracts");
await compileFile("ports/memory-snapshot-input.ts");
await compileDirectory("i18n/memory");
await compileDirectory("share");
await compileFile("components/memory/MemoryPreview.tsx");

async function load(relativePath) {
  return import(pathToFileURL(join(compiledRoot, relativePath)).href);
}

const journeyContract = await load("contracts/journey-document.js");
const snapshotContract = await load("contracts/memory-snapshot.js");
const selectionModule = await load("share/memory-selection.js");
const drawModule = await load("share/memory-draw-plan.js");
const browserModule = await load("share/memory-browser.js");
const { MEMORY_MESSAGES } = await load("i18n/memory/messages.js");
const { MemoryPreview } = await load("components/memory/MemoryPreview.js");

const { createMemorySnapshot, createMemorySourceCandidates } = selectionModule;
const {
  createMemoryDrawPlan,
  drawMemoryPlan,
  MEMORY_CANVAS_HEIGHT,
  MEMORY_CANVAS_WIDTH,
  MEMORY_TEMPLATE_ID,
} = drawModule;
const {
  canShareMemoryPng,
  createMemoryPublicationEnvironmentKey,
  createMemoryPublicationGate,
  downloadMemoryPng,
  generateMemoryPng,
  MEMORY_PNG_FILE_NAME,
  MEMORY_PNG_MIME_TYPE,
  shareMemoryPng,
} = browserModule;
const messages = MEMORY_MESSAGES.en;

const sensitive = {
  raw: "PRIVATE_RAW_TOKEN_87a1",
  memo: "PRIVATE_MEMO_TOKEN_41cc",
  unknown: "PRIVATE_UNKNOWN_TOKEN_25dd",
  journeyId: "private-journey-id",
  entryId: "private-entry-id",
  localId: "private-local-event-id",
  eventId: "equal-love:event:private-event-id",
  songId: "equal-love:song:private-song-id",
  sourceRevision: "private-source-revision",
};

const visible = {
  group: "Visible Group",
  event: "Visible Event",
  date: "2026-08-25",
  selectedHighlight: "VISIBLE_SELECTED_HIGHLIGHT",
  unselectedHighlight: "PRIVATE_UNSELECTED_HIGHLIGHT",
  selectedSong: "VISIBLE_SELECTED_SONG",
  unselectedSong: "PRIVATE_UNSELECTED_SONG",
  summary: "VISIBLE_EXPLICIT_SUMMARY",
};

function reference(entityId, groupName, title) {
  return {
    entityId,
    sourceRevision: sensitive.sourceRevision,
    fallback: {
      groupName,
      title,
      date: visible.date,
      venueName: "PRIVATE_VENUE_TOKEN",
    },
  };
}

function journeyDocument() {
  const timestamp = "2026-08-25T10:00:00.000Z";
  return {
    schemaVersion: 1,
    revision: 77,
    updatedAt: timestamp,
    journeys: [
      {
        id: sensitive.journeyId,
        subject: {
          kind: "public-reference",
          reference: reference(sensitive.eventId, visible.group, visible.event),
        },
        intent: "planned",
        experienceEntries: [
          {
            id: sensitive.entryId,
            mode: "in-person",
            occurredAt: timestamp,
            memo: sensitive.memo,
            highlights: [
              visible.selectedHighlight,
              visible.unselectedHighlight,
            ],
            songRefs: [
              reference(sensitive.songId, visible.group, visible.selectedSong),
              reference(
                "equal-love:song:second-private-song-id",
                visible.group,
                visible.unselectedSong,
              ),
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

function validJourneyReadWithUnknownFields() {
  const parsed = journeyContract.parseJourneyDocument(
    JSON.stringify(journeyDocument()),
  );
  assert.equal(parsed.status, "valid");
  return {
    ...parsed,
    raw: sensitive.raw,
    unknownDocumentField: sensitive.unknown,
    value: {
      ...parsed.value,
      unknownDocumentField: sensitive.unknown,
      journeys: parsed.value.journeys.map((journey) => ({
        ...journey,
        unknownJourneyField: sensitive.unknown,
        experienceEntries: journey.experienceEntries.map((entry) => ({
          ...entry,
          unknownEntryField: sensitive.unknown,
        })),
      })),
    },
  };
}

function oneCandidate() {
  const projected = createMemorySourceCandidates(
    validJourneyReadWithUnknownFields(),
  );
  assert.equal(projected.status, "ready");
  assert.equal(projected.candidates.length, 1);
  return projected.candidates[0];
}

function disclosure(overrides = {}) {
  return {
    includePerformanceName: false,
    includeMode: false,
    highlightIndexes: [],
    songIndexes: [],
    includeSummary: false,
    summary: "",
    ...overrides,
  };
}

function snapshotFor(selection = disclosure()) {
  const result = createMemorySnapshot(
    oneCandidate(),
    selection,
    messages.localGroupName,
  );
  assert.equal(result.ok, true);
  return result.snapshot;
}

function planFor(selection = disclosure()) {
  const result = createMemoryDrawPlan(snapshotFor(selection), messages);
  assert.equal(result.ok, true);
  return result.plan;
}

function whitelistedSnapshot({
  date = visible.date,
  eventName = visible.event,
  groupName = visible.group,
  highlights = [],
  mode = null,
} = {}) {
  return {
    schemaVersion: 1,
    event: {
      groupName,
      eventName,
      date,
      performanceName: null,
    },
    selected: {
      mode: mode === null ? null : { consent: true, value: mode },
      highlights: highlights.map((value) => ({ consent: true, value })),
      songs: [],
      summary: null,
    },
  };
}

function assertExcludesSensitiveText(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const token of [
    sensitive.raw,
    sensitive.memo,
    sensitive.unknown,
    sensitive.journeyId,
    sensitive.entryId,
    sensitive.localId,
    sensitive.eventId,
    sensitive.songId,
    sensitive.sourceRevision,
    visible.unselectedHighlight,
    visible.unselectedSong,
    '"revision":77',
    '"intent":"planned"',
    '"memo":',
    '"raw":',
  ]) {
    assert.equal(serialized.includes(token), false, `leaked ${token}`);
  }
}

function fakeCanvasContext({ invalidMeasurement = false, measureWidth } = {}) {
  const drawnText = [];
  let measurementCount = 0;
  return {
    drawnText,
    fillStyle: "",
    font: "",
    textBaseline: "top",
    fillRect() {},
    fillText(text) {
      drawnText.push(text);
    },
    measureText(text) {
      measurementCount += 1;
      return {
        width: invalidMeasurement
          ? Number.NaN
          : (measureWidth?.(text, {
              count: measurementCount,
              font: this.font,
            }) ?? Array.from(text).length * 10),
      };
    },
  };
}

function throwingMetadata(values, propertyName) {
  return new Proxy(values, {
    get(target, property, receiver) {
      if (property === propertyName) {
        throw new Error(`metadata getter failed: ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function sourceBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing source block: ${marker}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert.notEqual(openIndex, -1, `missing opening brace: ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }
  assert.fail(`missing closing brace: ${marker}`);
}

function rendererFixture(options = {}) {
  const context = fakeCanvasContext({
    invalidMeasurement: options.invalidMeasurement,
    measureWidth: options.measureWidth,
  });
  const state = {
    canvasWidth: null,
    canvasHeight: null,
    mimeType: null,
    drawnText: context.drawnText,
    fileCalls: 0,
    fontWaits: 0,
    toBlobCalls: 0,
  };
  const canvas = {
    get width() {
      return state.canvasWidth;
    },
    set width(value) {
      state.canvasWidth = value;
    },
    get height() {
      return state.canvasHeight;
    },
    set height(value) {
      state.canvasHeight = value;
    },
    getContext() {
      return options.contextNull ? null : context;
    },
    toBlob(callback, mimeType) {
      state.toBlobCalls += 1;
      state.mimeType = mimeType;
      if (options.toBlob === "throw") {
        throw new Error("toBlob failed");
      }
      const nativeBlob = new Blob(["opaque-png-bytes"], { type: mimeType });
      const encoded =
        options.toBlob === "null"
          ? null
          : options.blobMetadataGetter
            ? throwingMetadata(
                { type: mimeType, size: nativeBlob.size },
                options.blobMetadataGetter,
              )
            : nativeBlob;
      if (options.toBlobDeferred) {
        void options.toBlobDeferred.promise.then(() => callback(encoded));
      } else {
        callback(encoded);
      }
    },
  };
  const ports = {
    async waitForFonts() {
      state.fontWaits += 1;
      if (options.fontFailure) throw new Error("font failure");
    },
    createCanvas() {
      if (options.canvasFailure) throw new Error("canvas failure");
      return canvas;
    },
    createFile(blob) {
      state.fileCalls += 1;
      if (options.fileFailure) throw new Error("file failure");
      const metadata = {
        name: MEMORY_PNG_FILE_NAME,
        type: blob.type,
        lastModified: options.invalidFile ? 123 : 0,
        size: blob.size,
      };
      return options.fileMetadataGetter
        ? throwingMetadata(metadata, options.fileMetadataGetter)
        : Object.freeze(metadata);
    },
  };
  return { ports, state };
}

function readyInput(snapshot) {
  return {
    async request() {
      return { status: "ready", snapshot };
    },
  };
}

test("C0 MemorySnapshot whitelist is exact and defaults to minimum disclosure", () => {
  const candidate = oneCandidate();
  assert.deepEqual(Object.keys(candidate).sort(), [
    "event",
    "highlights",
    "mode",
    "songs",
  ]);
  assert.deepEqual(Object.keys(candidate.event).sort(), [
    "date",
    "eventName",
    "groupName",
    "performanceName",
  ]);

  const snapshot = snapshotFor();
  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    event: {
      groupName: visible.group,
      eventName: visible.event,
      date: visible.date,
      performanceName: null,
    },
    selected: {
      mode: null,
      highlights: [],
      songs: [],
      summary: null,
    },
  });
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "event",
    "schemaVersion",
    "selected",
  ]);
  assert.equal(snapshotContract.parseMemorySnapshot(snapshot).ok, true);
  assert.equal(
    snapshotContract.parseMemorySnapshot({
      ...snapshot,
      unknown: sensitive.unknown,
    }).ok,
    false,
  );
  assert.equal(
    snapshotContract.parseMemorySnapshot({
      ...snapshot,
      selected: {
        ...snapshot.selected,
        mode: { consent: false, value: "in-person" },
      },
    }).ok,
    false,
  );
});

test("same-event candidates are distinguished by localized mode without changing disclosure defaults", async () => {
  const document = journeyDocument();
  document.journeys[0].experienceEntries.push({
    ...structuredClone(document.journeys[0].experienceEntries[0]),
    id: "private-second-entry-id",
    mode: "livestream",
  });
  const parsed = journeyContract.parseJourneyDocument(JSON.stringify(document));
  assert.equal(parsed.status, "valid");
  const projected = createMemorySourceCandidates(parsed);
  assert.equal(projected.status, "ready");
  assert.deepEqual(
    projected.candidates.map((candidate) => candidate.mode),
    ["in-person", "livestream"],
  );

  for (const candidate of projected.candidates) {
    const hidden = createMemorySnapshot(
      candidate,
      disclosure(),
      messages.localGroupName,
    );
    assert.equal(hidden.ok, true);
    assert.equal(hidden.snapshot.selected.mode, null);

    const disclosed = createMemorySnapshot(
      candidate,
      disclosure({ includeMode: true }),
      messages.localGroupName,
    );
    assert.equal(disclosed.ok, true);
    assert.deepEqual(disclosed.snapshot.selected.mode, {
      consent: true,
      value: candidate.mode,
    });
  }

  const pageSource = await readFile(
    join(sourceRoot, "components", "memory", "MemoryPage.tsx"),
    "utf8",
  );
  assert.match(pageSource, /messages\.card\.modes\[item\.mode\]/);
  assert.doesNotMatch(pageSource, /modeInPerson|modeLivestream|modeArchive/);
});

test("a real local custom event is projected without its local id or venue", () => {
  const document = journeyDocument();
  document.journeys[0].subject = {
    kind: "local-custom-event",
    localId: sensitive.localId,
    fallback: {
      title: "Visible Local Event",
      date: null,
      venueName: "PRIVATE_LOCAL_VENUE_TOKEN",
    },
  };
  const parsed = journeyContract.parseJourneyDocument(JSON.stringify(document));
  assert.equal(parsed.status, "valid");
  const projected = createMemorySourceCandidates(parsed);
  assert.equal(projected.status, "ready");
  assert.deepEqual(projected.candidates[0].event, {
    groupName: null,
    eventName: "Visible Local Event",
    date: visible.date,
    performanceName: null,
  });

  const built = createMemorySnapshot(
    projected.candidates[0],
    disclosure(),
    messages.localGroupName,
  );
  assert.equal(built.ok, true);
  assert.equal(built.snapshot.event.groupName, messages.localGroupName);
  const planned = createMemoryDrawPlan(built.snapshot, messages);
  assert.equal(planned.ok, true);
  const previewHtml = renderToStaticMarkup(
    react.createElement(MemoryPreview, { plan: planned.plan }),
  );
  assert.ok(previewHtml.includes("Visible Local Event"));
  assert.equal(previewHtml.includes(sensitive.localId), false);
  assert.equal(previewHtml.includes("PRIVATE_LOCAL_VENUE_TOKEN"), false);
});

test("only checked C0 fields reach the shared draw plan and DOM preview", () => {
  const selection = disclosure({
    includeMode: true,
    highlightIndexes: [0],
    songIndexes: [0],
    includeSummary: true,
    summary: `  ${visible.summary}  `,
  });
  const snapshot = snapshotFor(selection);
  assert.deepEqual(snapshot.selected, {
    mode: { consent: true, value: "in-person" },
    highlights: [{ consent: true, value: visible.selectedHighlight }],
    songs: [
      {
        consent: true,
        value: { groupName: visible.group, title: visible.selectedSong },
      },
    ],
    summary: { consent: true, value: visible.summary },
  });

  const planned = createMemoryDrawPlan(snapshot, messages);
  assert.equal(planned.ok, true);
  const planText = JSON.stringify(planned.plan);
  const previewHtml = renderToStaticMarkup(
    react.createElement(MemoryPreview, { plan: planned.plan }),
  );
  for (const selectedText of [
    visible.group,
    visible.event,
    visible.date,
    visible.selectedHighlight,
    visible.selectedSong,
    visible.summary,
  ]) {
    assert.ok(planText.includes(selectedText));
    assert.ok(previewHtml.includes(selectedText));
  }
  assertExcludesSensitiveText(planned.plan);
  assertExcludesSensitiveText(previewHtml);

  const context = fakeCanvasContext();
  drawMemoryPlan(context, planned.plan);
  const canvasText = context.drawnText.join(" ");
  assert.ok(canvasText.includes(visible.selectedHighlight));
  assert.ok(canvasText.includes(visible.selectedSong));
  assert.ok(canvasText.includes(visible.summary));
  assertExcludesSensitiveText(canvasText);
});

test("invalid selections fail closed before preview or rendering", () => {
  const candidate = oneCandidate();
  for (const selection of [
    disclosure({ highlightIndexes: [99] }),
    disclosure({ songIndexes: [0, 0] }),
    disclosure({ includeSummary: true, summary: "   " }),
    disclosure({ includePerformanceName: true }),
  ]) {
    assert.equal(
      createMemorySnapshot(candidate, selection, messages.localGroupName).ok,
      false,
    );
  }

  const longCandidate = {
    ...candidate,
    highlights: Array.from(
      { length: 14 },
      (_, index) => `${index}-${"x".repeat(38)}`,
    ),
  };
  const snapshot = createMemorySnapshot(
    longCandidate,
    disclosure({ highlightIndexes: Array.from({ length: 14 }, (_, i) => i) }),
    messages.localGroupName,
  );
  assert.equal(snapshot.ok, true);
  assert.deepEqual(createMemoryDrawPlan(snapshot.snapshot, messages), {
    ok: false,
    reason: "content-too-long",
  });
});

test("the maximum legal 13-line preview stays fully reviewable at 390px", async () => {
  const longUnbrokenGroup = "G".repeat(128);
  const highlights = Array.from({ length: 10 }, (_, index) => `item-${index}`);
  const planned = createMemoryDrawPlan(
    whitelistedSnapshot({
      groupName: longUnbrokenGroup,
      highlights,
      mode: "in-person",
    }),
    messages,
  );
  assert.equal(planned.ok, true);
  assert.equal(
    planned.plan.sections.reduce(
      (count, section) => count + 1 + section.values.length,
      0,
    ),
    13,
  );

  const previewHtml = renderToStaticMarkup(
    react.createElement(MemoryPreview, { plan: planned.plan }),
  );
  assert.ok(previewHtml.includes(longUnbrokenGroup));
  for (const highlight of highlights)
    assert.ok(previewHtml.includes(highlight));
  assert.ok(previewHtml.includes(planned.plan.privacyLine));

  const css = await readFile(
    join(sourceRoot, "components", "memory", "memory-page.module.css"),
    "utf8",
  );
  const previewBlock = sourceBlock(css, ".previewCard {");
  assert.match(previewBlock, /box-sizing:\s*border-box/);
  assert.match(previewBlock, /width:\s*100%/);
  assert.match(previewBlock, /min-width:\s*0/);
  assert.match(previewBlock, /max-width:\s*100%/);

  const mobileBlock = sourceBlock(css, "@media (max-width: 36rem)");
  const mobilePreview = sourceBlock(mobileBlock, ".previewCard {");
  assert.match(mobilePreview, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobilePreview, /aspect-ratio:\s*auto/);
  assert.match(mobilePreview, /overflow:\s*visible/);

  const mobilePrivacy = sourceBlock(
    mobileBlock,
    ".previewCard [data-memory-preview-privacy]",
  );
  assert.match(mobilePrivacy, /position:\s*static/);
  assert.match(mobilePrivacy, /display:\s*block/);
  assert.doesNotMatch(mobilePrivacy, /display:\s*none/);
  assert.match(mobilePrivacy, /overflow-wrap:\s*anywhere/);

  const groupBlock = sourceBlock(
    css,
    ".previewCard [data-memory-preview-group] {",
  );
  assert.match(groupBlock, /overflow-wrap:\s*anywhere/);
  const dateChildren = sourceBlock(
    css,
    ".previewCard [data-memory-preview-date] strong",
  );
  assert.match(dateChildren, /min-width:\s*0/);
  assert.match(dateChildren, /overflow-wrap:\s*anywhere/);
});

test("the renderer has one fixed 1200 by 630 template", () => {
  assert.equal(MEMORY_CANVAS_WIDTH, 1200);
  assert.equal(MEMORY_CANVAS_HEIGHT, 630);
  assert.equal(MEMORY_TEMPLATE_ID, "atlas-memory-v1");
  assert.equal(createMemoryDrawPlan.length, 2);

  const plan = planFor();
  assert.deepEqual(
    {
      templateId: plan.templateId,
      width: plan.width,
      height: plan.height,
    },
    {
      templateId: "atlas-memory-v1",
      width: 1200,
      height: 630,
    },
  );
  assert.throws(() =>
    drawMemoryPlan(fakeCanvasContext(), {
      ...plan,
      templateId: "unapproved-template",
    }),
  );
});

test("Canvas and toBlob success produce one generic PNG file", async () => {
  const selection = disclosure({
    highlightIndexes: [0],
    songIndexes: [0],
  });
  const { ports, state } = rendererFixture();
  const result = await generateMemoryPng(
    readyInput(snapshotFor(selection)),
    messages,
    ports,
  );

  assert.equal(result.status, "ready");
  assert.equal(state.fontWaits, 1);
  assert.equal(state.canvasWidth, 1200);
  assert.equal(state.canvasHeight, 630);
  assert.equal(state.mimeType, MEMORY_PNG_MIME_TYPE);
  assert.equal(result.artifact.templateId, "atlas-memory-v1");
  assert.equal(result.artifact.blob.type, MEMORY_PNG_MIME_TYPE);
  assert.deepEqual(result.artifact.file, {
    name: "atlas-memory.png",
    type: MEMORY_PNG_MIME_TYPE,
    lastModified: 0,
    size: result.artifact.blob.size,
  });
  assertExcludesSensitiveText(state.drawnText.join(" "));
  assertExcludesSensitiveText(result.artifact.file);
});

test("Canvas, font, drawing, file, and toBlob failures are explicit", async () => {
  const snapshot = snapshotFor();
  const cases = [
    ["font", { fontFailure: true }],
    ["canvas", { canvasFailure: true }],
    ["canvas", { contextNull: true }],
    ["draw", { invalidMeasurement: true }],
    ["to-blob", { toBlob: "null" }],
    ["to-blob", { toBlob: "throw" }],
    ["file", { fileFailure: true }],
    ["file", { invalidFile: true }],
  ];
  for (const [stage, options] of cases) {
    const result = await generateMemoryPng(
      readyInput(snapshot),
      messages,
      rendererFixture(options).ports,
    );
    assert.deepEqual(result, {
      status: "failed",
      stage,
      journeyMutation: "none",
    });
  }

  const invalidSnapshot = { ...snapshot, privateUnknown: sensitive.unknown };
  assert.deepEqual(
    await generateMemoryPng(readyInput(invalidSnapshot), messages),
    { status: "failed", stage: "snapshot", journeyMutation: "none" },
  );
});

test("required group, event, and date bounds fail before PNG encoding", async () => {
  let journeyWrites = 0;
  const cases = [
    {
      name: "wide event title",
      snapshot: whitelistedSnapshot({ eventName: "界".repeat(72) }),
      measureWidth(text) {
        return Array.from(text).reduce(
          (width, character) => width + (character === "界" ? 50 : 10),
          0,
        );
      },
    },
    {
      name: "maximum unbroken group",
      snapshot: whitelistedSnapshot({ groupName: "群".repeat(128) }),
      measureWidth(text) {
        return Array.from(text).length * 10;
      },
    },
    {
      name: "wide localized date",
      snapshot: whitelistedSnapshot(),
      measureWidth(text) {
        return text.includes(visible.date) ? 500 : Array.from(text).length * 10;
      },
    },
  ];

  for (const item of cases) {
    assert.equal(
      snapshotContract.parseMemorySnapshot(item.snapshot).ok,
      true,
      item.name,
    );
    assert.equal(createMemoryDrawPlan(item.snapshot, messages).ok, true);
    const fixture = rendererFixture({ measureWidth: item.measureWidth });
    const result = await generateMemoryPng(
      readyInput(item.snapshot),
      messages,
      fixture.ports,
    );
    assert.deepEqual(
      result,
      { status: "failed", stage: "draw", journeyMutation: "none" },
      item.name,
    );
    assert.equal(fixture.state.toBlobCalls, 0, item.name);
    assert.equal(fixture.state.fileCalls, 0, item.name);
  }
  assert.equal(journeyWrites, 0);
});

test("changing Canvas metrics cannot validate a different replacement layout", async () => {
  let exactEventMeasurements = 0;
  const fixture = rendererFixture({
    measureWidth(text) {
      if (text === visible.event) {
        exactEventMeasurements += 1;
        if (exactEventMeasurements >= 4) return 500;
      }
      return Array.from(text).length * 10;
    },
  });
  const result = await generateMemoryPng(
    readyInput(whitelistedSnapshot()),
    messages,
    fixture.ports,
  );
  assert.deepEqual(result, {
    status: "failed",
    stage: "draw",
    journeyMutation: "none",
  });
  assert.ok(fixture.state.drawnText.includes(visible.event));
  assert.equal(fixture.state.toBlobCalls, 0);
  assert.equal(fixture.state.fileCalls, 0);
});

test("throwing Blob and File metadata getters map to explicit stages", async () => {
  const snapshot = snapshotFor();
  for (const propertyName of ["type", "size"]) {
    const fixture = rendererFixture({ blobMetadataGetter: propertyName });
    assert.deepEqual(
      await generateMemoryPng(readyInput(snapshot), messages, fixture.ports),
      { status: "failed", stage: "to-blob", journeyMutation: "none" },
    );
    assert.equal(fixture.state.fileCalls, 0);
  }

  for (const propertyName of ["name", "type", "lastModified", "size"]) {
    const fixture = rendererFixture({ fileMetadataGetter: propertyName });
    assert.deepEqual(
      await generateMemoryPng(readyInput(snapshot), messages, fixture.ports),
      { status: "failed", stage: "file", journeyMutation: "none" },
    );
    assert.equal(fixture.state.fileCalls, 1);
  }
});

test("generation cancellation and input failure never reach Canvas or Journey writes", async () => {
  let rendererCalls = 0;
  let journeyWrites = 0;
  const unreachableRenderer = {
    async waitForFonts() {
      rendererCalls += 1;
    },
    createCanvas() {
      rendererCalls += 1;
      throw new Error("must not render");
    },
    createFile() {
      rendererCalls += 1;
      throw new Error("must not create a file");
    },
  };

  const results = [
    await generateMemoryPng(
      {
        async request() {
          return { status: "cancelled", journeyMutation: "none" };
        },
      },
      messages,
      unreachableRenderer,
    ),
    await generateMemoryPng(
      {
        async request() {
          return {
            status: "failed",
            error: "input failed",
            journeyMutation: "none",
          };
        },
      },
      messages,
      unreachableRenderer,
    ),
    await generateMemoryPng(
      {
        async request() {
          throw new Error("input threw");
        },
      },
      messages,
      unreachableRenderer,
    ),
  ];

  assert.deepEqual(results, [
    { status: "cancelled", journeyMutation: "none" },
    { status: "failed", stage: "input", journeyMutation: "none" },
    { status: "failed", stage: "input", journeyMutation: "none" },
  ]);
  assert.equal(rendererCalls, 0);
  assert.equal(journeyWrites, 0);
});

async function generatedArtifact() {
  const fixture = rendererFixture();
  const result = await generateMemoryPng(
    readyInput(snapshotFor(disclosure({ highlightIndexes: [0] }))),
    messages,
    fixture.ports,
  );
  assert.equal(result.status, "ready");
  return result.artifact;
}

function ownArtifact(gate, environmentKey, artifact) {
  const ticket = gate.issue(environmentKey, "generate");
  assert.notEqual(ticket, null);
  assert.equal(gate.settle(ticket, environmentKey, "generate"), true);
  assert.equal(gate.ownsArtifact(ticket, environmentKey), true);
  return { artifact, ticket };
}

async function guardedGeneration(
  gate,
  environmentKey,
  snapshot,
  ports,
  publish,
) {
  const ticket = gate.issue(environmentKey, "generate");
  if (ticket === null) return "busy";
  const result = await generateMemoryPng(readyInput(snapshot), messages, ports);
  if (!gate.settle(ticket, environmentKey, "generate")) return "stale";
  publish(result);
  return result.status;
}

async function guardedShare(gate, environmentKey, binding, ports, publish) {
  if (!gate.ownsArtifact(binding.ticket, environmentKey)) return "missing";
  const ticket = gate.issue(environmentKey, "share");
  if (ticket === null) return "busy";
  const result = await shareMemoryPng(binding.artifact, ports);
  if (!gate.settle(ticket, environmentKey, "share")) return "stale";
  publish(result);
  return result.status;
}

test("locale and theme round trips cannot revive an old artifact", async () => {
  const artifact = await generatedArtifact();
  const transitions = [
    {
      label: "locale",
      first: createMemoryPublicationEnvironmentKey("en", "light"),
      changed: createMemoryPublicationEnvironmentKey("ja", "light"),
    },
    {
      label: "theme",
      first: createMemoryPublicationEnvironmentKey("en", "light"),
      changed: createMemoryPublicationEnvironmentKey("en", "dark"),
    },
  ];

  for (const transition of transitions) {
    const gate = createMemoryPublicationGate();
    gate.activate();
    const original = ownArtifact(gate, transition.first, artifact);

    gate.invalidate();
    assert.equal(
      gate.ownsArtifact(original.ticket, transition.changed),
      false,
      transition.label,
    );
    const changed = ownArtifact(gate, transition.changed, artifact);
    assert.ok(
      changed.ticket.generationToken > original.ticket.generationToken,
      transition.label,
    );

    gate.invalidate();
    assert.equal(
      gate.ownsArtifact(original.ticket, transition.first),
      false,
      transition.label,
    );
    assert.equal(
      gate.ownsArtifact(changed.ticket, transition.first),
      false,
      transition.label,
    );
    const returned = ownArtifact(gate, transition.first, artifact);
    assert.ok(
      returned.ticket.generationToken > changed.ticket.generationToken,
      transition.label,
    );
  }
});

test("pending generation and share cannot publish across locale or theme", async () => {
  const artifact = await generatedArtifact();
  const transitions = [
    [
      createMemoryPublicationEnvironmentKey("en", "light"),
      createMemoryPublicationEnvironmentKey("ko", "light"),
    ],
    [
      createMemoryPublicationEnvironmentKey("en", "light"),
      createMemoryPublicationEnvironmentKey("en", "dark"),
    ],
  ];

  for (const [before, after] of transitions) {
    const generationGate = createMemoryPublicationGate();
    generationGate.activate();
    const toBlobDeferred = deferred();
    const fixture = rendererFixture({ toBlobDeferred });
    const generationPublications = [];
    const pendingGeneration = guardedGeneration(
      generationGate,
      before,
      whitelistedSnapshot(),
      fixture.ports,
      (result) => generationPublications.push(result),
    );
    generationGate.invalidate();
    assert.notEqual(before, after);
    toBlobDeferred.resolve();
    assert.equal(await pendingGeneration, "stale");
    assert.deepEqual(generationPublications, []);

    const shareGate = createMemoryPublicationGate();
    shareGate.activate();
    const binding = ownArtifact(shareGate, before, artifact);
    const shareDeferred = deferred();
    const sharePublications = [];
    const pendingShare = guardedShare(
      shareGate,
      before,
      binding,
      {
        canShare: () => true,
        async share() {
          await shareDeferred.promise;
        },
      },
      (result) => sharePublications.push(result),
    );
    shareGate.invalidate();
    shareDeferred.resolve();
    assert.equal(await pendingShare, "stale");
    assert.deepEqual(sharePublications, []);
  }
});

test("Strict remount, unmount, storage, data, and artifact changes invalidate tickets", async () => {
  const artifact = await generatedArtifact();
  const environmentKey = createMemoryPublicationEnvironmentKey("en", "light");
  const gate = createMemoryPublicationGate();
  gate.activate();
  const first = ownArtifact(gate, environmentKey, artifact);

  const unmountTicket = gate.issue(environmentKey, "share");
  assert.notEqual(unmountTicket, null);
  gate.deactivate();
  assert.equal(gate.settle(unmountTicket, environmentKey, "share"), false);
  assert.equal(gate.ownsArtifact(first.ticket, environmentKey), false);
  assert.equal(gate.issue(environmentKey, "share"), null);

  gate.activate();
  const strictRemount = ownArtifact(gate, environmentKey, artifact);
  gate.invalidate();
  assert.equal(gate.ownsArtifact(strictRemount.ticket, environmentKey), false);

  const afterStorage = ownArtifact(gate, environmentKey, artifact);
  gate.invalidate();
  assert.equal(gate.ownsArtifact(afterStorage.ticket, environmentKey), false);

  const afterData = ownArtifact(gate, environmentKey, artifact);
  const oldShare = gate.issue(environmentKey, "share");
  assert.notEqual(oldShare, null);
  const replacement = gate.issue(environmentKey, "generate");
  assert.notEqual(replacement, null);
  assert.equal(gate.ownsArtifact(afterData.ticket, environmentKey), false);
  assert.equal(gate.settle(oldShare, environmentKey, "share"), false);
  assert.equal(gate.settle(replacement, environmentKey, "generate"), true);
});

test("same-tick double share calls once and stale out-of-order results cannot publish", async () => {
  const artifact = await generatedArtifact();
  const firstEnvironment = createMemoryPublicationEnvironmentKey("en", "light");
  const secondEnvironment = createMemoryPublicationEnvironmentKey("ja", "dark");
  const gate = createMemoryPublicationGate();
  gate.activate();
  const firstBinding = ownArtifact(gate, firstEnvironment, artifact);

  const firstDeferred = deferred();
  let systemShareCalls = 0;
  const publications = [];
  const firstShare = guardedShare(
    gate,
    firstEnvironment,
    firstBinding,
    {
      canShare: () => true,
      async share() {
        systemShareCalls += 1;
        await firstDeferred.promise;
      },
    },
    (result) => publications.push(`first:${result.status}`),
  );
  const duplicateShare = guardedShare(
    gate,
    firstEnvironment,
    firstBinding,
    {
      canShare: () => true,
      async share() {
        systemShareCalls += 1;
      },
    },
    (result) => publications.push(`duplicate:${result.status}`),
  );
  assert.equal(await duplicateShare, "busy");
  assert.equal(systemShareCalls, 1);

  gate.invalidate();
  const secondBinding = ownArtifact(gate, secondEnvironment, artifact);
  const secondDeferred = deferred();
  const secondShare = guardedShare(
    gate,
    secondEnvironment,
    secondBinding,
    {
      canShare: () => true,
      async share() {
        systemShareCalls += 1;
        await secondDeferred.promise;
      },
    },
    (result) => publications.push(`second:${result.status}`),
  );
  assert.equal(systemShareCalls, 2);

  secondDeferred.resolve();
  assert.equal(await secondShare, "shared");
  assert.deepEqual(publications, ["second:shared"]);

  firstDeferred.resolve();
  assert.equal(await firstShare, "stale");
  assert.deepEqual(publications, ["second:shared"]);
});

test("Web Share sends files only and reports success, rejection, and cancellation", async () => {
  const artifact = await generatedArtifact();
  let sharedPayload = null;
  let journeyWrites = 0;
  const supported = {
    canShare(payload) {
      assert.deepEqual(Object.keys(payload), ["files"]);
      return true;
    },
    async share(payload) {
      sharedPayload = payload;
    },
  };

  assert.equal(canShareMemoryPng(artifact, supported), true);
  assert.deepEqual(await shareMemoryPng(artifact, supported), {
    status: "shared",
    journeyMutation: "none",
  });
  assert.deepEqual(Object.keys(sharedPayload), ["files"]);
  assert.deepEqual(sharedPayload.files, [artifact.file]);
  assert.equal("title" in sharedPayload, false);
  assert.equal("text" in sharedPayload, false);
  assert.equal("url" in sharedPayload, false);
  assertExcludesSensitiveText(sharedPayload);

  assert.deepEqual(
    await shareMemoryPng(artifact, {
      canShare: () => true,
      async share() {
        throw new Error("share rejected");
      },
    }),
    { status: "rejected", journeyMutation: "none" },
  );

  assert.deepEqual(
    await shareMemoryPng(artifact, {
      canShare: () => true,
      async share() {
        const error = new Error("user cancelled");
        error.name = "AbortError";
        throw error;
      },
    }),
    { status: "cancelled", journeyMutation: "none" },
  );
  assert.equal(journeyWrites, 0);
});

test("unsupported Web Share exposes local download only", async () => {
  const artifact = await generatedArtifact();
  let shareCalls = 0;
  const unsupported = {
    canShare() {
      return false;
    },
    async share() {
      shareCalls += 1;
    },
  };
  assert.equal(canShareMemoryPng(artifact, unsupported), false);
  assert.deepEqual(await shareMemoryPng(artifact, unsupported), {
    status: "unsupported",
    journeyMutation: "none",
  });
  assert.equal(shareCalls, 0);

  const anchor = {
    href: "",
    download: "",
    rel: "",
    clicked: 0,
    removed: 0,
    click() {
      this.clicked += 1;
    },
    remove() {
      this.removed += 1;
    },
  };
  let appended = 0;
  let revoked = null;
  const downloadResult = downloadMemoryPng(artifact, {
    createObjectUrl(blob) {
      assert.equal(blob, artifact.blob);
      return "blob:atlas-memory-local";
    },
    revokeObjectUrl(url) {
      revoked = url;
    },
    createAnchor() {
      return anchor;
    },
    appendAnchor(value) {
      assert.equal(value, anchor);
      appended += 1;
    },
  });
  assert.deepEqual(downloadResult, {
    status: "started",
    journeyMutation: "none",
  });
  assert.equal(anchor.href, "blob:atlas-memory-local");
  assert.equal(anchor.download, "atlas-memory.png");
  assert.equal(anchor.rel, "noopener");
  assert.equal(anchor.clicked, 1);
  assert.equal(anchor.removed, 1);
  assert.equal(appended, 1);
  assert.equal(revoked, "blob:atlas-memory-local");
  assertExcludesSensitiveText(anchor.href);
});

test("download failures are explicit and still clean up transient URLs", async () => {
  const artifact = await generatedArtifact();
  let removed = 0;
  let revoked = 0;
  assert.deepEqual(
    downloadMemoryPng(artifact, {
      createObjectUrl() {
        return "blob:atlas-memory-local";
      },
      revokeObjectUrl() {
        revoked += 1;
      },
      createAnchor() {
        return {
          href: "",
          download: "",
          rel: "",
          click() {
            throw new Error("download blocked");
          },
          remove() {
            removed += 1;
          },
        };
      },
      appendAnchor() {},
    }),
    { status: "failed", journeyMutation: "none" },
  );
  assert.equal(removed, 1);
  assert.equal(revoked, 1);

  assert.deepEqual(
    downloadMemoryPng(artifact, {
      createObjectUrl() {
        throw new Error("object URL failed");
      },
      revokeObjectUrl() {},
      createAnchor() {
        throw new Error("must not create anchor");
      },
      appendAnchor() {},
    }),
    { status: "failed", journeyMutation: "none" },
  );

  assert.deepEqual(
    downloadMemoryPng(artifact, {
      createObjectUrl() {
        return "blob:atlas-memory-local";
      },
      revokeObjectUrl() {
        throw new Error("cleanup failed");
      },
      createAnchor() {
        return {
          href: "",
          download: "",
          rel: "",
          click() {},
          remove() {
            throw new Error("cleanup failed");
          },
        };
      },
      appendAnchor() {},
    }),
    { status: "started", journeyMutation: "none" },
  );
});

test("the production implementation uses native PNG and has no Journey write path", async () => {
  const productionRelativePaths = [
    "components/memory/MemoryPage.tsx",
    "components/memory/MemoryPreview.tsx",
    "i18n/memory/messages.ts",
    "share/memory-browser.ts",
    "share/memory-draw-plan.ts",
    "share/memory-selection.ts",
  ];
  const sources = await Promise.all(
    productionRelativePaths.map((path) =>
      readFile(join(sourceRoot, path), "utf8"),
    ),
  );
  const productionSource = sources.join("\n");
  const browserSource = sources[3];
  const pageSource = sources[0];

  assert.match(browserSource, /document\.createElement\("canvas"\)/);
  assert.match(browserSource, /canvas\.toBlob/);
  assert.match(browserSource, /"image\/png"/);
  assert.match(browserSource, /new File/);
  assert.match(browserSource, /navigator\.canShare/);
  assert.match(browserSource, /navigator\.share/);
  assert.match(browserSource, /URL\.createObjectURL/);
  assert.match(pageSource, /\.read\(\)/);
  assert.match(pageSource, /const \{ locale, theme \} = useShell\(\)/);
  assert.match(
    pageSource,
    /createMemoryPublicationEnvironmentKey\(locale, theme\)/,
  );
  assert.match(
    pageSource,
    /key=\{`\$\{environmentKey\}:\$\{publicationRevision\}`\}/,
  );
  assert.match(pageSource, /publicationGate\.issue\(environmentKey, "share"\)/);
  assert.match(
    pageSource,
    /publicationGate\.invalidate\(\);\s*\}, \[environmentKey, publicationGate\]\)/,
  );
  assert.doesNotMatch(
    pageSource,
    /LocalizedArtifact|localizedArtifact|generatingLocale|sharingLocale/,
  );
  assert.deepEqual(
    [...pageSource.matchAll(/repository\.([A-Za-z]+)/g)].map(
      (match) => match[1],
    ),
    ["read"],
  );
  assert.doesNotMatch(browserSource, /journey-storage|JourneyRepository/);
  assert.doesNotMatch(
    productionSource,
    /compareAndWrite|\.replace\(|deleteAll|setItem\(|removeItem\(/,
  );
  assert.doesNotMatch(
    productionSource,
    /localStorage|sessionStorage|"atlas:[^"]+"|location\.search|location\.hash|URLSearchParams|console\./,
  );
  assert.doesNotMatch(productionSource, /html2canvas|\bQR\b|\bcover\b/i);
  assert.doesNotMatch(productionSource, /\b(?:mock|stub|demo)\b/i);
});

test("the route is fixed, noindex, localized by the one existing U1 shell", async () => {
  const routeSource = await readFile(
    join(sourceRoot, "app", "memory", "page.tsx"),
    "utf8",
  );
  const rootLayoutSource = await readFile(
    join(sourceRoot, "app", "layout.tsx"),
    "utf8",
  );
  const pageSource = await readFile(
    join(sourceRoot, "components", "memory", "MemoryPage.tsx"),
    "utf8",
  );
  const messageSource = await readFile(
    join(sourceRoot, "i18n", "memory", "messages.ts"),
    "utf8",
  );
  const routeEntries = await readdir(join(sourceRoot, "app", "memory"), {
    withFileTypes: true,
  });

  assert.deepEqual(
    routeEntries.map((entry) => entry.name),
    ["page.tsx"],
  );
  assert.equal(
    routeEntries.some((entry) => entry.name.includes("[")),
    false,
  );
  assert.match(routeSource, /robots:\s*{/);
  assert.match(routeSource, /index:\s*false/);
  assert.match(routeSource, /follow:\s*false/);
  assert.doesNotMatch(
    routeSource,
    /params|generateStaticParams|AtlasShell|ShellProvider/,
  );
  assert.equal((rootLayoutSource.match(/<AtlasShell\b/g) ?? []).length, 1);
  assert.match(pageSource, /useShell\(\)/);
  assert.doesNotMatch(
    pageSource,
    /navigator\.language|resolveShellLocale|SHELL_MESSAGES|AtlasShell|ShellProvider/,
  );
  assert.match(messageSource, /import type { ShellLocale }/);
  assert.deepEqual(Object.keys(MEMORY_MESSAGES).sort(), [
    "en",
    "ja",
    "ko",
    "zh-CN",
  ]);
  assert.equal((pageSource.match(/<select\b/g) ?? []).length, 1);
});

test("empty and unsafe local reads fail closed without synthetic data", () => {
  assert.deepEqual(createMemorySourceCandidates({ status: "absent" }), {
    status: "empty",
  });
  for (const read of [
    { status: "corrupt", raw: sensitive.raw },
    { status: "future-version", raw: sensitive.raw, version: 2 },
    {
      status: "invalid",
      raw: sensitive.raw,
      issue: { path: "$", message: "invalid" },
    },
    { status: "read-failed", raw: sensitive.raw, error: "read failed" },
  ]) {
    assert.deepEqual(createMemorySourceCandidates(read), {
      status: "unavailable",
    });
  }
});
