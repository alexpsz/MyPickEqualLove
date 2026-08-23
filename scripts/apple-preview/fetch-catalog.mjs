import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  APPLE_PREVIEW_PROJECTS,
  APPLE_PREVIEW_STOREFRONT,
} from "./build-source-map.mjs";

const SNAPSHOT_SCHEMA_VERSION = 1;
const DEFAULT_DELAY_MS = 3_100;
const MAX_ATTEMPTS = 4;

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const runDirectory = resolve("memory", "apple-preview-runs", options.runId);
  const manifestPath = join(runDirectory, "manifest.json");
  const manifestExists = await fileExists(manifestPath);

  if (manifestExists && !options.resume) {
    throw new Error(
      `Run ${options.runId} already exists; pass --resume to continue that exact run`,
    );
  }

  await mkdir(runDirectory, { recursive: true });
  const manifest = manifestExists
    ? await readJsonFile(manifestPath)
    : createManifest(options.runId);
  validateManifestIdentity(manifest, options.runId);

  const throttle = createThrottle(options.delayMs);

  for (const project of APPLE_PREVIEW_PROJECTS) {
    const projectDirectory = join(runDirectory, "projects", project.projectId);
    const albumsPath = join(projectDirectory, "artist-albums.json");
    await mkdir(join(projectDirectory, "collections"), { recursive: true });

    let albumResponse;
    if (await fileExists(albumsPath)) {
      albumResponse = await readJsonFile(albumsPath);
    } else {
      const albumUrl = createLookupUrl(project.artistId, "album");
      albumResponse = await fetchJsonWithRetry(albumUrl, throttle);
      await writeJsonAtomic(albumsPath, albumResponse);
    }

    const collectionIds = extractCollectionIds(albumResponse, project);
    const manifestProject = manifest.projects.find(
      ({ projectId }) => projectId === project.projectId,
    );
    manifestProject.collectionIds = collectionIds;
    manifestProject.completedCollectionIds =
      manifestProject.completedCollectionIds.filter((collectionId) =>
        collectionIds.includes(collectionId),
      );
    await writeJsonAtomic(manifestPath, manifest);

    for (const [index, collectionId] of collectionIds.entries()) {
      const collectionPath = join(
        projectDirectory,
        "collections",
        `${collectionId}.json`,
      );
      if (!(await fileExists(collectionPath))) {
        const collectionUrl = createLookupUrl(collectionId, "song");
        const response = await fetchJsonWithRetry(collectionUrl, throttle);
        await writeJsonAtomic(collectionPath, response);
      }

      if (!manifestProject.completedCollectionIds.includes(collectionId)) {
        manifestProject.completedCollectionIds.push(collectionId);
        manifestProject.completedCollectionIds.sort(
          (left, right) => left - right,
        );
        await writeJsonAtomic(manifestPath, manifest);
      }
      console.log(
        `${project.projectId}: ${index + 1}/${collectionIds.length} collection ${collectionId}`,
      );
    }
  }

  console.log(`Apple preview catalog snapshot complete: ${runDirectory}`);
}

function createManifest(runId) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    runId,
    storefront: APPLE_PREVIEW_STOREFRONT,
    projects: APPLE_PREVIEW_PROJECTS.map(({ projectId, artistId }) => ({
      projectId,
      artistId,
      collectionIds: [],
      completedCollectionIds: [],
    })),
  };
}

function validateManifestIdentity(manifest, runId) {
  assert(
    manifest.schemaVersion === SNAPSHOT_SCHEMA_VERSION,
    "Snapshot manifest schemaVersion is unsupported",
  );
  assert(manifest.runId === runId, "Snapshot manifest runId does not match");
  assert(
    manifest.storefront === APPLE_PREVIEW_STOREFRONT,
    "Snapshot manifest storefront does not match",
  );
  assert(
    Array.isArray(manifest.projects) &&
      manifest.projects.length === APPLE_PREVIEW_PROJECTS.length,
    "Snapshot manifest project list is invalid",
  );
  for (const project of APPLE_PREVIEW_PROJECTS) {
    const entry = manifest.projects.find(
      ({ projectId }) => projectId === project.projectId,
    );
    assert(
      entry?.artistId === project.artistId,
      `${project.projectId} artistId drifted`,
    );
    assert(
      Array.isArray(entry.collectionIds),
      `${project.projectId} collectionIds is invalid`,
    );
    assert(
      Array.isArray(entry.completedCollectionIds),
      `${project.projectId} completedCollectionIds is invalid`,
    );
  }
}

function extractCollectionIds(response, project) {
  assert(
    Array.isArray(response?.results),
    `${project.projectId} album lookup is invalid`,
  );
  const collectionIds = response.results
    .filter(
      (result) =>
        result?.wrapperType === "collection" &&
        result?.artistId === project.artistId &&
        Number.isSafeInteger(result.collectionId) &&
        result.collectionId > 0,
    )
    .map(({ collectionId }) => collectionId);
  const uniqueCollectionIds = [...new Set(collectionIds)].sort(
    (left, right) => left - right,
  );
  assert(
    uniqueCollectionIds.length > 0,
    `${project.projectId} album lookup returned no collections`,
  );
  return uniqueCollectionIds;
}

function createLookupUrl(id, entity) {
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", String(id));
  url.searchParams.set("entity", entity);
  url.searchParams.set("limit", "200");
  url.searchParams.set("country", APPLE_PREVIEW_STOREFRONT);
  return url;
}

function createThrottle(delayMs) {
  let previousRequestStartedAt = 0;
  return async () => {
    const remaining = previousRequestStartedAt + delayMs - Date.now();
    if (remaining > 0) await wait(remaining);
    previousRequestStartedAt = Date.now();
  };
}

async function fetchJsonWithRetry(url, throttle) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await throttle();
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) return await response.json();

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      lastError = new Error(`${response.status} ${response.statusText}`);
      if (attempt < MAX_ATTEMPTS) {
        await wait(retryAfterMs ?? attempt * 2_000);
      }
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await wait(attempt * 2_000);
    }
  }
  throw new Error(
    `GET ${url} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
  );
}

function parseRetryAfter(value) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function parseArguments(args) {
  let runId;
  let resume = false;
  let delayMs = DEFAULT_DELAY_MS;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run-id") {
      runId = args[index + 1];
      index += 1;
    } else if (argument === "--resume") {
      resume = true;
    } else if (argument === "--delay-ms") {
      delayMs = Number(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  assert(
    typeof runId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(runId),
    "--run-id is required and must contain only letters, digits, dot, underscore, or dash",
  );
  assert(
    Number.isFinite(delayMs) && delayMs >= 0,
    "--delay-ms must be non-negative",
  );
  return { runId, resume, delayMs };
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function readJsonFile(path) {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(`apple preview fetch: FAIL: ${error.message}`);
  process.exitCode = 1;
});
