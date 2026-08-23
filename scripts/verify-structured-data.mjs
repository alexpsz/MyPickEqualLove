import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SCHEMA_CONTEXT = "https://schema.org";
const CREDIT_ROLES = ["lyricist", "composer", "arranger"];
const ROUTABLE_STATUSES = new Set(["published", "archived"]);

export function createExpectedWebSiteStructuredData({ name, siteUrl }) {
  const verifiedName = nonEmpty(name);
  const verifiedUrl = normalizeSiteUrl(siteUrl);
  if (!verifiedName || !verifiedUrl) return null;

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "WebSite",
    name: verifiedName,
    url: verifiedUrl,
  };
}

export function createExpectedMusicRecordingStructuredData({
  song,
  groupName,
  creditRegistry,
}) {
  const name = nonEmpty(song?.title?.ja);
  const verifiedGroupName = nonEmpty(groupName);
  const releaseName = nonEmpty(song?.releaseTitle?.ja);
  const datePublished = normalizeIsoDate(song?.releaseDate);
  const creators = resolveConfirmedCreators(song, creditRegistry);
  if (
    !name ||
    !verifiedGroupName ||
    !releaseName ||
    !datePublished ||
    !creators
  ) {
    return null;
  }

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "MusicRecording",
    name,
    byArtist: {
      "@type": "MusicGroup",
      name: verifiedGroupName,
    },
    inAlbum: {
      "@type": "MusicAlbum",
      name: releaseName,
    },
    datePublished,
    creator: creators.map(({ entry }) => ({ name: entry.ja.trim() })),
  };
}

export function verifyStructuredDataBlocks({
  html,
  label,
  expected,
  forbiddenCreatorNames = new Set(),
}) {
  const violations = [];
  const blocks = extractStructuredDataBlocks(html);
  if (expected && blocks.length !== expected.length) {
    violations.push(
      `${label} must contain ${expected.length} JSON-LD block(s), received ${blocks.length}`,
    );
  }

  const parsed = [];
  for (const [index, block] of blocks.entries()) {
    let value;
    try {
      value = JSON.parse(block);
    } catch (error) {
      violations.push(
        `${label} JSON-LD block ${index + 1} is not parseable: ${error.message}`,
      );
      continue;
    }
    parsed.push(value);
    validateSchemaShape(
      value,
      `${label} JSON-LD block ${index + 1}`,
      violations,
    );
    verifyNoForbiddenCreators(
      value,
      forbiddenCreatorNames,
      `${label} JSON-LD block ${index + 1}`,
      violations,
    );
  }

  if (!expected) return violations;

  for (const expectedValue of expected) {
    const type = expectedValue["@type"];
    const candidates = parsed.filter((value) => value?.["@type"] === type);
    if (candidates.length !== 1) {
      violations.push(
        `${label} must contain exactly one ${type} block, received ${candidates.length}`,
      );
      continue;
    }
    if (!isDeepStrictEqual(candidates[0], expectedValue)) {
      violations.push(
        `${label} ${type} block differs from confirmed source data: expected ${JSON.stringify(expectedValue)}, received ${JSON.stringify(candidates[0])}`,
      );
    }
  }

  const expectedTypes = new Set(expected.map((value) => value["@type"]));
  for (const value of parsed) {
    if (!expectedTypes.has(value?.["@type"])) {
      violations.push(
        `${label} contains unexpected JSON-LD type ${JSON.stringify(value?.["@type"])}`,
      );
    }
  }

  return violations;
}

export function verifyStructuredDataExport({
  contract,
  outputDirectory,
  projectId,
  repositoryRoot,
}) {
  const violations = [];
  const website = createExpectedWebSiteStructuredData({
    name: contract.displayName,
    siteUrl: contract.siteUrl,
  });
  if (!website) {
    return [`Invalid WebSite structured-data contract for ${projectId}`];
  }

  const songs = readJson(
    path.join(repositoryRoot, "src", "projects", projectId, "songs.json"),
    `${projectId} songs`,
    violations,
  );
  const experiences = readJson(
    path.join(
      repositoryRoot,
      "src",
      "projects",
      projectId,
      "live-experiences.json",
    ),
    `${projectId} live experiences`,
    violations,
  );
  const creditRegistry = readJson(
    path.join(repositoryRoot, "src", "data", "credit-registry.json"),
    "credit registry",
    violations,
  );
  if (
    !Array.isArray(songs) ||
    !Array.isArray(experiences) ||
    !creditRegistry ||
    typeof creditRegistry !== "object" ||
    !creditRegistry.creators ||
    typeof creditRegistry.creators !== "object"
  ) {
    if (creditRegistry && !creditRegistry.creators) {
      violations.push("credit registry must contain a creator map");
    }
    return violations;
  }

  const forbiddenCreatorNames = new Set(
    Object.values(creditRegistry.creators)
      .filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          Object.hasOwn(entry, "needsReview") &&
          entry.needsReview !== false,
      )
      .flatMap((entry) => [entry.ja, ...(entry.aliasesJa ?? [])])
      .map(nonEmpty)
      .filter(Boolean),
  );

  for (const filePath of walkHtmlFiles(outputDirectory)) {
    const relativePath = path.relative(outputDirectory, filePath);
    let html;
    try {
      html = readFileSync(filePath, "utf8");
    } catch (error) {
      violations.push(
        `${relativePath} structured-data scan could not read ${filePath}: ${error.message}`,
      );
      continue;
    }
    violations.push(
      ...verifyStructuredDataBlocks({
        html,
        label: relativePath,
        forbiddenCreatorNames,
      }),
    );
  }

  verifyExportedFile("index.html", [website]);
  verifyExportedFile(path.join("songs", "index.html"), [website]);

  for (const experience of experiences.filter((candidate) =>
    ROUTABLE_STATUSES.has(candidate?.status),
  )) {
    verifyExportedFile(path.join("live", experience.slug, "index.html"), [
      website,
    ]);
  }

  for (const song of songs) {
    const recording = createExpectedMusicRecordingStructuredData({
      song,
      groupName: contract.groupName,
      creditRegistry,
    });
    verifyExportedFile(
      path.join("songs", encodeURIComponent(song.id), "index.html"),
      recording ? [website, recording] : [website],
    );
  }

  return violations;

  function verifyExportedFile(relativePath, expected) {
    const filePath = path.join(outputDirectory, relativePath);
    let html;
    try {
      html = readFileSync(filePath, "utf8");
    } catch (error) {
      violations.push(
        `${relativePath} structured-data check could not read ${filePath}: ${error.message}`,
      );
      return;
    }
    violations.push(
      ...verifyStructuredDataBlocks({
        html,
        label: relativePath,
        expected,
      }),
    );
  }
}

function readJson(filePath, label, violations) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    violations.push(`${label} is missing or invalid: ${error.message}`);
    return null;
  }
}

function extractStructuredDataBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    const attributes = parseAttributes(match[1]);
    if (attributes.type?.toLowerCase() === "application/ld+json") {
      blocks.push(match[2].trim());
    }
  }
  return blocks;
}

function walkHtmlFiles(directory) {
  if (!existsSync(directory)) return [];

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtmlFiles(filePath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(filePath);
    }
  }
  return files;
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(
    /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function validateSchemaShape(value, label, violations) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    violations.push(`${label} must be a JSON object`);
    return;
  }
  if (value["@context"] !== SCHEMA_CONTEXT) {
    violations.push(`${label} must use ${SCHEMA_CONTEXT}`);
  }

  if (value["@type"] === "WebSite") {
    if (!nonEmpty(value.name)) violations.push(`${label} is missing name`);
    if (!normalizeSiteUrl(value.url))
      violations.push(`${label} has invalid url`);
    return;
  }

  if (value["@type"] !== "MusicRecording") {
    violations.push(`${label} has unsupported @type`);
    return;
  }

  if (!nonEmpty(value.name)) violations.push(`${label} is missing name`);
  if (!normalizeIsoDate(value.datePublished)) {
    violations.push(`${label} has invalid datePublished`);
  }
  if (
    value.byArtist?.["@type"] !== "MusicGroup" ||
    !nonEmpty(value.byArtist?.name)
  ) {
    violations.push(`${label} has invalid byArtist`);
  }
  if (
    value.inAlbum?.["@type"] !== "MusicAlbum" ||
    !nonEmpty(value.inAlbum?.name)
  ) {
    violations.push(`${label} has invalid inAlbum`);
  }
  if (
    !Array.isArray(value.creator) ||
    value.creator.length === 0 ||
    value.creator.some(
      (creator) =>
        !creator ||
        typeof creator !== "object" ||
        Array.isArray(creator) ||
        !nonEmpty(creator.name),
    )
  ) {
    violations.push(`${label} must contain non-empty confirmed creators`);
  }
}

function verifyNoForbiddenCreators(
  value,
  forbiddenCreatorNames,
  label,
  violations,
) {
  if (value?.["@type"] !== "MusicRecording") return;

  for (const creator of Array.isArray(value.creator) ? value.creator : []) {
    const creatorName = nonEmpty(creator?.name);
    if (creatorName && forbiddenCreatorNames.has(creatorName)) {
      violations.push(
        `${label} contains needsReview creator ${JSON.stringify(creatorName)}`,
      );
    }
  }
}

function resolveConfirmedCreators(song, creditRegistry) {
  if (
    !song ||
    song.sourceStatus === "unverified" ||
    !creditRegistry ||
    typeof creditRegistry !== "object" ||
    !creditRegistry.creators ||
    typeof creditRegistry.signatureSeparator?.ja !== "string"
  ) {
    return null;
  }

  const byJa = new Map();
  for (const [id, entry] of Object.entries(creditRegistry.creators)) {
    if (!isPublishableRegistryEntry(entry)) continue;
    byJa.set(entry.ja.trim(), { entry, id });
    for (const alias of entry.aliasesJa ?? []) {
      if (nonEmpty(alias)) byJa.set(alias.trim(), { entry, id });
    }
  }

  const creators = [];
  const seenIds = new Set();
  for (const role of CREDIT_ROLES) {
    const credit = song.credits?.[role];
    if (!nonEmpty(credit?.ja) || !nonEmpty(credit?.romaji)) return null;

    const resolved = resolveSignature(
      credit.ja,
      creditRegistry.signatureSeparator.ja,
      byJa,
    );
    if (!resolved?.length) return null;
    for (const creator of resolved) {
      if (seenIds.has(creator.id)) continue;
      seenIds.add(creator.id);
      creators.push(creator);
    }
  }

  return creators.length > 0 ? creators : null;
}

function resolveSignature(value, separator, byJa) {
  const whole = byJa.get(value.trim());
  if (whole) return [whole];

  const creators = [];
  for (const part of value.split(separator)) {
    const normalized = nonEmpty(part);
    if (!normalized) continue;
    const creator = byJa.get(normalized);
    if (!creator) return null;
    creators.push(creator);
  }
  return creators.length > 0 ? creators : null;
}

function isPublishableRegistryEntry(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    nonEmpty(entry.ja) &&
    nonEmpty(entry.romaji) &&
    (!Object.hasOwn(entry, "needsReview") || entry.needsReview === false) &&
    (!Object.hasOwn(entry, "aliasesJa") || Array.isArray(entry.aliasesJa))
  );
}

function nonEmpty(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeIsoDate(value) {
  const normalized = nonEmpty(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function normalizeSiteUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return `${url.origin}/`;
  } catch {
    return null;
  }
}

function compileStructuredDataModule(repositoryRoot) {
  const outputDirectory = mkdtempSync(
    path.join(tmpdir(), "mypick-structured-data-"),
  );
  const dependencyRoot = path.resolve(
    process.env.MYPICK_NODE_MODULES ??
      path.join(repositoryRoot, "node_modules"),
  );
  const tscPath = path.join(dependencyRoot, "typescript", "bin", "tsc");
  if (!existsSync(tscPath)) {
    rmSync(outputDirectory, { recursive: true, force: true });
    throw new Error(`TypeScript compiler not found at ${tscPath}`);
  }
  const result = spawnSync(
    process.execPath,
    [
      tscPath,
      "--ignoreConfig",
      "--module",
      "node16",
      "--moduleResolution",
      "node16",
      "--target",
      "ES2022",
      "--resolveJsonModule",
      "--esModuleInterop",
      "--strict",
      "--skipLibCheck",
      "--rootDir",
      repositoryRoot,
      "--outDir",
      outputDirectory,
      "src/utils/structuredData.ts",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );

  if (result.error || result.status !== 0) {
    rmSync(outputDirectory, { recursive: true, force: true });
    throw new Error(
      `Unable to compile structured-data helper: ${result.error?.message ?? result.stderr ?? `exit ${result.status}`}`,
    );
  }
  return outputDirectory;
}

function scriptTag(serialized) {
  return `<script type="application/ld+json">${serialized}</script>`;
}

async function runCli() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const { PROJECT_CONTRACTS } = await import("./verify-static-export.mjs");
  const sourceRegistry = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "src", "data", "credit-registry.json"),
      "utf8",
    ),
  );
  const outputDirectory = compileStructuredDataModule(repositoryRoot);
  const require = createRequire(import.meta.url);

  try {
    const production = require(
      path.join(outputDirectory, "src", "utils", "structuredData.js"),
    );
    const compiledRegistry = require(
      path.join(outputDirectory, "src", "data", "credit-registry.json"),
    );
    let recordingCount = 0;
    let omittedCount = 0;
    let negativeFixture;

    for (const [projectId, contract] of Object.entries(PROJECT_CONTRACTS)) {
      const website = production.createWebSiteStructuredData({
        name: contract.displayName,
        siteUrl: contract.siteUrl,
      });
      const expectedWebsite = createExpectedWebSiteStructuredData({
        name: contract.displayName,
        siteUrl: contract.siteUrl,
      });
      assert.deepEqual(website, expectedWebsite);
      const websiteJson = production.serializeStructuredData(website);
      assert.deepEqual(JSON.parse(websiteJson), website);
      assert.deepEqual(
        verifyStructuredDataBlocks({
          html: scriptTag(websiteJson),
          label: `${projectId} root fixture`,
          expected: [expectedWebsite],
        }),
        [],
      );

      const songs = JSON.parse(
        readFileSync(
          path.join(repositoryRoot, "src", "projects", projectId, "songs.json"),
          "utf8",
        ),
      );
      for (const song of songs) {
        const recording = production.createMusicRecordingStructuredData({
          song,
          groupName: contract.groupName,
        });
        const expectedRecording = createExpectedMusicRecordingStructuredData({
          song,
          groupName: contract.groupName,
          creditRegistry: sourceRegistry,
        });
        assert.deepEqual(recording, expectedRecording);
        if (!recording) {
          omittedCount += 1;
          continue;
        }
        const recordingJson = production.serializeStructuredData(recording);
        assert.deepEqual(JSON.parse(recordingJson), recording);
        assert.deepEqual(
          verifyStructuredDataBlocks({
            html: `${scriptTag(websiteJson)}${scriptTag(recordingJson)}`,
            label: `${projectId}/songs/${song.id}/ fixture`,
            expected: [expectedWebsite, expectedRecording],
          }),
          [],
        );
        recordingCount += 1;
        negativeFixture ??= {
          contract,
          expectedRecording,
          song,
        };
      }
    }

    assert.ok(negativeFixture, "at least one confirmed recording is required");
    verifyFailClosedCreatorGate({
      compiledRegistry,
      production,
      ...negativeFixture,
    });
    verifyScriptSafeSerialization({
      production,
      sourceRegistry,
      ...negativeFixture,
    });
    verifyExportAssertion({
      contracts: PROJECT_CONTRACTS,
      production,
      repositoryRoot,
      sourceRegistry,
    });

    console.log(
      `Structured data verification passed for ${Object.keys(PROJECT_CONTRACTS).length} sites and ${recordingCount} MusicRecording fixtures (${omittedCount} omitted fail-closed).`,
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}

function verifyFailClosedCreatorGate({
  compiledRegistry,
  contract,
  expectedRecording,
  production,
  song,
}) {
  const firstCreatorName = expectedRecording.creator[0].name;
  const creatorPair = Object.entries(compiledRegistry.creators).find(
    ([, entry]) => entry.ja.trim() === firstCreatorName,
  );
  assert.ok(creatorPair, "negative fixture creator must exist in registry");
  const [creatorId, creatorEntry] = creatorPair;
  const hadNeedsReview = Object.hasOwn(creatorEntry, "needsReview");
  const previousNeedsReview = creatorEntry.needsReview;

  try {
    creatorEntry.needsReview = true;
    assert.equal(
      production.createMusicRecordingStructuredData({
        song,
        groupName: contract.groupName,
      }),
      null,
    );
    assert.ok(
      verifyStructuredDataBlocks({
        html: scriptTag(JSON.stringify(expectedRecording)),
        label: "needsReview output fixture",
        expected: [expectedRecording],
        forbiddenCreatorNames: new Set([firstCreatorName]),
      }).some((violation) => violation.includes("needsReview creator")),
      "the output verifier must reject a needsReview creator name",
    );
    creatorEntry.needsReview = "false";
    assert.equal(
      production.createMusicRecordingStructuredData({
        song,
        groupName: contract.groupName,
      }),
      null,
    );
  } finally {
    if (hadNeedsReview) creatorEntry.needsReview = previousNeedsReview;
    else delete creatorEntry.needsReview;
  }

  delete compiledRegistry.creators[creatorId];
  try {
    assert.equal(
      production.createMusicRecordingStructuredData({
        song,
        groupName: contract.groupName,
      }),
      null,
    );
  } finally {
    compiledRegistry.creators[creatorId] = creatorEntry;
  }

  const missingCreatorSong = structuredClone(song);
  missingCreatorSong.credits.lyricist.ja = "__unregistered_creator__";
  assert.equal(
    production.createMusicRecordingStructuredData({
      song: missingCreatorSong,
      groupName: contract.groupName,
    }),
    null,
  );
}

function verifyScriptSafeSerialization({
  contract,
  production,
  song,
  sourceRegistry,
}) {
  const maliciousSong = structuredClone(song);
  maliciousSong.title.ja =
    'Safe </script><script>alert("song")</script> & \u2028 \u2029';
  maliciousSong.releaseTitle.ja =
    'Release </SCRIPT><script>alert("release")</script>';
  const maliciousGroup =
    'Group </script><script>alert("group")</script> & \u2028 \u2029';
  const recording = production.createMusicRecordingStructuredData({
    song: maliciousSong,
    groupName: maliciousGroup,
  });
  const expected = createExpectedMusicRecordingStructuredData({
    song: maliciousSong,
    groupName: maliciousGroup,
    creditRegistry: sourceRegistry,
  });
  assert.deepEqual(recording, expected);

  const serialized = production.serializeStructuredData(recording);
  assert.equal(/[<>&\u2028\u2029]/u.test(serialized), false);
  assert.equal(/<\/script/i.test(serialized), false);
  assert.deepEqual(JSON.parse(serialized), recording);
  assert.deepEqual(
    verifyStructuredDataBlocks({
      html: scriptTag(serialized),
      label: `${contract.groupName} script-safe fixture`,
      expected: [expected],
    }),
    [],
  );
}

function verifyExportAssertion({
  contracts,
  production,
  repositoryRoot,
  sourceRegistry,
}) {
  const fixtureRoot = mkdtempSync(
    path.join(tmpdir(), "mypick-structured-export-"),
  );

  try {
    for (const [projectId, contract] of Object.entries(contracts)) {
      const outputDirectory = path.join(fixtureRoot, projectId);
      const website = production.createWebSiteStructuredData({
        name: contract.displayName,
        siteUrl: contract.siteUrl,
      });
      const websiteTag = scriptTag(production.serializeStructuredData(website));
      const songs = JSON.parse(
        readFileSync(
          path.join(repositoryRoot, "src", "projects", projectId, "songs.json"),
          "utf8",
        ),
      );
      const experiences = JSON.parse(
        readFileSync(
          path.join(
            repositoryRoot,
            "src",
            "projects",
            projectId,
            "live-experiences.json",
          ),
          "utf8",
        ),
      );

      writeFixture("index.html", websiteTag);
      writeFixture(path.join("songs", "index.html"), websiteTag);
      for (const experience of experiences.filter((candidate) =>
        ROUTABLE_STATUSES.has(candidate?.status),
      )) {
        writeFixture(
          path.join("live", experience.slug, "index.html"),
          websiteTag,
        );
      }
      for (const song of songs) {
        const recording = production.createMusicRecordingStructuredData({
          song,
          groupName: contract.groupName,
        });
        assert.deepEqual(
          recording,
          createExpectedMusicRecordingStructuredData({
            song,
            groupName: contract.groupName,
            creditRegistry: sourceRegistry,
          }),
        );
        writeFixture(
          path.join("songs", encodeURIComponent(song.id), "index.html"),
          recording
            ? `${websiteTag}${scriptTag(
                production.serializeStructuredData(recording),
              )}`
            : websiteTag,
        );
      }

      assert.deepEqual(
        verifyStructuredDataExport({
          contract,
          outputDirectory,
          projectId,
          repositoryRoot,
        }),
        [],
      );

      if (projectId === "equal-love") {
        writeFixture(
          path.join("unexpected", "index.html"),
          '<script type="application/ld+json">{</script>',
        );
        assert.ok(
          verifyStructuredDataExport({
            contract,
            outputDirectory,
            projectId,
            repositoryRoot,
          }).some((violation) => violation.includes("is not parseable")),
          "the export assertion must parse JSON-LD in otherwise unknown HTML files",
        );
      }

      function writeFixture(relativePath, html) {
        const filePath = path.join(outputDirectory, relativePath);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, html, "utf8");
      }
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
