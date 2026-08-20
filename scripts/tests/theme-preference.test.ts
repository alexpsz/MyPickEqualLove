import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  AUTO_THEME_PREFERENCE,
  THEME_COLORS,
  applyThemeToRoot,
  createThemeBootstrapScript,
  parseThemePreference,
  persistThemePreference,
  readStoredThemePreference,
  readThemeStateFromDataset,
  resolveTheme,
} from "../../src/utils/themePreference";

test("invalid stored values fail closed to auto", () => {
  assert.equal(parseThemePreference("unexpected"), AUTO_THEME_PREFERENCE);
  assert.equal(parseThemePreference(null), AUTO_THEME_PREFERENCE);
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
});

test("auto resolves against the current system preference", () => {
  assert.equal(resolveTheme("auto", false), "light");
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("dataset initialization never needs a storage read", () => {
  assert.deepEqual(
    readThemeStateFromDataset({
      theme: "dark",
      themePreference: "auto",
    }),
    { preference: "auto", theme: "dark" },
  );
  assert.deepEqual(
    readThemeStateFromDataset({
      theme: "invalid",
      themePreference: "broken",
    }),
    { preference: "auto", theme: "light" },
  );
});

test("storage failures retain the auto fallback", () => {
  const failingStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(
    readStoredThemePreference(failingStorage, "theme"),
    AUTO_THEME_PREFERENCE,
  );
  assert.equal(persistThemePreference(failingStorage, "theme", "dark"), false);
});

test("explicit selections persist while auto removes the override", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  assert.equal(persistThemePreference(storage, "theme", "dark"), true);
  assert.equal(values.get("theme"), "dark");
  assert.equal(persistThemePreference(storage, "theme", "auto"), true);
  assert.equal(values.has("theme"), false);
});

test("theme application synchronizes dataset, color scheme, and theme-color", () => {
  const root = {
    dataset: {} as DOMStringMap,
    style: {} as CSSStyleDeclaration,
  };
  const meta = { content: "" };

  applyThemeToRoot(root, "dark", "dark", meta);

  assert.deepEqual(root.dataset, {
    theme: "dark",
    themePreference: "dark",
  });
  assert.equal(root.style.colorScheme, "dark");
  assert.equal(meta.content, THEME_COLORS.dark);
});

test("bootstrap short-circuits the export realm before storage or matchMedia", () => {
  const script = createThemeBootstrapScript(
    "#__mypick_export_realm_v4",
    "equal_love_theme_preference_v1",
  );
  const exportRealmCheck = script.indexOf("window.parent!==window");
  const storageRead = script.indexOf("window.localStorage.getItem");
  const matchMediaRead = script.indexOf("window.matchMedia");

  assert.ok(exportRealmCheck >= 0);
  assert.ok(exportRealmCheck < storageRead);
  assert.ok(exportRealmCheck < matchMediaRead);
  assert.match(script, /applyTheme\('auto','light'\);return/);

  const result = runBootstrap(script, {
    exportRealm: true,
    storedPreference: "dark",
    prefersDark: true,
  });
  assert.equal(result.storageReads, 0);
  assert.equal(result.matchMediaReads, 0);
  assert.deepEqual(result.root.dataset, {
    theme: "light",
    themePreference: "auto",
  });
  assert.equal(result.root.style.colorScheme, "light");
  assert.equal(result.meta.content, THEME_COLORS.light);
});

test("bootstrap only queries matchMedia for the auto preference", () => {
  const script = createThemeBootstrapScript("#export", "theme");

  const explicitResult = runBootstrap(script, {
    storedPreference: "dark",
    prefersDark: false,
  });
  assert.equal(explicitResult.storageReads, 1);
  assert.equal(explicitResult.matchMediaReads, 0);
  assert.equal(explicitResult.root.dataset.theme, "dark");

  const autoResult = runBootstrap(script, {
    storedPreference: "invalid",
    prefersDark: true,
  });
  assert.equal(autoResult.storageReads, 1);
  assert.equal(autoResult.matchMediaReads, 1);
  assert.deepEqual(autoResult.root.dataset, {
    theme: "dark",
    themePreference: "auto",
  });
});

function runBootstrap(
  script: string,
  {
    exportRealm = false,
    storedPreference,
    prefersDark,
  }: {
    exportRealm?: boolean;
    storedPreference: string | null;
    prefersDark: boolean;
  },
) {
  let storageReads = 0;
  let matchMediaReads = 0;
  const root = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: "" },
  };
  const meta = { content: "" };
  const windowLike = {
    parent: null as unknown,
    location: {
      hash: exportRealm ? "#__mypick_export_realm_v4" : "",
    },
    localStorage: {
      getItem: () => {
        storageReads += 1;
        return storedPreference;
      },
    },
    matchMedia: () => {
      matchMediaReads += 1;
      return { matches: prefersDark };
    },
  };
  windowLike.parent = exportRealm ? {} : windowLike;

  runInNewContext(script, {
    window: windowLike,
    document: {
      documentElement: root,
      querySelector: () => meta,
    },
  });

  return { root, meta, storageReads, matchMediaReads };
}
