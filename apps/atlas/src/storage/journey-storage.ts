import {
  parseJourneyDocument,
  type JourneyDocumentReadResult,
  type JourneyDocumentV1,
} from "../contracts/journey-document.js";
import {
  ATLAS_BACKUP_MAX_BYTES,
  utf8ByteLength,
} from "../backup/backup-codec.js";
import {
  createOpaqueRecoverySummary,
  createRestoreSummary,
  type JourneyRecoveryApplyPlan,
  type JourneyReplaceApplyPlan,
  type JourneyRestoreApplyPlan,
  type OpaqueRecoverySummary,
  type RestoreEntitySummary,
  type RestoreSummary,
} from "../ports/restore-plan.js";
import {
  isJourneyStorageExpectation,
  validateRecoverJourneyInput,
  validateReplaceJourneyInput,
  type DeleteAllJourneysInput,
  type JourneyDeleteMutationResult,
  type JourneyMutationConflict,
  type JourneyMutationFailure,
  type JourneyRepository,
  type JourneyRollbackResult,
  type JourneyStorageExpectation,
  type JourneyWriteMutationResult,
  type ValidatedCompareAndWriteJourneyInput,
  type ValidatedReplaceJourneyInput,
} from "../ports/journey-repository.js";

export const ATLAS_JOURNEY_STORAGE_KEY_V1 =
  "atlas:journey-document:v1" as const;

export interface JourneyStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface JourneyStorageEventLike {
  readonly key: string | null;
  readonly storageArea: JourneyStorageLike | null;
}

export type JourneyStorageEventResult =
  | {
      readonly status: "ignored";
      readonly reason: "different-storage-area" | "different-key";
    }
  | {
      readonly status: "reread";
      readonly reason: "journey-key" | "storage-cleared";
      readonly read: JourneyDocumentReadResult;
    };

export type JourneyReplacePlanApplyResult =
  | JourneyWriteMutationResult
  | {
      readonly status: "invalid-plan";
      readonly reason:
        | "invalid-shape"
        | "invalid-expected-revision"
        | "invalid-next-revision"
        | "non-consecutive-revision"
        | "invalid-document"
        | "measurement-failed"
        | "replacement-exceeds-authoritative-limit";
      readonly expectedNextRevision: number | null;
    };

export interface JourneyReplaceEligibilityInput {
  readonly plan: JourneyRestoreApplyPlan;
}

export type JourneyReplaceEligibilityResult =
  | {
      readonly status: "eligible";
      readonly storageCapacity: "unknown";
      readonly replacementByteLength: number;
      readonly requiredStorageUnits: number;
    }
  | {
      readonly status: "ineligible";
      readonly storageCapacity: "unknown";
      readonly reason: "replacement-exceeds-authoritative-limit";
      readonly replacementByteLength: number | null;
      readonly requiredStorageUnits: number;
      readonly error: string;
    }
  | {
      readonly status: "invalid";
      readonly storageCapacity: "unknown";
      readonly stage: "input" | "plan";
      readonly replacementByteLength: null;
      readonly requiredStorageUnits: null;
      readonly error: string;
    }
  | {
      readonly status: "measurement-failed";
      readonly storageCapacity: "unknown";
      readonly replacementByteLength: null;
      readonly requiredStorageUnits: null;
      readonly error: string;
    };

type StorageProvider = () => JourneyStorageLike;

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.name && error.name !== "Error"
      ? `${error.name}: ${error.message}`
      : error.message;
  }
  return String(error);
}

function invalidEligibility(
  stage: "input" | "plan",
  error: string,
): JourneyReplaceEligibilityResult {
  return {
    status: "invalid",
    storageCapacity: "unknown",
    stage,
    replacementByteLength: null,
    requiredStorageUnits: null,
    error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actualKeys.length === expected.length &&
    actualKeys.every((key, index) => key === expected[index])
  );
}

function isRestoreEntitySummary(value: unknown): value is RestoreEntitySummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "before",
      "after",
      "added",
      "updated",
      "deleted",
      "unchanged",
    ])
  ) {
    return false;
  }
  const counts = [
    value.before,
    value.after,
    value.added,
    value.updated,
    value.deleted,
    value.unchanged,
  ];
  if (
    !counts.every(
      (count) =>
        typeof count === "number" && Number.isInteger(count) && count >= 0,
    )
  ) {
    return false;
  }
  const summary = value as unknown as RestoreEntitySummary;
  return (
    summary.before === summary.updated + summary.deleted + summary.unchanged &&
    summary.after === summary.added + summary.updated + summary.unchanged
  );
}

function isRestoreSummary(value: unknown): value is RestoreSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["journeys", "experienceEntries"]) &&
    isRestoreEntitySummary(value.journeys) &&
    isRestoreEntitySummary(value.experienceEntries)
  );
}

function isOpaqueRecoverySummary(
  value: unknown,
): value is OpaqueRecoverySummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["current", "replacement"]) ||
    !isRecord(value.current) ||
    !isRecord(value.replacement) ||
    !hasExactKeys(value.current, ["status", "countsAvailable"]) ||
    !hasExactKeys(value.replacement, ["journeys", "experienceEntries"])
  ) {
    return false;
  }
  return (
    ["corrupt", "future-version", "invalid"].includes(
      value.current.status as string,
    ) &&
    value.current.countsAvailable === false &&
    [value.replacement.journeys, value.replacement.experienceEntries].every(
      (count) =>
        typeof count === "number" && Number.isInteger(count) && count >= 0,
    )
  );
}

type ReplacePlanValidationResult =
  | { readonly ok: true; readonly plan: JourneyRestoreApplyPlan }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-shape"
        | "invalid-expected-revision"
        | "invalid-next-revision"
        | "non-consecutive-revision";
      readonly expectedNextRevision: number | null;
    };

function validateReplacePlanShape(value: unknown): ReplacePlanValidationResult {
  if (isRecord(value) && value.kind === "recover-journey-document-from-raw") {
    if (
      !hasExactKeys(value, ["kind", "expectation", "replacement", "summary"]) ||
      !isRecord(value.replacement) ||
      !isOpaqueRecoverySummary(value.summary)
    ) {
      return {
        ok: false,
        reason: "invalid-shape",
        expectedNextRevision: null,
      };
    }
    const plan = value as unknown as JourneyRecoveryApplyPlan;
    const validated = validateRecoverJourneyInput({
      expectedRaw: plan.expectation,
      replacement: plan.replacement,
    });
    if (!validated.ok) {
      return {
        ok: false,
        reason: validated.reason,
        expectedNextRevision: validated.expectedNextRevision,
      };
    }
    if (
      parseJourneyDocument(plan.expectation.raw).status !==
      plan.expectation.status
    ) {
      return {
        ok: false,
        reason: "invalid-expected-revision",
        expectedNextRevision: null,
      };
    }
    return { ok: true, plan };
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "kind",
      "expectedRevision",
      "replacement",
      "summary",
    ]) ||
    value.kind !== "replace-journey-document" ||
    !isRecord(value.replacement) ||
    !isRestoreSummary(value.summary)
  ) {
    return {
      ok: false,
      reason: "invalid-shape",
      expectedNextRevision: null,
    };
  }
  const plan = value as unknown as JourneyReplaceApplyPlan;
  const validated = validateReplaceJourneyInput({
    expectedRevision: plan.expectedRevision,
    replacement: plan.replacement,
  });
  return validated.ok
    ? { ok: true, plan }
    : {
        ok: false,
        reason: validated.reason,
        expectedNextRevision: validated.expectedNextRevision,
      };
}

function runtimeInputForPlan(plan: JourneyRestoreApplyPlan) {
  return plan.kind === "replace-journey-document"
    ? {
        expectedRevision: plan.expectedRevision,
        replacement: plan.replacement,
      }
    : { expectedRaw: plan.expectation, replacement: plan.replacement };
}

type CanonicalReplacementMeasurement =
  | {
      readonly fits: true;
      readonly replacementByteLength: number;
      readonly requiredStorageUnits: number;
    }
  | {
      readonly fits: false;
      readonly replacementByteLength: number | null;
      readonly requiredStorageUnits: number;
    };

function measureCanonicalReplacement(
  raw: string,
): CanonicalReplacementMeasurement {
  if (raw.length > ATLAS_BACKUP_MAX_BYTES) {
    return {
      fits: false,
      replacementByteLength: null,
      requiredStorageUnits: raw.length,
    };
  }
  const replacementByteLength = utf8ByteLength(raw);
  const requiredStorageUnits = Math.max(raw.length, replacementByteLength);
  return requiredStorageUnits <= ATLAS_BACKUP_MAX_BYTES
    ? { fits: true, replacementByteLength, requiredStorageUnits }
    : { fits: false, replacementByteLength, requiredStorageUnits };
}

function rawFromRead(result: JourneyDocumentReadResult): string | null {
  return result.status === "absent" ? null : result.raw;
}

function actualMatchesExpectation(
  actual: JourneyDocumentReadResult,
  expected: JourneyStorageExpectation,
) {
  switch (expected.state) {
    case "absent":
      return actual.status === "absent";
    case "present":
      return (
        actual.status === "valid" && actual.value.revision === expected.revision
      );
    case "unreadable":
      return actual.status === expected.status && actual.raw === expected.raw;
  }
}

function isRuntimeJourneyStorageExpectation(
  value: unknown,
): value is JourneyStorageExpectation {
  if (!isJourneyStorageExpectation(value)) return false;
  return (
    value.state !== "unreadable" ||
    parseJourneyDocument(value.raw).status === value.status
  );
}

function snapshotJourneyStorageExpectation(
  expectation: JourneyStorageExpectation,
): JourneyStorageExpectation {
  switch (expectation.state) {
    case "absent":
      return { state: "absent" };
    case "present":
      return { state: "present", revision: expectation.revision };
    case "unreadable":
      return {
        state: "unreadable",
        status: expectation.status,
        raw: expectation.raw,
      };
  }
}

function canonicalDocumentJson(value: JourneyDocumentV1) {
  return JSON.stringify(value);
}

function prepareDocument(value: JourneyDocumentV1) {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch (error) {
    throw new Error(`Journey serialization failed: ${describeError(error)}`);
  }
  const parsed = parseJourneyDocument(raw);
  if (parsed.status !== "valid") {
    throw new Error(
      `Validated Journey input failed strict parsing: ${parsed.status}`,
    );
  }
  return { raw, value: parsed.value };
}

type RuntimeReplaceValidationFailureReason =
  | "invalid-shape"
  | "invalid-expected-revision"
  | "invalid-next-revision"
  | "non-consecutive-revision"
  | "invalid-document"
  | "measurement-failed"
  | "replacement-exceeds-authoritative-limit";

type RuntimeReplaceValidationResult =
  | {
      readonly ok: true;
      readonly expectedRevision: JourneyStorageExpectation;
      readonly replacement: JourneyDocumentV1;
      readonly measurement: Extract<
        CanonicalReplacementMeasurement,
        { readonly fits: true }
      >;
    }
  | {
      readonly ok: false;
      readonly reason: RuntimeReplaceValidationFailureReason;
      readonly expectedNextRevision: number | null;
      readonly error: string;
      readonly measurement: CanonicalReplacementMeasurement | null;
    };

function validateRuntimeReplaceInput(
  value: unknown,
): RuntimeReplaceValidationResult {
  const isRevisionReplace =
    isRecord(value) && hasExactKeys(value, ["expectedRevision", "replacement"]);
  const isOpaqueRecovery =
    isRecord(value) && hasExactKeys(value, ["expectedRaw", "replacement"]);
  if (
    !isRecord(value) ||
    (!isRevisionReplace && !isOpaqueRecovery) ||
    !isRecord(value.replacement)
  ) {
    return {
      ok: false,
      reason: "invalid-shape",
      expectedNextRevision: null,
      error:
        "Replacement input must contain one exact expectation and Journey replacement",
      measurement: null,
    };
  }

  const revision = isOpaqueRecovery
    ? validateRecoverJourneyInput({
        expectedRaw:
          value.expectedRaw as JourneyRecoveryApplyPlan["expectation"],
        replacement: value.replacement as unknown as JourneyDocumentV1,
      })
    : validateReplaceJourneyInput({
        expectedRevision:
          value.expectedRevision as JourneyReplaceApplyPlan["expectedRevision"],
        replacement: value.replacement as unknown as JourneyDocumentV1,
      });
  if (!revision.ok) {
    return {
      ok: false,
      reason: revision.reason,
      expectedNextRevision: revision.expectedNextRevision,
      error: `Journey revision transition failed: ${revision.reason}`,
      measurement: null,
    };
  }

  let prepared: ReturnType<typeof prepareDocument>;
  try {
    prepared = prepareDocument(
      value.replacement as unknown as JourneyDocumentV1,
    );
  } catch (error) {
    const message = describeError(error);
    const measurementFailed = message.startsWith(
      "Journey serialization failed:",
    );
    return {
      ok: false,
      reason: measurementFailed ? "measurement-failed" : "invalid-document",
      expectedNextRevision: null,
      error: message,
      measurement: null,
    };
  }

  const measurement = measureCanonicalReplacement(prepared.raw);
  if (!measurement.fits) {
    return {
      ok: false,
      reason: "replacement-exceeds-authoritative-limit",
      expectedNextRevision: null,
      error:
        "Canonical Journey replacement exceeds the authoritative backup/storage limit",
      measurement,
    };
  }
  return {
    ok: true,
    expectedRevision:
      "expectedRaw" in revision.value
        ? revision.value.expectedRaw
        : revision.value.expectedRevision,
    replacement: prepared.value,
    measurement,
  };
}

function copyRestoreSummary(
  summary: RestoreSummary | OpaqueRecoverySummary,
): RestoreSummary | OpaqueRecoverySummary {
  return "current" in summary
    ? {
        current: { ...summary.current },
        replacement: { ...summary.replacement },
      }
    : {
        journeys: { ...summary.journeys },
        experienceEntries: { ...summary.experienceEntries },
      };
}

function opaqueRecoverySummaryMatches(
  plan: JourneyRestoreApplyPlan,
  replacement: JourneyDocumentV1,
) {
  if (plan.kind !== "recover-journey-document-from-raw") return true;
  const canonical = createOpaqueRecoverySummary(
    plan.expectation.status,
    replacement,
  );
  return JSON.stringify(canonical) === JSON.stringify(plan.summary);
}

function readbackMatches(
  readback: JourneyDocumentReadResult,
  expected: JourneyDocumentV1,
): readback is Extract<
  JourneyDocumentReadResult,
  { readonly status: "valid" }
> {
  return (
    readback.status === "valid" &&
    readback.value.revision === expected.revision &&
    canonicalDocumentJson(readback.value) === canonicalDocumentJson(expected)
  );
}

function conflict(
  expectedRevision: JourneyStorageExpectation,
  actual: JourneyDocumentReadResult,
): JourneyMutationConflict {
  return {
    status: "conflict",
    expectedRevision,
    actual,
    rollback: { status: "not-required" },
  };
}

function readFailure(
  actual: Extract<
    JourneyDocumentReadResult,
    { readonly status: "read-failed" }
  >,
): JourneyMutationFailure {
  return {
    status: "failure",
    stage: "read-before-write",
    rawBefore: actual.raw,
    error: actual.error,
    rollback: { status: "not-required" },
  };
}

export class LocalStorageJourneyRepository implements JourneyRepository {
  readonly #storageProvider: StorageProvider;
  #lastObservedRaw: string | null = null;

  constructor(storage: JourneyStorageLike | StorageProvider) {
    this.#storageProvider =
      typeof storage === "function" ? storage : () => storage;
  }

  async read(): Promise<JourneyDocumentReadResult> {
    try {
      const raw = this.#storageProvider().getItem(ATLAS_JOURNEY_STORAGE_KEY_V1);
      this.#lastObservedRaw = raw;
      return parseJourneyDocument(raw);
    } catch (error) {
      return {
        status: "read-failed",
        raw: this.#lastObservedRaw,
        error: describeError(error),
      };
    }
  }

  async compareAndWrite(
    input: ValidatedCompareAndWriteJourneyInput,
  ): Promise<JourneyWriteMutationResult> {
    return this.#writeDocument(input.expectedRevision, input.next);
  }

  async replace(
    input: ValidatedReplaceJourneyInput,
  ): Promise<JourneyWriteMutationResult> {
    const validated = validateRuntimeReplaceInput(input);
    if (!validated.ok) {
      return {
        status: "failure",
        stage: "write",
        rawBefore: null,
        error: validated.error,
        rollback: { status: "not-required" },
      };
    }
    return this.#writeDocument(
      validated.expectedRevision,
      validated.replacement,
      { enforceAuthoritativeReplacementLimit: true },
    );
  }

  async applyReplacePlan(
    plan: JourneyRestoreApplyPlan,
  ): Promise<JourneyReplacePlanApplyResult> {
    const validated = validateReplacePlanShape(plan);
    if (!validated.ok) {
      return {
        status: "invalid-plan",
        reason: validated.reason,
        expectedNextRevision: validated.expectedNextRevision,
      };
    }
    const replacement = validateRuntimeReplaceInput(
      runtimeInputForPlan(validated.plan),
    );
    if (!replacement.ok) {
      return {
        status: "invalid-plan",
        reason: replacement.reason,
        expectedNextRevision: replacement.expectedNextRevision,
      };
    }
    if (
      !opaqueRecoverySummaryMatches(validated.plan, replacement.replacement)
    ) {
      return {
        status: "invalid-plan",
        reason: "invalid-shape",
        expectedNextRevision: null,
      };
    }
    return this.#writeDocument(
      replacement.expectedRevision,
      replacement.replacement,
      {
        enforceAuthoritativeReplacementLimit: true,
        expectedRestoreSummary: copyRestoreSummary(validated.plan.summary),
      },
    );
  }

  async preflightReplaceEligibility(
    input: JourneyReplaceEligibilityInput,
  ): Promise<JourneyReplaceEligibilityResult> {
    if (!isRecord(input) || !hasExactKeys(input, ["plan"])) {
      return invalidEligibility(
        "input",
        "replacement eligibility input must contain only plan",
      );
    }
    const validated = validateReplacePlanShape(input.plan);
    if (!validated.ok) {
      return invalidEligibility(
        "plan",
        `replacement eligibility plan is invalid: ${validated.reason}`,
      );
    }
    const replacement = validateRuntimeReplaceInput(
      runtimeInputForPlan(validated.plan),
    );
    if (!replacement.ok) {
      if (replacement.reason === "measurement-failed") {
        return {
          status: "measurement-failed",
          storageCapacity: "unknown",
          replacementByteLength: null,
          requiredStorageUnits: null,
          error: replacement.error,
        };
      }
      if (
        replacement.reason === "replacement-exceeds-authoritative-limit" &&
        replacement.measurement !== null
      ) {
        return {
          status: "ineligible",
          storageCapacity: "unknown",
          reason: replacement.reason,
          replacementByteLength: replacement.measurement.replacementByteLength,
          requiredStorageUnits: replacement.measurement.requiredStorageUnits,
          error: replacement.error,
        };
      }
      return invalidEligibility("plan", replacement.error);
    }
    if (
      !opaqueRecoverySummaryMatches(validated.plan, replacement.replacement)
    ) {
      return invalidEligibility(
        "plan",
        "opaque recovery summary does not match the canonical replacement",
      );
    }
    return {
      status: "eligible",
      storageCapacity: "unknown",
      replacementByteLength: replacement.measurement.replacementByteLength,
      requiredStorageUnits: replacement.measurement.requiredStorageUnits,
    };
  }

  async deleteAll(
    input: DeleteAllJourneysInput,
  ): Promise<JourneyDeleteMutationResult> {
    if (
      !isRecord(input) ||
      !hasExactKeys(input, ["expectedRevision"]) ||
      !isRuntimeJourneyStorageExpectation(input.expectedRevision)
    ) {
      return {
        status: "failure",
        stage: "write",
        rawBefore: null,
        error: "Delete input must contain one exact valid Journey expectation",
        rollback: { status: "not-required" },
      };
    }
    const expectedRevision = snapshotJourneyStorageExpectation(
      input.expectedRevision,
    );
    const before = await this.read();
    if (before.status === "read-failed") {
      return readFailure(before);
    }
    if (!actualMatchesExpectation(before, expectedRevision)) {
      return conflict(expectedRevision, before);
    }

    const rawBefore = rawFromRead(before);
    try {
      this.#storageProvider().removeItem(ATLAS_JOURNEY_STORAGE_KEY_V1);
    } catch (error) {
      return this.#failureWithConditionalRollback(
        "write",
        rawBefore,
        null,
        error,
      );
    }

    const readback = await this.read();
    if (readback.status !== "absent") {
      const error =
        readback.status === "read-failed"
          ? readback.error
          : `Delete readback was ${readback.status}, not absent`;
      return this.#failureWithConditionalRollback(
        "readback",
        rawBefore,
        null,
        error,
      );
    }
    return { status: "deleted", readback: { status: "absent" } };
  }

  async handleStorageEvent(
    event: JourneyStorageEventLike,
  ): Promise<JourneyStorageEventResult> {
    let storage: JourneyStorageLike;
    try {
      storage = this.#storageProvider();
    } catch {
      return { status: "ignored", reason: "different-storage-area" };
    }
    if (event.storageArea !== storage) {
      return { status: "ignored", reason: "different-storage-area" };
    }
    if (event.key !== null && event.key !== ATLAS_JOURNEY_STORAGE_KEY_V1) {
      return { status: "ignored", reason: "different-key" };
    }
    return {
      status: "reread",
      reason: event.key === null ? "storage-cleared" : "journey-key",
      read: await this.read(),
    };
  }

  async #writeDocument(
    expectedRevision: JourneyStorageExpectation,
    document: JourneyDocumentV1,
    options: {
      readonly enforceAuthoritativeReplacementLimit?: boolean;
      readonly expectedRestoreSummary?: RestoreSummary | OpaqueRecoverySummary;
    } = {},
  ): Promise<JourneyWriteMutationResult> {
    const expectedSnapshot =
      snapshotJourneyStorageExpectation(expectedRevision);
    const before = await this.read();
    if (before.status === "read-failed") {
      return readFailure(before);
    }
    if (!actualMatchesExpectation(before, expectedSnapshot)) {
      return conflict(expectedSnapshot, before);
    }

    const rawBefore = rawFromRead(before);
    const revision =
      expectedSnapshot.state === "unreadable"
        ? validateRecoverJourneyInput({
            expectedRaw: expectedSnapshot,
            replacement: document,
          })
        : validateReplaceJourneyInput({
            expectedRevision: expectedSnapshot,
            replacement: document,
          });
    if (!revision.ok) {
      return {
        status: "failure",
        stage: "write",
        rawBefore,
        error: `Journey revision transition failed: ${revision.reason}`,
        rollback: { status: "not-required" },
      };
    }

    let prepared: ReturnType<typeof prepareDocument>;
    try {
      prepared = prepareDocument(document);
    } catch (error) {
      return {
        status: "failure",
        stage: "write",
        rawBefore,
        error: describeError(error),
        rollback: { status: "not-required" },
      };
    }
    if (options.enforceAuthoritativeReplacementLimit) {
      const measurement = measureCanonicalReplacement(prepared.raw);
      if (!measurement.fits) {
        return {
          status: "failure",
          stage: "write",
          rawBefore,
          error:
            "Canonical Journey replacement exceeds the authoritative backup/storage limit",
          rollback: { status: "not-required" },
        };
      }
    }
    if (options.expectedRestoreSummary !== undefined) {
      const actualSummary =
        expectedSnapshot.state === "unreadable"
          ? createOpaqueRecoverySummary(expectedSnapshot.status, prepared.value)
          : createRestoreSummary(
              before.status === "valid" ? before.value : null,
              prepared.value,
            );
      if (
        JSON.stringify(actualSummary) !==
        JSON.stringify(options.expectedRestoreSummary)
      ) {
        return {
          status: "failure",
          stage: "write",
          rawBefore,
          error:
            "Restore plan summary does not match the canonical current and replacement documents",
          rollback: { status: "not-required" },
        };
      }
    }

    try {
      this.#storageProvider().setItem(
        ATLAS_JOURNEY_STORAGE_KEY_V1,
        prepared.raw,
      );
    } catch (error) {
      return this.#failureWithConditionalRollback(
        "write",
        rawBefore,
        prepared.raw,
        error,
      );
    }

    const readback = await this.read();
    if (!readbackMatches(readback, prepared.value)) {
      const error =
        readback.status === "read-failed"
          ? readback.error
          : `Journey readback did not match committed revision ${prepared.value.revision}`;
      return this.#failureWithConditionalRollback(
        "readback",
        rawBefore,
        prepared.raw,
        error,
      );
    }
    return { status: "committed", readback };
  }

  #failureWithConditionalRollback(
    stage: "write" | "readback",
    rawBefore: string | null,
    attemptedRaw: string | null,
    error: unknown,
  ): JourneyMutationFailure {
    return {
      status: "failure",
      stage,
      rawBefore,
      error: typeof error === "string" ? error : describeError(error),
      rollback: this.#restoreRawIfOwned(rawBefore, attemptedRaw),
    };
  }

  #restoreRawIfOwned(
    rawBefore: string | null,
    attemptedRaw: string | null,
  ): JourneyRollbackResult {
    let storage: JourneyStorageLike;
    let currentRaw: string | null;
    try {
      storage = this.#storageProvider();
      currentRaw = storage.getItem(ATLAS_JOURNEY_STORAGE_KEY_V1);
      this.#lastObservedRaw = currentRaw;
    } catch (error) {
      return {
        status: "failed",
        raw: rawBefore,
        error: `Safe rollback blocked because current storage could not be read: ${describeError(error)}`,
      };
    }

    if (currentRaw === rawBefore) {
      return { status: "not-required" };
    }
    if (currentRaw !== attemptedRaw) {
      return {
        status: "failed",
        raw: rawBefore,
        error:
          "Safe rollback blocked because a concurrent or external value replaced this operation's attempted value",
      };
    }

    try {
      if (rawBefore === null) {
        storage.removeItem(ATLAS_JOURNEY_STORAGE_KEY_V1);
      } else {
        storage.setItem(ATLAS_JOURNEY_STORAGE_KEY_V1, rawBefore);
      }
      const restored = storage.getItem(ATLAS_JOURNEY_STORAGE_KEY_V1);
      if (restored !== rawBefore) {
        throw new Error("Rollback readback did not match the exact prior raw");
      }
      this.#lastObservedRaw = restored;
      return { status: "restored", raw: rawBefore };
    } catch (error) {
      return {
        status: "failed",
        raw: rawBefore,
        error: describeError(error),
      };
    }
  }
}

export function createBrowserJourneyRepository() {
  return new LocalStorageJourneyRepository(() => window.localStorage);
}
