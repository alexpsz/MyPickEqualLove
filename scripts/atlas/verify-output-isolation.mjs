import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runNpmCommand } from "../run-project-command.mjs";
import { verifyStaticExport } from "../verify-static-export.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..", "..");
const PROJECT_IDS = ["equal-love", "nearly-equal-joy", "not-equal-me"];

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function receiptPath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

async function inventoryPath(root, relativePath, entries, files) {
  const absolutePath = path.join(root, relativePath);
  const canonicalPath = receiptPath(relativePath);
  let status;
  try {
    status = await lstat(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      entries.push(`A ${canonicalPath}`);
      return;
    }
    throw error;
  }

  if (status.isSymbolicLink()) {
    throw new Error(
      `Output isolation refuses a symbolic link: ${absolutePath}`,
    );
  }
  if (status.isDirectory()) {
    entries.push(`D ${canonicalPath}`);
    const children = await readdir(absolutePath);
    children.sort();
    for (const child of children) {
      await inventoryPath(root, path.join(relativePath, child), entries, files);
    }
    return;
  }
  if (!status.isFile()) {
    throw new Error(
      `Output isolation requires a regular file: ${absolutePath}`,
    );
  }

  const sha256 = await hashFile(absolutePath);
  entries.push(`F ${canonicalPath} ${status.size} ${sha256}`);
  files.push({ relativePath: canonicalPath, sha256, size: status.size });
}

export async function snapshotOutputTrees(root, relativePaths) {
  const resolvedRoot = path.resolve(root);
  const entries = [];
  const files = [];
  for (const relativePath of [...relativePaths].sort()) {
    await inventoryPath(resolvedRoot, relativePath, entries, files);
  }
  return {
    digest: createHash("sha256").update(entries.join("\n")).digest("hex"),
    entries,
    files,
  };
}

export function assertSameOutputReceipt(before, after, label) {
  if (before.digest === after.digest) return;

  const length = Math.max(before.entries.length, after.entries.length);
  let difference = "inventory length changed";
  for (let index = 0; index < length; index += 1) {
    if (before.entries[index] !== after.entries[index]) {
      difference = `${before.entries[index] ?? "<missing>"} -> ${after.entries[index] ?? "<missing>"}`;
      break;
    }
  }
  throw new Error(`${label} changed across an isolated build: ${difference}`);
}

export function assertNoArtifactHashOverlap(
  forbiddenFiles,
  candidateReceipt,
  label,
) {
  const forbiddenByHash = new Map(
    forbiddenFiles.map((file) => [file.sha256, file.relativePath]),
  );
  for (const candidate of candidateReceipt.files) {
    const source = forbiddenByHash.get(candidate.sha256);
    if (source !== undefined) {
      throw new Error(
        `${label} contains Atlas-only bytes: ${candidate.relativePath} matches ${source}`,
      );
    }
  }
}

async function runScript(scriptName) {
  console.log(`Running ${scriptName} for output-isolation proof...`);
  const result = await runNpmCommand(["run", scriptName]);
  if (result.code !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.code}`);
  }
}

async function buildAndVerifyMyPick(projectId) {
  await runScript(`build:${projectId}`);
  const result = await verifyStaticExport({
    outputDirectory: path.join(REPOSITORY_ROOT, "out"),
    projectId,
    repositoryRoot: REPOSITORY_ROOT,
  });
  console.log(
    `Static export verification passed for ${projectId} (${result.routes} routes).`,
  );
  return snapshotOutputTrees(REPOSITORY_ROOT, ["out"]);
}

async function verifyOutputIsolation() {
  const rootPaths = [".next", "out"];
  const atlasPaths = ["apps/atlas/.next", "apps/atlas/out"];

  const verifiedMyPickHashes = new Set();
  for (const projectId of PROJECT_IDS) {
    const receipt = await buildAndVerifyMyPick(projectId);
    for (const file of receipt.files) verifiedMyPickHashes.add(file.sha256);
  }
  const rootBeforeAtlas = await snapshotOutputTrees(REPOSITORY_ROOT, rootPaths);

  await runScript("build:atlas");
  assertSameOutputReceipt(
    rootBeforeAtlas,
    await snapshotOutputTrees(REPOSITORY_ROOT, rootPaths),
    "MyPick .next/out",
  );

  const atlasAfterBuild = await snapshotOutputTrees(
    REPOSITORY_ROOT,
    atlasPaths,
  );
  const atlasDeployable = await snapshotOutputTrees(REPOSITORY_ROOT, [
    "apps/atlas/out",
  ]);
  const atlasOnlyFiles = atlasDeployable.files.filter(
    (file) => !verifiedMyPickHashes.has(file.sha256),
  );
  if (atlasOnlyFiles.length === 0) {
    throw new Error(
      "Atlas build produced no independently identifiable files.",
    );
  }

  for (const projectId of PROJECT_IDS) {
    const myPickReceipt = await buildAndVerifyMyPick(projectId);
    assertNoArtifactHashOverlap(
      atlasOnlyFiles,
      myPickReceipt,
      `${projectId} out`,
    );
    assertSameOutputReceipt(
      atlasAfterBuild,
      await snapshotOutputTrees(REPOSITORY_ROOT, atlasPaths),
      `Atlas .next/out after ${projectId}`,
    );
  }

  console.log(
    `Four-output isolation passed (root-before-Atlas ${rootBeforeAtlas.digest}; Atlas ${atlasAfterBuild.digest}; Atlas-only files ${atlasOnlyFiles.length}).`,
  );
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  verifyOutputIsolation().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
