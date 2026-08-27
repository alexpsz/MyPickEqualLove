import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoArtifactHashOverlap,
  assertSameOutputReceipt,
  snapshotOutputTrees,
} from "./verify-output-isolation.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("tree receipts are deterministic and detect output mutations", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-output-receipt-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(path.join(root, "out"));
  await writeFile(path.join(root, "out", "index.html"), "first");

  const first = await snapshotOutputTrees(root, ["missing", "out"]);
  const same = await snapshotOutputTrees(root, ["out", "missing"]);
  assert.deepEqual(same, first);
  assert.doesNotThrow(() => assertSameOutputReceipt(first, same, "fixture"));

  await mkdir(path.join(root, "candidate"));
  await writeFile(path.join(root, "candidate", "renamed.js"), "first");
  const copied = await snapshotOutputTrees(root, ["candidate"]);
  assert.throws(
    () => assertNoArtifactHashOverlap(first.files, copied, "candidate"),
    /candidate contains Atlas-only bytes: candidate\/renamed\.js matches out\/index\.html/,
  );

  await writeFile(path.join(root, "out", "index.html"), "second");
  const changed = await snapshotOutputTrees(root, ["missing", "out"]);
  assert.throws(
    () => assertSameOutputReceipt(first, changed, "fixture"),
    /fixture changed across an isolated build/,
  );
});

test("Q0 owns one quality pass and delegates every build to output isolation", async () => {
  const rootPackage = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const atlasPackage = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "apps", "atlas", "package.json"),
      "utf8",
    ),
  );
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "quality-gates.yml"),
    "utf8",
  );
  const isolationSource = await readFile(
    path.join(
      repositoryRoot,
      "scripts",
      "atlas",
      "verify-output-isolation.mjs",
    ),
    "utf8",
  );

  assert.equal(
    rootPackage.scripts.verify,
    "npm run verify:quality && npm run verify:static-export",
  );
  assert.equal(
    atlasPackage.scripts.verify,
    "npm run verify:quality && npm run build && npm run verify:static-export",
  );
  assert.equal(
    rootPackage.scripts["verify:q0"],
    "npm run verify:quality && npm run verify:atlas:quality && npm run verify:output-isolation && npm run format:check",
  );
  assert.equal(
    rootPackage.scripts["verify:atlas:quality"],
    "npm run verify:quality --workspace @mypick/atlas",
  );
  assert.doesNotMatch(rootPackage.scripts["verify:q0"], /verify:static-export/);
  assert.doesNotMatch(rootPackage.scripts["verify:q0"], /verify:atlas(?:\s|$)/);
  assert.doesNotMatch(rootPackage.scripts["verify:q0"], /build:/);
  assert.match(workflow, /^\s*run: npm run verify:q0\s*$/m);
  assert.doesNotMatch(workflow, /^\s*run: npm run verify\s*$/m);
  assert.doesNotMatch(workflow, /^\s*run: npm run verify:atlas\s*$/m);
  assert.equal(
    (isolationSource.match(/for \(const projectId of PROJECT_IDS\)/g) ?? [])
      .length,
    2,
    "isolation must build and verify each MyPick site before and after Atlas",
  );
  assert.equal(
    (isolationSource.match(/runScript\("build:atlas"\)/g) ?? []).length,
    1,
    "isolation must build and verify Atlas exactly once",
  );
});
