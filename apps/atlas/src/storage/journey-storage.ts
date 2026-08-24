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

type StorageProvider = () => JourneyStorageLike;

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.name && error.name !== "Error"
      ? `${error.name}: ${error.message}`
      : error.message;
  }
  return String(error);
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
      return this.#failureWithRollback("write", rawBefore, error);
    }

    const readback = await this.read();
    if (readback.status !== "absent") {
      const error =
        readback.status === "read-failed"
          ? readback.error
          : `Delete readback was ${readback.status}, not absent`;
      return this.#failureWithRollback("readback", rawBefore, error);
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
      return this.#failureWithRollback("write", rawBefore, error);
    }

    const readback = await this.read();
    if (!readbackMatches(readback, prepared.value)) {
      const error =
        readback.status === "read-failed"
          ? readback.error
          : `Journey readback did not match committed revision ${prepared.value.revision}`;
      return this.#failureWithRollback("readback", rawBefore, error);
    }
    return { status: "committed", readback };
  }

  #failureWithRollback(
    stage: "write" | "readback",
    rawBefore: string | null,
    error: unknown,
  ): JourneyMutationFailure {
    return {
      status: "failure",
      stage,
      rawBefore,
      error: typeof error === "string" ? error : describeError(error),
      rollback: this.#restoreRaw(rawBefore),
    };
  }

  #restoreRaw(rawBefore: string | null): JourneyRollbackResult {
    try {
      const storage = this.#storageProvider();
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
