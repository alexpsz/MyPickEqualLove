import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  inspectStaticExport,
  verifyStaticExport,
} from "./verify-static-export.mjs";
import { validateRepositoryPath } from "../../../scripts/check-repository-boundary.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ATLAS_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const REPOSITORY_ROOT = path.resolve(ATLAS_ROOT, "..", "..");
const require = createRequire(import.meta.url);
const typescript = require("typescript");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

async function loadAtlasNextConfig() {
  const source = readFileSync(path.join(ATLAS_ROOT, "next.config.ts"), "utf8");
  const compiled = typescript.transpileModule(source, {
    fileName: "next.config.ts",
    compilerOptions: {
      module: typescript.ModuleKind.ES2022,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return (await import(moduleUrl)).default;
}

function isIgnoredByGit(repositoryPath) {
  const result = spawnSync(
    "git",
    ["check-ignore", "-q", "--no-index", "--", repositoryPath],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(result.stderr || result.stdout || "git check-ignore failed");
}

function withExportFixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "atlas-foundation-"));
  mkdirSync(path.join(directory, "_next", "static", "chunks"), {
    recursive: true,
  });
  writeFileSync(
    path.join(directory, "index.html"),
    "<!doctype html><h1>Atlas</h1>",
  );
  writeFileSync(
    path.join(directory, "404.html"),
    "<!doctype html><h1>Not found</h1>",
  );
  mkdirSync(path.join(directory, "404"), { recursive: true });
  mkdirSync(path.join(directory, "_not-found"), { recursive: true });
  writeFileSync(
    path.join(directory, "404", "index.html"),
    "<!doctype html><h1>Not found</h1>",
  );
  writeFileSync(
    path.join(directory, "_not-found", "index.html"),
    "<!doctype html><h1>Not found</h1>",
  );
  writeFileSync(
    path.join(directory, "_next", "static", "chunks", "app.js"),
    "",
  );

  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeExportFixtureFile(directory, relativePath, content = "") {
  const filePath = path.join(directory, ...relativePath.split("/"));
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function assertExportRejected(mutateFixture, expectedViolation) {
  withExportFixture((directory) => {
    mutateFixture(directory);

    const inspection = inspectStaticExport(directory);
    assert.deepEqual(inspection.violations, [expectedViolation]);
    assert.throws(
      () => verifyStaticExport(directory),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes(expectedViolation));
        return true;
      },
    );
  });
}

test("Atlas is a private workspace with independent quality commands", () => {
  const repositoryPackage = readJson(
    path.join(REPOSITORY_ROOT, "package.json"),
  );
  const atlasPackage = readJson(path.join(ATLAS_ROOT, "package.json"));

  assert.equal(atlasPackage.private, true);
  assert.deepEqual(repositoryPackage.workspaces, ["apps/atlas"]);

  for (const command of [
    "lint",
    "typecheck",
    "test",
    "build",
    "verify:static-export",
    "verify",
  ]) {
    assert.equal(typeof atlasPackage.scripts[command], "string");
  }

  assert.equal(atlasPackage.scripts.build, "next build --webpack");

  for (const dependency of ["next", "react", "react-dom"]) {
    assert.equal(
      atlasPackage.dependencies[dependency],
      repositoryPackage.dependencies[dependency],
    );
  }
});

test("Atlas keeps its static-export contract local", async () => {
  const nextConfig = readFileSync(
    path.join(ATLAS_ROOT, "next.config.ts"),
    "utf8",
  );
  const executableConfig = await loadAtlasNextConfig();
  const rootTsconfig = readJson(path.join(REPOSITORY_ROOT, "tsconfig.json"));

  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.match(nextConfig, /unoptimized:\s*true/);
  assert.equal(executableConfig.output, "export");
  assert.equal(executableConfig.images.unoptimized, true);

  const sentinelAlias = { sentinel: "preserved" };
  const webpackConfig = {
    resolve: {
      alias: sentinelAlias,
      extensionAlias: { ".css": [".css"] },
    },
  };
  assert.equal(executableConfig.webpack(webpackConfig), webpackConfig);
  assert.equal(webpackConfig.resolve.alias, sentinelAlias);
  assert.deepEqual(webpackConfig.resolve.extensionAlias, {
    ".css": [".css"],
    ".js": [".ts", ".tsx", ".js"],
  });
  assert.ok(rootTsconfig.exclude.includes("apps/atlas"));
});

test("the repository boundary rejects local-only paths at any depth", () => {
  for (const allowedPath of [
    ".env.example",
    ".gitignore",
    "apps/atlas/src/app/page.tsx",
    "apps/atlas/src/app/memory/page.tsx",
    "apps/atlas/src/components/memory/MemoryPage.tsx",
    "apps/atlas/src/i18n/memory/messages.ts",
    "apps\\atlas\\src\\app\\page.tsx",
    "apps\\atlas\\src\\app\\memory\\page.tsx",
  ]) {
    assert.deepEqual(validateRepositoryPath(allowedPath), [], allowedPath);
  }

  const rejectedPaths = [
    [".ENV.EXAMPLE", "environment files are local-only"],
    ["PACKAGE.JSON", "root file is not"],
    ["Apps/atlas/src/app/page.tsx", "not public-allowlisted"],
    ["apps/Atlas/src/app/page.tsx", "not public-allowlisted"],
    ["apps/other/src/app/page.tsx", "not public-allowlisted"],
    ["apps/atlas/notes/Agent.MD", "workflow basename"],
    ["apps/atlas/notes/AGENTS.md", "workflow basename"],
    ["apps/atlas/notes/ClaUdE.mD", "workflow basename"],
    ["apps/atlas/notes/LIVE-IMPLEMENTATION-PLAN.MD", "workflow basename"],
    ["apps\\atlas\\src\\.AgEnTs\\private.txt", ".agents/"],
    ["apps/atlas/src/.ClAuDe/private.txt", ".claude/"],
    ["apps/atlas/src/.CoDeX/private.txt", ".codex/"],
    ["apps/atlas/src/.InTeRnAl/private.txt", ".internal/"],
    ["apps/atlas/src/InTeRnAl/private.txt", "internal/"],
    ["apps/atlas/src/MeMoRy/private.txt", "memory/"],
    ["apps/atlas/src/share/memory/private.txt", "memory/"],
    ["apps/atlas/src/app/MeMoRy/private.txt", "memory/"],
    ["apps/atlas/src/app/memory/nested/memory/private.txt", "memory/"],
    ["apps/atlas/src/app/memory/internal/private.txt", "internal/"],
    ["apps/atlas/src/components/memory/.codex/private.txt", ".codex/"],
    ["apps/atlas/src/i18n/memory/memories/private.txt", "memories/"],
    ["apps/atlas/src/MeMoRiEs/private.txt", "memories/"],
    ["apps/atlas/src/.VeRcEl/private.txt", ".vercel/"],
    ["apps/atlas/src/.WrAnGlEr/private.txt", ".wrangler/"],
    ["apps/atlas/.ENV", "environment files are local-only"],
    ["apps/atlas/config/.Env.Local", "environment files are local-only"],
    ["apps/atlas/.env.example", "environment files are local-only"],
  ];

  for (const [repositoryPath, expectedReason] of rejectedPaths) {
    const violations = validateRepositoryPath(repositoryPath);
    assert.equal(violations.length, 1, repositoryPath);
    assert.ok(
      violations[0].includes(expectedReason),
      `${repositoryPath}: ${violations[0]}`,
    );
  }
});

test("gitignore exposes only the reviewed Atlas product memory trees", () => {
  for (const publicProductPath of [
    "apps/atlas/src/app/memory/page.tsx",
    "apps/atlas/src/components/memory/MemoryPage.tsx",
    "apps/atlas/src/i18n/memory/messages.ts",
  ]) {
    assert.equal(isIgnoredByGit(publicProductPath), false, publicProductPath);
  }

  for (const localOnlyPath of [
    "apps/atlas/src/share/memory/private.txt",
    "apps/atlas/src/app/memory/nested/memory/private.txt",
    "apps/atlas/src/app/memory/internal/private.txt",
    "apps/atlas/src/components/memory/.codex/private.txt",
    "apps/atlas/src/i18n/memory/memories/private.txt",
  ]) {
    assert.equal(isIgnoredByGit(localOnlyPath), true, localOnlyPath);
  }
});

test("the verifier accepts only the exact Foundation fallback routes", () => {
  withExportFixture((directory) => {
    const result = verifyStaticExport(directory);
    assert.deepEqual(
      result.files.filter((file) =>
        ["404.html", "404/index.html", "_not-found/index.html"].includes(file),
      ),
      ["404.html", "404/index.html", "_not-found/index.html"],
    );
  });
});

test("the verifier throws for foreign/index.html", () => {
  assertExportRejected(
    (directory) =>
      writeExportFixtureFile(directory, "foreign/index.html", "foreign route"),
    "unexpected Foundation route found: foreign/index.html",
  );
});

test("the verifier throws for 404/foreign/index.html", () => {
  assertExportRejected(
    (directory) =>
      writeExportFixtureFile(
        directory,
        "404/foreign/index.html",
        "foreign route",
      ),
    "unexpected Foundation route found: 404/foreign/index.html",
  );
});

test("the verifier throws for a covers segment without a route violation", () => {
  assertExportRejected(
    (directory) =>
      writeExportFixtureFile(directory, "covers/cover.txt", "foreign cover"),
    "foreign MyPick output segment found: covers/cover.txt",
  );
});

test("the verifier throws for a manifest without another violation", () => {
  assertExportRejected(
    (directory) =>
      writeExportFixtureFile(directory, "manifest.webmanifest", "{}"),
    "Atlas must not emit manifest.webmanifest",
  );
});

test("the verifier throws for a service worker without another violation", () => {
  assertExportRejected(
    (directory) =>
      writeExportFixtureFile(
        directory,
        "sw.js",
        "self.addEventListener('fetch', () => {});",
      ),
    "Atlas must not emit sw.js",
  );
});
