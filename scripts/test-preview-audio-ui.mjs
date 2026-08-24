import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function loadTranspiledModule(relativePath, mocks = {}) {
  const filename = resolve(repositoryRoot, relativePath);
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    return require(specifier);
  };
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) { ${output}\n})`,
    { filename: `${filename}.compiled.cjs` },
  );
  wrapper(
    compiledModule.exports,
    localRequire,
    compiledModule,
    filename,
    dirname(filename),
  );
  return compiledModule.exports;
}

const appIconModule = {
  __esModule: true,
  default: ({ name }) => React.createElement("svg", { "data-icon": name }),
};
const coverPreviewState = {
  playingSongId: null,
  status: "idle",
  failedSongIds: new Set(),
  toggle: () => {},
};
const componentModule = loadTranspiledModule(
  "src/components/OfficialMediaLinks.tsx",
  {
    "../i18n/LocaleProvider": { useLocale: () => ({ t: (key) => key }) },
    "../utils/officialMedia": {
      getPrimaryOfficialMediaLink: () => undefined,
      getOfficialMediaLinks: () => [],
      OFFICIAL_MEDIA_MESSAGE_KEYS: {},
    },
    "../utils/previewMedia": {
      getPreviewMedia: () => ({
        previewUrl: "https://audio-ssl.itunes.apple.com/test.m4a",
        trackViewUrl: "https://music.apple.com/test",
      }),
    },
    "./AppIcon": appIconModule,
    "./PreviewAudioProvider": {
      usePreviewAudio: () => coverPreviewState,
    },
  },
);
const {
  OfficialMediaCoverLink,
  PreviewMediaControlView,
  resolvePreviewMediaControlMode,
} = componentModule;

const sharedViewProps = {
  className: "control",
  previewTitle: "Stop preview",
  previewAriaLabel: "Stop previewing Test Song",
  officialHref: "https://www.youtube.com/watch?v=abcdefghijk",
  officialTitle: "Official MV",
  officialAriaLabel: "Open Official MV for Test Song",
  onToggle: () => {},
};

const previewMode = resolvePreviewMediaControlMode({
  hasPreview: true,
  failed: false,
  hasOfficialLink: true,
});
const previewMarkup = renderToStaticMarkup(
  React.createElement(PreviewMediaControlView, {
    ...sharedViewProps,
    mode: previewMode,
    isActive: true,
  }),
);
assert.match(previewMarkup, /^<button\b/);
assert.match(previewMarkup, /aria-pressed="true"/);
assert.match(previewMarkup, /aria-label="Stop previewing Test Song"/);
assert.match(previewMarkup, /data-icon="pause"/);
assert.doesNotMatch(previewMarkup, /style="width:/);
assert.doesNotMatch(previewMarkup, /aria-hidden="true"/);
assert.doesNotMatch(previewMarkup, /role="status"/);

const idlePreviewMarkup = renderToStaticMarkup(
  React.createElement(PreviewMediaControlView, {
    ...sharedViewProps,
    mode: previewMode,
    isActive: false,
  }),
);
assert.match(idlePreviewMarkup, /^<button\b/);
assert.match(idlePreviewMarkup, /aria-pressed="false"/);
assert.match(idlePreviewMarkup, /data-icon="play"/);
assert.doesNotMatch(idlePreviewMarkup, /style="width:/);
assert.doesNotMatch(idlePreviewMarkup, /aria-hidden="true"/);

for (const scenario of [
  { hasPreview: false, failed: false, hasOfficialLink: true },
  { hasPreview: true, failed: true, hasOfficialLink: true },
]) {
  const fallbackMarkup = renderToStaticMarkup(
    React.createElement(PreviewMediaControlView, {
      ...sharedViewProps,
      mode: resolvePreviewMediaControlMode(scenario),
      isActive: false,
    }),
  );
  assert.match(fallbackMarkup, /^<a\b/);
  assert.match(fallbackMarkup, /href="https:\/\/www\.youtube\.com/);
  assert.doesNotMatch(fallbackMarkup, /<button\b/);
}

assert.equal(
  renderToStaticMarkup(
    React.createElement(PreviewMediaControlView, {
      ...sharedViewProps,
      mode: resolvePreviewMediaControlMode({
        hasPreview: false,
        failed: false,
        hasOfficialLink: false,
      }),
      isActive: false,
    }),
  ),
  "",
);

const renderCoverControl = () =>
  renderToStaticMarkup(
    React.createElement(
      OfficialMediaCoverLink,
      { songId: "test-song", title: "Test Song", className: "cover" },
      React.createElement("span", null, "Cover"),
    ),
  );

const idleCoverMarkup = renderCoverControl();
assert.match(idleCoverMarkup, /^<button\b/);
assert.match(idleCoverMarkup, /aria-pressed="false"/);
assert.match(idleCoverMarkup, /data-icon="play"/);
assert.doesNotMatch(idleCoverMarkup, /style="width:/);

coverPreviewState.playingSongId = "test-song";
coverPreviewState.status = "playing";
const activeCoverMarkup = renderCoverControl();
assert.match(activeCoverMarkup, /aria-pressed="true"/);
assert.match(activeCoverMarkup, /data-icon="pause"/);
assert.doesNotMatch(activeCoverMarkup, /style="width:/);
assert.equal(
  activeCoverMarkup
    .replace(/aria-pressed="true"/, 'aria-pressed="false"')
    .replace(/data-icon="pause"/, 'data-icon="play"')
    .replace(/preview\.stopAria/, "preview.playAria")
    .replace(/preview\.stop"/, 'preview.play"'),
  idleCoverMarkup,
  "playing and idle preview controls must differ only by icon, pressed state, and label",
);

const { messages } = loadTranspiledModule("src/i18n/messages.ts");
const previewKeys = [
  "songDetail.preview.play",
  "songDetail.preview.stop",
  "songDetail.preview.playAria",
  "songDetail.preview.stopAria",
  "songDetail.preview.attribution",
  "songDetail.appleMusic",
];
for (const locale of ["en", "ja", "zh-CN", "ko"]) {
  for (const key of previewKeys) {
    assert.equal(typeof messages[locale][key], "string", `${locale}/${key}`);
    assert.notEqual(messages[locale][key].trim(), "", `${locale}/${key}`);
  }
  assert.match(messages[locale]["songDetail.preview.playAria"], /\{title\}/);
  assert.match(messages[locale]["songDetail.preview.stopAria"], /\{title\}/);
}

console.log("Preview audio UI contracts passed.");
