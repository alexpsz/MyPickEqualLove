import {
  parseJourneyDocumentValue,
  type JourneyDocumentV1,
} from "../contracts/journey-document.js";
import {
  ContractValidationError,
  expectExactKeys,
  expectInteger,
  expectIsoTimestamp,
  expectLiteral,
  expectRecord,
  expectString,
  issueFrom,
  type ContractIssue,
} from "../contracts/strict.js";
import {
  createRestorePlan,
  type JourneyReplaceApplyPlan,
} from "../ports/restore-plan.js";
import type { JourneyRevisionExpectation } from "../ports/journey-repository.js";

export const ATLAS_BACKUP_PRODUCT_FAMILY_SITE_ID = "atlas" as const;
export const ATLAS_BACKUP_SCHEMA_VERSION = 1 as const;

export interface AtlasBackupEnvelopeV1 {
  readonly productFamilySiteId: typeof ATLAS_BACKUP_PRODUCT_FAMILY_SITE_ID;
  readonly schemaVersion: typeof ATLAS_BACKUP_SCHEMA_VERSION;
  readonly exportedAt: string;
  readonly journey: JourneyDocumentV1;
}

export interface AtlasBackupEncodeInput {
  readonly exportedAt: string;
  readonly journey: JourneyDocumentV1;
}

export type AtlasBackupParseResult =
  | {
      readonly status: "valid";
      readonly raw: string;
      readonly value: AtlasBackupEnvelopeV1;
    }
  | {
      readonly status: "future-version";
      readonly raw: string;
      readonly version: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "corrupt";
      readonly raw: string;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "invalid";
      readonly raw: string;
      readonly issue: ContractIssue;
    };

export interface AtlasBackupImportLimits {
  readonly maximumBytes: number;
  readonly availableBytes: number;
}

export type AtlasBackupImportInput =
  | { readonly status: "cancelled" }
  | {
      readonly status: "selected";
      readonly raw: string;
      readonly limits: AtlasBackupImportLimits;
    };

export type AtlasBackupPreflightResult =
  | {
      readonly status: "ready";
      readonly raw: string;
      readonly byteLength: number;
      readonly backup: AtlasBackupEnvelopeV1;
    }
  | {
      readonly status: "cancelled";
      readonly raw: null;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "oversize";
      readonly raw: string;
      readonly byteLength: number;
      readonly maximumBytes: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "capacity-failed";
      readonly raw: string;
      readonly byteLength: number;
      readonly availableBytes: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "corrupt";
      readonly raw: string;
      readonly byteLength: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "future-version";
      readonly raw: string;
      readonly byteLength: number;
      readonly version: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "invalid";
      readonly raw: string | null;
      readonly byteLength: number | null;
      readonly issue: ContractIssue;
    };

export interface AtlasBackupRestoreTransaction {
  readonly expectedRevision: JourneyRevisionExpectation;
}

export interface AtlasBackupDryRunInput {
  readonly import: AtlasBackupImportInput;
  readonly current: JourneyDocumentV1 | null;
  readonly now: string;
  readonly transaction: AtlasBackupRestoreTransaction;
}

export type AtlasBackupDryRunResult =
  | {
      readonly status: "ready";
      readonly raw: string;
      readonly byteLength: number;
      readonly backup: AtlasBackupEnvelopeV1;
      readonly applyPlan: JourneyReplaceApplyPlan;
    }
  | {
      readonly status:
        | "cancelled"
        | "oversize"
        | "capacity-failed"
        | "corrupt"
        | "future-version"
        | "invalid";
      readonly raw: string | null;
      readonly issue: ContractIssue;
      readonly applyPlan: null;
    };

const EMPTY_ISSUE: ContractIssue = {
  path: "$.import",
  message: "backup import was cancelled",
};

function futureVersionIssue(version: number): ContractIssue {
  return {
    path: "$.schemaVersion",
    message: `unsupported future backup schema version ${version}`,
  };
}

function corruptIssue(): ContractIssue {
  return { path: "$", message: "backup is not valid JSON" };
}

function rawForDiagnostic(value: unknown): string | null {
  try {
    const record = expectRecord(value, "$");
    return typeof record.raw === "string" ? record.raw : null;
  } catch {
    return null;
  }
}

function parseAtlasBackupEnvelopeValue(value: unknown): AtlasBackupEnvelopeV1 {
  const record = expectRecord(value, "$");
  expectExactKeys(record, "$", [
    "productFamilySiteId",
    "schemaVersion",
    "exportedAt",
    "journey",
  ]);
  return {
    productFamilySiteId: expectLiteral(
      record.productFamilySiteId,
      "$.productFamilySiteId",
      [ATLAS_BACKUP_PRODUCT_FAMILY_SITE_ID],
    ),
    schemaVersion: expectLiteral(record.schemaVersion, "$.schemaVersion", [
      ATLAS_BACKUP_SCHEMA_VERSION,
    ]),
    exportedAt: expectIsoTimestamp(record.exportedAt, "$.exportedAt"),
    journey: parseJourneyDocumentValue(record.journey),
  };
}

/** Strictly parses an Atlas-only backup envelope without touching storage. */
export function parseAtlasBackup(raw: string): AtlasBackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt", raw, issue: corruptIssue() };
  }

  try {
    const versionRecord = expectRecord(parsed, "$");
    if (
      typeof versionRecord.schemaVersion === "number" &&
      Number.isInteger(versionRecord.schemaVersion) &&
      versionRecord.schemaVersion > ATLAS_BACKUP_SCHEMA_VERSION
    ) {
      return {
        status: "future-version",
        raw,
        version: versionRecord.schemaVersion,
        issue: futureVersionIssue(versionRecord.schemaVersion),
      };
    }
    return {
      status: "valid",
      raw,
      value: parseAtlasBackupEnvelopeValue(parsed),
    };
  } catch (error) {
    return { status: "invalid", raw, issue: issueFrom(error) };
  }
}

/**
 * Produces stable JSON after validating the supplied Journey with the C0
 * strict parser. The export timestamp is explicit so this stays pure.
 */
export function encodeAtlasBackup(input: AtlasBackupEncodeInput): string {
  const record = expectRecord(input, "$");
  expectExactKeys(record, "$", ["exportedAt", "journey"]);
  const raw = JSON.stringify({
    productFamilySiteId: ATLAS_BACKUP_PRODUCT_FAMILY_SITE_ID,
    schemaVersion: ATLAS_BACKUP_SCHEMA_VERSION,
    exportedAt: expectIsoTimestamp(record.exportedAt, "$.exportedAt"),
    journey: parseJourneyDocumentValue(record.journey),
  });
  const verification = parseAtlasBackup(raw);
  if (verification.status !== "valid") {
    throw new ContractValidationError(
      "$",
      "encoded backup did not pass strict verification",
    );
  }
  return raw;
}

function parseImportLimits(value: unknown): AtlasBackupImportLimits {
  const record = expectRecord(value, "$.limits");
  expectExactKeys(record, "$.limits", ["maximumBytes", "availableBytes"]);
  return {
    maximumBytes: expectInteger(record.maximumBytes, "$.limits.maximumBytes", {
      min: 0,
    }),
    availableBytes: expectInteger(
      record.availableBytes,
      "$.limits.availableBytes",
      { min: 0 },
    ),
  };
}

/** Uses UTF-8 bytes rather than JavaScript string length. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Performs the import capacity gate before parsing the backup JSON. It cannot
 * create an apply plan or write personal state.
 */
export function preflightAtlasBackupImport(
  input: unknown,
): AtlasBackupPreflightResult {
  const raw = rawForDiagnostic(input);
  try {
    const record = expectRecord(input, "$");
    const status = expectLiteral(record.status, "$.status", [
      "cancelled",
      "selected",
    ] as const);
    if (status === "cancelled") {
      expectExactKeys(record, "$", ["status"]);
      return { status, raw: null, issue: EMPTY_ISSUE };
    }

    expectExactKeys(record, "$", ["status", "raw", "limits"]);
    const selectedRaw = expectString(record.raw, "$.raw", {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
    const limits = parseImportLimits(record.limits);
    const byteLength = utf8ByteLength(selectedRaw);
    if (byteLength > limits.maximumBytes) {
      return {
        status: "oversize",
        raw: selectedRaw,
        byteLength,
        maximumBytes: limits.maximumBytes,
        issue: {
          path: "$.raw",
          message: "backup exceeds the configured UTF-8 byte limit",
        },
      };
    }
    if (byteLength > limits.availableBytes) {
      return {
        status: "capacity-failed",
        raw: selectedRaw,
        byteLength,
        availableBytes: limits.availableBytes,
        issue: {
          path: "$.raw",
          message: "backup exceeds the available UTF-8 byte capacity",
        },
      };
    }

    const parsed = parseAtlasBackup(selectedRaw);
    if (parsed.status === "valid") {
      return {
        status: "ready",
        raw: selectedRaw,
        byteLength,
        backup: parsed.value,
      };
    }
    if (parsed.status === "future-version") {
      return {
        status: "future-version",
        raw: selectedRaw,
        byteLength,
        version: parsed.version,
        issue: parsed.issue,
      };
    }
    if (parsed.status === "corrupt") {
      return {
        status: "corrupt",
        raw: selectedRaw,
        byteLength,
        issue: parsed.issue,
      };
    }
    return {
      status: "invalid",
      raw: selectedRaw,
      byteLength,
      issue: parsed.issue,
    };
  } catch (error) {
    return {
      status: "invalid",
      raw,
      byteLength: raw === null ? null : utf8ByteLength(raw),
      issue: issueFrom(error),
    };
  }
}

function parseRestoreTransaction(
  value: unknown,
): AtlasBackupRestoreTransaction {
  const record = expectRecord(value, "$.transaction");
  expectExactKeys(record, "$.transaction", ["expectedRevision"]);
  const expectedRecord = expectRecord(
    record.expectedRevision,
    "$.transaction.expectedRevision",
  );
  const state = expectLiteral(
    expectedRecord.state,
    "$.transaction.expectedRevision.state",
    ["absent", "present"] as const,
  );
  if (state === "absent") {
    expectExactKeys(expectedRecord, "$.transaction.expectedRevision", [
      "state",
    ]);
    return { expectedRevision: { state } };
  }
  expectExactKeys(expectedRecord, "$.transaction.expectedRevision", [
    "state",
    "revision",
  ]);
  return {
    expectedRevision: {
      state,
      revision: expectInteger(
        expectedRecord.revision,
        "$.transaction.expectedRevision.revision",
        { min: 0 },
      ),
    },
  };
}

type AtlasBackupDryRunFailureStatus = Exclude<
  AtlasBackupDryRunResult["status"],
  "ready"
>;

function dryRunFailure(
  status: AtlasBackupDryRunFailureStatus,
  raw: string | null,
  issue: ContractIssue,
): AtlasBackupDryRunResult {
  return { status, raw, issue, applyPlan: null };
}

/**
 * Creates a C0-compatible whole-document replacement plan. Imported revision
 * numbers are deliberately ignored: the replacement always continues the
 * explicit current transaction state.
 */
export function dryRunAtlasBackupRestore(
  input: unknown,
): AtlasBackupDryRunResult {
  let inputRaw: string | null = null;
  try {
    inputRaw = rawForDiagnostic(expectRecord(input, "$").import);
  } catch {
    inputRaw = null;
  }
  try {
    const record = expectRecord(input, "$");
    expectExactKeys(record, "$", ["import", "current", "now", "transaction"]);
    const preflight = preflightAtlasBackupImport(record.import);
    if (preflight.status !== "ready") {
      return dryRunFailure(preflight.status, preflight.raw, preflight.issue);
    }

    const current =
      record.current === null
        ? null
        : parseJourneyDocumentValue(record.current);
    const now = expectIsoTimestamp(record.now, "$.now");
    if (
      now < preflight.backup.journey.updatedAt ||
      (current !== null && now < current.updatedAt)
    ) {
      throw new ContractValidationError(
        "$.now",
        "restore time cannot precede the current or imported Journey timestamp",
      );
    }
    const transaction = parseRestoreTransaction(record.transaction);
    const actualExpectedRevision: JourneyRevisionExpectation =
      current === null
        ? { state: "absent" }
        : { state: "present", revision: current.revision };
    const replacement = parseJourneyDocumentValue({
      schemaVersion: preflight.backup.journey.schemaVersion,
      revision:
        actualExpectedRevision.state === "absent"
          ? 0
          : actualExpectedRevision.revision + 1,
      updatedAt: now,
      journeys: preflight.backup.journey.journeys,
    });
    const planned = createRestorePlan({
      status: "valid",
      raw: preflight.raw,
      expectedRevision: transaction.expectedRevision,
      current,
      replacement,
    });
    if (planned.status !== "ready") {
      return dryRunFailure("invalid", preflight.raw, {
        path: "$.transaction.expectedRevision",
        message:
          planned.status === "invalid"
            ? planned.reason
            : "restore plan rejected a validated backup input",
      });
    }
    return {
      status: "ready",
      raw: preflight.raw,
      byteLength: preflight.byteLength,
      backup: preflight.backup,
      applyPlan: planned.applyPlan,
    };
  } catch (error) {
    return dryRunFailure("invalid", inputRaw, issueFrom(error));
  }
}
