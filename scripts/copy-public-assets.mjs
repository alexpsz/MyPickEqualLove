import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_IDS = new Set(["equal-love", "nearly-equal-joy", "not-equal-me"]);
const ROUTABLE_STATUSES = new Set(["published", "archived"]);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDirectory, "..");

export function loadCoverManifest({ projectId, root }) {
  assertProjectId(projectId);
  const resolvedRoot = path.resolve(root);
  const publicDirectory = path.join(resolvedRoot, "public");
  const catalogPath = path.join(
    resolvedRoot,
    "src",
    "projects",
    projectId,
    "songs.json",
  );
  const songs = readJsonArray(catalogPath, "song catalog");
  const catalogCoverPaths = [];

  for (const [index, song] of songs.entries()) {
    const coverPath = normalizeCoverPath(song?.coverUrl, projectId, index);
    catalogCoverPaths.push(coverPath);
  }
  assertNoCaseInsensitiveCollisions(catalogCoverPaths, "cover paths");
  const coverPaths = new Set(catalogCoverPaths);

  if (coverPaths.size === 0) {
    throw new Error(`${catalogPath} must reference at least one cover`);
  }

  for (const coverPath of coverPaths) {
    const sourcePath = resolveContainedPath(publicDirectory, coverPath);
    assertRegularNonSymlinkFile(sourcePath, publicDirectory, "source cover");
  }

  return Object.freeze({
    coverPaths: Object.freeze(Array.from(coverPaths).sort()),
    projectId,
    publicDirectory,
    root: resolvedRoot,
  });
}

export function verifyCoverClosure({ manifest, outDirectory }) {
  const out = path.resolve(outDirectory);
  const coversDirectory = path.join(out, "covers");
  const actual = enumerateCoverFiles(coversDirectory);
  const expected = new Set(manifest.coverPaths);
  const actualPaths = new Set(actual.keys());

  for (const coverPath of manifest.coverPaths) {
    const outputPath = actual.get(coverPath);
    if (!outputPath) {
      throw new Error(`missing expected output cover ${coverPath}`);
    }
    const sourcePath = resolveContainedPath(
      manifest.publicDirectory,
      coverPath,
    );
    assertMatchingFiles(sourcePath, outputPath, coverPath);
  }

  const missing = manifest.coverPaths.filter(
    (coverPath) => !actualPaths.has(coverPath),
  );
  const extra = Array.from(actualPaths)
    .filter((coverPath) => !expected.has(coverPath))
    .sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `out/covers exact set mismatch: missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
    );
  }

  return Object.freeze({
    coverPaths: Object.freeze(Array.from(actualPaths).sort()),
    coversDirectory,
  });
}

export function pruneStaticExportAssets({ projectId, root }) {
  const resolvedRoot = path.resolve(root);
  const outDirectory = path.join(resolvedRoot, "out");
  const coversDirectory = path.join(outDirectory, "covers");
  const manifest = loadCoverManifest({ projectId, root: resolvedRoot });
  const actual = enumerateCoverFiles(coversDirectory);
  const expected = new Set(manifest.coverPaths);

  // Complete all source/output and hash validation before deleting an artifact.
  for (const coverPath of manifest.coverPaths) {
    const outputPath = actual.get(coverPath);
    if (!outputPath) {
      throw new Error(`missing expected output cover ${coverPath}`);
    }
    const sourcePath = resolveContainedPath(
      manifest.publicDirectory,
      coverPath,
    );
    assertMatchingFiles(sourcePath, outputPath, coverPath);
  }

  for (const [coverPath, outputPath] of actual) {
    if (!expected.has(coverPath)) {
      fs.rmSync(outputPath);
    }
  }
  removeEmptyDirectories(coversDirectory, coversDirectory);
  const closure = verifyCoverClosure({ manifest, outDirectory });

  removeExportedLiveRoute(outDirectory, "__empty-live__");
  for (const slug of getInactiveLiveSlugs(resolvedRoot, projectId)) {
    removeExportedLiveRoute(outDirectory, slug);
  }
  const liveDirectory = path.join(outDirectory, "live");
  if (
    fs.existsSync(liveDirectory) &&
    fs.readdirSync(liveDirectory).length === 0
  ) {
    fs.rmdirSync(liveDirectory);
  }

  return closure;
}

export function assertNoCaseInsensitiveCollisions(paths, label) {
  const pathsByFoldedName = new Map();
  for (const candidate of paths) {
    const folded = candidate.toLowerCase();
    const previous = pathsByFoldedName.get(folded);
    if (previous && previous !== candidate) {
      throw new Error(
        `${label} collide case-insensitively: ${previous} and ${candidate}`,
      );
    }
    pathsByFoldedName.set(folded, candidate);
  }
}

function normalizeCoverPath(value, projectId, index) {
  if (typeof value !== "string") {
    throw new Error(`song catalog entry ${index} coverUrl must be a string`);
  }
  if (value.includes("\\") || value.includes("%") || value.includes("\0")) {
    throw new Error(`unsafe coverUrl ${JSON.stringify(value)}`);
  }
  const expectedPattern = new RegExp(
    `^/covers/${escapeRegExp(projectId)}/[a-z0-9][a-z0-9-]*\\.jpg$`,
  );
  if (!expectedPattern.test(value) || path.posix.normalize(value) !== value) {
    throw new Error(
      `coverUrl must be a normalized current-project JPEG path: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function enumerateCoverFiles(coversDirectory) {
  if (!fs.existsSync(coversDirectory)) {
    throw new Error(`missing output covers directory ${coversDirectory}`);
  }
  assertDirectoryWithoutSymlink(coversDirectory, "output covers directory");
  const files = new Map();

  walk(coversDirectory);
  assertNoCaseInsensitiveCollisions(files.keys(), "output covers");
  return files;

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const stats = fs.lstatSync(absolutePath);
      if (stats.isSymbolicLink()) {
        throw new Error(
          `output covers must not contain symlinks: ${absolutePath}`,
        );
      }
      if (stats.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!stats.isFile() || stats.size === 0) {
        throw new Error(
          `output cover must be a non-empty regular file: ${absolutePath}`,
        );
      }

      const relative = path.relative(coversDirectory, absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(
          `output cover escapes covers directory: ${absolutePath}`,
        );
      }
      const coverPath = `/covers/${relative.split(path.sep).join("/")}`;
      if (path.posix.normalize(coverPath) !== coverPath) {
        throw new Error(`output cover path is not normalized: ${coverPath}`);
      }
      files.set(coverPath, absolutePath);
    }
  }
}

function assertMatchingFiles(sourcePath, outputPath, coverPath) {
  const sourceStats = fs.statSync(sourcePath);
  const outputStats = fs.statSync(outputPath);
  if (sourceStats.size !== outputStats.size) {
    throw new Error(`output cover size differs from source ${coverPath}`);
  }
  if (sha256(sourcePath) !== sha256(outputPath)) {
    throw new Error(`output cover hash differs from source ${coverPath}`);
  }
}

function assertRegularNonSymlinkFile(filePath, boundary, label) {
  assertContainedExistingPath(filePath, boundary, label);
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) {
    throw new Error(`${label} must be a non-empty regular file: ${filePath}`);
  }
}

function assertContainedExistingPath(filePath, boundary, label) {
  const relative = path.relative(boundary, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes repository boundary: ${filePath}`);
  }
  let current = path.resolve(boundary);
  assertDirectoryWithoutSymlink(current, `${label} boundary`);
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) {
      throw new Error(`missing ${label} ${current}`);
    }
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} must not use symlinks: ${current}`);
    }
  }
}

function assertDirectoryWithoutSymlink(directory, label) {
  const stats = fs.lstatSync(directory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function resolveContainedPath(boundary, coverPath) {
  const candidate = path.resolve(boundary, `.${coverPath}`);
  const relative = path.relative(boundary, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`cover path escapes public directory: ${coverPath}`);
  }
  return candidate;
}

function removeEmptyDirectories(directory, rootDirectory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyDirectories(path.join(directory, entry.name), rootDirectory);
    }
  }
  if (directory !== rootDirectory && fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory);
  }
}

function removeExportedLiveRoute(outDirectory, slug) {
  fs.rmSync(path.join(outDirectory, "live", slug), {
    force: true,
    recursive: true,
  });
  for (const extension of [".html", ".txt"]) {
    fs.rmSync(path.join(outDirectory, "live", `${slug}${extension}`), {
      force: true,
    });
  }
}

function getInactiveLiveSlugs(root, currentProjectId) {
  const projectsDirectory = path.join(root, "src", "projects");
  const allSlugs = new Set();
  const currentSlugs = new Set();

  for (const projectId of fs.readdirSync(projectsDirectory)) {
    const liveExperiencesPath = path.join(
      projectsDirectory,
      projectId,
      "live-experiences.json",
    );
    if (!fs.existsSync(liveExperiencesPath)) continue;
    const experiences = readJsonArray(liveExperiencesPath, "Live experiences");
    for (const experience of experiences) {
      if (!ROUTABLE_STATUSES.has(experience?.status)) continue;
      allSlugs.add(experience.slug);
      if (projectId === currentProjectId) currentSlugs.add(experience.slug);
    }
  }
  return Array.from(allSlugs).filter((slug) => !currentSlugs.has(slug));
}

function readJsonArray(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${filePath}: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} at ${filePath} must contain an array`);
  }
  return parsed;
}

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function assertProjectId(projectId) {
  if (!PROJECT_IDS.has(projectId)) {
    throw new Error(`Unsupported project id ${JSON.stringify(projectId)}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const currentProjectId = process.env.NEXT_PUBLIC_PROJECT_ID || "equal-love";
    const result = pruneStaticExportAssets({
      projectId: currentProjectId,
      root: repositoryRoot,
    });
    console.log(
      `Pruned static export to ${result.coverPaths.length} current-project covers.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
