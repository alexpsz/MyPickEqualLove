import {
  PUBLIC_ATLAS_SITE_IDS,
  isPublicAtlasSiteId,
  requireNamespacedEntityId,
  type NamespacedEntityId,
  type PublicAtlasSiteId,
} from "./identity.js";
import {
  parsePublicReferenceValue,
  type PublicEntityReference,
} from "./public-reference.js";
import {
  ContractValidationError,
  expectArray,
  expectExactKeys,
  expectHttpsUrl,
  expectIanaTimezone,
  expectInteger,
  expectIsoDate,
  expectIsoTimestamp,
  expectLiteral,
  expectPattern,
  expectRecord,
  expectString,
  issueFrom,
  type ContractIssue,
} from "./strict.js";

export const PUBLIC_ATLAS_PROJECTION_SCHEMA_VERSION = 1 as const;

export type AtlasLifecycle =
  | "scheduled"
  | "postponed"
  | "cancelled"
  | "completed"
  | "unknown";
export type AtlasVerificationStatus = "verified" | "partial" | "unverified";

export interface ProjectionVenueSnapshot {
  readonly displayName: string;
}

export interface ProjectionCoverage {
  readonly included: number;
  readonly total: number;
}

export interface ProjectionExcludedItem {
  readonly kind: "event" | "performance" | "setlist-entry";
  readonly sourceId: string;
  readonly reason: string;
}

export interface ProjectionUnresolvedItem {
  readonly kind: "venue" | "song" | "source";
  readonly sourceValue: string;
  readonly reason: string;
}

export interface ProjectionSetlistEntry {
  readonly order: number;
  readonly songRef: PublicEntityReference<"song">;
}

export interface ProjectionPerformance {
  readonly id: NamespacedEntityId<"performance">;
  readonly displayName: string;
  readonly venue: ProjectionVenueSnapshot;
  readonly date: string;
  readonly startAt?: string;
  readonly timezone: string;
  readonly lifecycle: AtlasLifecycle;
  readonly setlist: readonly ProjectionSetlistEntry[];
  readonly verificationStatus: AtlasVerificationStatus;
  readonly sourceUrls: readonly string[];
  readonly coverage: ProjectionCoverage;
  readonly excluded: readonly ProjectionExcludedItem[];
  readonly unresolved: readonly ProjectionUnresolvedItem[];
}

export interface ProjectionEvent {
  readonly id: NamespacedEntityId<"event">;
  readonly displayName: string;
  readonly venue: ProjectionVenueSnapshot;
  readonly dates: {
    readonly start: string;
    readonly end: string;
  };
  readonly timezone: string;
  readonly lifecycle: AtlasLifecycle;
  readonly performances: readonly ProjectionPerformance[];
  readonly verificationStatus: AtlasVerificationStatus;
  readonly sourceUrls: readonly string[];
  readonly coverage: ProjectionCoverage;
  readonly excluded: readonly ProjectionExcludedItem[];
  readonly unresolved: readonly ProjectionUnresolvedItem[];
}

export interface ProjectionGroup {
  readonly id: NamespacedEntityId<"group">;
  readonly siteId: PublicAtlasSiteId;
  readonly displayName: string;
  readonly events: readonly ProjectionEvent[];
}

export interface ProjectionGroupCount {
  readonly events: number;
  readonly performances: number;
  readonly setlistEntries: number;
}

export type ProjectionGroupCounts = Readonly<
  Record<PublicAtlasSiteId, ProjectionGroupCount>
>;

export interface PublicAtlasProjectionV1 {
  readonly schemaVersion: typeof PUBLIC_ATLAS_PROJECTION_SCHEMA_VERSION;
  readonly sourceCommit: string;
  readonly sourceRevision: string;
  readonly groupCounts: ProjectionGroupCounts;
  readonly artifactHash: string;
  readonly groups: readonly ProjectionGroup[];
}

export type PublicAtlasProjectionParseResult =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly value: PublicAtlasProjectionV1 }
  | {
      readonly status: "future-version";
      readonly raw: string;
      readonly version: number;
    }
  | { readonly status: "corrupt"; readonly raw: string }
  | {
      readonly status: "invalid";
      readonly raw: string;
      readonly issue: ContractIssue;
    };

const LIFECYCLES = [
  "scheduled",
  "postponed",
  "cancelled",
  "completed",
  "unknown",
] as const;
const VERIFICATION_STATUSES = ["verified", "partial", "unverified"] as const;
const EXCLUDED_KINDS = ["event", "performance", "setlist-entry"] as const;
const UNRESOLVED_KINDS = ["venue", "song", "source"] as const;

function parseVenue(value: unknown, path: string): ProjectionVenueSnapshot {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["displayName"]);
  return {
    displayName: expectString(record.displayName, `${path}.displayName`, {
      max: 256,
    }),
  };
}

function parseCoverage(value: unknown, path: string): ProjectionCoverage {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["included", "total"]);
  const included = expectInteger(record.included, `${path}.included`, {
    min: 0,
  });
  const total = expectInteger(record.total, `${path}.total`, { min: 0 });
  if (included > total) {
    throw new ContractValidationError(path, "included cannot exceed total");
  }
  return { included, total };
}

function parseExcluded(value: unknown, path: string) {
  return expectArray(value, path).map((item, index): ProjectionExcludedItem => {
    const itemPath = `${path}[${index}]`;
    const record = expectRecord(item, itemPath);
    expectExactKeys(record, itemPath, ["kind", "sourceId", "reason"]);
    return {
      kind: expectLiteral(record.kind, `${itemPath}.kind`, EXCLUDED_KINDS),
      sourceId: expectString(record.sourceId, `${itemPath}.sourceId`, {
        max: 256,
      }),
      reason: expectString(record.reason, `${itemPath}.reason`, { max: 512 }),
    };
  });
}

function parseUnresolved(value: unknown, path: string) {
  return expectArray(value, path).map(
    (item, index): ProjectionUnresolvedItem => {
      const itemPath = `${path}[${index}]`;
      const record = expectRecord(item, itemPath);
      expectExactKeys(record, itemPath, ["kind", "sourceValue", "reason"]);
      return {
        kind: expectLiteral(record.kind, `${itemPath}.kind`, UNRESOLVED_KINDS),
        sourceValue: expectString(
          record.sourceValue,
          `${itemPath}.sourceValue`,
          {
            max: 512,
          },
        ),
        reason: expectString(record.reason, `${itemPath}.reason`, { max: 512 }),
      };
    },
  );
}

function parseSourceUrls(value: unknown, path: string) {
  const urls = expectArray(value, path).map((url, index) =>
    expectHttpsUrl(url, `${path}[${index}]`),
  );
  if (new Set(urls).size !== urls.length) {
    throw new ContractValidationError(
      path,
      "duplicate source URLs are not allowed",
    );
  }
  return urls;
}

function parseSetlist(
  value: unknown,
  path: string,
  siteId: PublicAtlasSiteId,
  sourceRevision: string,
) {
  let previousOrder = 0;
  return expectArray(value, path).map((item, index): ProjectionSetlistEntry => {
    const itemPath = `${path}[${index}]`;
    const record = expectRecord(item, itemPath);
    expectExactKeys(record, itemPath, ["order", "songRef"]);
    const order = expectInteger(record.order, `${itemPath}.order`, { min: 1 });
    if (order <= previousOrder) {
      throw new ContractValidationError(
        `${itemPath}.order`,
        "setlist orders must be strictly increasing",
      );
    }
    previousOrder = order;
    const songRef = parsePublicReferenceValue(
      record.songRef,
      `${itemPath}.songRef`,
      ["song"],
    );
    const parsedSong = requireNamespacedEntityId(
      songRef.entityId,
      `${itemPath}.songRef.entityId`,
      "song",
    );
    if (parsedSong.siteId !== siteId) {
      throw new ContractValidationError(
        `${itemPath}.songRef.entityId`,
        "song site must match its group",
      );
    }
    if (songRef.sourceRevision !== sourceRevision) {
      throw new ContractValidationError(
        `${itemPath}.songRef.sourceRevision`,
        "song reference revision must match projection revision",
      );
    }
    return { order, songRef };
  });
}

function parseCommonEvidence(record: Record<string, unknown>, path: string) {
  return {
    verificationStatus: expectLiteral(
      record.verificationStatus,
      `${path}.verificationStatus`,
      VERIFICATION_STATUSES,
    ),
    sourceUrls: parseSourceUrls(record.sourceUrls, `${path}.sourceUrls`),
    coverage: parseCoverage(record.coverage, `${path}.coverage`),
    excluded: parseExcluded(record.excluded, `${path}.excluded`),
    unresolved: parseUnresolved(record.unresolved, `${path}.unresolved`),
  };
}

function parsePerformance(
  value: unknown,
  path: string,
  siteId: PublicAtlasSiteId,
  eventLocalId: string,
  sourceRevision: string,
  eventStart: string,
  eventEnd: string,
  eventTimezone: string,
): ProjectionPerformance {
  const record = expectRecord(value, path);
  expectExactKeys(
    record,
    path,
    [
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
    ],
    ["startAt"],
  );
  const parsedId = requireNamespacedEntityId(
    record.id,
    `${path}.id`,
    "performance",
  );
  if (parsedId.siteId !== siteId || parsedId.eventLocalId !== eventLocalId) {
    throw new ContractValidationError(
      `${path}.id`,
      "performance namespace must match its parent event",
    );
  }
  const date = expectIsoDate(record.date, `${path}.date`);
  if (date < eventStart || date > eventEnd) {
    throw new ContractValidationError(
      `${path}.date`,
      "performance date must fall within its parent Event date range",
    );
  }
  const timezone = expectIanaTimezone(record.timezone, `${path}.timezone`);
  if (timezone !== eventTimezone) {
    throw new ContractValidationError(
      `${path}.timezone`,
      "performance timezone must match its parent Event timezone",
    );
  }
  const startAt =
    record.startAt === undefined
      ? undefined
      : expectIsoTimestamp(record.startAt, `${path}.startAt`);
  if (startAt !== undefined) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: eventTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(Date.parse(startAt));
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    if (`${values.year}-${values.month}-${values.day}` !== date) {
      throw new ContractValidationError(
        `${path}.startAt`,
        "local date in parent Event timezone must match performance date",
      );
    }
  }
  return {
    id: parsedId.id,
    displayName: expectString(record.displayName, `${path}.displayName`, {
      max: 256,
    }),
    venue: parseVenue(record.venue, `${path}.venue`),
    date,
    ...(startAt === undefined ? {} : { startAt }),
    timezone,
    lifecycle: expectLiteral(record.lifecycle, `${path}.lifecycle`, LIFECYCLES),
    setlist: parseSetlist(
      record.setlist,
      `${path}.setlist`,
      siteId,
      sourceRevision,
    ),
    ...parseCommonEvidence(record, path),
  };
}

function parseEvent(
  value: unknown,
  path: string,
  siteId: PublicAtlasSiteId,
  sourceRevision: string,
): ProjectionEvent {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, [
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
  const parsedId = requireNamespacedEntityId(record.id, `${path}.id`, "event");
  if (parsedId.siteId !== siteId) {
    throw new ContractValidationError(
      `${path}.id`,
      "event site must match its group",
    );
  }
  const datesRecord = expectRecord(record.dates, `${path}.dates`);
  expectExactKeys(datesRecord, `${path}.dates`, ["start", "end"]);
  const start = expectIsoDate(datesRecord.start, `${path}.dates.start`);
  const end = expectIsoDate(datesRecord.end, `${path}.dates.end`);
  if (end < start) {
    throw new ContractValidationError(
      `${path}.dates.end`,
      "end cannot precede start",
    );
  }
  const timezone = expectIanaTimezone(record.timezone, `${path}.timezone`);
  return {
    id: parsedId.id,
    displayName: expectString(record.displayName, `${path}.displayName`, {
      max: 256,
    }),
    venue: parseVenue(record.venue, `${path}.venue`),
    dates: { start, end },
    timezone,
    lifecycle: expectLiteral(record.lifecycle, `${path}.lifecycle`, LIFECYCLES),
    performances: expectArray(record.performances, `${path}.performances`).map(
      (performance, index) =>
        parsePerformance(
          performance,
          `${path}.performances[${index}]`,
          siteId,
          parsedId.localId,
          sourceRevision,
          start,
          end,
          timezone,
        ),
    ),
    ...parseCommonEvidence(record, path),
  };
}

function parseGroup(
  value: unknown,
  path: string,
  sourceRevision: string,
): ProjectionGroup {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["id", "siteId", "displayName", "events"]);
  const parsedId = requireNamespacedEntityId(record.id, `${path}.id`, "group");
  if (!isPublicAtlasSiteId(parsedId.siteId)) {
    throw new ContractValidationError(
      `${path}.id`,
      "group must belong to a public site",
    );
  }
  const siteId = expectLiteral(
    record.siteId,
    `${path}.siteId`,
    PUBLIC_ATLAS_SITE_IDS,
  );
  if (parsedId.siteId !== siteId) {
    throw new ContractValidationError(
      `${path}.siteId`,
      "site must match group namespace",
    );
  }
  return {
    id: parsedId.id,
    siteId,
    displayName: expectString(record.displayName, `${path}.displayName`, {
      max: 128,
    }),
    events: expectArray(record.events, `${path}.events`).map((event, index) =>
      parseEvent(event, `${path}.events[${index}]`, siteId, sourceRevision),
    ),
  };
}

function actualCount(group: ProjectionGroup): ProjectionGroupCount {
  return {
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
  };
}

function parseGroupCounts(
  value: unknown,
  path: string,
  groups: readonly ProjectionGroup[],
): ProjectionGroupCounts {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, PUBLIC_ATLAS_SITE_IDS);
  return Object.fromEntries(
    PUBLIC_ATLAS_SITE_IDS.map((siteId) => {
      const countPath = `${path}.${siteId}`;
      const countRecord = expectRecord(record[siteId], countPath);
      expectExactKeys(countRecord, countPath, [
        "events",
        "performances",
        "setlistEntries",
      ]);
      const supplied = {
        events: expectInteger(countRecord.events, `${countPath}.events`, {
          min: 0,
        }),
        performances: expectInteger(
          countRecord.performances,
          `${countPath}.performances`,
          { min: 0 },
        ),
        setlistEntries: expectInteger(
          countRecord.setlistEntries,
          `${countPath}.setlistEntries`,
          { min: 0 },
        ),
      };
      const group = groups.find((candidate) => candidate.siteId === siteId);
      if (!group) {
        throw new ContractValidationError(countPath, "missing group for count");
      }
      const actual = actualCount(group);
      if (
        supplied.events !== actual.events ||
        supplied.performances !== actual.performances ||
        supplied.setlistEntries !== actual.setlistEntries
      ) {
        throw new ContractValidationError(
          countPath,
          "count does not match group data",
        );
      }
      return [siteId, supplied];
    }),
  ) as ProjectionGroupCounts;
}

export function parsePublicAtlasProjectionValue(
  value: unknown,
): PublicAtlasProjectionV1 {
  const record = expectRecord(value, "$");
  expectExactKeys(record, "$", [
    "schemaVersion",
    "sourceCommit",
    "sourceRevision",
    "groupCounts",
    "artifactHash",
    "groups",
  ]);
  const schemaVersion = expectLiteral(record.schemaVersion, "$.schemaVersion", [
    PUBLIC_ATLAS_PROJECTION_SCHEMA_VERSION,
  ]);
  const sourceCommit = expectPattern(
    record.sourceCommit,
    "$.sourceCommit",
    /^[0-9a-f]{40}$/,
    "expected a full lowercase Git commit SHA",
  );
  const sourceRevision = expectString(
    record.sourceRevision,
    "$.sourceRevision",
    {
      max: 128,
    },
  );
  const groups = expectArray(record.groups, "$.groups").map((group, index) =>
    parseGroup(group, `$.groups[${index}]`, sourceRevision),
  );
  if (groups.length !== PUBLIC_ATLAS_SITE_IDS.length) {
    throw new ContractValidationError(
      "$.groups",
      "expected exactly three public groups",
    );
  }
  const groupSites = groups.map((group) => group.siteId);
  if (
    new Set(groupSites).size !== groupSites.length ||
    PUBLIC_ATLAS_SITE_IDS.some((siteId) => !groupSites.includes(siteId))
  ) {
    throw new ContractValidationError(
      "$.groups",
      "public group sites must be unique and complete",
    );
  }
  const structuralIds = groups.flatMap((group) => [
    group.id,
    ...group.events.flatMap((event) => [
      event.id,
      ...event.performances.map((performance) => performance.id),
    ]),
  ]);
  if (new Set(structuralIds).size !== structuralIds.length) {
    throw new ContractValidationError(
      "$.groups",
      "group, event, and performance ids must be unique",
    );
  }
  return {
    schemaVersion,
    sourceCommit,
    sourceRevision,
    groupCounts: parseGroupCounts(record.groupCounts, "$.groupCounts", groups),
    artifactHash: expectPattern(
      record.artifactHash,
      "$.artifactHash",
      /^sha256:[0-9a-f]{64}$/,
      "expected a sha256 artifact hash",
    ),
    groups,
  };
}

export function parsePublicAtlasProjection(
  raw: string | null,
): PublicAtlasProjectionParseResult {
  if (raw === null) {
    return { status: "absent" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt", raw };
  }
  try {
    const versionRecord = expectRecord(parsed, "$");
    if (
      typeof versionRecord.schemaVersion === "number" &&
      Number.isInteger(versionRecord.schemaVersion) &&
      versionRecord.schemaVersion > PUBLIC_ATLAS_PROJECTION_SCHEMA_VERSION
    ) {
      return {
        status: "future-version",
        raw,
        version: versionRecord.schemaVersion,
      };
    }
    return { status: "valid", value: parsePublicAtlasProjectionValue(parsed) };
  } catch (error) {
    return { status: "invalid", raw, issue: issueFrom(error) };
  }
}
