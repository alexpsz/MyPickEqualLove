import type {
  JourneyDocumentReadResult,
  JourneyDocumentV1,
} from "../contracts/journey-document.js";

export type JourneyRevisionExpectation =
  | { readonly state: "absent" }
  | { readonly state: "present"; readonly revision: number };

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
  if (typeof expectedRevision !== "object" || expectedRevision === null) {
    return {
      ok: false,
      reason: "invalid-expected-revision",
      expectedNextRevision: null,
    };
  }
  const expected = expectedRevision as {
    readonly state?: unknown;
    readonly revision?: unknown;
  };
  if (expected.state === "absent") {
    if (Object.keys(expectedRevision as Record<string, unknown>).length !== 1) {
      return {
        ok: false,
        reason: "invalid-expected-revision",
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
  if (
    expected.state !== "present" ||
    Object.keys(expectedRevision as Record<string, unknown>).length !== 2 ||
    !Number.isInteger(expected.revision) ||
    (expected.revision as number) < 0
  ) {
    return {
      ok: false,
      reason: "invalid-expected-revision",
      expectedNextRevision: null,
    };
  }
  const expectedNextRevision = (expected.revision as number) + 1;
  return nextRevision === expectedNextRevision
    ? { ok: true, nextRevision }
    : {
        ok: false,
        reason: "non-consecutive-revision",
        expectedNextRevision,
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
  readonly expectedRevision: JourneyRevisionExpectation;
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

declare const validatedRevisionBrand: unique symbol;
export type ValidatedCompareAndWriteJourneyInput =
  CompareAndWriteJourneyInput & {
    readonly [validatedRevisionBrand]: "compare-and-write";
  };
export type ValidatedReplaceJourneyInput = ReplaceJourneyInput & {
  readonly [validatedRevisionBrand]: "replace";
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

export interface DeleteAllJourneysInput {
  readonly expectedRevision: JourneyRevisionExpectation;
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
