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
  createRestoreSummary,
  type JourneyReplaceApplyPlan,
  type RestoreEntitySummary,
  type RestoreSummary,
} from "../ports/restore-plan.js";
import {
  validateReplaceJourneyInput,
  type DeleteAllJourneysInput,
  type JourneyDeleteMutationResult,
  type JourneyMutationConflict,
  type JourneyMutationFailure,
  type JourneyRepository,
  type JourneyRevisionExpectation,
  type JourneyRollbackResult,
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
        | "non-consecutive-revision";
      readonly expectedNextRevision: number | null;
    };

export interface JourneyReplacementCapacityPreflightInput {
  readonly plan: JourneyReplaceApplyPlan;
}

export type JourneyReplacementCapacityPreflightResult =
  | {
      readonly status: "ready";
      /** Advisory only. Every apply path independently repeats all hard gates. */
      readonly advisory: true;
      readonly replacementByteLength: number;
      readonly requiredStorageUnits: number;
    }
  | {
      readonly status: "capacity-failed";
      readonly applyPlan: null;
      readonly reason:
        | "replacement-exceeds-authoritative-limit"
        | "probe-quota-exceeded";
      readonly replacementByteLength: number | null;
      readonly requiredStorageUnits: number;
      readonly error: string;
    }
  | {
      readonly status: "unavailable";
      readonly applyPlan: null;
      readonly stage:
        | "invalid-input"
        | "invalid-plan"
        | "measurement"
        | "probe-token"
        | "probe-write"
        | "probe-readback"
        | "probe-cleanup";
      readonly replacementByteLength: number | null;
      readonly requiredStorageUnits: number | null;
      readonly error: string;
    };

type StorageProvider = () => JourneyStorageLike;

const ATLAS_JOURNEY_CAPACITY_PROBE_KEY_PREFIX_V1 =
  "atlas:journey-capacity-probe:v1:";
const ATLAS_JOURNEY_CAPACITY_PROBE_VALUE_PREFIX_V1 =
  "atlas-capacity-placeholder:v1:";

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.name && error.name !== "Error"
      ? `${error.name}: ${error.message}`
      : error.message;
  }
  return String(error);
}

function isQuotaExceededError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "QuotaExceededError"
  );
}

function unavailableCapacity(
  stage: Extract<
    JourneyReplacementCapacityPreflightResult,
    { readonly status: "unavailable" }
  >["stage"],
  error: string,
  replacementByteLength: number | null = null,
  requiredStorageUnits: number | null = null,
): JourneyReplacementCapacityPreflightResult {
  return {
    status: "unavailable",
    applyPlan: null,
    stage,
    replacementByteLength,
    requiredStorageUnits,
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

type ReplacePlanValidationResult =
  | { readonly ok: true; readonly plan: JourneyReplaceApplyPlan }
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
  expected: JourneyRevisionExpectation,
) {
  return expected.state === "absent"
    ? actual.status === "absent"
    : actual.status === "valid" && actual.value.revision === expected.revision;
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
  expectedRevision: JourneyRevisionExpectation,
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
    if (
      !isRecord(input) ||
      !hasExactKeys(input, ["expectedRevision", "replacement"])
    ) {
      return {
        status: "failure",
        stage: "write",
        rawBefore: null,
        error:
          "Replace input must contain only expectedRevision and replacement",
        rollback: { status: "not-required" },
      };
    }
    return this.#writeDocument(input.expectedRevision, input.replacement, {
      enforceAuthoritativeReplacementLimit: true,
    });
  }

  async applyReplacePlan(
    plan: JourneyReplaceApplyPlan,
  ): Promise<JourneyReplacePlanApplyResult> {
    const validated = validateReplacePlanShape(plan);
    if (!validated.ok) {
      return {
        status: "invalid-plan",
        reason: validated.reason,
        expectedNextRevision: validated.expectedNextRevision,
      };
    }
    return this.#writeDocument(
      validated.plan.expectedRevision,
      validated.plan.replacement,
      {
        enforceAuthoritativeReplacementLimit: true,
        expectedRestoreSummary: validated.plan.summary,
      },
    );
  }

  async preflightReplaceCapacity(
    input: JourneyReplacementCapacityPreflightInput,
  ): Promise<JourneyReplacementCapacityPreflightResult> {
    if (!isRecord(input) || !hasExactKeys(input, ["plan"])) {
      return unavailableCapacity(
        "invalid-input",
        "replacement capacity input must contain only plan",
      );
    }
    const validated = validateReplacePlanShape(input.plan);
    if (!validated.ok) {
      return unavailableCapacity(
        "invalid-plan",
        `replacement capacity plan is invalid: ${validated.reason}`,
      );
    }

    let measurement: CanonicalReplacementMeasurement;
    try {
      const prepared = prepareDocument(validated.plan.replacement);
      measurement = measureCanonicalReplacement(prepared.raw);
    } catch (error) {
      return unavailableCapacity("measurement", describeError(error));
    }
    if (!measurement.fits) {
      return {
        status: "capacity-failed",
        applyPlan: null,
        reason: "replacement-exceeds-authoritative-limit",
        replacementByteLength: measurement.replacementByteLength,
        requiredStorageUnits: measurement.requiredStorageUnits,
        error:
          "canonical Journey replacement exceeds the authoritative backup/storage limit",
      };
    }
    return this.#runReplacementCapacityProbe(
      measurement.replacementByteLength,
      measurement.requiredStorageUnits,
    );
  }

  async deleteAll(
    input: DeleteAllJourneysInput,
  ): Promise<JourneyDeleteMutationResult> {
    const before = await this.read();
    if (before.status === "read-failed") {
      return readFailure(before);
    }
    if (!actualMatchesExpectation(before, input.expectedRevision)) {
      return conflict(input.expectedRevision, before);
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

  #runReplacementCapacityProbe(
    replacementByteLength: number,
    requiredStorageUnits: number,
  ): JourneyReplacementCapacityPreflightResult {
    let probeKey: string;
    let probeValue: string;
    try {
      probeKey = `${ATLAS_JOURNEY_CAPACITY_PROBE_KEY_PREFIX_V1}${globalThis.crypto.randomUUID()}`;
      const seed = `${ATLAS_JOURNEY_CAPACITY_PROBE_VALUE_PREFIX_V1}${globalThis.crypto.randomUUID()}:`;
      probeValue = seed
        .repeat(Math.ceil(requiredStorageUnits / seed.length))
        .slice(0, requiredStorageUnits);
    } catch (error) {
      return unavailableCapacity(
        "probe-token",
        describeError(error),
        replacementByteLength,
        requiredStorageUnits,
      );
    }

    let storage: JourneyStorageLike;
    try {
      storage = this.#storageProvider();
    } catch (error) {
      return unavailableCapacity(
        "probe-write",
        describeError(error),
        replacementByteLength,
        requiredStorageUnits,
      );
    }

    try {
      // A fresh UUID key is written directly; there is no shared fixed-key
      // emptiness read for another tab to occupy before this write.
      storage.setItem(probeKey, probeValue);
    } catch (error) {
      const cleanup = this.#cleanupCapacityProbe(
        storage,
        probeKey,
        probeValue,
        true,
      );
      if (!cleanup.ok) {
        return unavailableCapacity(
          "probe-cleanup",
          cleanup.error,
          replacementByteLength,
          requiredStorageUnits,
        );
      }
      return isQuotaExceededError(error)
        ? {
            status: "capacity-failed",
            applyPlan: null,
            reason: "probe-quota-exceeded",
            replacementByteLength,
            requiredStorageUnits,
            error: describeError(error),
          }
        : unavailableCapacity(
            "probe-write",
            describeError(error),
            replacementByteLength,
            requiredStorageUnits,
          );
    }

    let readback: string | null;
    try {
      readback = storage.getItem(probeKey);
    } catch (error) {
      const cleanup = this.#cleanupCapacityProbe(
        storage,
        probeKey,
        probeValue,
        false,
      );
      return unavailableCapacity(
        cleanup.ok ? "probe-readback" : "probe-cleanup",
        cleanup.ok ? describeError(error) : cleanup.error,
        replacementByteLength,
        requiredStorageUnits,
      );
    }
    if (readback !== probeValue) {
      return unavailableCapacity(
        "probe-readback",
        "replacement capacity probe was replaced or removed concurrently",
        replacementByteLength,
        requiredStorageUnits,
      );
    }

    const cleanup = this.#cleanupCapacityProbe(
      storage,
      probeKey,
      probeValue,
      false,
    );
    if (!cleanup.ok) {
      return unavailableCapacity(
        "probe-cleanup",
        cleanup.error,
        replacementByteLength,
        requiredStorageUnits,
      );
    }
    return {
      status: "ready",
      advisory: true,
      replacementByteLength,
      requiredStorageUnits,
    };
  }

  #cleanupCapacityProbe(
    storage: JourneyStorageLike,
    probeKey: string,
    probeValue: string,
    allowMissing: boolean,
  ): { readonly ok: true } | { readonly ok: false; readonly error: string } {
    let current: string | null;
    try {
      current = storage.getItem(probeKey);
    } catch (error) {
      return {
        ok: false,
        error: `capacity probe cleanup could not read ownership: ${describeError(error)}`,
      };
    }
    if (current === null) {
      return allowMissing
        ? { ok: true }
        : {
            ok: false,
            error: "capacity probe disappeared before cleanup",
          };
    }
    if (current !== probeValue) {
      return {
        ok: false,
        error:
          "capacity probe cleanup refused to remove a concurrent or external value",
      };
    }

    try {
      storage.removeItem(probeKey);
    } catch (error) {
      return {
        ok: false,
        error: `capacity probe cleanup failed: ${describeError(error)}`,
      };
    }
    try {
      return storage.getItem(probeKey) === null
        ? { ok: true }
        : {
            ok: false,
            error: "capacity probe cleanup did not leave the probe key absent",
          };
    } catch (error) {
      return {
        ok: false,
        error: `capacity probe cleanup readback failed: ${describeError(error)}`,
      };
    }
  }

  async #writeDocument(
    expectedRevision: JourneyRevisionExpectation,
    document: JourneyDocumentV1,
    options: {
      readonly enforceAuthoritativeReplacementLimit?: boolean;
      readonly expectedRestoreSummary?: RestoreSummary;
    } = {},
  ): Promise<JourneyWriteMutationResult> {
    const before = await this.read();
    if (before.status === "read-failed") {
      return readFailure(before);
    }
    if (!actualMatchesExpectation(before, expectedRevision)) {
      return conflict(expectedRevision, before);
    }

    const rawBefore = rawFromRead(before);
    const revision = validateReplaceJourneyInput({
      expectedRevision,
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
      const actualSummary = createRestoreSummary(
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
