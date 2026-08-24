import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ATLAS_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

function readAtlasFile(relativePath) {
  return readFileSync(path.join(ATLAS_ROOT, relativePath), "utf8");
}

test("the product-family adapter reads MyPick URLs from the canonical registry", () => {
  const navigation = readAtlasFile("src/config/product-family-navigation.ts");

  assert.ok(navigation.includes('from "../../../../src/projects/registry"'));
  assert.match(navigation, /PROJECTS\[siteId\]\.config\.siteUrl/);
  assert.match(navigation, /PUBLIC_ATLAS_SITE_IDS/);
  assert.doesNotMatch(navigation, /https?:\/\//);
});

test("the shell supplies the four bounded locales", () => {
  const messages = readAtlasFile("src/i18n/shell/messages.ts");

  for (const locale of ["zh-CN", "en", "ja", "ko"]) {
    assert.match(messages, new RegExp(`(?:")?${locale}(?:")?:\\s*\\{`));
  }

  assert.match(messages, /primaryAction/);
  assert.match(messages, /privacyDescription/);
});

test("the static home names a local Journey action without releasing shared activity", () => {
  const shell = readAtlasFile("src/components/shell/atlas-shell.tsx");
  const home = readAtlasFile("src/features/home/atlas-home.tsx");

  assert.match(home, /primaryAction/);
  assert.match(home, /local-custom-event/);
  assert.match(home, /sourceStatus/);
  assert.doesNotMatch(shell, /Events/);
  assert.doesNotMatch(shell, /events/);
});

test("the shell keeps keyboard focus and compact layouts explicit", () => {
  const styles = readAtlasFile("src/app/globals.css");

  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /minmax\(0, 1fr\)/);
  assert.match(styles, /overflow-x: clip/);
});
