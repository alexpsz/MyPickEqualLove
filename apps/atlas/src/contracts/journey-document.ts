import {
  parsePublicReferenceValue,
  type PublicEntityReference,
} from "./public-reference.js";
import {
  ContractValidationError,
  expectArray,
  expectExactKeys,
  expectInteger,
  expectIsoDate,
  expectIsoTimestamp,
  expectLiteral,
  expectPattern,
  expectRecord,
  expectString,
  expectUniqueStrings,
  issueFrom,
  type ContractIssue,
} from "./strict.js";

export const JOURNEY_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type JourneyIntent = "interested" | "planned" | null;
export type ExperienceMode = "in-person" | "livestream" | "archive";

export interface LocalCustomEventFallback {
  readonly title: string;
  readonly date: string | null;
  readonly venueName: string | null;
}

export interface LocalCustomEventSubject {
  readonly kind: "local-custom-event";
  readonly localId: string;
  readonly fallback: LocalCustomEventFallback;
}

export interface PublicJourneySubject {
  readonly kind: "public-reference";
  readonly reference: PublicEntityReference<"event" | "performance">;
}

export type JourneySubject = LocalCustomEventSubject | PublicJourneySubject;

export interface JourneyExperienceEntry {
  readonly id: string;
  readonly mode: ExperienceMode;
  readonly occurredAt: string;
  readonly memo: string;
  readonly highlights: readonly string[];
  readonly songRefs: readonly PublicEntityReference<"song">[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JourneyRecord {
  readonly id: string;
  readonly subject: JourneySubject;
  readonly intent: JourneyIntent;
  readonly experienceEntries: readonly JourneyExperienceEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JourneyDocumentV1 {
  readonly schemaVersion: typeof JOURNEY_DOCUMENT_SCHEMA_VERSION;
  readonly revision: number;
  readonly updatedAt: string;
  readonly journeys: readonly JourneyRecord[];
}

export type JourneyDocumentReadResult =
  | { readonly status: "absent" }
  | {
      readonly status: "valid";
      readonly value: JourneyDocumentV1;
      readonly raw: string;
    }
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
    }
  | {
      readonly status: "read-failed";
      readonly raw: string | null;
      readonly error: string;
    };

const INTENTS = ["interested", "planned", null] as const;
const EXPERIENCE_MODES = ["in-person", "livestream", "archive"] as const;
const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function nullableText(value: unknown, path: string) {
  return value === null
    ? null
    : expectString(value, path, { min: 1, max: 256 });
}

function parseLocalCustomFallback(
  value: unknown,
  path: string,
): LocalCustomEventFallback {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["title", "date", "venueName"]);
  return {
    title: expectString(record.title, `${path}.title`, { max: 256 }),
    date:
      record.date === null ? null : expectIsoDate(record.date, `${path}.date`),
    venueName: nullableText(record.venueName, `${path}.venueName`),
  };
}

function parseSubject(value: unknown, path: string): JourneySubject {
  const record = expectRecord(value, path);
  const kind = expectLiteral(record.kind, `${path}.kind`, [
    "local-custom-event",
    "public-reference",
  ] as const);
  if (kind === "local-custom-event") {
    expectExactKeys(record, path, ["kind", "localId", "fallback"]);
    return {
      kind,
      localId: expectPattern(
        record.localId,
        `${path}.localId`,
        LOCAL_ID_PATTERN,
        "expected a stable lowercase local id",
      ),
      fallback: parseLocalCustomFallback(record.fallback, `${path}.fallback`),
    };
  }
  expectExactKeys(record, path, ["kind", "reference"]);
  return {
    kind,
    reference: parsePublicReferenceValue(
      record.reference,
      `${path}.reference`,
      ["event", "performance"],
    ),
  };
}

function parseEntry(value: unknown, path: string): JourneyExperienceEntry {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, [
    "id",
    "mode",
    "occurredAt",
    "memo",
    "highlights",
    "songRefs",
    "createdAt",
    "updatedAt",
  ]);
  const createdAt = expectIsoTimestamp(record.createdAt, `${path}.createdAt`);
  const updatedAt = expectIsoTimestamp(record.updatedAt, `${path}.updatedAt`);
  if (updatedAt < createdAt) {
    throw new ContractValidationError(
      `${path}.updatedAt`,
      "updatedAt cannot precede createdAt",
    );
  }
  return {
    id: expectPattern(
      record.id,
      `${path}.id`,
      LOCAL_ID_PATTERN,
      "expected a stable lowercase entry id",
    ),
    mode: expectLiteral(record.mode, `${path}.mode`, EXPERIENCE_MODES),
    occurredAt: expectIsoTimestamp(record.occurredAt, `${path}.occurredAt`),
    memo: expectString(record.memo, `${path}.memo`, { min: 0, max: 10_000 }),
    highlights: expectUniqueStrings(record.highlights, `${path}.highlights`, {
      maxItems: 100,
      maxLength: 256,
    }),
    songRefs: expectArray(record.songRefs, `${path}.songRefs`).map(
      (songRef, index) =>
        parsePublicReferenceValue(songRef, `${path}.songRefs[${index}]`, [
          "song",
        ]),
    ),
    createdAt,
    updatedAt,
  };
}

function parseJourney(value: unknown, path: string): JourneyRecord {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, [
    "id",
    "subject",
    "intent",
    "experienceEntries",
    "createdAt",
    "updatedAt",
  ]);
  const createdAt = expectIsoTimestamp(record.createdAt, `${path}.createdAt`);
  const updatedAt = expectIsoTimestamp(record.updatedAt, `${path}.updatedAt`);
  if (updatedAt < createdAt) {
    throw new ContractValidationError(
      `${path}.updatedAt`,
      "updatedAt cannot precede createdAt",
    );
  }
  const experienceEntries = expectArray(
    record.experienceEntries,
    `${path}.experienceEntries`,
  ).map((entry, index) =>
    parseEntry(entry, `${path}.experienceEntries[${index}]`),
  );
  const entryIds = experienceEntries.map((entry) => entry.id);
  if (new Set(entryIds).size !== entryIds.length) {
    throw new ContractValidationError(
      `${path}.experienceEntries`,
      "entry ids must be unique within a Journey",
    );
  }
  if (experienceEntries.some((entry) => entry.updatedAt > updatedAt)) {
    throw new ContractValidationError(
      `${path}.updatedAt`,
      "Journey updatedAt must include entry updates",
    );
  }
  return {
    id: expectPattern(
      record.id,
      `${path}.id`,
      LOCAL_ID_PATTERN,
      "expected a stable lowercase Journey id",
    ),
    subject: parseSubject(record.subject, `${path}.subject`),
    intent: expectLiteral(record.intent, `${path}.intent`, INTENTS),
    experienceEntries,
    createdAt,
    updatedAt,
  };
}

export function parseJourneyDocumentValue(value: unknown): JourneyDocumentV1 {
  const record = expectRecord(value, "$");
  expectExactKeys(record, "$", [
    "schemaVersion",
    "revision",
    "updatedAt",
    "journeys",
  ]);
  const updatedAt = expectIsoTimestamp(record.updatedAt, "$.updatedAt");
  const journeys = expectArray(record.journeys, "$.journeys").map(
    (journey, index) => parseJourney(journey, `$.journeys[${index}]`),
  );
  const journeyIds = journeys.map((journey) => journey.id);
  if (new Set(journeyIds).size !== journeyIds.length) {
    throw new ContractValidationError(
      "$.journeys",
      "Journey ids must be unique",
    );
  }
  if (journeys.some((journey) => journey.updatedAt > updatedAt)) {
    throw new ContractValidationError(
      "$.updatedAt",
      "document updatedAt must include Journey updates",
    );
  }
  return {
    schemaVersion: expectLiteral(record.schemaVersion, "$.schemaVersion", [
      JOURNEY_DOCUMENT_SCHEMA_VERSION,
    ]),
    revision: expectInteger(record.revision, "$.revision", { min: 0 }),
    updatedAt,
    journeys,
  };
}

export function parseJourneyDocument(
  raw: string | null,
): JourneyDocumentReadResult {
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
      versionRecord.schemaVersion > JOURNEY_DOCUMENT_SCHEMA_VERSION
    ) {
      return {
        status: "future-version",
        raw,
        version: versionRecord.schemaVersion,
      };
    }
    return { status: "valid", raw, value: parseJourneyDocumentValue(parsed) };
  } catch (error) {
    return { status: "invalid", raw, issue: issueFrom(error) };
  }
}

export async function readJourneyDocument(
  readRaw: () => Promise<string | null>,
  rawOnFailure: string | null = null,
): Promise<JourneyDocumentReadResult> {
  try {
    return parseJourneyDocument(await readRaw());
  } catch (error) {
    return {
      status: "read-failed",
      raw: rawOnFailure,
      error: error instanceof Error ? error.message : "Journey read failed",
    };
  }
}
