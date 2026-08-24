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
/**
 * Atlas-only import ceiling. U2 may use this against File.size before File.text(),
 * but the codec enforces it again for every raw string it receives.
 */
export const ATLAS_BACKUP_MAX_BYTES = 8 * 1024 * 1024;

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
  /** A caller may request a lower import ceiling, but never raise the hard cap. */
  readonly maximumBytes: number;
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
      readonly importByteLength: number;
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
      /** Lower bound only: counting stops as soon as the effective cap is exceeded. */
      readonly minimumImportByteLength: number;
      readonly importHardCapBytes: typeof ATLAS_BACKUP_MAX_BYTES;
      readonly effectiveMaximumBytes: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "corrupt";
      readonly raw: string;
      readonly importByteLength: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "future-version";
      readonly raw: string;
      readonly importByteLength: number;
      readonly version: number;
      readonly issue: ContractIssue;
    }
  | {
      readonly status: "invalid";
      readonly raw: string | null;
      readonly importByteLength: number | null;
      readonly issue: ContractIssue;
    };

export type AtlasBackupPreflightFailure = Exclude<
  AtlasBackupPreflightResult,
  { readonly status: "ready" }
>;

export interface AtlasBackupRestoreTransaction {
  readonly expectedRevision: JourneyRevisionExpectation;
  /** Capacity for the canonical Journey replacement, never the import envelope. */
  readonly availableBytes: number;
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
      readonly importByteLength: number;
      readonly replacementByteLength: number;
      readonly backup: AtlasBackupEnvelopeV1;
      readonly applyPlan: JourneyReplaceApplyPlan;
    }
  | (AtlasBackupPreflightFailure & { readonly applyPlan: null })
  | {
      readonly status: "capacity-failed";
      readonly raw: string;
      readonly replacementByteLength: number;
      readonly availableBytes: number;
      readonly issue: ContractIssue;
      readonly applyPlan: null;
    }
  | {
      readonly status: "invalid";
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

function requireExportedAtAtOrAfterJourney(
  exportedAt: string,
  journey: JourneyDocumentV1,
) {
  if (exportedAt < journey.updatedAt) {
    throw new ContractValidationError(
      "$.exportedAt",
      "exportedAt cannot precede Journey updatedAt",
    );
  }
  return exportedAt;
}

function parseAtlasBackupEnvelopeValue(value: unknown): AtlasBackupEnvelopeV1 {
  const record = expectRecord(value, "$");
  expectExactKeys(record, "$", [
    "productFamilySiteId",
    "schemaVersion",
    "exportedAt",
    "journey",
  ]);
  const journey = parseJourneyDocumentValue(record.journey);
  return {
    productFamilySiteId: expectLiteral(
      record.productFamilySiteId,
      "$.productFamilySiteId",
      [ATLAS_BACKUP_PRODUCT_FAMILY_SITE_ID],
    ),
    schemaVersion: expectLiteral(record.schemaVersion, "$.schemaVersion", [
      ATLAS_BACKUP_SCHEMA_VERSION,
    ]),
    exportedAt: requireExportedAtAtOrAfterJourney(
      expectIsoTimestamp(record.exportedAt, "$.exportedAt"),
      journey,
    ),
    journey,
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
  const journey = parseJourneyDocumentValue(record.journey);
  const exportedAt = requireExportedAtAtOrAfterJourney(
    expectIsoTimestamp(record.exportedAt, "$.exportedAt"),
    journey,
  );
  const raw = JSON.stringify({
    productFamilySiteId: ATLAS_BACKUP_PRODUCT_FAMILY_SITE_ID,
    schemaVersion: ATLAS_BACKUP_SCHEMA_VERSION,
    exportedAt,
    journey,
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
  expectExactKeys(record, "$.limits", ["maximumBytes"]);
  return {
    maximumBytes: expectInteger(record.maximumBytes, "$.limits.maximumBytes", {
      min: 0,
    }),
  };
}

interface Utf8ByteCount {
  readonly byteLength: number;
  readonly exceeded: boolean;
}

/** Counts UTF-8 bytes without allocating a same-sized Uint8Array. */
function countUtf8BytesAtMost(
  value: string,
  maximumBytes: number,
): Utf8ByteCount {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      byteLength += 4;
      index += 1;
    } else {
      // A lone surrogate serializes as U+FFFD, which is three bytes.
      byteLength += 3;
    }
    if (byteLength > maximumBytes) {
      return { byteLength, exceeded: true };
    }
  }
  return { byteLength, exceeded: false };
}

/** Uses UTF-8 bytes rather than JavaScript string length or a large buffer. */
export function utf8ByteLength(value: string): number {
  return countUtf8BytesAtMost(value, Number.MAX_SAFE_INTEGER).byteLength;
}

function oversizeImportResult(
  raw: string,
  minimumImportByteLength: number,
  effectiveMaximumBytes: number,
): Extract<AtlasBackupPreflightResult, { readonly status: "oversize" }> {
  return {
    status: "oversize",
    raw,
    minimumImportByteLength,
    importHardCapBytes: ATLAS_BACKUP_MAX_BYTES,
    effectiveMaximumBytes,
    issue: {
      path: "$.raw",
      message: "backup exceeds the effective import UTF-8 byte limit",
    },
  };
}

/**
 * Performs the non-bypassable import hard-cap gate before parsing backup JSON. It cannot
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
    if (selectedRaw.length > ATLAS_BACKUP_MAX_BYTES) {
      return oversizeImportResult(
        selectedRaw,
        selectedRaw.length,
        ATLAS_BACKUP_MAX_BYTES,
      );
    }
    const limits = parseImportLimits(record.limits);
    const effectiveMaximumBytes = Math.min(
      limits.maximumBytes,
      ATLAS_BACKUP_MAX_BYTES,
    );
    const importBytes = countUtf8BytesAtMost(
      selectedRaw,
      effectiveMaximumBytes,
    );
    if (importBytes.exceeded) {
      return oversizeImportResult(
        selectedRaw,
        importBytes.byteLength,
        effectiveMaximumBytes,
      );
    }

    const parsed = parseAtlasBackup(selectedRaw);
    if (parsed.status === "valid") {
      return {
        status: "ready",
        raw: selectedRaw,
        importByteLength: importBytes.byteLength,
        backup: parsed.value,
      };
    }
    if (parsed.status === "future-version") {
      return {
        status: "future-version",
        raw: selectedRaw,
        importByteLength: importBytes.byteLength,
        version: parsed.version,
        issue: parsed.issue,
      };
    }
    if (parsed.status === "corrupt") {
      return {
        status: "corrupt",
        raw: selectedRaw,
        importByteLength: importBytes.byteLength,
        issue: parsed.issue,
      };
    }
    return {
      status: "invalid",
      raw: selectedRaw,
      importByteLength: importBytes.byteLength,
      issue: parsed.issue,
    };
  } catch (error) {
    return {
      status: "invalid",
      raw,
      importByteLength:
        raw === null || raw.length > ATLAS_BACKUP_MAX_BYTES
          ? null
          : utf8ByteLength(raw),
      issue: issueFrom(error),
    };
  }
}

function parseRestoreTransaction(
  value: unknown,
): AtlasBackupRestoreTransaction {
  const record = expectRecord(value, "$.transaction");
  expectExactKeys(record, "$.transaction", [
    "expectedRevision",
    "availableBytes",
  ]);
  const availableBytes = expectInteger(
    record.availableBytes,
    "$.transaction.availableBytes",
    { min: 0 },
  );
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
    return { expectedRevision: { state }, availableBytes };
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
    availableBytes,
  };
}

function withNoApplyPlan<T extends AtlasBackupPreflightFailure>(
  failure: T,
): T & { readonly applyPlan: null } {
  return { ...failure, applyPlan: null };
}

function invalidDryRunFailure(raw: string | null, issue: ContractIssue) {
  return { status: "invalid" as const, raw, issue, applyPlan: null };
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
      return withNoApplyPlan(preflight);
    }

    const current =
      record.current === null
        ? null
        : parseJourneyDocumentValue(record.current);
    const now = expectIsoTimestamp(record.now, "$.now");
    if (
      now < preflight.backup.exportedAt ||
      now < preflight.backup.journey.updatedAt ||
      (current !== null && now < current.updatedAt)
    ) {
      throw new ContractValidationError(
        "$.now",
        "restore time cannot precede the backup export, current, or imported Journey timestamp",
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
      return invalidDryRunFailure(preflight.raw, {
        path: "$.transaction.expectedRevision",
        message:
          planned.status === "invalid"
            ? planned.reason
            : "restore plan rejected a validated backup input",
      });
    }
    const replacementByteLength = utf8ByteLength(JSON.stringify(replacement));
    if (replacementByteLength > transaction.availableBytes) {
      return {
        status: "capacity-failed",
        raw: preflight.raw,
        replacementByteLength,
        availableBytes: transaction.availableBytes,
        issue: {
          path: "$.transaction.availableBytes",
          message:
            "canonical Journey replacement exceeds the available storage capacity",
        },
        applyPlan: null,
      };
    }
    return {
      status: "ready",
      raw: preflight.raw,
      importByteLength: preflight.importByteLength,
      replacementByteLength,
      backup: preflight.backup,
      applyPlan: planned.applyPlan,
    };
  } catch (error) {
    return invalidDryRunFailure(inputRaw, issueFrom(error));
  }
}
