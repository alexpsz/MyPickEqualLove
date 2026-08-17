import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertNoCaseInsensitiveCollisions,
  loadCoverManifest,
  pruneStaticExportAssets,
  verifyCoverClosure,
} from "./copy-public-assets.mjs";

const PROJECT_ID = "equal-love";
const KEEP_A = "/covers/equal-love/keep-a.jpg";
const KEEP_B = "/covers/equal-love/keep-b.jpg";

test("prunes only extra generated covers and inactive Live routes", async () => {
  await withFixture(async ({ out, root }) => {
    const sourceBefore = await readFile(
      path.join(root, "public", "covers", "not-equal-me", "foreign.jpg"),
    );
    const result = pruneStaticExportAssets({ projectId: PROJECT_ID, root });

    assert.deepEqual(result.coverPaths, [KEEP_A, KEEP_B]);
    assert.equal(
      existsSync(path.join(out, "covers", "not-equal-me", "foreign.jpg")),
      false,
    );
    assert.equal(
      existsSync(path.join(out, "covers", "equal-love", "placeholder.svg")),
      false,
    );
    assert.deepEqual(
      await readFile(
        path.join(root, "public", "covers", "not-equal-me", "foreign.jpg"),
      ),
      sourceBefore,
    );
    assert.equal(
      await readFile(path.join(out, "icon.svg"), "utf8"),
      "out-icon",
    );
    assert.equal(
      await readFile(path.join(out, "_next", "static", "app.js"), "utf8"),
      "next-output",
    );
    assert.equal(existsSync(path.join(out, "live", "current-live")), true);
    assert.equal(existsSync(path.join(out, "live", "foreign-live")), false);
    assert.equal(
      existsSync(path.join(out, "live", "foreign-live.html")),
      false,
    );
    assert.equal(existsSync(path.join(out, "live", "foreign-live.txt")), false);
    assert.equal(existsSync(path.join(out, "live", "__empty-live__")), false);

    const manifest = loadCoverManifest({ projectId: PROJECT_ID, root });
    assert.deepEqual(
      verifyCoverClosure({ manifest, outDirectory: out }).coverPaths,
      [KEEP_A, KEEP_B],
    );
  });
});

test("allows intentional many-song reuse of one normalized cover", async () => {
  await withFixture(async ({ root }) => {
    const manifest = loadCoverManifest({ projectId: PROJECT_ID, root });
    assert.deepEqual(manifest.coverPaths, [KEEP_A, KEEP_B]);
  });
});

for (const unsafeCoverUrl of [
  "/covers/equal-love/../escape.jpg",
  "/covers/equal-love/%2e%2e/escape.jpg",
  "/covers/equal-love\\escape.jpg",
  "/covers/not-equal-me/foreign.jpg",
  "/covers/equal-love/UPPER.jpg",
  "/covers/equal-love/keep-a.jpg?cache=1",
]) {
  test(`rejects unsafe catalog path ${unsafeCoverUrl}`, async () => {
    await withFixture(async ({ root }) => {
      await writeCatalog(root, [{ id: "unsafe", coverUrl: unsafeCoverUrl }]);
      assert.throws(
        () => loadCoverManifest({ projectId: PROJECT_ID, root }),
        /(?:unsafe coverUrl|normalized current-project JPEG path)/,
      );
    });
  });
}

test("rejects unsupported projects", async () => {
  await withFixture(async ({ root }) => {
    assert.throws(
      () => loadCoverManifest({ projectId: "unknown", root }),
      /Unsupported project id/,
    );
  });
});

test("rejects missing and zero-byte source covers", async () => {
  await withFixture(async ({ root }) => {
    const source = sourcePath(root, KEEP_A);
    await rm(source);
    assert.throws(
      () => loadCoverManifest({ projectId: PROJECT_ID, root }),
      /missing source cover/,
    );
    await writeFile(source, "");
    assert.throws(
      () => loadCoverManifest({ projectId: PROJECT_ID, root }),
      /non-empty regular file/,
    );
  });
});

test("hash mismatch fails before any extra cover is deleted", async () => {
  await withFixture(async ({ out, root }) => {
    await writeFile(outputPath(out, KEEP_A), "drift-a");
    const extra = path.join(out, "covers", "not-equal-me", "foreign.jpg");
    assert.throws(
      () => pruneStaticExportAssets({ projectId: PROJECT_ID, root }),
      /output cover hash differs from source/,
    );
    assert.equal(existsSync(extra), true);
  });
});

test("missing expected output fails before any extra cover is deleted", async () => {
  await withFixture(async ({ out, root }) => {
    await rm(outputPath(out, KEEP_A));
    const extra = path.join(out, "covers", "not-equal-me", "foreign.jpg");
    assert.throws(
      () => pruneStaticExportAssets({ projectId: PROJECT_ID, root }),
      /missing expected output cover/,
    );
    assert.equal(existsSync(extra), true);
  });
});

test("rejects zero-byte output before pruning", async () => {
  await withFixture(async ({ out, root }) => {
    await writeFile(outputPath(out, KEEP_A), "");
    assert.throws(
      () => pruneStaticExportAssets({ projectId: PROJECT_ID, root }),
      /non-empty regular file/,
    );
  });
});

test("rejects source symlinks", async (context) => {
  await withFixture(async ({ root }) => {
    const source = sourcePath(root, KEEP_A);
    const target = path.join(root, "outside.jpg");
    await writeFile(target, "cover-a");
    await rm(source);
    try {
      await symlink(target, source, "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) {
        context.skip(`symlink creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.equal((await lstat(source)).isSymbolicLink(), true);
    assert.throws(
      () => loadCoverManifest({ projectId: PROJECT_ID, root }),
      /must not use symlinks/,
    );
  });
});

test("rejects case-insensitive path collisions on every platform", () => {
  assert.throws(
    () =>
      assertNoCaseInsensitiveCollisions(
        ["/covers/equal-love/keep-a.jpg", "/covers/equal-love/KEEP-A.JPG"],
        "output covers",
      ),
    /collide case-insensitively/,
  );
});

async function withFixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mypick-cover-prune-"));
  const out = path.join(root, "out");
  try {
    await writeCatalog(root, [
      { id: "song-a", coverUrl: KEEP_A },
      { id: "song-a-reuse", coverUrl: KEEP_A },
      { id: "song-b", coverUrl: KEEP_B },
    ]);
    for (const projectId of [
      "equal-love",
      "nearly-equal-joy",
      "not-equal-me",
    ]) {
      await writeFixtureFile(
        path.join(root, "src", "projects", projectId, "live-experiences.json"),
        JSON.stringify([
          {
            slug: projectId === PROJECT_ID ? "current-live" : "foreign-live",
            status: "published",
          },
        ]),
      );
    }

    for (const [coverPath, content] of [
      [KEEP_A, "cover-a"],
      [KEEP_B, "cover-b"],
      ["/covers/not-equal-me/foreign.jpg", "foreign"],
    ]) {
      await writeFixtureFile(sourcePath(root, coverPath), content);
      await writeFixtureFile(outputPath(out, coverPath), content);
    }
    await writeFixtureFile(
      path.join(out, "covers", "equal-love", "placeholder.svg"),
      "placeholder",
    );
    await writeFixtureFile(
      path.join(root, "public", "icon.svg"),
      "source-icon",
    );
    await writeFixtureFile(path.join(out, "icon.svg"), "out-icon");
    await writeFixtureFile(
      path.join(root, ".next", "static", "app.js"),
      "next-source",
    );
    await writeFixtureFile(
      path.join(out, "_next", "static", "app.js"),
      "next-output",
    );
    for (const route of ["current-live", "foreign-live", "__empty-live__"]) {
      await writeFixtureFile(
        path.join(out, "live", route, "index.html"),
        route,
      );
    }
    await writeFixtureFile(
      path.join(out, "live", "foreign-live.html"),
      "foreign",
    );
    await writeFixtureFile(
      path.join(out, "live", "foreign-live.txt"),
      "foreign",
    );

    await callback({ out, root });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function writeCatalog(root, songs) {
  await writeFixtureFile(
    path.join(root, "src", "projects", PROJECT_ID, "songs.json"),
    JSON.stringify(songs),
  );
}

function sourcePath(root, coverPath) {
  return path.join(root, "public", ...coverPath.split("/").filter(Boolean));
}

function outputPath(out, coverPath) {
  return path.join(out, ...coverPath.split("/").filter(Boolean));
}

async function writeFixtureFile(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}
