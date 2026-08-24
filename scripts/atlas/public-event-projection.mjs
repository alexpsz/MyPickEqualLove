import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const execFileAsync = promisify(execFile);

export const PUBLIC_SITE_IDS = [
  "equal-love",
  "nearly-equal-joy",
  "not-equal-me",
];
export const GATE_NAMES = [
  "sourceUseBoundary",
  "claimLevelEvidence",
  "temporalVerification",
  "timezoneAndLifecycle",
  "refreshInvalidationWithdrawal",
  "maintenanceOwner",
];
export const FIXED_SEEDS = [
  {
    siteId: "equal-love",
    sourcePath: "src/projects/equal-love/live-experiences.json",
    songsPath: "src/projects/equal-love/songs.json",
    approvalPath:
      "scripts/atlas/evidence/equal-love-public-seed-approval.v1.json",
  },
  {
    siteId: "nearly-equal-joy",
    sourcePath: "src/projects/nearly-equal-joy/live-experiences.json",
    songsPath: "src/projects/nearly-equal-joy/songs.json",
    approvalPath:
      "scripts/atlas/evidence/nearly-equal-joy-public-seed-approval.v1.json",
  },
  {
    siteId: "not-equal-me",
    sourcePath: "src/projects/not-equal-me/live-experiences.json",
    songsPath: "src/projects/not-equal-me/songs.json",
    approvalPath:
      "scripts/atlas/evidence/not-equal-me-public-seed-approval.v1.json",
  },
];
export const FIXED_BASELINE_CONTRACT_PATH =
  "apps/atlas/src/contracts/baseline-receipt.ts";
export const FIXED_AUTHORITY_CONTRACT_PATH =
  "apps/atlas/src/contracts/publication-authority.ts";
export const FIXED_CONTRACT_PATHS = [
  "apps/atlas/src/contracts/public-atlas-projection.ts",
  "apps/atlas/src/contracts/identity.ts",
  "apps/atlas/src/contracts/public-reference.ts",
  "apps/atlas/src/contracts/strict.ts",
  FIXED_BASELINE_CONTRACT_PATH,
  FIXED_AUTHORITY_CONTRACT_PATH,
];
export const FIXED_ARTIFACT_PATH =
  "apps/atlas/src/generated/public-atlas-projection.v1.json";
export const FIXED_RECEIPT_PATH =
  "scripts/atlas/source-go-hold-receipt.v1.json";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..", "..");
export const DEFAULT_RECEIPT_PATH = resolve(
  DEFAULT_REPOSITORY_ROOT,
  FIXED_RECEIPT_PATH,
);
export const DEFAULT_ARTIFACT_PATH = resolve(
  DEFAULT_REPOSITORY_ROOT,
  FIXED_ARTIFACT_PATH,
);

const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_REVISION_ALGORITHM =
  "sha256 of canonical UTF-8 atlas-public-source-revision-v1 input";
const VERIFICATION_STATUSES = new Set(["verified", "partial", "unverified"]);
const REFRESH_CADENCES = new Set([
  "on-source-change",
  "daily",
  "weekly",
  "monthly",
]);
const LIFECYCLES = new Set([
  "scheduled",
  "postponed",
  "cancelled",
  "completed",
  "unknown",
]);
const c0ParserCache = new Map();
const c0BaselineCache = new Map();
const authorityContractCache = new Map();

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function record(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected an object");
  }
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function string(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "expected a non-empty string");
  }
  return value;
}

function integer(value, path, min = Number.MIN_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min) {
    fail(path, `expected an integer >= ${min}`);
  }
  return value;
}

function exactKeys(value, path, keys) {
  const actual = Object.keys(record(value, path)).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(
      path,
      `expected exact keys ${expected.join(", ")}; received ${actual.join(", ")}`,
    );
  }
}

function allowedKeys(value, path, required, optional = []) {
  const object = record(value, path);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "unknown key");
  }
  for (const key of required) {
    if (!(key in object)) fail(`${path}.${key}`, "missing key");
  }
}

function enumValue(value, path, values) {
  if (!values.has(value))
    fail(path, `expected one of ${[...values].join(", ")}`);
  return value;
}

function isoDate(value, path) {
  const parsed = string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) fail(path, "expected ISO date");
  const date = new Date(`${parsed}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== parsed
  ) {
    fail(path, "expected a real ISO date");
  }
  return parsed;
}

function utcTimestamp(value, path) {
  if (typeof value !== "string" || value.length === 0 || value.length > 24) {
    fail(path, "expected a bounded canonical UTC timestamp");
  }
  const parsed = value;
  const match = parsed.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?Z$/,
  );
  if (!match) {
    fail(path, "expected an ISO UTC timestamp");
  }
  const milliseconds = Date.parse(parsed);
  if (Number.isNaN(milliseconds)) fail(path, "expected a real timestamp");
  const canonical = new Date(milliseconds).toISOString();
  const expectedCanonical = `${match[1]}${match[2] ?? ".000"}Z`;
  if (canonical !== expectedCanonical) {
    fail(path, "timestamp is not a real canonical UTC calendar instant");
  }
  return parsed;
}

function httpsUrl(value, path) {
  const parsed = string(value, path);
  let url;
  try {
    url = new URL(parsed);
  } catch {
    fail(path, "expected a valid URL");
  }
  if (url.protocol !== "https:") fail(path, "expected an HTTPS URL");
  return parsed;
}

function ianaTimezone(value, path) {
  const parsed = string(value, path);
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed }).format();
  } catch {
    fail(path, "expected an IANA timezone");
  }
  return parsed;
}

function uniqueStrings(value, path, parse = string) {
  const parsed = array(value, path).map((item, index) =>
    parse(item, `${path}[${index}]`),
  );
  if (new Set(parsed).size !== parsed.length)
    fail(path, "duplicates are not allowed");
  return parsed;
}

function isOutside(root, target) {
  const fromRoot = relative(root, target);
  return (
    fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)
  );
}

export function safeRepositoryPath(root, repositoryPath, path = "$path") {
  const value = string(repositoryPath, path);
  if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    fail(path, "expected a repository-relative path");
  }
  if (value.split(/[\\/]+/).includes("..")) {
    fail(path, "parent traversal is not allowed");
  }
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, value);
  if (target === resolvedRoot || isOutside(resolvedRoot, target)) {
    fail(path, "path escapes or names the repository root");
  }
  return target;
}

async function readContainedFile(repositoryRoot, rootReal, repositoryPath) {
  const target = safeRepositoryPath(
    repositoryRoot,
    repositoryPath,
    repositoryPath,
  );
  await validateFixedPhysicalChain(
    repositoryRoot,
    rootReal,
    repositoryPath,
    repositoryPath,
  );
  return readFile(target);
}

async function validateExactReceiptPath(repositoryRoot, receiptPath) {
  const expected = resolve(repositoryRoot, FIXED_RECEIPT_PATH);
  if (resolve(receiptPath) !== expected) {
    fail("receiptPath", `must be exactly ${expected}`);
  }
  const rootReal = await realpath(repositoryRoot);
  await validateFixedPhysicalChain(
    repositoryRoot,
    rootReal,
    FIXED_RECEIPT_PATH,
    FIXED_RECEIPT_PATH,
  );
  return { expected, rootReal };
}

function samePhysicalPath(left, right) {
  return relative(left, right) === "" && relative(right, left) === "";
}

async function validateFixedPhysicalChain(
  repositoryRoot,
  rootReal,
  repositoryPath,
  path,
  { allowMissing = false } = {},
) {
  let lexicalPath = resolve(repositoryRoot);
  let expectedRealPath = rootReal;
  for (const component of repositoryPath.split(/[\\/]+/)) {
    lexicalPath = resolve(lexicalPath, component);
    expectedRealPath = resolve(expectedRealPath, component);
    let status;
    try {
      status = await lstat(lexicalPath);
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) return;
      if (error?.code === "ENOENT") fail(path, "file is missing");
      throw error;
    }
    if (status.isSymbolicLink()) {
      fail(
        path,
        `physical path component is a symbolic link or junction: ${component}`,
      );
    }
    const actualRealPath = await realpath(lexicalPath);
    if (!samePhysicalPath(actualRealPath, expectedRealPath)) {
      fail(
        path,
        `physical path component does not match its fixed repository location: ${component}`,
      );
    }
  }
}

async function validateFixedArtifactChain(repositoryRoot, rootReal) {
  return validateFixedPhysicalChain(
    repositoryRoot,
    rootReal,
    FIXED_ARTIFACT_PATH,
    "artifactPath",
    { allowMissing: true },
  );
}

async function validateExactArtifactPath(repositoryRoot, artifactPath) {
  const expected = resolve(repositoryRoot, FIXED_ARTIFACT_PATH);
  if (resolve(artifactPath) !== expected) {
    fail("artifactPath", `must be exactly ${expected}`);
  }
  const rootReal = await realpath(repositoryRoot);
  await validateFixedArtifactChain(repositoryRoot, rootReal);
  return { expected, rootReal };
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("canonical JSON cannot contain a non-finite number");
  }
  if (value === undefined)
    throw new Error("canonical JSON cannot contain undefined");
  return value;
}

export function canonicalUtf8(value) {
  return Buffer.from(JSON.stringify(canonicalize(value)), "utf8");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseUtf8Json(bytes, path) {
  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(path, "file is not valid UTF-8");
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(
      path,
      `invalid JSON (${error instanceof Error ? error.message : "parse error"})`,
    );
  }
}

function validateCounts(value, path) {
  exactKeys(value, path, ["events", "performances", "setlistEntries"]);
  return {
    events: integer(value.events, `${path}.events`, 0),
    performances: integer(value.performances, `${path}.performances`, 0),
    setlistEntries: integer(value.setlistEntries, `${path}.setlistEntries`, 0),
  };
}

function validateGate(value, path) {
  exactKeys(value, path, ["status", "evidenceRefs", "gap"]);
  const status = enumValue(
    value.status,
    `${path}.status`,
    new Set(["GO", "HOLD"]),
  );
  const evidenceRefs = uniqueStrings(
    value.evidenceRefs,
    `${path}.evidenceRefs`,
  );
  const gap = value.gap === null ? null : string(value.gap, `${path}.gap`);
  if (status === "GO" && (evidenceRefs.length === 0 || gap !== null)) {
    fail(path, "GO requires evidenceRefs and a null gap");
  }
  if (status === "HOLD" && gap === null)
    fail(path, "HOLD requires a named gap");
  return { status, evidenceRefs, gap };
}

function validateOrderedPathHashes(value, path, expectedPaths, allowSubset) {
  const entries = array(value, path);
  const observed = entries.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    exactKeys(entry, entryPath, ["path", "sha256"]);
    safeRepositoryPath(
      DEFAULT_REPOSITORY_ROOT,
      entry.path,
      `${entryPath}.path`,
    );
    if (!SHA256_PATTERN.test(entry.sha256))
      fail(`${entryPath}.sha256`, "invalid SHA-256");
    return entry.path;
  });
  const expected = allowSubset
    ? expectedPaths.filter((candidate) => observed.includes(candidate))
    : expectedPaths;
  if (
    observed.length !== expected.length ||
    observed.some((entry, index) => entry !== expected[index])
  ) {
    fail(
      path,
      `paths must be the fixed ordered ${allowSubset ? "subset" : "allowlist"}`,
    );
  }
}

export function validateReceipt(
  value,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
) {
  exactKeys(value, "$receipt", [
    "schemaVersion",
    "receiptId",
    "sourceCommit",
    "sourceRevisionAlgorithm",
    "historicalBaseline",
    "contractFiles",
    "evidenceFiles",
    "seeds",
  ]);
  if (value.schemaVersion !== 1) fail("$receipt.schemaVersion", "expected 1");
  if (value.receiptId !== "atlas-public-event-source-go-hold-v1") {
    fail("$receipt.receiptId", "unexpected receipt id");
  }
  if (!/^[0-9a-f]{40}$/.test(value.sourceCommit)) {
    fail("$receipt.sourceCommit", "expected a full lowercase Git SHA");
  }
  if (value.sourceRevisionAlgorithm !== SOURCE_REVISION_ALGORITHM) {
    fail(
      "$receipt.sourceRevisionAlgorithm",
      "unknown source revision algorithm",
    );
  }
  exactKeys(value.historicalBaseline, "$receipt.historicalBaseline", [
    "contractPath",
    "sourceCommit",
    "totals",
  ]);
  if (value.historicalBaseline.contractPath !== FIXED_BASELINE_CONTRACT_PATH) {
    fail(
      "$receipt.historicalBaseline.contractPath",
      "unexpected baseline contract path",
    );
  }
  if (!/^[0-9a-f]{40}$/.test(value.historicalBaseline.sourceCommit)) {
    fail(
      "$receipt.historicalBaseline.sourceCommit",
      "expected a full lowercase Git SHA",
    );
  }
  validateCounts(
    value.historicalBaseline.totals,
    "$receipt.historicalBaseline.totals",
  );
  validateOrderedPathHashes(
    value.contractFiles,
    "$receipt.contractFiles",
    FIXED_CONTRACT_PATHS,
    false,
  );
  const approvalPaths = FIXED_SEEDS.map((seed) => seed.approvalPath);
  validateOrderedPathHashes(
    value.evidenceFiles,
    "$receipt.evidenceFiles",
    approvalPaths,
    true,
  );

  const seeds = array(value.seeds, "$receipt.seeds");
  if (seeds.length !== FIXED_SEEDS.length) {
    fail("$receipt.seeds", "expected exactly three ordered public seeds");
  }
  seeds.forEach((seed, index) => {
    const path = `$receipt.seeds[${index}]`;
    const fixed = FIXED_SEEDS[index];
    exactKeys(seed, path, [
      "siteId",
      "sourcePath",
      "sourceSha256",
      "songsPath",
      "songsSha256",
      "baselineCounts",
      "decision",
      "withdrawalState",
      "gates",
    ]);
    if (seed.siteId !== fixed.siteId)
      fail(`${path}.siteId`, `expected ${fixed.siteId}`);
    if (seed.sourcePath !== fixed.sourcePath)
      fail(`${path}.sourcePath`, "not the fixed source path");
    if (seed.songsPath !== fixed.songsPath)
      fail(`${path}.songsPath`, "not the fixed songs path");
    if (!SHA256_PATTERN.test(seed.sourceSha256))
      fail(`${path}.sourceSha256`, "invalid SHA-256");
    if (!SHA256_PATTERN.test(seed.songsSha256))
      fail(`${path}.songsSha256`, "invalid SHA-256");
    validateCounts(seed.baselineCounts, `${path}.baselineCounts`);
    enumValue(seed.decision, `${path}.decision`, new Set(["GO", "HOLD"]));
    enumValue(
      seed.withdrawalState,
      `${path}.withdrawalState`,
      new Set(["active", "withdrawn", "unknown"]),
    );
    exactKeys(seed.gates, `${path}.gates`, GATE_NAMES);
    const gates = GATE_NAMES.map((name) =>
      validateGate(seed.gates[name], `${path}.gates.${name}`),
    );
    const expectedDecision =
      seed.withdrawalState === "active" &&
      gates.every((gate) => gate.status === "GO")
        ? "GO"
        : "HOLD";
    if (seed.decision !== expectedDecision) {
      fail(
        `${path}.decision`,
        `must be ${expectedDecision} for the recorded gates and withdrawal state`,
      );
    }
    if (
      seed.decision === "GO" &&
      !value.evidenceFiles.some((entry) => entry.path === fixed.approvalPath)
    ) {
      fail(`${path}.decision`, "GO requires its fixed approval evidence file");
    }
  });
  for (const entry of [...value.contractFiles, ...value.evidenceFiles]) {
    safeRepositoryPath(repositoryRoot, entry.path, entry.path);
  }
  return value;
}

export function computeSourceRevision(receipt) {
  return `sha256:${sha256(
    canonicalUtf8({
      kind: "atlas-public-source-revision-v1",
      schemaVersion: receipt.schemaVersion,
      sourceCommit: receipt.sourceCommit,
      historicalBaseline: receipt.historicalBaseline,
      contractFiles: receipt.contractFiles,
      evidenceFiles: receipt.evidenceFiles,
      seeds: receipt.seeds,
    }),
  )}`;
}

function validateSourceUrls(value, path) {
  return uniqueStrings(value, path, httpsUrl);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function governancePrincipalId(value, path, authorityContract) {
  if (!authorityContract?.isAtlasGovernancePrincipalId?.(value)) {
    fail(path, "expected a canonical configured-contract principal id");
  }
  return value;
}

function publicationAuthorityId(value, path, authorityContract) {
  if (!authorityContract?.isAtlasAuthorityId?.(value)) {
    fail(path, "expected a canonical configured-contract authority id");
  }
  return value;
}

function validatePublicAtlasEvidence(
  value,
  path,
  auditDate,
  authorityContract,
) {
  exactKeys(value, path, [
    "asOf",
    "lastVerifiedAt",
    "timezone",
    "lifecycle",
    "refreshPolicy",
    "maintenanceOwnerId",
  ]);
  const asOf = isoDate(value.asOf, `${path}.asOf`);
  const lastVerifiedAt = isoDate(
    value.lastVerifiedAt,
    `${path}.lastVerifiedAt`,
  );
  if (asOf > lastVerifiedAt) fail(`${path}.asOf`, "must be <= lastVerifiedAt");
  if (asOf > auditDate || lastVerifiedAt > auditDate) {
    fail(
      path,
      `asOf and lastVerifiedAt cannot be after auditDate ${auditDate}`,
    );
  }
  const timezone = ianaTimezone(value.timezone, `${path}.timezone`);
  const lifecycle = enumValue(value.lifecycle, `${path}.lifecycle`, LIFECYCLES);
  exactKeys(value.refreshPolicy, `${path}.refreshPolicy`, [
    "refreshCadence",
    "staleAfterDays",
    "onInvalidation",
    "onWithdrawal",
  ]);
  const staleAfterDays = integer(
    value.refreshPolicy.staleAfterDays,
    `${path}.refreshPolicy.staleAfterDays`,
    1,
  );
  if (staleAfterDays > 365) {
    fail(`${path}.refreshPolicy.staleAfterDays`, "must be <= 365");
  }
  const refreshCadence = enumValue(
    value.refreshPolicy.refreshCadence,
    `${path}.refreshPolicy.refreshCadence`,
    REFRESH_CADENCES,
  );
  if (value.refreshPolicy.onInvalidation !== "HOLD") {
    fail(`${path}.refreshPolicy.onInvalidation`, "must be HOLD");
  }
  if (value.refreshPolicy.onWithdrawal !== "HOLD") {
    fail(`${path}.refreshPolicy.onWithdrawal`, "must be HOLD");
  }
  const expiryDate = addDays(lastVerifiedAt, staleAfterDays);
  if (auditDate > expiryDate) {
    fail(path, `stale after ${expiryDate}; auditDate is ${auditDate}`);
  }
  return {
    asOf,
    lastVerifiedAt,
    timezone,
    lifecycle,
    refreshPolicy: {
      refreshCadence,
      staleAfterDays,
      onInvalidation: "HOLD",
      onWithdrawal: "HOLD",
    },
    maintenanceOwnerId: governancePrincipalId(
      value.maintenanceOwnerId,
      `${path}.maintenanceOwnerId`,
      authorityContract,
    ),
  };
}

function validateSongs(value, path) {
  const songs = array(value, path);
  const byId = new Map();
  songs.forEach((song, index) => {
    const itemPath = `${path}[${index}]`;
    const item = record(song, itemPath);
    const id = string(item.id, `${itemPath}.id`);
    if (!LOCAL_ID_PATTERN.test(id)) fail(`${itemPath}.id`, "invalid local id");
    if (byId.has(id)) fail(`${itemPath}.id`, "duplicate song id");
    const title = record(item.title, `${itemPath}.title`);
    byId.set(id, { id, title: string(title.ja, `${itemPath}.title.ja`) });
  });
  return byId;
}

function validateExcludedEntries(value, path, includedOrders) {
  if (value === undefined) return [];
  const sourceOrders = new Set();
  const beforeOrders = new Set();
  return array(value, path).map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = record(entry, itemPath);
    allowedKeys(
      item,
      itemPath,
      ["sourceUrl", "label", "reason"],
      ["sourceOrder", "beforeSourceOrder"],
    );
    httpsUrl(item.sourceUrl, `${itemPath}.sourceUrl`);
    string(item.label, `${itemPath}.label`);
    string(item.reason, `${itemPath}.reason`);
    const hasSourceOrder = Object.hasOwn(item, "sourceOrder");
    const hasBeforeSourceOrder = Object.hasOwn(item, "beforeSourceOrder");
    if (hasSourceOrder === hasBeforeSourceOrder) {
      fail(
        itemPath,
        "must contain exactly one of sourceOrder or beforeSourceOrder",
      );
    }
    if (hasSourceOrder) {
      const order = integer(item.sourceOrder, `${itemPath}.sourceOrder`, 1);
      if (includedOrders.has(order) || sourceOrders.has(order)) {
        fail(
          `${itemPath}.sourceOrder`,
          "conflicts with an included or excluded order",
        );
      }
      sourceOrders.add(order);
    } else {
      const order = integer(
        item.beforeSourceOrder,
        `${itemPath}.beforeSourceOrder`,
        1,
      );
      if (!includedOrders.has(order)) {
        fail(`${itemPath}.beforeSourceOrder`, "must target an included order");
      }
      if (beforeOrders.has(order)) {
        fail(`${itemPath}.beforeSourceOrder`, "duplicate excluded position");
      }
      beforeOrders.add(order);
    }
    return item;
  });
}

function coverageIssuesFor(performance, excluded) {
  const included = new Set(performance.setlist.map((entry) => entry.order));
  const numericExcluded = new Set(
    excluded.flatMap((entry) =>
      Object.hasOwn(entry, "sourceOrder") ? [entry.sourceOrder] : [],
    ),
  );
  const numeric = [...included, ...numericExcluded];
  const maximum = numeric.length === 0 ? 0 : Math.max(...numeric);
  const missing = [];
  for (let order = 1; order <= maximum; order += 1) {
    if (!included.has(order) && !numericExcluded.has(order))
      missing.push(order);
  }
  return missing.length === 0
    ? []
    : [
        `setlist order gaps ${missing.join(", ")} lack structured excludedEntries`,
      ];
}

function validateLiveSource(value, seed, songs, auditDate, authorityContract) {
  const path = seed.sourcePath;
  const events = array(value, path);
  const eventIds = new Set();
  const ownerNames = new Set();
  const coverageIssues = [];
  let performanceCount = 0;
  let setlistEntryCount = 0;

  events.forEach((event, eventIndex) => {
    const eventPath = `${path}[${eventIndex}]`;
    allowedKeys(
      event,
      eventPath,
      [
        "id",
        "projectId",
        "slug",
        "kind",
        "status",
        "title",
        "subtitle",
        "description",
        "canonicalPath",
        "eventName",
        "venue",
        "officialUrl",
        "eventEvidence",
        "slots",
        "export",
        "share",
      ],
      [
        "provenanceSchemaVersion",
        "includeCombinedPerformance",
        "combinedPerformanceLabel",
        "defaultContextId",
        "performances",
        "publicAtlasEvidence",
      ],
    );
    const eventId = string(event.id, `${eventPath}.id`);
    if (!LOCAL_ID_PATTERN.test(eventId))
      fail(`${eventPath}.id`, "invalid local id");
    if (eventIds.has(eventId)) fail(`${eventPath}.id`, "duplicate event id");
    eventIds.add(eventId);
    if (event.projectId !== seed.siteId)
      fail(`${eventPath}.projectId`, "must match seed siteId");
    for (const key of [
      "slug",
      "kind",
      "status",
      "title",
      "subtitle",
      "description",
      "canonicalPath",
      "eventName",
      "venue",
    ]) {
      string(event[key], `${eventPath}.${key}`);
    }
    httpsUrl(event.officialUrl, `${eventPath}.officialUrl`);
    array(event.slots, `${eventPath}.slots`);
    record(event.export, `${eventPath}.export`);
    record(event.share, `${eventPath}.share`);
    exactKeys(event.eventEvidence, `${eventPath}.eventEvidence`, [
      "dates",
      "verificationStatus",
      "sourceUrls",
      "sourceNote",
    ]);
    const dates = array(
      event.eventEvidence.dates,
      `${eventPath}.eventEvidence.dates`,
    ).map((date, index) =>
      isoDate(date, `${eventPath}.eventEvidence.dates[${index}]`),
    );
    if (dates.length === 0 || new Set(dates).size !== dates.length) {
      fail(`${eventPath}.eventEvidence.dates`, "must be non-empty and unique");
    }
    for (let index = 1; index < dates.length; index += 1) {
      if (dates[index] <= dates[index - 1]) {
        fail(
          `${eventPath}.eventEvidence.dates[${index}]`,
          "dates must be strictly increasing",
        );
      }
    }
    enumValue(
      event.eventEvidence.verificationStatus,
      `${eventPath}.eventEvidence.verificationStatus`,
      VERIFICATION_STATUSES,
    );
    validateSourceUrls(
      event.eventEvidence.sourceUrls,
      `${eventPath}.eventEvidence.sourceUrls`,
    );
    string(
      event.eventEvidence.sourceNote,
      `${eventPath}.eventEvidence.sourceNote`,
    );

    if (seed.decision === "GO" && event.publicAtlasEvidence === undefined) {
      fail(`${eventPath}.publicAtlasEvidence`, "required for a GO seed");
    }
    if (event.publicAtlasEvidence !== undefined) {
      const evidence = validatePublicAtlasEvidence(
        event.publicAtlasEvidence,
        `${eventPath}.publicAtlasEvidence`,
        auditDate,
        authorityContract,
      );
      ownerNames.add(evidence.maintenanceOwnerId);
    }

    const performanceIds = new Set();
    const performances =
      event.performances === undefined
        ? []
        : array(event.performances, `${eventPath}.performances`);
    performances.forEach((performance, performanceIndex) => {
      const performancePath = `${eventPath}.performances[${performanceIndex}]`;
      allowedKeys(
        performance,
        performancePath,
        [
          "id",
          "label",
          "date",
          "verificationStatus",
          "sourceUrls",
          "sourceNote",
          "setlist",
        ],
        ["provenance"],
      );
      const performanceId = string(performance.id, `${performancePath}.id`);
      if (!LOCAL_ID_PATTERN.test(performanceId))
        fail(`${performancePath}.id`, "invalid local id");
      if (performanceIds.has(performanceId))
        fail(`${performancePath}.id`, "duplicate performance id");
      performanceIds.add(performanceId);
      string(performance.label, `${performancePath}.label`);
      const performanceDate = isoDate(
        performance.date,
        `${performancePath}.date`,
      );
      if (!dates.includes(performanceDate)) {
        fail(
          `${performancePath}.date`,
          "must be an exact member of parent eventEvidence.dates",
        );
      }
      enumValue(
        performance.verificationStatus,
        `${performancePath}.verificationStatus`,
        VERIFICATION_STATUSES,
      );
      validateSourceUrls(
        performance.sourceUrls,
        `${performancePath}.sourceUrls`,
      );
      string(performance.sourceNote, `${performancePath}.sourceNote`);
      let previousOrder = 0;
      const includedOrders = new Set();
      array(performance.setlist, `${performancePath}.setlist`).forEach(
        (entry, entryIndex) => {
          const entryPath = `${performancePath}.setlist[${entryIndex}]`;
          allowedKeys(
            entry,
            entryPath,
            ["order", "songId"],
            ["section", "versionNote"],
          );
          const order = integer(entry.order, `${entryPath}.order`, 1);
          if (order <= previousOrder)
            fail(`${entryPath}.order`, "must be strictly increasing");
          previousOrder = order;
          includedOrders.add(order);
          const songId = string(entry.songId, `${entryPath}.songId`);
          if (!songs.has(songId))
            fail(`${entryPath}.songId`, `unknown song id ${songId}`);
        },
      );
      const provenance = performance.provenance;
      const excluded = validateExcludedEntries(
        provenance?.excludedEntries,
        `${performancePath}.provenance.excludedEntries`,
        includedOrders,
      );
      for (const issue of coverageIssuesFor(performance, excluded)) {
        coverageIssues.push(`${event.id}/${performance.id}: ${issue}`);
      }
      performanceCount += 1;
      setlistEntryCount += performance.setlist.length;
    });
  });
  if (seed.decision === "GO" && ownerNames.size !== 1) {
    fail(path, "a GO seed must name exactly one maintenance owner");
  }
  return {
    events,
    coverageIssues,
    counts: {
      events: events.length,
      performances: performanceCount,
      setlistEntries: setlistEntryCount,
    },
  };
}

function validateApproval(
  value,
  fixed,
  seed,
  auditDate,
  path,
  authorityContract,
) {
  exactKeys(value, path, [
    "schemaVersion",
    "siteId",
    "scope",
    "sourcePath",
    "sourceSha256",
    "songsPath",
    "songsSha256",
    "atlasPublicSeedApproval",
    "approvalAuthorityId",
    "approverId",
    "approvedAt",
    "maintenanceOwnerId",
    "withdrawalState",
  ]);
  if (value.schemaVersion !== 1) fail(`${path}.schemaVersion`, "expected 1");
  if (value.siteId !== fixed.siteId)
    fail(`${path}.siteId`, `expected ${fixed.siteId}`);
  if (value.scope !== "atlas-public-seed-v1") {
    fail(`${path}.scope`, "must be atlas-public-seed-v1");
  }
  if (
    value.sourcePath !== fixed.sourcePath ||
    value.sourcePath !== seed.sourcePath
  ) {
    fail(`${path}.sourcePath`, "must match the fixed seed sourcePath");
  }
  if (
    value.sourceSha256 !== seed.sourceSha256 ||
    !SHA256_PATTERN.test(value.sourceSha256)
  ) {
    fail(`${path}.sourceSha256`, "must match the seed source hash");
  }
  if (
    value.songsPath !== fixed.songsPath ||
    value.songsPath !== seed.songsPath
  ) {
    fail(`${path}.songsPath`, "must match the fixed seed songsPath");
  }
  if (
    value.songsSha256 !== seed.songsSha256 ||
    !SHA256_PATTERN.test(value.songsSha256)
  ) {
    fail(`${path}.songsSha256`, "must match the seed songs hash");
  }
  if (value.atlasPublicSeedApproval !== "approved") {
    fail(`${path}.atlasPublicSeedApproval`, "must explicitly be approved");
  }
  const approvalAuthorityId = publicationAuthorityId(
    value.approvalAuthorityId,
    `${path}.approvalAuthorityId`,
    authorityContract,
  );
  const approverId = governancePrincipalId(
    value.approverId,
    `${path}.approverId`,
    authorityContract,
  );
  const maintenanceOwnerId = governancePrincipalId(
    value.maintenanceOwnerId,
    `${path}.maintenanceOwnerId`,
    authorityContract,
  );
  if (approverId === maintenanceOwnerId) {
    fail(path, "approverId must differ from maintenanceOwnerId");
  }
  if (
    !authorityContract.isConfiguredAtlasPublicationApprover(
      approvalAuthorityId,
      approverId,
      maintenanceOwnerId,
    )
  ) {
    fail(path, "signer is not in the fixed publication authority roster");
  }
  const approvedAt = utcTimestamp(value.approvedAt, `${path}.approvedAt`);
  if (approvedAt.slice(0, 10) > auditDate) {
    fail(`${path}.approvedAt`, `cannot be after auditDate ${auditDate}`);
  }
  return {
    ...value,
    approvalAuthorityId,
    approverId,
    maintenanceOwnerId,
    withdrawalState: enumValue(
      value.withdrawalState,
      `${path}.withdrawalState`,
      new Set(["active", "withdrawn"]),
    ),
  };
}

function parseEvidenceRef(reference, path) {
  const value = string(reference, path);
  const hashIndex = value.indexOf("#");
  if (hashIndex <= 0 || value.indexOf("#", hashIndex + 1) !== -1) {
    fail(path, "expected repoPath#JSON-pointer");
  }
  const repositoryPath = value.slice(0, hashIndex);
  const pointer = value.slice(hashIndex + 1);
  if (pointer !== "" && !pointer.startsWith("/")) {
    fail(path, "JSON pointer must be empty or start with /");
  }
  return { repositoryPath, pointer };
}

function resolveJsonPointer(document, pointer, path) {
  if (pointer === "") return document;
  let current = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/.test(rawToken))
      fail(path, "invalid JSON pointer escape");
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(token) || Number(token) >= current.length) {
        fail(path, `array pointer segment ${token} does not exist`);
      }
      current = current[Number(token)];
    } else if (
      current !== null &&
      typeof current === "object" &&
      Object.hasOwn(current, token)
    ) {
      current = current[token];
    } else {
      fail(path, `pointer segment ${token} does not exist`);
    }
  }
  return current;
}

function expectedGateRefs(fixed, source, gateName) {
  const sourceRefs = [];
  source.events.forEach((event, eventIndex) => {
    const eventBase = `${fixed.sourcePath}#/${eventIndex}`;
    if (gateName === "claimLevelEvidence") {
      sourceRefs.push(`${eventBase}/eventEvidence`);
      (event.performances ?? []).forEach((_performance, performanceIndex) => {
        sourceRefs.push(`${eventBase}/performances/${performanceIndex}`);
      });
    }
    if (gateName === "temporalVerification") {
      sourceRefs.push(`${eventBase}/publicAtlasEvidence/asOf`);
      sourceRefs.push(`${eventBase}/publicAtlasEvidence/lastVerifiedAt`);
    }
    if (gateName === "timezoneAndLifecycle") {
      sourceRefs.push(`${eventBase}/publicAtlasEvidence/timezone`);
      sourceRefs.push(`${eventBase}/publicAtlasEvidence/lifecycle`);
    }
    if (gateName === "refreshInvalidationWithdrawal") {
      sourceRefs.push(`${eventBase}/publicAtlasEvidence/refreshPolicy`);
    }
    if (gateName === "maintenanceOwner") {
      sourceRefs.push(`${eventBase}/publicAtlasEvidence/maintenanceOwnerId`);
    }
  });
  if (gateName === "sourceUseBoundary") return [`${fixed.approvalPath}#`];
  if (gateName === "claimLevelEvidence")
    return [...sourceRefs, `${fixed.songsPath}#`];
  if (gateName === "refreshInvalidationWithdrawal") {
    return [...sourceRefs, `${fixed.approvalPath}#/withdrawalState`];
  }
  if (gateName === "maintenanceOwner") {
    return [...sourceRefs, `${fixed.approvalPath}#/maintenanceOwnerId`];
  }
  return sourceRefs;
}

function sameOrderedStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function claimEvidenceIssues(source) {
  const issues = [];
  source.events.forEach((event) => {
    if (event.eventEvidence.verificationStatus === "unverified") {
      issues.push(`${event.id}/eventEvidence is unverified`);
    }
    if (event.eventEvidence.sourceUrls.length === 0) {
      issues.push(`${event.id}/eventEvidence has no HTTPS source URL`);
    }
    (event.performances ?? []).forEach((performance) => {
      if (performance.verificationStatus === "unverified") {
        issues.push(`${event.id}/${performance.id} is unverified`);
      }
      if (performance.sourceUrls.length === 0) {
        issues.push(`${event.id}/${performance.id} has no HTTPS source URL`);
      }
    });
  });
  return issues;
}

function validateGateEvidence(seedResult, fixed, documents) {
  const { seed, source, approval } = seedResult;
  const errors = [];
  if (!source) return errors;
  for (const gateName of GATE_NAMES) {
    const gate = seed.gates[gateName];
    const expected = expectedGateRefs(fixed, source, gateName);
    for (const [index, reference] of gate.evidenceRefs.entries()) {
      try {
        const parsed = parseEvidenceRef(
          reference,
          `${seed.siteId}.${gateName}.evidenceRefs[${index}]`,
        );
        const document = documents.get(parsed.repositoryPath);
        if (document === undefined)
          fail(reference, "path is not an audited JSON document");
        resolveJsonPointer(document, parsed.pointer, reference);
        if (!expected.includes(reference)) {
          fail(reference, `is not valid semantic evidence for ${gateName}`);
        }
      } catch (error) {
        errors.push(`EVIDENCE_REF:${seed.siteId}:${gateName}:${error.message}`);
      }
    }
    if (
      gate.status === "GO" &&
      !sameOrderedStrings(gate.evidenceRefs, expected)
    ) {
      errors.push(
        `EVIDENCE_SET:${seed.siteId}:${gateName}:expected ${JSON.stringify(expected)}`,
      );
    }
  }
  if (
    seed.gates.claimLevelEvidence.status === "GO" &&
    source.coverageIssues.length > 0
  ) {
    errors.push(
      `CLAIM_COVERAGE:${seed.siteId}:${source.coverageIssues.join(" | ")}`,
    );
  }
  if (seed.gates.claimLevelEvidence.status === "GO") {
    const issues = claimEvidenceIssues(source);
    if (issues.length > 0) {
      errors.push(`CLAIM_EVIDENCE:${seed.siteId}:${issues.join(" | ")}`);
    }
  }
  if (seed.decision === "GO") {
    if (!approval) {
      errors.push(`APPROVAL_MISSING:${seed.siteId}:${fixed.approvalPath}`);
    } else {
      const owners = new Set(
        source.events.map(
          (event) => event.publicAtlasEvidence?.maintenanceOwnerId,
        ),
      );
      owners.delete(undefined);
      if (owners.size !== 1 || !owners.has(approval.maintenanceOwnerId)) {
        errors.push(
          `APPROVAL_OWNER:${seed.siteId}:approval and source owner must match`,
        );
      }
      if (seed.withdrawalState !== approval.withdrawalState) {
        errors.push(
          `APPROVAL_WITHDRAWAL:${seed.siteId}:receipt ${seed.withdrawalState}, approval ${approval.withdrawalState}`,
        );
      }
      if (approval.withdrawalState !== "active") {
        errors.push(`APPROVAL_WITHDRAWN:${seed.siteId}`);
      }
    }
  }
  return errors;
}

function sameCounts(left, right) {
  return (
    left.events === right.events &&
    left.performances === right.performances &&
    left.setlistEntries === right.setlistEntries
  );
}

async function git(repositoryRoot, args, encoding = "utf8") {
  return execFileAsync("git", ["-c", "core.excludesFile=", ...args], {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function verifyGitCommit(repositoryRoot, commit) {
  const result = await git(repositoryRoot, ["cat-file", "-t", commit]);
  if (result.stdout.trim() !== "commit")
    throw new Error("object is not a commit");
}

async function gitBlob(repositoryRoot, commit, repositoryPath) {
  const result = await git(
    repositoryRoot,
    ["show", `${commit}:${repositoryPath}`],
    "buffer",
  );
  return result.stdout;
}

function receiptFileBindings(receipt) {
  return [
    ...receipt.contractFiles.map((entry) => ({ ...entry, kind: "SCHEMA" })),
    ...receipt.evidenceFiles.map((entry) => ({ ...entry, kind: "EVIDENCE" })),
    ...receipt.seeds.flatMap((seed) => [
      { path: seed.sourcePath, sha256: seed.sourceSha256, kind: "SOURCE" },
      { path: seed.songsPath, sha256: seed.songsSha256, kind: "SOURCE" },
    ]),
  ];
}

function validateBaselineSourceReceipt(value, fixed, path) {
  exactKeys(value, path, [
    "siteId",
    "sourcePath",
    "byteLength",
    "sha256",
    "eventCount",
    "eventLocalIds",
    "performanceCount",
    "performanceIds",
    "setlistEntryCount",
    "setlistOrderRanges",
  ]);
  if (value.siteId !== fixed.siteId)
    fail(`${path}.siteId`, `expected ${fixed.siteId}`);
  if (value.sourcePath !== fixed.sourcePath) {
    fail(`${path}.sourcePath`, `expected ${fixed.sourcePath}`);
  }
  integer(value.byteLength, `${path}.byteLength`, 1);
  if (!SHA256_PATTERN.test(value.sha256))
    fail(`${path}.sha256`, "invalid SHA-256");
  integer(value.eventCount, `${path}.eventCount`, 0);
  const eventLocalIds = uniqueStrings(
    value.eventLocalIds,
    `${path}.eventLocalIds`,
  );
  if (eventLocalIds.length !== value.eventCount) {
    fail(`${path}.eventLocalIds`, "length must match eventCount");
  }
  for (const [index, eventId] of eventLocalIds.entries()) {
    if (!LOCAL_ID_PATTERN.test(eventId)) {
      fail(`${path}.eventLocalIds[${index}]`, "invalid Event local id");
    }
  }
  integer(value.performanceCount, `${path}.performanceCount`, 0);
  const performanceIds = uniqueStrings(
    value.performanceIds,
    `${path}.performanceIds`,
  );
  if (performanceIds.length !== value.performanceCount) {
    fail(`${path}.performanceIds`, "length must match performanceCount");
  }
  integer(value.setlistEntryCount, `${path}.setlistEntryCount`, 0);
  const ranges = array(value.setlistOrderRanges, `${path}.setlistOrderRanges`);
  if (ranges.length !== value.performanceCount) {
    fail(`${path}.setlistOrderRanges`, "length must match performanceCount");
  }
  let observedEntries = 0;
  ranges.forEach((range, index) => {
    const rangePath = `${path}.setlistOrderRanges[${index}]`;
    exactKeys(range, rangePath, [
      "eventLocalId",
      "performanceLocalId",
      "setlistEntryCount",
      "setlistOrderRange",
    ]);
    const eventLocalId = string(
      range.eventLocalId,
      `${rangePath}.eventLocalId`,
    );
    const performanceLocalId = string(
      range.performanceLocalId,
      `${rangePath}.performanceLocalId`,
    );
    if (!eventLocalIds.includes(eventLocalId)) {
      fail(`${rangePath}.eventLocalId`, "not present in eventLocalIds");
    }
    if (!performanceIds.includes(`${eventLocalId}/${performanceLocalId}`)) {
      fail(rangePath, "not present in performanceIds");
    }
    const count = integer(
      range.setlistEntryCount,
      `${rangePath}.setlistEntryCount`,
      1,
    );
    exactKeys(range.setlistOrderRange, `${rangePath}.setlistOrderRange`, [
      "first",
      "last",
    ]);
    const first = integer(
      range.setlistOrderRange.first,
      `${rangePath}.setlistOrderRange.first`,
      1,
    );
    const last = integer(
      range.setlistOrderRange.last,
      `${rangePath}.setlistOrderRange.last`,
      first,
    );
    if (last - first + 1 !== count) {
      fail(rangePath, "order range must close setlistEntryCount");
    }
    observedEntries += count;
  });
  if (observedEntries !== value.setlistEntryCount) {
    fail(`${path}.setlistEntryCount`, "does not match performance ranges");
  }
  return value;
}

function validateC0BaselineReceipt(value) {
  exactKeys(value, "$c0Baseline", ["sourceCommit", "totals", "sources"]);
  if (!/^[0-9a-f]{40}$/.test(value.sourceCommit)) {
    fail("$c0Baseline.sourceCommit", "expected a full lowercase Git SHA");
  }
  validateCounts(value.totals, "$c0Baseline.totals");
  const sources = array(value.sources, "$c0Baseline.sources");
  if (sources.length !== FIXED_SEEDS.length) {
    fail("$c0Baseline.sources", "expected exactly three ordered sources");
  }
  const totals = { events: 0, performances: 0, setlistEntries: 0 };
  sources.forEach((source, index) => {
    validateBaselineSourceReceipt(
      source,
      FIXED_SEEDS[index],
      `$c0Baseline.sources[${index}]`,
    );
    totals.events += source.eventCount;
    totals.performances += source.performanceCount;
    totals.setlistEntries += source.setlistEntryCount;
  });
  if (!sameCounts(totals, value.totals)) {
    fail("$c0Baseline.totals", "does not match source totals");
  }
  return value;
}

function deriveHistoricalSourceReceipt(bytes, fixed) {
  const events = array(
    parseUtf8Json(bytes, fixed.sourcePath),
    fixed.sourcePath,
  );
  const eventLocalIds = [];
  const performanceIds = [];
  const setlistOrderRanges = [];
  let setlistEntryCount = 0;
  for (const [eventIndex, event] of events.entries()) {
    const eventId = string(event.id, `${fixed.sourcePath}[${eventIndex}].id`);
    if (!LOCAL_ID_PATTERN.test(eventId) || eventLocalIds.includes(eventId)) {
      fail(
        `${fixed.sourcePath}[${eventIndex}].id`,
        "invalid or duplicate Event id",
      );
    }
    eventLocalIds.push(eventId);
    for (const [performanceIndex, performance] of (
      event.performances ?? []
    ).entries()) {
      const performancePath = `${fixed.sourcePath}[${eventIndex}].performances[${performanceIndex}]`;
      const performanceId = string(performance.id, `${performancePath}.id`);
      const namespacedLocalId = `${eventId}/${performanceId}`;
      if (
        !LOCAL_ID_PATTERN.test(performanceId) ||
        performanceIds.includes(namespacedLocalId)
      ) {
        fail(`${performancePath}.id`, "invalid or duplicate Performance id");
      }
      performanceIds.push(namespacedLocalId);
      const setlist = array(performance.setlist, `${performancePath}.setlist`);
      if (setlist.length === 0)
        fail(`${performancePath}.setlist`, "cannot be empty");
      let previousOrder = 0;
      const orders = setlist.map((entry, entryIndex) => {
        const order = integer(
          entry.order,
          `${performancePath}.setlist[${entryIndex}].order`,
          1,
        );
        if (order <= previousOrder) {
          fail(
            `${performancePath}.setlist[${entryIndex}].order`,
            "must be strictly increasing",
          );
        }
        previousOrder = order;
        return order;
      });
      if (orders.at(-1) - orders[0] + 1 !== orders.length) {
        fail(
          `${performancePath}.setlist`,
          "historical setlist order range is not closed",
        );
      }
      setlistOrderRanges.push({
        eventLocalId: eventId,
        performanceLocalId: performanceId,
        setlistEntryCount: setlist.length,
        setlistOrderRange: { first: orders[0], last: orders.at(-1) },
      });
      setlistEntryCount += setlist.length;
    }
  }
  return {
    siteId: fixed.siteId,
    sourcePath: fixed.sourcePath,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    eventCount: events.length,
    eventLocalIds,
    performanceCount: performanceIds.length,
    performanceIds,
    setlistEntryCount,
    setlistOrderRanges,
  };
}

function protectedLiveSourceProjection(document, path) {
  const protectedEvents = structuredClone(array(document, path));
  protectedEvents.forEach((event, eventIndex) => {
    const eventPath = `${path}[${eventIndex}]`;
    const item = record(event, eventPath);
    delete item.publicAtlasEvidence;
    const performances = item.performances ?? [];
    array(performances, `${eventPath}.performances`).forEach(
      (performance, performanceIndex) => {
        const performancePath = `${eventPath}.performances[${performanceIndex}]`;
        const performanceItem = record(performance, performancePath);
        if (performanceItem.provenance === undefined) return;
        const provenance = record(
          performanceItem.provenance,
          `${performancePath}.provenance`,
        );
        delete provenance.excludedEntries;
        if (Object.keys(provenance).length === 0) {
          delete performanceItem.provenance;
        }
      },
    );
  });
  return protectedEvents;
}

function referencedSongIds(document, path) {
  const ids = new Set();
  array(document, path).forEach((event, eventIndex) => {
    const item = record(event, `${path}[${eventIndex}]`);
    array(
      item.performances ?? [],
      `${path}[${eventIndex}].performances`,
    ).forEach((performance, performanceIndex) => {
      const performancePath = `${path}[${eventIndex}].performances[${performanceIndex}]`;
      const performanceItem = record(performance, performancePath);
      array(performanceItem.setlist, `${performancePath}.setlist`).forEach(
        (entry, entryIndex) => {
          const entryItem = record(
            entry,
            `${performancePath}.setlist[${entryIndex}]`,
          );
          ids.add(
            string(
              entryItem.songId,
              `${performancePath}.setlist[${entryIndex}].songId`,
            ),
          );
        },
      );
    });
  });
  return ids;
}

function protectedReferencedSongs(document, referencedIds, path) {
  const found = new Set();
  const projection = [];
  array(document, path).forEach((song, index) => {
    const item = record(song, `${path}[${index}]`);
    const id = string(item.id, `${path}[${index}].id`);
    if (!referencedIds.has(id)) return;
    if (found.has(id))
      fail(`${path}[${index}].id`, "duplicate referenced song");
    found.add(id);
    projection.push(structuredClone(item));
  });
  for (const id of referencedIds) {
    if (!found.has(id)) fail(path, `referenced song ${id} is missing`);
  }
  return projection;
}

function firstProtectedDifference(left, right, path = "$") {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return path;
    if (left.length !== right.length) return `${path}.length`;
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstProtectedDifference(
        left[index],
        right[index],
        `${path}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  }
  const leftIsObject = left !== null && typeof left === "object";
  const rightIsObject = right !== null && typeof right === "object";
  if (leftIsObject || rightIsObject) {
    if (!leftIsObject || !rightIsObject) return path;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!sameOrderedStrings(leftKeys, rightKeys)) return `${path}.{keys}`;
    for (const key of leftKeys) {
      const difference = firstProtectedDifference(
        left[key],
        right[key],
        `${path}.${key}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return path;
}

function canonicalEqual(left, right) {
  return canonicalUtf8(left).equals(canonicalUtf8(right));
}

async function isAncestor(repositoryRoot, ancestor, descendant) {
  try {
    await git(repositoryRoot, [
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

async function auditHistoricalBaseline(
  repositoryRoot,
  receipt,
  headCommit,
  verifiedBytesByPath,
) {
  const errors = [];
  let baseline;
  try {
    baseline = validateC0BaselineReceipt(
      await loadC0BaselineReceipt(
        verifiedBytesByPath.get(FIXED_BASELINE_CONTRACT_PATH),
      ),
    );
  } catch (error) {
    return [`HISTORICAL_SCHEMA:${error.message}`];
  }
  if (receipt.historicalBaseline.sourceCommit !== baseline.sourceCommit) {
    errors.push(
      `HISTORICAL_RECEIPT:sourceCommit must equal C0 ${baseline.sourceCommit}`,
    );
  }
  if (!canonicalEqual(receipt.historicalBaseline.totals, baseline.totals)) {
    errors.push(
      "HISTORICAL_RECEIPT:totals must equal the C0 baseline constant",
    );
  }
  receipt.seeds.forEach((seed, index) => {
    const expected = {
      events: baseline.sources[index].eventCount,
      performances: baseline.sources[index].performanceCount,
      setlistEntries: baseline.sources[index].setlistEntryCount,
    };
    if (!canonicalEqual(seed.baselineCounts, expected)) {
      errors.push(
        `HISTORICAL_RECEIPT:${seed.siteId}:baselineCounts must equal ${JSON.stringify(expected)}`,
      );
    }
  });
  try {
    await verifyGitCommit(repositoryRoot, baseline.sourceCommit);
  } catch (error) {
    errors.push(`HISTORICAL_COMMIT:${baseline.sourceCommit}:${error.message}`);
    return errors;
  }
  for (const descendant of [receipt.sourceCommit, headCommit]) {
    try {
      if (
        !(await isAncestor(repositoryRoot, baseline.sourceCommit, descendant))
      ) {
        errors.push(
          `GIT_ANCESTRY:historical ${baseline.sourceCommit} is not an ancestor of ${descendant}`,
        );
      }
    } catch (error) {
      errors.push(
        `GIT_ANCESTRY:${baseline.sourceCommit}:${descendant}:${error.message}`,
      );
    }
  }
  for (const [index, expected] of baseline.sources.entries()) {
    const fixed = FIXED_SEEDS[index];
    let historicalSourceBytes;
    try {
      historicalSourceBytes = await gitBlob(
        repositoryRoot,
        baseline.sourceCommit,
        expected.sourcePath,
      );
      const observed = deriveHistoricalSourceReceipt(
        historicalSourceBytes,
        fixed,
      );
      if (!canonicalEqual(observed, expected)) {
        errors.push(
          `HISTORICAL_SOURCE:${expected.siteId}:constant does not match historical Git blob`,
        );
      }
    } catch (error) {
      errors.push(
        `HISTORICAL_SOURCE:${expected.siteId}:${expected.sourcePath}:${error.message}`,
      );
      continue;
    }
    try {
      const currentSourceBytes = verifiedBytesByPath.get(fixed.sourcePath);
      if (!currentSourceBytes) {
        fail(fixed.sourcePath, "verified source bytes are unavailable");
      }
      const historicalSource = parseUtf8Json(
        historicalSourceBytes,
        `${baseline.sourceCommit}:${fixed.sourcePath}`,
      );
      const currentSource = parseUtf8Json(currentSourceBytes, fixed.sourcePath);
      const sourceDifference = firstProtectedDifference(
        protectedLiveSourceProjection(
          historicalSource,
          `${baseline.sourceCommit}:${fixed.sourcePath}`,
        ),
        protectedLiveSourceProjection(currentSource, fixed.sourcePath),
      );
      if (sourceDifference) {
        errors.push(
          `HISTORICAL_FACT_DRIFT:${fixed.siteId}:live-source:${sourceDifference}`,
        );
      }

      const historicalSongIds = referencedSongIds(
        historicalSource,
        `${baseline.sourceCommit}:${fixed.sourcePath}`,
      );
      const currentSongIds = referencedSongIds(currentSource, fixed.sourcePath);
      const protectedSongIds = new Set([
        ...historicalSongIds,
        ...currentSongIds,
      ]);
      const historicalSongsBytes = await gitBlob(
        repositoryRoot,
        baseline.sourceCommit,
        fixed.songsPath,
      );
      const currentSongsBytes = verifiedBytesByPath.get(fixed.songsPath);
      if (!currentSongsBytes) {
        fail(fixed.songsPath, "verified songs bytes are unavailable");
      }
      const songDifference = firstProtectedDifference(
        protectedReferencedSongs(
          parseUtf8Json(
            historicalSongsBytes,
            `${baseline.sourceCommit}:${fixed.songsPath}`,
          ),
          protectedSongIds,
          `${baseline.sourceCommit}:${fixed.songsPath}`,
        ),
        protectedReferencedSongs(
          parseUtf8Json(currentSongsBytes, fixed.songsPath),
          protectedSongIds,
          fixed.songsPath,
        ),
      );
      if (songDifference) {
        errors.push(
          `HISTORICAL_FACT_DRIFT:${fixed.siteId}:referenced-songs:${songDifference}`,
        );
      }
    } catch (error) {
      errors.push(`HISTORICAL_FACT_DRIFT:${fixed.siteId}:${error.message}`);
    }
  }
  return errors;
}

export async function auditWorkspace({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  receiptPath = resolve(repositoryRoot, FIXED_RECEIPT_PATH),
  auditDate = new Date().toISOString().slice(0, 10),
} = {}) {
  auditDate = isoDate(auditDate, "auditDate");
  const { rootReal } = await validateExactReceiptPath(
    repositoryRoot,
    receiptPath,
  );
  const receiptBytes = await readContainedFile(
    repositoryRoot,
    rootReal,
    FIXED_RECEIPT_PATH,
  );
  const receipt = validateReceipt(
    parseUtf8Json(receiptBytes, FIXED_RECEIPT_PATH),
    repositoryRoot,
  );
  const errors = [];
  const verifiedBytesByPath = new Map();
  let headCommit;
  let sourceCommitExists = false;
  let sourceCommitIsAncestor = false;
  try {
    headCommit = (
      await git(repositoryRoot, ["rev-parse", "HEAD"])
    ).stdout.trim();
  } catch (error) {
    errors.push(`GIT_HEAD:${error.message}`);
  }
  try {
    await verifyGitCommit(repositoryRoot, receipt.sourceCommit);
    sourceCommitExists = true;
  } catch (error) {
    errors.push(`GIT_COMMIT:${receipt.sourceCommit}:${error.message}`);
  }
  if (headCommit && sourceCommitExists) {
    try {
      sourceCommitIsAncestor = await isAncestor(
        repositoryRoot,
        receipt.sourceCommit,
        headCommit,
      );
      if (!sourceCommitIsAncestor) {
        errors.push(
          `GIT_ANCESTRY:sourceCommit ${receipt.sourceCommit} is not an ancestor of HEAD ${headCommit}`,
        );
      }
    } catch (error) {
      errors.push(
        `GIT_ANCESTRY:${receipt.sourceCommit}:${headCommit}:${error.message}`,
      );
    }
  }
  const sourceCommitTrusted = Boolean(
    headCommit && sourceCommitExists && sourceCommitIsAncestor,
  );
  const bindings = receiptFileBindings(receipt);
  for (const binding of bindings) {
    let current;
    let bindingVerified = true;
    try {
      current = await readContainedFile(repositoryRoot, rootReal, binding.path);
      const currentHash = sha256(current);
      if (currentHash !== binding.sha256) {
        bindingVerified = false;
        errors.push(
          `${binding.kind}_DRIFT:${binding.path}:expected ${binding.sha256}, observed ${currentHash}`,
        );
      }
    } catch (error) {
      errors.push(`${binding.kind}_MISSING:${binding.path}:${error.message}`);
      continue;
    }
    try {
      const committed = await gitBlob(
        repositoryRoot,
        receipt.sourceCommit,
        binding.path,
      );
      if (!committed.equals(current)) {
        bindingVerified = false;
        errors.push(`GIT_BLOB_DRIFT:${receipt.sourceCommit}:${binding.path}`);
      }
      const committedHash = sha256(committed);
      if (committedHash !== binding.sha256) {
        bindingVerified = false;
        errors.push(
          `GIT_BLOB_HASH:${binding.path}:expected ${binding.sha256}, commit has ${committedHash}`,
        );
      }
    } catch (error) {
      bindingVerified = false;
      errors.push(
        `GIT_BLOB:${receipt.sourceCommit}:${binding.path}:${error.message}`,
      );
    }
    if (bindingVerified) verifiedBytesByPath.set(binding.path, current);
  }

  const documents = new Map();
  let fixedJsonInputsParsed = true;
  for (const binding of bindings) {
    if (binding.kind === "SCHEMA") continue;
    const bytes = verifiedBytesByPath.get(binding.path);
    if (!bytes) {
      fixedJsonInputsParsed = false;
      continue;
    }
    try {
      documents.set(binding.path, parseUtf8Json(bytes, binding.path));
    } catch (error) {
      fixedJsonInputsParsed = false;
      const prefix =
        binding.kind === "EVIDENCE" ? "APPROVAL_SCHEMA" : "SOURCE_SCHEMA";
      errors.push(`${prefix}:${binding.path}:${error.message}`);
    }
  }

  const allReceiptBindingsVerified = bindings.every((binding) =>
    verifiedBytesByPath.has(binding.path),
  );
  const contractExecutionReady =
    sourceCommitTrusted && allReceiptBindingsVerified && fixedJsonInputsParsed;
  if (!contractExecutionReady) {
    errors.push(
      "CONTRACT_EXECUTION_BLOCKED:source commit trust, all fixed receipt bindings, and JSON parse prerequisites are required",
    );
  }
  if (contractExecutionReady) {
    errors.push(
      ...(await auditHistoricalBaseline(
        repositoryRoot,
        receipt,
        headCommit,
        verifiedBytesByPath,
      )),
    );
  }
  let authorityContract;
  if (contractExecutionReady) {
    try {
      authorityContract = await loadPublicationAuthorityContract(
        verifiedBytesByPath.get(FIXED_AUTHORITY_CONTRACT_PATH),
      );
    } catch (error) {
      errors.push(`AUTHORITY_CONTRACT:${error.message}`);
    }
  }

  const approvals = new Map();
  for (const evidenceFile of receipt.evidenceFiles) {
    const document = documents.get(evidenceFile.path);
    if (document === undefined) continue;
    try {
      const fixed = FIXED_SEEDS.find(
        (candidate) => candidate.approvalPath === evidenceFile.path,
      );
      const seed = receipt.seeds.find(
        (candidate) => candidate.siteId === fixed.siteId,
      );
      if (!authorityContract) throw new Error("authority contract unavailable");
      approvals.set(
        fixed.siteId,
        validateApproval(
          document,
          fixed,
          seed,
          auditDate,
          evidenceFile.path,
          authorityContract,
        ),
      );
    } catch (error) {
      errors.push(`APPROVAL_SCHEMA:${evidenceFile.path}:${error.message}`);
    }
  }

  const seedResults = [];
  for (const [index, seed] of receipt.seeds.entries()) {
    const fixed = FIXED_SEEDS[index];
    const seedErrors = [];
    let songs;
    let source;
    try {
      const songsDocument = documents.get(seed.songsPath);
      if (songsDocument === undefined)
        throw new Error("songs document unavailable");
      songs = validateSongs(songsDocument, seed.songsPath);
    } catch (error) {
      seedErrors.push(`SOURCE_SCHEMA:${seed.songsPath}:${error.message}`);
    }
    try {
      const sourceDocument = documents.get(seed.sourcePath);
      if (sourceDocument === undefined)
        throw new Error("live source unavailable");
      if (!songs) throw new Error("songs validation failed");
      source = validateLiveSource(
        sourceDocument,
        seed,
        songs,
        auditDate,
        authorityContract,
      );
      if (!sameCounts(source.counts, seed.baselineCounts)) {
        seedErrors.push(
          `BASELINE_DRIFT:${seed.siteId}:expected ${JSON.stringify(seed.baselineCounts)}, observed ${JSON.stringify(source.counts)}`,
        );
      }
      if (source.coverageIssues.length > 0) {
        seedErrors.push(
          `COVERAGE_HOLD:${seed.siteId}:${source.coverageIssues.join(" | ")}`,
        );
      }
    } catch (error) {
      seedErrors.push(`SOURCE_SCHEMA:${seed.sourcePath}:${error.message}`);
    }
    const result = {
      seed,
      songs,
      source,
      approval: approvals.get(seed.siteId),
      errors: seedErrors,
      holdGaps: GATE_NAMES.flatMap((name) =>
        seed.gates[name].status === "HOLD"
          ? [`${name}: ${seed.gates[name].gap}`]
          : [],
      ),
    };
    seedErrors.push(...validateGateEvidence(result, fixed, documents));
    if (seed.decision === "HOLD") {
      seedErrors.push(
        `SEED_HOLD:${seed.siteId}:${result.holdGaps.join(" | ")}`,
      );
    }
    if (seed.withdrawalState !== "active") {
      seedErrors.push(`SEED_WITHDRAWAL:${seed.siteId}:${seed.withdrawalState}`);
    }
    errors.push(...seedErrors);
    seedResults.push(result);
  }

  const totals = seedResults.reduce(
    (sum, result) => ({
      events: sum.events + (result.source?.counts.events ?? 0),
      performances:
        sum.performances + (result.source?.counts.performances ?? 0),
      setlistEntries:
        sum.setlistEntries + (result.source?.counts.setlistEntries ?? 0),
    }),
    { events: 0, performances: 0, setlistEntries: 0 },
  );
  if (!sameCounts(totals, receipt.historicalBaseline.totals)) {
    errors.push(
      `BASELINE_DRIFT:totals:expected ${JSON.stringify(receipt.historicalBaseline.totals)}, observed ${JSON.stringify(totals)}`,
    );
  }
  return {
    ok: errors.length === 0,
    auditDate,
    receipt,
    sourceRevision: computeSourceRevision(receipt),
    seedResults,
    totals,
    errors,
    verifiedBytesByPath,
  };
}

function excludedItems(performance) {
  return (performance.provenance?.excludedEntries ?? []).map((entry) => ({
    kind: "setlist-entry",
    sourceId: Object.hasOwn(entry, "sourceOrder")
      ? `source-order:${entry.sourceOrder}`
      : `before-source-order:${entry.beforeSourceOrder}`,
    reason: `${entry.label}: ${entry.reason}`,
  }));
}

function commonEvidence(source, included, total, excluded = []) {
  return {
    verificationStatus: source.verificationStatus,
    sourceUrls: source.sourceUrls,
    coverage: { included, total },
    excluded,
    unresolved: [],
  };
}

export function artifactHash(projection) {
  const payload = { ...projection };
  delete payload.artifactHash;
  return `sha256:${sha256(canonicalUtf8(payload))}`;
}

function transpile(source, fileName) {
  return typescript.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText;
}

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

function replaceImport(source, relativeImport, dataUrl) {
  return source.replaceAll(
    JSON.stringify(relativeImport),
    JSON.stringify(dataUrl),
  );
}

function verifiedContractSource(bytes, path) {
  if (!Buffer.isBuffer(bytes)) {
    fail(path, "verified in-memory contract bytes are unavailable");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function loadC0BaselineReceipt(bytes) {
  const path = FIXED_BASELINE_CONTRACT_PATH;
  const source = verifiedContractSource(bytes, path);
  const cacheKey = sha256(Buffer.from(source, "utf8"));
  if (c0BaselineCache.has(cacheKey)) return c0BaselineCache.get(cacheKey);
  const c0Module = await import(dataModule(transpile(source, path)));
  const baseline = c0Module.ATLAS_C0_BASELINE_RECEIPT;
  c0BaselineCache.set(cacheKey, baseline);
  return baseline;
}

async function loadPublicationAuthorityContract(bytes) {
  const source = verifiedContractSource(bytes, FIXED_AUTHORITY_CONTRACT_PATH);
  const cacheKey = sha256(Buffer.from(source, "utf8"));
  if (authorityContractCache.has(cacheKey)) {
    return authorityContractCache.get(cacheKey);
  }
  const authorityContract = await import(
    dataModule(transpile(source, FIXED_AUTHORITY_CONTRACT_PATH))
  );
  for (const exportName of [
    "ATLAS_PUBLICATION_AUTHORITY_CONTRACT",
    "isAtlasAuthorityId",
    "isAtlasGovernancePrincipalId",
    "isConfiguredAtlasPublicationApprover",
    "parseAtlasPublicationAuthorityContract",
  ]) {
    if (!(exportName in authorityContract)) {
      fail(FIXED_AUTHORITY_CONTRACT_PATH, `missing export ${exportName}`);
    }
  }
  const parsed = authorityContract.parseAtlasPublicationAuthorityContract(
    authorityContract.ATLAS_PUBLICATION_AUTHORITY_CONTRACT,
  );
  if (!parsed?.ok) {
    fail(
      FIXED_AUTHORITY_CONTRACT_PATH,
      `configured authority contract is invalid: ${parsed?.reason ?? "unknown reason"}`,
    );
  }
  authorityContractCache.set(cacheKey, authorityContract);
  return authorityContract;
}

async function loadC0ProjectionParser(verifiedBytesByPath) {
  const sources = new Map();
  for (const path of FIXED_CONTRACT_PATHS.slice(0, 4)) {
    sources.set(
      path,
      verifiedContractSource(verifiedBytesByPath.get(path), path),
    );
  }
  const cacheKey = sha256(
    Buffer.concat([...sources.values()].map((source) => Buffer.from(source))),
  );
  if (c0ParserCache.has(cacheKey)) return c0ParserCache.get(cacheKey);
  const strictUrl = dataModule(
    transpile(sources.get("apps/atlas/src/contracts/strict.ts"), "strict.ts"),
  );
  const identityUrl = dataModule(
    replaceImport(
      transpile(
        sources.get("apps/atlas/src/contracts/identity.ts"),
        "identity.ts",
      ),
      "./strict.js",
      strictUrl,
    ),
  );
  let publicReferenceSource = transpile(
    sources.get("apps/atlas/src/contracts/public-reference.ts"),
    "public-reference.ts",
  );
  publicReferenceSource = replaceImport(
    publicReferenceSource,
    "./identity.js",
    identityUrl,
  );
  publicReferenceSource = replaceImport(
    publicReferenceSource,
    "./strict.js",
    strictUrl,
  );
  const publicReferenceUrl = dataModule(publicReferenceSource);
  let projectionSource = transpile(
    sources.get("apps/atlas/src/contracts/public-atlas-projection.ts"),
    "public-atlas-projection.ts",
  );
  projectionSource = replaceImport(
    projectionSource,
    "./identity.js",
    identityUrl,
  );
  projectionSource = replaceImport(
    projectionSource,
    "./public-reference.js",
    publicReferenceUrl,
  );
  projectionSource = replaceImport(projectionSource, "./strict.js", strictUrl);
  const c0Module = await import(dataModule(projectionSource));
  c0ParserCache.set(cacheKey, c0Module.parsePublicAtlasProjection);
  return c0Module.parsePublicAtlasProjection;
}

async function assertC0Projection(raw, verifiedBytesByPath, path) {
  const parse = await loadC0ProjectionParser(verifiedBytesByPath);
  const result = parse(raw);
  if (result.status !== "valid") {
    const detail =
      result.status === "invalid"
        ? `${result.issue.path}: ${result.issue.message}`
        : result.status;
    fail(path, `C0 parser rejected projection (${detail})`);
  }
  return result.value;
}

export async function buildProjection(audit) {
  if (!audit.ok)
    throw new Error("cannot build a projection from a non-GO audit");
  const groups = audit.seedResults.map(({ seed, songs, source }) => ({
    id: `${seed.siteId}:group:${seed.siteId}`,
    siteId: seed.siteId,
    displayName: seed.siteId,
    events: source.events.map((event) => {
      const dates = event.eventEvidence.dates;
      const publicEvidence = event.publicAtlasEvidence;
      const performances = (event.performances ?? []).map((performance) => {
        const excluded = excludedItems(performance);
        return {
          id: `${seed.siteId}:performance:${event.id}:${performance.id}`,
          displayName: performance.label,
          venue: { displayName: event.venue },
          date: performance.date,
          timezone: publicEvidence.timezone,
          lifecycle: publicEvidence.lifecycle,
          setlist: performance.setlist.map((entry) => ({
            order: entry.order,
            songRef: {
              entityId: `${seed.siteId}:song:${entry.songId}`,
              sourceRevision: audit.sourceRevision,
              fallback: {
                groupName: seed.siteId,
                title: songs.get(entry.songId).title,
                date: performance.date,
                venueName: event.venue,
              },
            },
          })),
          ...commonEvidence(
            performance,
            performance.setlist.length,
            performance.setlist.length + excluded.length,
            excluded,
          ),
        };
      });
      return {
        id: `${seed.siteId}:event:${event.id}`,
        displayName: event.eventName,
        venue: { displayName: event.venue },
        dates: { start: dates[0], end: dates.at(-1) },
        timezone: publicEvidence.timezone,
        lifecycle: publicEvidence.lifecycle,
        performances,
        ...commonEvidence(event.eventEvidence, 1, 1),
      };
    }),
  }));
  const groupCounts = Object.fromEntries(
    groups.map((group) => [
      group.siteId,
      {
        events: group.events.length,
        performances: group.events.reduce(
          (sum, event) => sum + event.performances.length,
          0,
        ),
        setlistEntries: group.events.reduce(
          (sum, event) =>
            sum +
            event.performances.reduce(
              (performanceSum, performance) =>
                performanceSum + performance.setlist.length,
              0,
            ),
          0,
        ),
      },
    ]),
  );
  const projection = {
    schemaVersion: 1,
    sourceCommit: audit.receipt.sourceCommit,
    sourceRevision: audit.sourceRevision,
    groupCounts,
    groups,
  };
  projection.artifactHash = artifactHash(projection);
  const bytes = Buffer.from(
    `${JSON.stringify(canonicalize(projection), null, 2)}\n`,
    "utf8",
  );
  await assertC0Projection(
    bytes.toString("utf8"),
    audit.verifiedBytesByPath,
    "generated projection",
  );
  return { projection, bytes };
}

async function readExactArtifact(repositoryRoot, artifactPath) {
  const { expected, rootReal } = await validateExactArtifactPath(
    repositoryRoot,
    artifactPath,
  );
  try {
    const targetReal = await realpath(expected);
    if (targetReal === rootReal || isOutside(rootReal, targetReal)) {
      fail("artifactPath", "artifact realpath escapes the repository");
    }
    return await readFile(targetReal);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function removeExactArtifact(repositoryRoot, artifactPath) {
  const existing = await readExactArtifact(repositoryRoot, artifactPath);
  if (existing === null) return false;
  await unlink(resolve(repositoryRoot, FIXED_ARTIFACT_PATH));
  return true;
}

async function atomicWrite(repositoryRoot, artifactPath, bytes) {
  const { expected, rootReal } = await validateExactArtifactPath(
    repositoryRoot,
    artifactPath,
  );
  await mkdir(dirname(expected), { recursive: true });
  await validateFixedArtifactChain(repositoryRoot, rootReal);
  const parentReal = await realpath(dirname(expected));
  if (parentReal === rootReal || isOutside(rootReal, parentReal)) {
    fail("artifactPath", "generated directory realpath escapes the repository");
  }
  const temporaryPath = `${expected}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await validateFixedArtifactChain(repositoryRoot, rootReal);
    await rename(temporaryPath, expected);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") throw cleanupError;
    }
    throw error;
  }
}

export async function generateProjection(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const artifactPath =
    options.artifactPath ?? resolve(repositoryRoot, FIXED_ARTIFACT_PATH);
  let audit;
  try {
    await validateExactArtifactPath(repositoryRoot, artifactPath);
  } catch (error) {
    return {
      ok: false,
      status: "HOLD",
      sourceRevision: null,
      invalidated: false,
      errors: [`ARTIFACT_PATH:${error.message}`],
    };
  }
  try {
    audit = await auditWorkspace({ ...options, repositoryRoot });
    if (!audit.ok) {
      const invalidated = await removeExactArtifact(
        repositoryRoot,
        artifactPath,
      );
      return {
        ok: false,
        status: "HOLD",
        sourceRevision: audit.sourceRevision,
        invalidated,
        errors: audit.errors,
      };
    }
    const generated = await buildProjection(audit);
    await atomicWrite(repositoryRoot, artifactPath, generated.bytes);
    return {
      ok: true,
      status: "GO",
      sourceRevision: audit.sourceRevision,
      artifactHash: generated.projection.artifactHash,
      artifactPath,
      errors: [],
    };
  } catch (error) {
    let invalidated = false;
    let invalidationError;
    try {
      invalidated = await removeExactArtifact(repositoryRoot, artifactPath);
    } catch (caught) {
      invalidationError = caught;
    }
    return {
      ok: false,
      status: "HOLD",
      sourceRevision: audit?.sourceRevision ?? null,
      invalidated,
      errors: [
        `FATAL:${error instanceof Error ? error.message : String(error)}`,
        ...(invalidationError
          ? [`INVALIDATION_FAILED:${invalidationError.message}`]
          : []),
      ],
    };
  }
}

export async function checkProjection(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const artifactPath =
    options.artifactPath ?? resolve(repositoryRoot, FIXED_ARTIFACT_PATH);
  try {
    await validateExactArtifactPath(repositoryRoot, artifactPath);
  } catch (error) {
    return {
      ok: false,
      status: "HOLD",
      sourceRevision: null,
      errors: [`ARTIFACT_PATH:${error.message}`],
    };
  }
  try {
    const audit = await auditWorkspace({ ...options, repositoryRoot });
    const actualBytes = await readExactArtifact(repositoryRoot, artifactPath);
    if (!audit.ok) {
      return {
        ok: false,
        status: "HOLD",
        sourceRevision: audit.sourceRevision,
        errors: [
          ...audit.errors,
          ...(actualBytes
            ? ["ARTIFACT_NOT_PUBLISHABLE:source receipt is not GO"]
            : []),
        ],
      };
    }
    const expected = await buildProjection(audit);
    if (actualBytes === null) {
      return {
        ok: false,
        status: "HOLD",
        sourceRevision: audit.sourceRevision,
        errors: [
          "ARTIFACT_ABSENT:generate the projection from approved sources",
        ],
      };
    }
    const errors = [];
    let parsed;
    try {
      parsed = await assertC0Projection(
        actualBytes.toString("utf8"),
        audit.verifiedBytesByPath,
        FIXED_ARTIFACT_PATH,
      );
      if (artifactHash(parsed) !== parsed.artifactHash) {
        errors.push(
          "ARTIFACT_HASH:does not match canonical payload without artifactHash",
        );
      }
    } catch (error) {
      errors.push(`ARTIFACT_INVALID:${error.message}`);
    }
    if (!actualBytes.equals(expected.bytes)) {
      errors.push(
        "ARTIFACT_DRIFT:generated bytes do not match deterministic projection",
      );
    }
    return {
      ok: errors.length === 0,
      status: errors.length === 0 ? "GO" : "HOLD",
      sourceRevision: audit.sourceRevision,
      artifactHash: parsed?.artifactHash ?? null,
      errors,
    };
  } catch (error) {
    return {
      ok: false,
      status: "HOLD",
      sourceRevision: null,
      errors: [
        `FATAL:${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}
