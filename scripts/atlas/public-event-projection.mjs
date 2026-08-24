import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..", "..");
export const DEFAULT_RECEIPT_PATH = resolve(
  SCRIPT_DIRECTORY,
  "source-go-hold-receipt.v1.json",
);
export const DEFAULT_ARTIFACT_PATH = resolve(
  DEFAULT_REPOSITORY_ROOT,
  "apps/atlas/src/generated/public-atlas-projection.v1.json",
);

const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_REVISION_ALGORITHM =
  "sha256 of canonical UTF-8 atlas-public-source-revision-v1 input";
const VERIFICATION_STATUSES = new Set(["verified", "partial", "unverified"]);
const LIFECYCLES = new Set([
  "scheduled",
  "postponed",
  "cancelled",
  "completed",
  "unknown",
]);

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

function string(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    fail(path, "expected a non-empty string");
  }
  return value;
}

function integer(value, path, { min = Number.MIN_SAFE_INTEGER } = {}) {
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

function enumValue(value, path, values) {
  if (!values.has(value))
    fail(path, `expected one of ${[...values].join(", ")}`);
  return value;
}

function uniqueStrings(value, path, parse = string) {
  const parsed = array(value, path).map((item, index) =>
    parse(item, `${path}[${index}]`),
  );
  if (new Set(parsed).size !== parsed.length)
    fail(path, "duplicates are not allowed");
  return parsed;
}

function safeRepositoryPath(root, repositoryPath, path) {
  const value = string(repositoryPath, path);
  if (isAbsolute(value) || value.includes("\\")) {
    fail(path, "expected a forward-slash repository-relative path");
  }
  const target = resolve(root, value);
  const fromRoot = relative(root, target);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..\\`)) {
    fail(path, "path escapes or names the repository root");
  }
  return target;
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
    events: integer(value.events, `${path}.events`, { min: 0 }),
    performances: integer(value.performances, `${path}.performances`, {
      min: 0,
    }),
    setlistEntries: integer(value.setlistEntries, `${path}.setlistEntries`, {
      min: 0,
    }),
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
  safeRepositoryPath(
    repositoryRoot,
    value.historicalBaseline.contractPath,
    "$receipt.historicalBaseline.contractPath",
  );
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

  const contractFiles = array(value.contractFiles, "$receipt.contractFiles");
  if (contractFiles.length === 0)
    fail("$receipt.contractFiles", "cannot be empty");
  const contractPaths = new Set();
  contractFiles.forEach((entry, index) => {
    const path = `$receipt.contractFiles[${index}]`;
    exactKeys(entry, path, ["path", "sha256"]);
    safeRepositoryPath(repositoryRoot, entry.path, `${path}.path`);
    if (contractPaths.has(entry.path)) fail(`${path}.path`, "duplicate path");
    contractPaths.add(entry.path);
    if (!SHA256_PATTERN.test(entry.sha256))
      fail(`${path}.sha256`, "invalid SHA-256");
  });
  if (!contractPaths.has(value.historicalBaseline.contractPath)) {
    fail(
      "$receipt.contractFiles",
      "must include the historical baseline contract",
    );
  }

  const seeds = array(value.seeds, "$receipt.seeds");
  if (seeds.length !== PUBLIC_SITE_IDS.length) {
    fail("$receipt.seeds", "expected exactly three ordered public seeds");
  }
  seeds.forEach((seed, index) => {
    const path = `$receipt.seeds[${index}]`;
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
    if (seed.siteId !== PUBLIC_SITE_IDS[index]) {
      fail(`${path}.siteId`, `expected ${PUBLIC_SITE_IDS[index]}`);
    }
    safeRepositoryPath(repositoryRoot, seed.sourcePath, `${path}.sourcePath`);
    safeRepositoryPath(repositoryRoot, seed.songsPath, `${path}.songsPath`);
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
  });
  return value;
}

export function computeSourceRevision(receipt) {
  const revisionInput = {
    kind: "atlas-public-source-revision-v1",
    schemaVersion: receipt.schemaVersion,
    sourceCommit: receipt.sourceCommit,
    historicalBaseline: receipt.historicalBaseline,
    contractFiles: receipt.contractFiles,
    seeds: receipt.seeds,
  };
  return `sha256:${sha256(canonicalUtf8(revisionInput))}`;
}

function validateSourceUrls(value, path) {
  return uniqueStrings(value, path, httpsUrl);
}

function validatePublicAtlasEvidence(value, path) {
  exactKeys(value, path, [
    "asOf",
    "lastVerifiedAt",
    "timezone",
    "lifecycle",
    "refreshPolicy",
    "maintenanceOwner",
  ]);
  const asOf = isoDate(value.asOf, `${path}.asOf`);
  const lastVerifiedAt = isoDate(
    value.lastVerifiedAt,
    `${path}.lastVerifiedAt`,
  );
  if (lastVerifiedAt > asOf)
    fail(`${path}.lastVerifiedAt`, "cannot be after asOf");
  const timezone = ianaTimezone(value.timezone, `${path}.timezone`);
  const lifecycle = enumValue(value.lifecycle, `${path}.lifecycle`, LIFECYCLES);
  exactKeys(value.refreshPolicy, `${path}.refreshPolicy`, [
    "refreshCadence",
    "staleAfterDays",
    "onInvalidation",
    "onWithdrawal",
  ]);
  const refreshPolicy = {
    refreshCadence: string(
      value.refreshPolicy.refreshCadence,
      `${path}.refreshPolicy.refreshCadence`,
    ),
    staleAfterDays: integer(
      value.refreshPolicy.staleAfterDays,
      `${path}.refreshPolicy.staleAfterDays`,
      { min: 1 },
    ),
    onInvalidation: value.refreshPolicy.onInvalidation,
    onWithdrawal: value.refreshPolicy.onWithdrawal,
  };
  if (refreshPolicy.onInvalidation !== "HOLD") {
    fail(`${path}.refreshPolicy.onInvalidation`, "must fail closed as HOLD");
  }
  if (refreshPolicy.onWithdrawal !== "HOLD") {
    fail(`${path}.refreshPolicy.onWithdrawal`, "must fail closed as HOLD");
  }
  return {
    asOf,
    lastVerifiedAt,
    timezone,
    lifecycle,
    refreshPolicy,
    maintenanceOwner: string(
      value.maintenanceOwner,
      `${path}.maintenanceOwner`,
    ),
  };
}

function validateSongs(value, path) {
  const songs = array(value, path);
  const byId = new Map();
  songs.forEach((song, index) => {
    const songPath = `${path}[${index}]`;
    const item = record(song, songPath);
    const id = string(item.id, `${songPath}.id`);
    if (!LOCAL_ID_PATTERN.test(id)) fail(`${songPath}.id`, "invalid local id");
    if (byId.has(id)) fail(`${songPath}.id`, "duplicate song id");
    const title = record(item.title, `${songPath}.title`);
    const titleJa = string(title.ja, `${songPath}.title.ja`);
    byId.set(id, { id, title: titleJa });
  });
  return byId;
}

function validateExcludedEntries(value, path) {
  if (value === undefined) return [];
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
    if (
      item.sourceOrder === undefined &&
      item.beforeSourceOrder === undefined
    ) {
      fail(itemPath, "expected sourceOrder or beforeSourceOrder");
    }
    if (item.sourceOrder !== undefined)
      integer(item.sourceOrder, `${itemPath}.sourceOrder`, { min: 1 });
    if (item.beforeSourceOrder !== undefined) {
      integer(item.beforeSourceOrder, `${itemPath}.beforeSourceOrder`, {
        min: 1,
      });
    }
    return item;
  });
}

function validateLiveSource(value, seed, songs) {
  const path = seed.sourcePath;
  const events = array(value, path);
  const eventIds = new Set();
  const ownerNames = new Set();
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
    if (dates.length === 0)
      fail(`${eventPath}.eventEvidence.dates`, "cannot be empty");
    if (new Set(dates).size !== dates.length)
      fail(`${eventPath}.eventEvidence.dates`, "duplicate date");
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

    if (seed.decision === "GO") {
      if (event.publicAtlasEvidence === undefined) {
        fail(`${eventPath}.publicAtlasEvidence`, "required for a GO seed");
      }
      const publicEvidence = validatePublicAtlasEvidence(
        event.publicAtlasEvidence,
        `${eventPath}.publicAtlasEvidence`,
      );
      ownerNames.add(publicEvidence.maintenanceOwner);
    } else if (event.publicAtlasEvidence !== undefined) {
      validatePublicAtlasEvidence(
        event.publicAtlasEvidence,
        `${eventPath}.publicAtlasEvidence`,
      );
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
      if (performanceDate < dates[0] || performanceDate > dates.at(-1)) {
        fail(
          `${performancePath}.date`,
          "must fall within the parent Event date range",
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
      if (performance.provenance !== undefined) {
        const provenance = record(
          performance.provenance,
          `${performancePath}.provenance`,
        );
        validateExcludedEntries(
          provenance.excludedEntries,
          `${performancePath}.provenance.excludedEntries`,
        );
      }
      let previousOrder = 0;
      array(performance.setlist, `${performancePath}.setlist`).forEach(
        (entry, entryIndex) => {
          const entryPath = `${performancePath}.setlist[${entryIndex}]`;
          allowedKeys(
            entry,
            entryPath,
            ["order", "songId"],
            ["section", "versionNote"],
          );
          const order = integer(entry.order, `${entryPath}.order`, { min: 1 });
          if (order <= previousOrder)
            fail(`${entryPath}.order`, "must be strictly increasing");
          previousOrder = order;
          const songId = string(entry.songId, `${entryPath}.songId`);
          if (!songs.has(songId))
            fail(`${entryPath}.songId`, `unknown song id ${songId}`);
        },
      );
      performanceCount += 1;
      setlistEntryCount += performance.setlist.length;
    });
  });

  if (seed.decision === "GO" && ownerNames.size !== 1) {
    fail(
      path,
      "a GO seed must name exactly one maintenance owner across its Events",
    );
  }
  return {
    events,
    counts: {
      events: events.length,
      performances: performanceCount,
      setlistEntries: setlistEntryCount,
    },
  };
}

function sameCounts(left, right) {
  return (
    left.events === right.events &&
    left.performances === right.performances &&
    left.setlistEntries === right.setlistEntries
  );
}

async function hashFile(path) {
  const bytes = await readFile(path);
  return { bytes, sha256: sha256(bytes) };
}

export async function auditWorkspace({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  receiptPath = DEFAULT_RECEIPT_PATH,
} = {}) {
  const receiptBytes = await readFile(receiptPath);
  const receipt = validateReceipt(
    parseUtf8Json(receiptBytes, relative(repositoryRoot, receiptPath)),
    repositoryRoot,
  );
  const errors = [];

  for (const [index, contractFile] of receipt.contractFiles.entries()) {
    try {
      const path = safeRepositoryPath(
        repositoryRoot,
        contractFile.path,
        `$receipt.contractFiles[${index}].path`,
      );
      const observed = await hashFile(path);
      if (observed.sha256 !== contractFile.sha256) {
        errors.push(
          `SCHEMA_DRIFT:${contractFile.path}:expected ${contractFile.sha256}, observed ${observed.sha256}`,
        );
      }
    } catch (error) {
      errors.push(`SCHEMA_DRIFT:${contractFile.path}:${error.message}`);
    }
  }

  const seedResults = [];
  for (const seed of receipt.seeds) {
    const seedErrors = [];
    let songs;
    let source;
    try {
      const songsPath = safeRepositoryPath(
        repositoryRoot,
        seed.songsPath,
        `${seed.siteId}.songsPath`,
      );
      const observed = await hashFile(songsPath);
      if (observed.sha256 !== seed.songsSha256) {
        seedErrors.push(
          `SOURCE_DRIFT:${seed.songsPath}:expected ${seed.songsSha256}, observed ${observed.sha256}`,
        );
      }
      songs = validateSongs(
        parseUtf8Json(observed.bytes, seed.songsPath),
        seed.songsPath,
      );
    } catch (error) {
      seedErrors.push(`SOURCE_SCHEMA:${seed.songsPath}:${error.message}`);
    }
    try {
      const sourcePath = safeRepositoryPath(
        repositoryRoot,
        seed.sourcePath,
        `${seed.siteId}.sourcePath`,
      );
      const observed = await hashFile(sourcePath);
      if (observed.sha256 !== seed.sourceSha256) {
        seedErrors.push(
          `SOURCE_DRIFT:${seed.sourcePath}:expected ${seed.sourceSha256}, observed ${observed.sha256}`,
        );
      }
      if (songs) {
        source = validateLiveSource(
          parseUtf8Json(observed.bytes, seed.sourcePath),
          seed,
          songs,
        );
        if (!sameCounts(source.counts, seed.baselineCounts)) {
          seedErrors.push(
            `BASELINE_DRIFT:${seed.siteId}:expected ${JSON.stringify(seed.baselineCounts)}, observed ${JSON.stringify(source.counts)}`,
          );
        }
      }
    } catch (error) {
      seedErrors.push(`SOURCE_SCHEMA:${seed.sourcePath}:${error.message}`);
    }

    const holdGaps = GATE_NAMES.flatMap((gateName) => {
      const gate = seed.gates[gateName];
      return gate.status === "HOLD" ? [`${gateName}: ${gate.gap}`] : [];
    });
    if (seed.decision === "HOLD") {
      seedErrors.push(`SEED_HOLD:${seed.siteId}:${holdGaps.join(" | ")}`);
    }
    if (seed.withdrawalState !== "active") {
      seedErrors.push(`SEED_WITHDRAWAL:${seed.siteId}:${seed.withdrawalState}`);
    }
    errors.push(...seedErrors);
    seedResults.push({ seed, songs, source, errors: seedErrors, holdGaps });
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
    receipt,
    sourceRevision: computeSourceRevision(receipt),
    seedResults,
    totals,
    errors,
  };
}

function excludedItems(performance) {
  const entries = performance.provenance?.excludedEntries ?? [];
  return entries.map((entry) => ({
    kind: "setlist-entry",
    sourceId:
      entry.sourceOrder !== undefined
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

export function buildProjection(audit) {
  if (!audit.ok)
    throw new Error("cannot build a projection from a non-GO audit");
  const groups = audit.seedResults.map(({ seed, songs, source }) => ({
    id: `${seed.siteId}:group:${seed.siteId}`,
    siteId: seed.siteId,
    displayName: seed.siteId,
    events: source.events.map((event) => {
      const groupName = seed.siteId;
      const eventDates = event.eventEvidence.dates;
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
          setlist: performance.setlist.map((entry) => {
            const song = songs.get(entry.songId);
            return {
              order: entry.order,
              songRef: {
                entityId: `${seed.siteId}:song:${entry.songId}`,
                sourceRevision: audit.sourceRevision,
                fallback: {
                  groupName,
                  title: song.title,
                  date: performance.date,
                  venueName: event.venue,
                },
              },
            };
          }),
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
        dates: { start: eventDates[0], end: eventDates.at(-1) },
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
  validateProjection(projection);
  const bytes = Buffer.from(
    `${JSON.stringify(canonicalize(projection), null, 2)}\n`,
    "utf8",
  );
  return { projection, bytes };
}

function validateCoverage(value, path) {
  exactKeys(value, path, ["included", "total"]);
  const included = integer(value.included, `${path}.included`, { min: 0 });
  const total = integer(value.total, `${path}.total`, { min: 0 });
  if (included > total) fail(path, "included cannot exceed total");
}

function validateCommonProjectionEvidence(value, path) {
  enumValue(
    value.verificationStatus,
    `${path}.verificationStatus`,
    VERIFICATION_STATUSES,
  );
  validateSourceUrls(value.sourceUrls, `${path}.sourceUrls`);
  validateCoverage(value.coverage, `${path}.coverage`);
  array(value.excluded, `${path}.excluded`).forEach((item, index) => {
    const itemPath = `${path}.excluded[${index}]`;
    exactKeys(item, itemPath, ["kind", "sourceId", "reason"]);
    enumValue(
      item.kind,
      `${itemPath}.kind`,
      new Set(["event", "performance", "setlist-entry"]),
    );
    string(item.sourceId, `${itemPath}.sourceId`);
    string(item.reason, `${itemPath}.reason`);
  });
  array(value.unresolved, `${path}.unresolved`).forEach((item, index) => {
    const itemPath = `${path}.unresolved[${index}]`;
    exactKeys(item, itemPath, ["kind", "sourceValue", "reason"]);
    enumValue(
      item.kind,
      `${itemPath}.kind`,
      new Set(["venue", "song", "source"]),
    );
    string(item.sourceValue, `${itemPath}.sourceValue`);
    string(item.reason, `${itemPath}.reason`);
  });
}

export function validateProjection(value, { verifyArtifactHash = true } = {}) {
  exactKeys(value, "$projection", [
    "schemaVersion",
    "sourceCommit",
    "sourceRevision",
    "groupCounts",
    "artifactHash",
    "groups",
  ]);
  if (value.schemaVersion !== 1)
    fail("$projection.schemaVersion", "expected 1");
  if (!/^[0-9a-f]{40}$/.test(value.sourceCommit)) {
    fail("$projection.sourceCommit", "expected a full lowercase Git SHA");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(value.sourceRevision)) {
    fail(
      "$projection.sourceRevision",
      "expected deterministic SHA-256 revision",
    );
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(value.artifactHash)) {
    fail("$projection.artifactHash", "expected SHA-256 artifact hash");
  }
  exactKeys(value.groupCounts, "$projection.groupCounts", PUBLIC_SITE_IDS);
  const groups = array(value.groups, "$projection.groups");
  if (groups.length !== PUBLIC_SITE_IDS.length)
    fail("$projection.groups", "expected three groups");
  const structuralIds = new Set();
  groups.forEach((group, groupIndex) => {
    const path = `$projection.groups[${groupIndex}]`;
    exactKeys(group, path, ["id", "siteId", "displayName", "events"]);
    const siteId = PUBLIC_SITE_IDS[groupIndex];
    if (group.siteId !== siteId) fail(`${path}.siteId`, `expected ${siteId}`);
    if (group.id !== `${siteId}:group:${siteId}`)
      fail(`${path}.id`, "invalid namespaced group id");
    string(group.displayName, `${path}.displayName`);
    if (structuralIds.has(group.id))
      fail(`${path}.id`, "duplicate structural id");
    structuralIds.add(group.id);
    let performances = 0;
    let setlistEntries = 0;
    const eventIds = new Set();
    array(group.events, `${path}.events`).forEach((event, eventIndex) => {
      const eventPath = `${path}.events[${eventIndex}]`;
      exactKeys(event, eventPath, [
        "id",
        "displayName",
        "venue",
        "dates",
        "timezone",
        "lifecycle",
        "performances",
        "verificationStatus",
        "sourceUrls",
        "coverage",
        "excluded",
        "unresolved",
      ]);
      const eventPrefix = `${siteId}:event:`;
      if (!event.id.startsWith(eventPrefix))
        fail(`${eventPath}.id`, "invalid namespaced Event id");
      const eventLocalId = event.id.slice(eventPrefix.length);
      if (!LOCAL_ID_PATTERN.test(eventLocalId))
        fail(`${eventPath}.id`, "invalid Event local id");
      if (eventIds.has(event.id) || structuralIds.has(event.id))
        fail(`${eventPath}.id`, "duplicate structural id");
      eventIds.add(event.id);
      structuralIds.add(event.id);
      string(event.displayName, `${eventPath}.displayName`);
      exactKeys(event.venue, `${eventPath}.venue`, ["displayName"]);
      string(event.venue.displayName, `${eventPath}.venue.displayName`);
      exactKeys(event.dates, `${eventPath}.dates`, ["start", "end"]);
      const start = isoDate(event.dates.start, `${eventPath}.dates.start`);
      const end = isoDate(event.dates.end, `${eventPath}.dates.end`);
      if (end < start) fail(`${eventPath}.dates.end`, "cannot precede start");
      const timezone = ianaTimezone(event.timezone, `${eventPath}.timezone`);
      enumValue(event.lifecycle, `${eventPath}.lifecycle`, LIFECYCLES);
      validateCommonProjectionEvidence(event, eventPath);
      let previousPerformanceId;
      array(event.performances, `${eventPath}.performances`).forEach(
        (performance, performanceIndex) => {
          const performancePath = `${eventPath}.performances[${performanceIndex}]`;
          exactKeys(performance, performancePath, [
            "id",
            "displayName",
            "venue",
            "date",
            "timezone",
            "lifecycle",
            "setlist",
            "verificationStatus",
            "sourceUrls",
            "coverage",
            "excluded",
            "unresolved",
          ]);
          const prefix = `${siteId}:performance:${eventLocalId}:`;
          if (!performance.id.startsWith(prefix))
            fail(`${performancePath}.id`, "invalid parent namespace");
          const localId = performance.id.slice(prefix.length);
          if (!LOCAL_ID_PATTERN.test(localId))
            fail(`${performancePath}.id`, "invalid Performance local id");
          if (structuralIds.has(performance.id))
            fail(`${performancePath}.id`, "duplicate structural id");
          structuralIds.add(performance.id);
          if (previousPerformanceId === performance.id)
            fail(`${performancePath}.id`, "duplicate Performance id");
          previousPerformanceId = performance.id;
          string(performance.displayName, `${performancePath}.displayName`);
          exactKeys(performance.venue, `${performancePath}.venue`, [
            "displayName",
          ]);
          string(
            performance.venue.displayName,
            `${performancePath}.venue.displayName`,
          );
          const date = isoDate(performance.date, `${performancePath}.date`);
          if (date < start || date > end)
            fail(`${performancePath}.date`, "outside parent Event date range");
          if (
            ianaTimezone(
              performance.timezone,
              `${performancePath}.timezone`,
            ) !== timezone
          ) {
            fail(
              `${performancePath}.timezone`,
              "must match parent Event timezone",
            );
          }
          enumValue(
            performance.lifecycle,
            `${performancePath}.lifecycle`,
            LIFECYCLES,
          );
          validateCommonProjectionEvidence(performance, performancePath);
          let previousOrder = 0;
          array(performance.setlist, `${performancePath}.setlist`).forEach(
            (entry, entryIndex) => {
              const entryPath = `${performancePath}.setlist[${entryIndex}]`;
              exactKeys(entry, entryPath, ["order", "songRef"]);
              const order = integer(entry.order, `${entryPath}.order`, {
                min: 1,
              });
              if (order <= previousOrder)
                fail(`${entryPath}.order`, "must be strictly increasing");
              previousOrder = order;
              exactKeys(entry.songRef, `${entryPath}.songRef`, [
                "entityId",
                "sourceRevision",
                "fallback",
              ]);
              const songPrefix = `${siteId}:song:`;
              if (!entry.songRef.entityId.startsWith(songPrefix)) {
                fail(
                  `${entryPath}.songRef.entityId`,
                  "song namespace must match group",
                );
              }
              if (
                !LOCAL_ID_PATTERN.test(
                  entry.songRef.entityId.slice(songPrefix.length),
                )
              ) {
                fail(`${entryPath}.songRef.entityId`, "invalid song local id");
              }
              if (entry.songRef.sourceRevision !== value.sourceRevision) {
                fail(
                  `${entryPath}.songRef.sourceRevision`,
                  "must match projection sourceRevision",
                );
              }
              exactKeys(
                entry.songRef.fallback,
                `${entryPath}.songRef.fallback`,
                ["groupName", "title", "date", "venueName"],
              );
              string(
                entry.songRef.fallback.groupName,
                `${entryPath}.songRef.fallback.groupName`,
              );
              string(
                entry.songRef.fallback.title,
                `${entryPath}.songRef.fallback.title`,
              );
              isoDate(
                entry.songRef.fallback.date,
                `${entryPath}.songRef.fallback.date`,
              );
              string(
                entry.songRef.fallback.venueName,
                `${entryPath}.songRef.fallback.venueName`,
              );
            },
          );
          performances += 1;
          setlistEntries += performance.setlist.length;
        },
      );
    });
    const observed = {
      events: group.events.length,
      performances,
      setlistEntries,
    };
    const supplied = value.groupCounts[siteId];
    validateCounts(supplied, `$projection.groupCounts.${siteId}`);
    if (!sameCounts(observed, supplied)) {
      fail(
        `$projection.groupCounts.${siteId}`,
        "does not match projected group data",
      );
    }
  });
  if (verifyArtifactHash && artifactHash(value) !== value.artifactHash) {
    fail(
      "$projection.artifactHash",
      "does not match canonical payload without artifactHash",
    );
  }
  return value;
}

async function removeArtifact(artifactPath) {
  try {
    await unlink(artifactPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicWrite(artifactPath, bytes) {
  await mkdir(dirname(artifactPath), { recursive: true });
  const temporaryPath = `${artifactPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, artifactPath);
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
  const artifactPath = options.artifactPath ?? DEFAULT_ARTIFACT_PATH;
  let audit;
  try {
    audit = await auditWorkspace(options);
    if (!audit.ok) {
      const invalidated = await removeArtifact(artifactPath);
      return {
        ok: false,
        status: "HOLD",
        sourceRevision: audit.sourceRevision,
        invalidated,
        errors: audit.errors,
      };
    }
    const generated = buildProjection(audit);
    await atomicWrite(artifactPath, generated.bytes);
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
      invalidated = await removeArtifact(artifactPath);
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
  const artifactPath = options.artifactPath ?? DEFAULT_ARTIFACT_PATH;
  try {
    const audit = await auditWorkspace(options);
    if (!audit.ok) {
      let artifactPresent = false;
      try {
        await readFile(artifactPath);
        artifactPresent = true;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      return {
        ok: false,
        status: "HOLD",
        sourceRevision: audit.sourceRevision,
        errors: [
          ...audit.errors,
          ...(artifactPresent
            ? ["ARTIFACT_NOT_PUBLISHABLE:source receipt is not GO"]
            : []),
        ],
      };
    }
    const expected = buildProjection(audit);
    let actualBytes;
    try {
      actualBytes = await readFile(artifactPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          ok: false,
          status: "HOLD",
          sourceRevision: audit.sourceRevision,
          errors: [
            "ARTIFACT_ABSENT:generate the projection from the approved sources",
          ],
        };
      }
      throw error;
    }
    const errors = [];
    let parsed;
    try {
      parsed = parseUtf8Json(
        actualBytes,
        relative(
          options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
          artifactPath,
        ),
      );
      validateProjection(parsed);
    } catch (error) {
      errors.push(`ARTIFACT_INVALID:${error.message}`);
    }
    if (!actualBytes.equals(expected.bytes)) {
      errors.push(
        "ARTIFACT_DRIFT:generated bytes do not match the deterministic projection",
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
