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
const componentModule = loadTranspiledModule(
  "src/components/OfficialMediaLinks.tsx",
  {
    "../i18n/LocaleProvider": { useLocale: () => ({ t: (key) => key }) },
    "../utils/officialMedia": {
      getPrimaryOfficialMediaLink: () => undefined,
      getOfficialMediaLinks: () => [],
      OFFICIAL_MEDIA_MESSAGE_KEYS: {},
    },
    "../utils/previewMedia": { getPreviewMedia: () => undefined },
    "./AppIcon": appIconModule,
    "./PreviewAudioProvider": { usePreviewAudio: () => ({}) },
  },
);
const { PreviewMediaControlView, resolvePreviewMediaControlMode } =
  componentModule;

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
    progress: 0.42,
    firstUseNotice: "Privacy notice",
  }),
);
assert.match(previewMarkup, /^<button\b/);
assert.match(previewMarkup, /aria-pressed="true"/);
assert.match(previewMarkup, /aria-label="Stop previewing Test Song"/);
assert.match(previewMarkup, /data-icon="pause"/);
assert.match(previewMarkup, /style="width:42%"/);
assert.match(previewMarkup, /role="status"/);

for (const scenario of [
  { hasPreview: false, failed: false, hasOfficialLink: true },
  { hasPreview: true, failed: true, hasOfficialLink: true },
]) {
  const fallbackMarkup = renderToStaticMarkup(
    React.createElement(PreviewMediaControlView, {
      ...sharedViewProps,
      mode: resolvePreviewMediaControlMode(scenario),
      isActive: false,
      progress: 0,
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
      progress: 0,
    }),
  ),
  "",
);

const oneNoticeMarkup = renderToStaticMarkup(
  React.createElement(
    React.Fragment,
    null,
    React.createElement(PreviewMediaControlView, {
      ...sharedViewProps,
      mode: "preview",
      isActive: false,
      progress: 0,
      firstUseNotice: "Privacy notice",
    }),
    React.createElement(PreviewMediaControlView, {
      ...sharedViewProps,
      mode: "preview",
      isActive: false,
      progress: 0,
    }),
  ),
);
assert.equal(oneNoticeMarkup.match(/role="status"/g)?.length, 1);

const { messages } = loadTranspiledModule("src/i18n/messages.ts");
const previewKeys = [
  "songDetail.preview.play",
  "songDetail.preview.stop",
  "songDetail.preview.playAria",
  "songDetail.preview.stopAria",
  "songDetail.preview.attribution",
  "songDetail.appleMusic",
  "songDetail.preview.firstUseNote",
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
