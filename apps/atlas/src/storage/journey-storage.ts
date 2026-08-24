import {
  parseJourneyDocument,
  type JourneyDocumentReadResult,
  type JourneyDocumentV1,
} from "../contracts/journey-document.js";
import type { JourneyReplaceApplyPlan } from "../ports/restore-plan.js";
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
        | "invalid-expected-revision"
        | "invalid-next-revision"
        | "non-consecutive-revision";
      readonly expectedNextRevision: number | null;
    };

export interface JourneyReplacementCapacityPreflightInput {
  readonly plan: JourneyReplaceApplyPlan;
  /** Supplied from the backup codec's single authoritative import limit. */
  readonly maximumReplacementBytes: number;
}

export type JourneyReplacementCapacityPreflightResult =
  | {
      readonly status: "ready";
      readonly applyPlan: JourneyReplaceApplyPlan;
      readonly replacementByteLength: number;
      readonly requiredStorageUnits: number;
    }
  | {
      readonly status: "capacity-failed";
      readonly applyPlan: null;
      readonly reason:
        | "replacement-exceeds-authorized-limit"
        | "replacement-exceeds-probe-hard-limit"
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
        | "probe-in-use"
        | "probe-read"
        | "probe-occupied"
        | "probe-token"
        | "probe-write"
        | "probe-readback"
        | "probe-cleanup";
      readonly replacementByteLength: number | null;
      readonly requiredStorageUnits: number | null;
      readonly error: string;
    };

type StorageProvider = () => JourneyStorageLike;

const ATLAS_JOURNEY_CAPACITY_PROBE_KEY_V1 = "atlas:journey-capacity-probe:v1";
const CAPACITY_PROBE_MAX_STORAGE_UNITS = 8 * 1024 * 1024;

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
  #capacityProbeActive = false;

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
    return this.#writeDocument(input.expectedRevision, input.replacement);
  }

  async applyReplacePlan(
    plan: JourneyReplaceApplyPlan,
  ): Promise<JourneyReplacePlanApplyResult> {
    const validated = validateReplaceJourneyInput({
      expectedRevision: plan.expectedRevision,
      replacement: plan.replacement,
    });
    if (!validated.ok) {
      return {
        status: "invalid-plan",
        reason: validated.reason,
        expectedNextRevision: validated.expectedNextRevision,
      };
    }
    return this.replace(validated.value);
  }

  async preflightReplaceCapacity(
    input: JourneyReplacementCapacityPreflightInput,
  ): Promise<JourneyReplacementCapacityPreflightResult> {
    if (
      !Number.isSafeInteger(input.maximumReplacementBytes) ||
      input.maximumReplacementBytes <= 0
    ) {
      return unavailableCapacity(
        "invalid-input",
        "maximumReplacementBytes must be a positive integer",
      );
    }
    if (input.plan.kind !== "replace-journey-document") {
      return unavailableCapacity(
        "invalid-plan",
        "replacement capacity requires a Journey replace apply plan",
      );
    }
    const validated = validateReplaceJourneyInput({
      expectedRevision: input.plan.expectedRevision,
      replacement: input.plan.replacement,
    });
    if (!validated.ok) {
      return unavailableCapacity(
        "invalid-plan",
        `replacement plan revision is invalid: ${validated.reason}`,
      );
    }

    let prepared: ReturnType<typeof prepareDocument>;
    let replacementByteLength: number;
    let requiredStorageUnits: number;
    try {
      prepared = prepareDocument(validated.value.replacement);
      requiredStorageUnits = prepared.raw.length;
      if (requiredStorageUnits > CAPACITY_PROBE_MAX_STORAGE_UNITS) {
        return {
          status: "capacity-failed",
          applyPlan: null,
          reason: "replacement-exceeds-probe-hard-limit",
          replacementByteLength: null,
          requiredStorageUnits,
          error:
            "canonical Journey replacement exceeds the probe allocation limit",
        };
      }
      replacementByteLength = new TextEncoder().encode(prepared.raw).byteLength;
    } catch (error) {
      return unavailableCapacity("measurement", describeError(error));
    }
    if (replacementByteLength > input.maximumReplacementBytes) {
      return {
        status: "capacity-failed",
        applyPlan: null,
        reason: "replacement-exceeds-authorized-limit",
        replacementByteLength,
        requiredStorageUnits,
        error:
          "canonical Journey replacement exceeds the caller's authoritative byte limit",
      };
    }
    if (this.#capacityProbeActive) {
      return unavailableCapacity(
        "probe-in-use",
        "another replacement capacity probe is already active",
        replacementByteLength,
        requiredStorageUnits,
      );
    }

    this.#capacityProbeActive = true;
    try {
      return this.#runReplacementCapacityProbe(
        input.plan,
        replacementByteLength,
        requiredStorageUnits,
      );
    } finally {
      this.#capacityProbeActive = false;
    }
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
    plan: JourneyReplaceApplyPlan,
    replacementByteLength: number,
    requiredStorageUnits: number,
  ): JourneyReplacementCapacityPreflightResult {
    let storage: JourneyStorageLike;
    try {
      storage = this.#storageProvider();
      const existing = storage.getItem(ATLAS_JOURNEY_CAPACITY_PROBE_KEY_V1);
      if (existing !== null) {
        return unavailableCapacity(
          "probe-occupied",
          "replacement capacity probe key already contains a value",
          replacementByteLength,
          requiredStorageUnits,
        );
      }
    } catch (error) {
      return unavailableCapacity(
        "probe-read",
        describeError(error),
        replacementByteLength,
        requiredStorageUnits,
      );
    }

    let probeValue: string;
    try {
      const token = globalThis.crypto.randomUUID();
      const seed = `atlas-capacity-probe:${token}:`;
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

    try {
      storage.setItem(ATLAS_JOURNEY_CAPACITY_PROBE_KEY_V1, probeValue);
    } catch (error) {
      const cleanup = this.#cleanupCapacityProbe(storage, probeValue, true);
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
      readback = storage.getItem(ATLAS_JOURNEY_CAPACITY_PROBE_KEY_V1);
    } catch (error) {
      const cleanup = this.#cleanupCapacityProbe(storage, probeValue, false);
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

    const cleanup = this.#cleanupCapacityProbe(storage, probeValue, false);
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
      applyPlan: plan,
      replacementByteLength,
      requiredStorageUnits,
    };
  }

  #cleanupCapacityProbe(
    storage: JourneyStorageLike,
    probeValue: string,
    allowMissing: boolean,
  ): { readonly ok: true } | { readonly ok: false; readonly error: string } {
    let current: string | null;
    try {
      current = storage.getItem(ATLAS_JOURNEY_CAPACITY_PROBE_KEY_V1);
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
      storage.removeItem(ATLAS_JOURNEY_CAPACITY_PROBE_KEY_V1);
    } catch (error) {
      return {
        ok: false,
        error: `capacity probe cleanup failed: ${describeError(error)}`,
      };
    }
    try {
      return storage.getItem(ATLAS_JOURNEY_CAPACITY_PROBE_KEY_V1) === null
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
  ): Promise<JourneyWriteMutationResult> {
    const before = await this.read();
    if (before.status === "read-failed") {
      return readFailure(before);
    }
    if (!actualMatchesExpectation(before, expectedRevision)) {
      return conflict(expectedRevision, before);
    }

    const rawBefore = rawFromRead(before);
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
