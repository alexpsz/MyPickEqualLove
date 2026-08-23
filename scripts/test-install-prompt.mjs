import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const isStripTypesChild = process.argv.includes("--strip-types-child");
let temporaryRoot = null;
let utility;

if (isStripTypesChild) {
  utility = await import(
    pathToFileURL(path.join(repositoryRoot, "src", "utils", "installPrompt.ts"))
      .href
  );
} else {
  try {
    const importedTypeScript = await import("typescript");
    const ts = importedTypeScript.default ?? importedTypeScript;
    temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "mypick-install-prompt-"),
    );
    utility = await compileInstallPromptUtility(temporaryRoot, ts);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    const child = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        "--experimental-strip-types",
        fileURLToPath(import.meta.url),
        "--strip-types-child",
      ],
      { stdio: "inherit" },
    );
    process.exit(child.status ?? 1);
  }
}

after(async () => {
  if (temporaryRoot) {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("install hint state is versioned and corrupt/future values fail closed", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(utility.readInstallHintState(storage, "hint"), {
    status: "absent",
    state: null,
  });

  storage.setItem("hint", "not json");
  assert.equal(utility.readInstallHintState(storage, "hint").status, "invalid");
  assert.equal(utility.markInstallHintPickCompleted(storage, "hint"), false);
  assert.equal(storage.getItem("hint"), "not json");

  storage.setItem(
    "hint",
    JSON.stringify({
      schemaVersion: 2,
      hasCompletedPick: false,
      dismissed: false,
    }),
  );
  assert.equal(
    utility.readInstallHintState(storage, "hint").status,
    "unsupported",
  );
  assert.equal(utility.dismissInstallHint(storage, "hint"), false);
  assert.equal(JSON.parse(storage.getItem("hint")).schemaVersion, 2);
});

test("first pick and dismiss state persist without losing either fact", () => {
  const storage = new MemoryStorage();
  assert.equal(utility.markInstallHintPickCompleted(storage, "hint"), true);
  assert.deepEqual(JSON.parse(storage.getItem("hint")), {
    schemaVersion: 1,
    hasCompletedPick: true,
    dismissed: false,
  });
  assert.equal(utility.dismissInstallHint(storage, "hint"), true);
  assert.deepEqual(JSON.parse(storage.getItem("hint")), {
    schemaVersion: 1,
    hasCompletedPick: true,
    dismissed: true,
  });
});

test("stored-pick detection accepts standard/live v2 and legacy v1 only", () => {
  const storage = new MemoryStorage({
    equal_love_mypicks_v2: JSON.stringify({
      schemaVersion: 2,
      picks: {},
    }),
    other_project_mypicks_v2: JSON.stringify({
      schemaVersion: 2,
      picks: { "slot-1": "foreign-song" },
    }),
  });
  assert.equal(utility.hasStoredPick(storage, "equal_love"), false);

  storage.setItem(
    "equal_love_live_kokuritsu_2026_day1_picks_v2",
    JSON.stringify({
      schemaVersion: 2,
      picks: { "memory-1": "want-you-want-you" },
    }),
  );
  assert.equal(utility.hasStoredPick(storage, "equal_love"), true);

  storage.clear();
  storage.setItem(
    "equal_love_mypicks_v1",
    JSON.stringify({ "slot-1": "equal-love" }),
  );
  assert.equal(utility.hasStoredPick(storage, "equal_love"), true);
  storage.setItem("equal_love_mypicks_v1", "broken");
  assert.equal(utility.hasStoredPick(storage, "equal_love"), false);
});

test("prompt eligibility waits for a pick and respects standalone/dismiss", () => {
  const base = {
    dismissed: false,
    hasCompletedPick: true,
    hasNativePrompt: true,
    isIosSafari: false,
    isStandalone: false,
  };
  assert.equal(utility.getInstallPromptMode(base), "native");
  assert.equal(
    utility.getInstallPromptMode({ ...base, hasNativePrompt: false }),
    null,
  );
  assert.equal(
    utility.getInstallPromptMode({
      ...base,
      hasNativePrompt: false,
      isIosSafari: true,
    }),
    "ios",
  );
  assert.equal(
    utility.getInstallPromptMode({ ...base, hasCompletedPick: false }),
    null,
  );
  assert.equal(
    utility.getInstallPromptMode({ ...base, dismissed: true }),
    null,
  );
  assert.equal(
    utility.getInstallPromptMode({ ...base, isStandalone: true }),
    null,
  );
});

test("iOS Safari and standalone detection reject lookalike browsers", () => {
  const iosSafari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  assert.equal(
    utility.detectIosSafari({
      maxTouchPoints: 5,
      platform: "iPhone",
      userAgent: iosSafari,
    }),
    true,
  );
  assert.equal(
    utility.detectIosSafari({
      maxTouchPoints: 5,
      platform: "iPhone",
      userAgent: iosSafari.replace("Safari/604.1", "CriOS/140.0 Safari/604.1"),
    }),
    false,
  );
  assert.equal(
    utility.detectIosSafari({
      maxTouchPoints: 5,
      platform: "MacIntel",
      userAgent: iosSafari.replace("iPhone", "Macintosh"),
    }),
    true,
  );
  assert.equal(
    utility.detectStandalone({
      displayModeStandalone: false,
      navigatorStandalone: true,
    }),
    true,
  );
});

test("service worker registration requires production, security, support, and top level", () => {
  const ready = {
    isProduction: true,
    isSecureContext: true,
    isTopLevel: true,
    serviceWorkerSupported: true,
  };
  assert.equal(utility.shouldRegisterServiceWorker(ready), true);
  for (const key of Object.keys(ready)) {
    assert.equal(
      utility.shouldRegisterServiceWorker({ ...ready, [key]: false }),
      false,
      `${key} must be required`,
    );
  }
});

test("layout, registration, copy, and build wiring retain the narrow contracts", async () => {
  const [
    installComponent,
    registrationComponent,
    layout,
    projectConfig,
    copyAssets,
    verifier,
    packageJson,
  ] = await Promise.all([
    readRepositoryFile("src/components/InstallPrompt.tsx"),
    readRepositoryFile("src/components/ServiceWorkerRegistration.tsx"),
    readRepositoryFile("src/app/layout.tsx"),
    readRepositoryFile("src/config/project.ts"),
    readRepositoryFile("scripts/copy-public-assets.mjs"),
    readRepositoryFile("scripts/verify-static-export.mjs"),
    readRepositoryFile("package.json"),
  ]);

  assert.match(installComponent, /beforeinstallprompt/);
  assert.match(installComponent, /hasStoredPick/);
  assert.match(installComponent, /STORAGE_KEYS\.installHint/);
  assert.match(installComponent, /isInstallEnvironmentEligible/);
  assert.match(
    registrationComponent,
    /process\.env\.NODE_ENV === "production"/,
  );
  assert.match(registrationComponent, /window\.isSecureContext/);
  assert.match(registrationComponent, /window\.addEventListener\("load"/);
  assert.match(registrationComponent, /updateViaCache: "none"/);
  assert.ok(
    layout.indexOf("<LocaleProvider>") < layout.indexOf("<InstallPrompt />"),
  );
  assert.match(layout, /<ServiceWorkerRegistration \/>/);
  assert.match(
    projectConfig,
    /installHint: `\$\{PROJECT_CONFIG\.storagePrefix\}_install_hint_v1`/,
  );
  assert.match(copyAssets, /copyCurrentProjectCovers\(source, destination\)/);
  assert.match(verifier, /verifyProjectPublicAssets/);

  const scripts = JSON.parse(packageJson).scripts;
  assert.match(scripts.build, /generate:service-worker/);
  assert.equal(
    scripts["check:service-worker"],
    "node scripts/generate-service-worker.mjs --self-test",
  );
  assert.match(scripts.test, /test:install-prompt/);
  assert.match(scripts.test, /check:service-worker/);
});

async function compileInstallPromptUtility(outputDirectory, ts) {
  const sourcePath = path.join(
    repositoryRoot,
    "src",
    "utils",
    "installPrompt.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repositoryRoot,
        getNewLine: () => os.EOL,
      }),
    );
  }

  const outputPath = path.join(outputDirectory, "installPrompt.mjs");
  await writeFile(outputPath, result.outputText, "utf8");
  return import(pathToFileURL(outputPath).href);
}

function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

class MemoryStorage {
  #values;

  constructor(initial = {}) {
    this.#values = new Map(Object.entries(initial));
  }

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  key(index) {
    return Array.from(this.#values.keys())[index] ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, value);
  }
}
