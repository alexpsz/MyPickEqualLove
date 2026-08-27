import type {
  JourneyDocumentReadResult,
  JourneyDocumentV1,
} from "../contracts/journey-document.js";

export type JourneyRevisionExpectation =
  | { readonly state: "absent" }
  | { readonly state: "present"; readonly revision: number };

export type JourneyUnreadableStatus = "corrupt" | "future-version" | "invalid";

/**
 * Whole-document recovery may replace or delete a value that cannot be parsed,
 * but only while the exact raw value and its read classification still match.
 */
export type JourneyOpaqueRawExpectation = {
  readonly state: "unreadable";
  readonly status: JourneyUnreadableStatus;
  readonly raw: string;
};

export type JourneyStorageExpectation =
  | JourneyRevisionExpectation
  | JourneyOpaqueRawExpectation;

function hasExactOwnKeys(
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

export function isJourneyStorageExpectation(
  value: unknown,
): value is JourneyStorageExpectation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const expectation = value as {
    readonly state?: unknown;
    readonly revision?: unknown;
    readonly status?: unknown;
    readonly raw?: unknown;
  };
  const record = value as Record<string, unknown>;
  if (expectation.state === "absent") {
    return hasExactOwnKeys(record, ["state"]);
  }
  if (expectation.state === "present") {
    return (
      hasExactOwnKeys(record, ["state", "revision"]) &&
      Number.isInteger(expectation.revision) &&
      (expectation.revision as number) >= 0
    );
  }
  return (
    expectation.state === "unreadable" &&
    hasExactOwnKeys(record, ["state", "status", "raw"]) &&
    ["corrupt", "future-version", "invalid"].includes(
      expectation.status as string,
    ) &&
    typeof expectation.raw === "string"
  );
}

export type JourneyRevisionTransitionResult =
  | { readonly ok: true; readonly nextRevision: number }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-expected-revision"
        | "invalid-next-revision"
        | "non-consecutive-revision";
      readonly expectedNextRevision: number | null;
    };

/**
 * An absent document starts at revision 0. A present revision, including 0,
 * advances by exactly one; equal, decreasing, and skipped revisions fail closed.
 */
export function validateJourneyRevisionTransition(
  expectedRevision: unknown,
  nextRevision: number,
): JourneyRevisionTransitionResult {
  if (!Number.isInteger(nextRevision) || nextRevision < 0) {
    return {
      ok: false,
      reason: "invalid-next-revision",
      expectedNextRevision: null,
    };
  }
  if (
    !isJourneyStorageExpectation(expectedRevision) ||
    expectedRevision.state === "unreadable"
  ) {
    return {
      ok: false,
      reason: "invalid-expected-revision",
      expectedNextRevision: null,
    };
  }
  if (expectedRevision.state === "absent") {
    return nextRevision === 0
      ? { ok: true, nextRevision }
      : {
          ok: false,
          reason: "non-consecutive-revision",
          expectedNextRevision: 0,
        };
  }
  const expectedNextRevision = expectedRevision.revision + 1;
  return nextRevision === expectedNextRevision
    ? { ok: true, nextRevision }
    : {
        ok: false,
        reason: "non-consecutive-revision",
        expectedNextRevision,
      };
}

export function validateJourneyOpaqueRecoveryTransition(
  expectedRevision: unknown,
  nextRevision: number,
): JourneyRevisionTransitionResult {
  if (
    isJourneyStorageExpectation(expectedRevision) &&
    expectedRevision.state === "unreadable"
  ) {
    if (!Number.isInteger(nextRevision) || nextRevision < 0) {
      return {
        ok: false,
        reason: "invalid-next-revision",
        expectedNextRevision: null,
      };
    }
    return nextRevision === 0
      ? { ok: true, nextRevision }
      : {
          ok: false,
          reason: "non-consecutive-revision",
          expectedNextRevision: 0,
        };
  }
  return {
    ok: false,
    reason: "invalid-expected-revision",
    expectedNextRevision: null,
  };
}

export type JourneyRollbackResult =
  | { readonly status: "not-required" }
  | { readonly status: "restored"; readonly raw: string | null }
  | {
      readonly status: "failed";
      readonly raw: string | null;
      readonly error: string;
    };

export type JourneyMutationConflict = {
  readonly status: "conflict";
  readonly expectedRevision: JourneyStorageExpectation;
  readonly actual: JourneyDocumentReadResult;
  readonly rollback: { readonly status: "not-required" };
};

export type JourneyMutationFailure = {
  readonly status: "failure";
  readonly stage: "read-before-write" | "write" | "readback";
  readonly rawBefore: string | null;
  readonly error: string;
  readonly rollback: JourneyRollbackResult;
};

export type JourneyWriteMutationResult =
  | {
      readonly status: "committed";
      readonly readback: Extract<
        JourneyDocumentReadResult,
        { readonly status: "valid" }
      >;
    }
  | JourneyMutationConflict
  | JourneyMutationFailure;

export type JourneyDeleteMutationResult =
  | {
      readonly status: "deleted";
      readonly readback: { readonly status: "absent" };
    }
  | JourneyMutationConflict
  | JourneyMutationFailure;

export interface CompareAndWriteJourneyInput {
  readonly expectedRevision: JourneyRevisionExpectation;
  readonly next: JourneyDocumentV1;
}

export interface ReplaceJourneyInput {
  readonly expectedRevision: JourneyRevisionExpectation;
  readonly replacement: JourneyDocumentV1;
}

export interface RecoverJourneyInput {
  readonly expectedRaw: JourneyOpaqueRawExpectation;
  readonly replacement: JourneyDocumentV1;
}

declare const validatedRevisionBrand: unique symbol;
export type ValidatedCompareAndWriteJourneyInput =
  CompareAndWriteJourneyInput & {
    readonly [validatedRevisionBrand]: "compare-and-write";
  };
export type ValidatedReplaceJourneyInput = ReplaceJourneyInput & {
  readonly [validatedRevisionBrand]: "replace";
};
export type ValidatedRecoverJourneyInput = RecoverJourneyInput & {
  readonly [validatedRevisionBrand]: "recover";
};

export type JourneyWriteInputValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | Extract<JourneyRevisionTransitionResult, { readonly ok: false }>;

export function validateCompareAndWriteJourneyInput(
  input: CompareAndWriteJourneyInput,
): JourneyWriteInputValidationResult<ValidatedCompareAndWriteJourneyInput> {
  const transition = validateJourneyRevisionTransition(
    input.expectedRevision,
    input.next.revision,
  );
  return transition.ok
    ? { ok: true, value: input as ValidatedCompareAndWriteJourneyInput }
    : transition;
}

export function validateReplaceJourneyInput(
  input: ReplaceJourneyInput,
): JourneyWriteInputValidationResult<ValidatedReplaceJourneyInput> {
  const transition = validateJourneyRevisionTransition(
    input.expectedRevision,
    input.replacement.revision,
  );
  return transition.ok
    ? { ok: true, value: input as ValidatedReplaceJourneyInput }
    : transition;
}

export function validateRecoverJourneyInput(
  input: RecoverJourneyInput,
): JourneyWriteInputValidationResult<ValidatedRecoverJourneyInput> {
  const transition = validateJourneyOpaqueRecoveryTransition(
    input.expectedRaw,
    input.replacement.revision,
  );
  return transition.ok
    ? { ok: true, value: input as ValidatedRecoverJourneyInput }
    : transition;
}

export interface DeleteAllJourneysInput {
  readonly expectedRevision: JourneyStorageExpectation;
}

/**
 * Sole personal-state writer port. Implementations must re-read before writes,
 * verify readback, and attempt restoration of the exact prior raw value on a
 * write/readback failure. The contract intentionally provides no merge method.
 */
export interface JourneyRepository {
  read(): Promise<JourneyDocumentReadResult>;
  compareAndWrite(
    input: ValidatedCompareAndWriteJourneyInput,
  ): Promise<JourneyWriteMutationResult>;
  replace(
    input: ValidatedReplaceJourneyInput,
  ): Promise<JourneyWriteMutationResult>;
  deleteAll(
    input: DeleteAllJourneysInput,
  ): Promise<JourneyDeleteMutationResult>;
}
