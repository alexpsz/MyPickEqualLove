import type {
  JourneyDocumentReadResult,
  JourneyDocumentV1,
} from "../contracts/journey-document.js";

export type JourneyRollbackResult =
  | { readonly status: "not-required" }
  | { readonly status: "restored"; readonly raw: string | null }
  | {
      readonly status: "failed";
      readonly raw: string | null;
      readonly error: string;
    };

export type JourneyMutationResult =
  | {
      readonly status: "committed";
      readonly readback: JourneyDocumentV1 | null;
      readonly raw: string | null;
    }
  | {
      readonly status: "conflict";
      readonly expectedRevision: number;
      readonly actual: JourneyDocumentReadResult;
      readonly rollback: { readonly status: "not-required" };
    }
  | {
      readonly status: "failure";
      readonly stage: "read-before-write" | "write" | "readback";
      readonly rawBefore: string | null;
      readonly error: string;
      readonly rollback: JourneyRollbackResult;
    };

export interface CompareAndWriteJourneyInput {
  readonly expectedRevision: number;
  readonly next: JourneyDocumentV1;
}

export interface ReplaceJourneyInput {
  readonly expectedRevision: number;
  readonly replacement: JourneyDocumentV1;
}

export interface DeleteAllJourneysInput {
  readonly expectedRevision: number;
}

/**
 * Sole personal-state writer port. Implementations must re-read before writes,
 * verify readback, and attempt restoration of the exact prior raw value on a
 * write/readback failure. The contract intentionally provides no merge method.
 */
export interface JourneyRepository {
  read(): Promise<JourneyDocumentReadResult>;
  compareAndWrite(
    input: CompareAndWriteJourneyInput,
  ): Promise<JourneyMutationResult>;
  replace(input: ReplaceJourneyInput): Promise<JourneyMutationResult>;
  deleteAll(input: DeleteAllJourneysInput): Promise<JourneyMutationResult>;
}
