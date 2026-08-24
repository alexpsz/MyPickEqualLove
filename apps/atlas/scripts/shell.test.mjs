import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ATLAS_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const COMPILED_ROOT = mkdtempSync(join(tmpdir(), "atlas-shell-test-"));

after(async () => {
  await rm(COMPILED_ROOT, { recursive: true, force: true });
});

function readAtlasFile(relativePath) {
  return readFileSync(join(ATLAS_ROOT, relativePath), "utf8");
}

async function compileShellModule(relativePath) {
  const sourcePath = join(ATLAS_ROOT, relativePath);
  const outputPath = join(
    COMPILED_ROOT,
    relative(join(ATLAS_ROOT, "src"), sourcePath).replace(/\.ts$/, ".js"),
  );
  const source = await readFile(sourcePath, "utf8");
  const output = typescript.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.CommonJS,
    },
  }).outputText;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}

await Promise.all(
  [
    "src/i18n/shell/messages.ts",
    "src/i18n/shell/shell-preferences.ts",
    "src/i18n/shell/shell-routes.ts",
  ].map(compileShellModule),
);

const messages = require(join(COMPILED_ROOT, "i18n/shell/messages.js"));
const preferences = require(
  join(COMPILED_ROOT, "i18n/shell/shell-preferences.js"),
);
const routes = require(join(COMPILED_ROOT, "i18n/shell/shell-routes.js"));

function extractCssRule(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing CSS selector: ${selector}`);
  const openingBrace = source.indexOf("{", start);
  const closingBrace = source.indexOf("}", openingBrace);
  return source.slice(openingBrace + 1, closingBrace);
}

function extractCssTokens(source, selector) {
  const rule = extractCssRule(source, selector);
  return Object.fromEntries(
    [...rule.matchAll(/(--atlas-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(
      ([, name, value]) => [name, value.toLowerCase()],
    ),
  );
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const [lighter, darker] = [foregroundLuminance, backgroundLuminance].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function executeThemeBootstrap({
  prefersDark = false,
  storedValue = null,
  storageThrows = false,
} = {}) {
  const root = { dataset: {}, style: {} };
  const context = {
    document: { documentElement: root },
    window: {
      localStorage: {
        getItem() {
          if (storageThrows) {
            throw new Error("storage unavailable");
          }

          return storedValue;
        },
      },
      matchMedia() {
        return { matches: prefersDark };
      },
    },
  };

  runInNewContext(preferences.SHELL_THEME_BOOTSTRAP_SCRIPT, context);
  return root;
}

test("the product-family adapter reads MyPick URLs from the canonical registry", () => {
  const navigation = readAtlasFile("src/config/product-family-navigation.ts");

  assert.ok(navigation.includes('from "../../../../src/projects/registry"'));
  assert.match(navigation, /PROJECTS\[siteId\]\.config\.siteUrl/);
  assert.match(navigation, /PUBLIC_ATLAS_SITE_IDS/);
  assert.doesNotMatch(navigation, /https?:\/\//);
});

test("the shell preference resolver keeps locale and theme input bounded", () => {
  assert.deepEqual(
    preferences.parseShellPreferences('{"locale":"ja","theme":"dark"}'),
    { locale: "ja", theme: "dark" },
  );
  assert.deepEqual(preferences.parseShellPreferences("not-json"), {});
  assert.deepEqual(
    preferences.parseShellPreferences('{"locale":"fr","theme":"neon"}'),
    { locale: undefined, theme: undefined },
  );
  assert.deepEqual(
    preferences.resolveShellPreferences({
      browserLocales: ["ko-KR"],
      prefersDark: true,
      storedValue: null,
    }),
    { locale: "ko", theme: "dark" },
  );
  assert.deepEqual(
    preferences.resolveShellPreferences({
      browserLanguage: "ja-JP",
      prefersDark: false,
      storedValue: '{"locale":"zh-CN","theme":"dark"}',
    }),
    { locale: "zh-CN", theme: "dark" },
  );
  assert.equal(
    preferences.resolveShellLocale(["en-US", "ja-JP"], undefined),
    "en",
  );
  assert.equal(
    preferences.resolveShellLocale(["en_US", "ja-JP"], undefined),
    "ja",
  );
  assert.equal(
    preferences.resolveShellLocale(["fr-FR", "ko-KR", "en-GB"], undefined),
    "ko",
  );
  assert.equal(preferences.resolveShellLocale(["invalid-tag"], "ja-JP"), "ja");
});

test("the pre-paint bootstrap renders as a native parser-blocking script and fails safe", () => {
  const layout = readAtlasFile("src/app/layout.tsx");
  const head = layout.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  const renderedScript = renderToStaticMarkup(
    createElement("script", {
      dangerouslySetInnerHTML: {
        __html: preferences.SHELL_THEME_BOOTSTRAP_SCRIPT,
      },
      id: "atlas-theme-bootstrap",
    }),
  );
  const storedDark = executeThemeBootstrap({
    prefersDark: false,
    storedValue: '{"locale":"en","theme":"dark"}',
  });
  const storageFailure = executeThemeBootstrap({
    prefersDark: true,
    storageThrows: true,
  });
  const malformedStorage = executeThemeBootstrap({
    prefersDark: true,
    storedValue: "{bad-json",
  });

  assert.ok(head);
  assert.match(head, /<script/);
  assert.match(
    head,
    /dangerouslySetInnerHTML=\{\{ __html: SHELL_THEME_BOOTSTRAP_SCRIPT \}\}/,
  );
  assert.doesNotMatch(layout, /next\/script/);
  assert.doesNotMatch(layout, /<Script\b/);
  assert.doesNotMatch(layout, /__next_s/);
  assert.ok(renderedScript.includes("root.dataset.theme = theme;"));
  assert.ok(renderedScript.includes("root.style.colorScheme = theme;"));
  assert.doesNotMatch(renderedScript, /__next_s/);
  assert.ok(
    preferences.SHELL_THEME_BOOTSTRAP_SCRIPT.includes(
      preferences.SHELL_PREFERENCES_STORAGE_KEY,
    ),
  );
  assert.deepEqual(storedDark.dataset, { theme: "dark" });
  assert.deepEqual(storedDark.style, { colorScheme: "dark" });
  assert.deepEqual(storageFailure.dataset, { theme: "dark" });
  assert.deepEqual(malformedStorage.dataset, { theme: "dark" });
});

test("the four shell locales include skip-copy parity and language option tags", () => {
  const shell = readAtlasFile("src/components/shell/atlas-shell.tsx");

  assert.deepEqual(messages.SHELL_LOCALES, ["zh-CN", "en", "ja", "ko"]);
  for (const locale of messages.SHELL_LOCALES) {
    const message = messages.SHELL_MESSAGES[locale];
    assert.equal(typeof message.languageName, "string");
    assert.ok(message.languageName.trim());
    assert.equal(typeof message.navigation.skipToMain, "string");
    assert.ok(message.navigation.skipToMain.trim());
  }

  assert.match(
    shell,
    /<option key=\{language\} lang=\{language\} value=\{language\}>/,
  );
});

test("the shell navigation targets the future static routes and marks only the current route", () => {
  const shell = readAtlasFile("src/components/shell/atlas-shell.tsx");
  const home = readAtlasFile("src/features/home/atlas-home.tsx");

  assert.deepEqual(routes.SHELL_ROUTES, {
    home: "/",
    journey: "/journey/",
    localEvent: "/local-event/",
  });
  assert.equal(routes.isCurrentShellRoute("/", routes.SHELL_ROUTES.home), true);
  assert.equal(
    routes.isCurrentShellRoute("/journey", routes.SHELL_ROUTES.journey),
    true,
  );
  assert.equal(
    routes.isCurrentShellRoute("/local-event/", routes.SHELL_ROUTES.home),
    false,
  );
  assert.equal(
    routes.isCurrentShellRoute(null, routes.SHELL_ROUTES.home),
    false,
  );
  assert.match(shell, /usePathname/);
  assert.match(shell, /isCurrentShellRoute\(pathname, SHELL_ROUTES\.home\)/);
  assert.match(shell, /isCurrentShellRoute\(pathname, SHELL_ROUTES\.journey\)/);
  assert.match(
    shell,
    /isCurrentShellRoute\(pathname, SHELL_ROUTES\.localEvent\)/,
  );
  assert.match(shell, /href=\{SHELL_ROUTES\.journey\}/);
  assert.match(shell, /href=\{SHELL_ROUTES\.localEvent\}/);
  assert.match(home, /href=\{SHELL_ROUTES\.localEvent\}/);
  assert.doesNotMatch(shell, /aria-current="page"/);
  assert.doesNotMatch(shell, /Events/);
  assert.doesNotMatch(shell, /events/);
});

test("accent foregrounds retain contrast in light and dark default and hover states", () => {
  const styles = readAtlasFile("src/app/globals.css");
  const lightTokens = extractCssTokens(styles, ":root {");
  const darkTokens = extractCssTokens(styles, ':root[data-theme="dark"] {');
  const minimumContrast = 4.5;

  // Negative control: the reviewer-found white-on-dark-accent pair is invalid.
  assert.ok(contrastRatio("#ffffff", "#9eb6ff") < minimumContrast);

  for (const [theme, tokens] of [
    ["light", lightTokens],
    ["dark", darkTokens],
  ]) {
    assert.ok(
      contrastRatio(tokens["--atlas-on-accent"], tokens["--atlas-accent"]) >=
        minimumContrast,
      `${theme} default accent contrast must meet ${minimumContrast}:1`,
    );
    assert.ok(
      contrastRatio(
        tokens["--atlas-on-accent"],
        tokens["--atlas-accent-strong"],
      ) >= minimumContrast,
      `${theme} hover accent contrast must meet ${minimumContrast}:1`,
    );
  }

  assert.match(
    extractCssRule(styles, ".atlas-shell__brand-mark"),
    /color: var\(--atlas-on-accent\)/,
  );
  assert.match(
    extractCssRule(styles, ".atlas-home__primary-action"),
    /color: var\(--atlas-on-accent\)/,
  );
  assert.match(
    extractCssRule(styles, ".atlas-home__primary-action:hover"),
    /background: var\(--atlas-accent-strong\)/,
  );
});

test("the shell keeps keyboard focus and compact layouts explicit", () => {
  const styles = readAtlasFile("src/app/globals.css");

  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /minmax\(0, 1fr\)/);
  assert.match(styles, /overflow-x: clip/);
});
