import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectMyPickOutputIsolation } from "../verify-static-export.mjs";

async function outputFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "mypick-output-isolation-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(path.join(root, "_next", "static", "chunks"), {
    recursive: true,
  });
  await writeFile(path.join(root, "index.html"), "<title>MY PICK</title>");
  await writeFile(
    path.join(root, "_next", "static", "chunks", "app.js"),
    "const product = 'MY PICK';",
  );
  return root;
}

function inspect(outputDirectory, { experienceSlugs = [], songIds = [] } = {}) {
  return inspectMyPickOutputIsolation({
    experienceSlugs,
    outputDirectory,
    songIds,
  });
}

test("the MyPick output isolation inventory accepts the exact route families", async (t) => {
  const output = await outputFixture(t);
  for (const relativePath of [
    "404.html",
    "404/index.html",
    "_not-found/index.html",
    "songs/index.html",
    "songs/song-1/index.html",
    "live/event-1/index.html",
  ]) {
    const filePath = path.join(output, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "<title>MY PICK</title>");
  }

  assert.deepEqual(
    await inspect(output, {
      experienceSlugs: ["event-1"],
      songIds: ["song-1"],
    }),
    [],
  );
});

test("the MyPick output isolation inventory rejects Atlas routes and markers", async (t) => {
  const output = await outputFixture(t);
  await mkdir(path.join(output, "journey"));
  await writeFile(path.join(output, "journey", "index.html"), "Atlas");
  await writeFile(
    path.join(output, "_next", "static", "chunks", "atlas.js"),
    'const key = "atlas:journey-document:v1";',
  );

  const violations = await inspect(output);
  assert.ok(
    violations.includes(
      "Atlas route or asset segment leaked into MyPick: journey/index.html",
    ),
  );
  assert.ok(
    violations.includes(
      "Atlas runtime marker atlas:journey-document:v1 leaked into _next/static/chunks/atlas.js",
    ),
  );
  assert.ok(
    violations.includes("unexpected MyPick HTML route: journey/index.html"),
  );
});

test("content scanning rejects Atlas CSS merged into a differently hashed chunk", async (t) => {
  const output = await outputFixture(t);
  await writeFile(
    path.join(output, "_next", "static", "chunks", "app.js"),
    'const styles=".memory-page_module__card{color:var(--atlas-ink)}";',
  );

  const violations = await inspect(output);
  assert.ok(
    violations.includes(
      "Atlas CSS custom property leaked into _next/static/chunks/app.js",
    ),
  );
  assert.ok(
    violations.includes(
      "Atlas Journey or Memory CSS module leaked into _next/static/chunks/app.js",
    ),
  );
});

test("content scanning distinguishes Atlas UI markers from a build path", async (t) => {
  const output = await outputFixture(t);
  const chunk = path.join(output, "_next", "static", "chunks", "app.js");
  await writeFile(
    chunk,
    'const cwd = "/ROOT/.codex/worktrees/atlas-v1-integration/node_modules";',
  );
  assert.deepEqual(await inspect(output), []);

  await writeFile(chunk, 'const className = "atlas-shell__brand";');
  assert.ok(
    (await inspect(output)).includes(
      "Atlas shell or home marker leaked into _next/static/chunks/app.js",
    ),
  );
});
