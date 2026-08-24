import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertNoArtifactHashOverlap,
  assertSameOutputReceipt,
  snapshotOutputTrees,
} from "./verify-output-isolation.mjs";

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
