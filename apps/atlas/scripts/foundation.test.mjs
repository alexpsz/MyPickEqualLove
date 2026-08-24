import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  inspectStaticExport,
  verifyStaticExport,
} from "./verify-static-export.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ATLAS_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const REPOSITORY_ROOT = path.resolve(ATLAS_ROOT, "..", "..");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
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

  for (const dependency of ["next", "react", "react-dom"]) {
    assert.equal(
      atlasPackage.dependencies[dependency],
      repositoryPackage.dependencies[dependency],
    );
  }
});

test("Atlas keeps its static-export contract local", () => {
  const nextConfig = readFileSync(
    path.join(ATLAS_ROOT, "next.config.ts"),
    "utf8",
  );
  const rootTsconfig = readJson(path.join(REPOSITORY_ROOT, "tsconfig.json"));

  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.match(nextConfig, /unoptimized:\s*true/);
  assert.ok(rootTsconfig.exclude.includes("apps/atlas"));
});

test("the verifier accepts the isolated Foundation export", () => {
  withExportFixture((directory) => {
    assert.doesNotThrow(() => verifyStaticExport(directory));
  });
});

test("the verifier rejects foreign routes and service workers", () => {
  withExportFixture((directory) => {
    mkdirSync(path.join(directory, "songs"), { recursive: true });
    writeFileSync(path.join(directory, "songs", "index.html"), "foreign route");
    writeFileSync(
      path.join(directory, "sw.js"),
      "self.addEventListener('fetch', () => {});",
    );

    const result = inspectStaticExport(directory);
    assert.ok(
      result.violations.some((violation) =>
        violation.includes("songs/index.html"),
      ),
    );
    assert.ok(
      result.violations.some((violation) => violation.includes("sw.js")),
    );
  });
});
