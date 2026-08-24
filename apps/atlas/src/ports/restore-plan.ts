import type { JourneyDocumentV1 } from "../contracts/journey-document.js";

export interface RestoreSummary {
  readonly journeyCount: number;
  readonly experienceEntryCount: number;
}

export type RestorePlanInput =
  | { readonly status: "cancelled" }
  | { readonly status: "corrupt"; readonly raw: string }
  | {
      readonly status: "future-version";
      readonly raw: string;
      readonly version: number;
    }
  | {
      readonly status: "invalid";
      readonly raw: string;
      readonly reason: string;
    }
  | {
      readonly status: "capacity-failed";
      readonly raw: string;
      readonly requiredBytes: number;
      readonly availableBytes: number;
    }
  | {
      readonly status: "valid";
      readonly raw: string;
      readonly expectedRevision: number;
      readonly replacement: JourneyDocumentV1;
      readonly summary: RestoreSummary;
    };

export interface JourneyReplaceApplyPlan {
  readonly kind: "replace-journey-document";
  readonly expectedRevision: number;
  readonly replacement: JourneyDocumentV1;
  readonly summary: RestoreSummary;
}

export type RestorePlanResult =
  | { readonly status: "ready"; readonly applyPlan: JourneyReplaceApplyPlan }
  | {
      readonly status: Exclude<RestorePlanInput["status"], "valid">;
      readonly applyPlan: null;
    };

/** Pure planning boundary. It never reads or writes personal storage. */
export function createRestorePlan(input: RestorePlanInput): RestorePlanResult {
  if (input.status !== "valid") {
    return { status: input.status, applyPlan: null };
  }
  return {
    status: "ready",
    applyPlan: {
      kind: "replace-journey-document",
      expectedRevision: input.expectedRevision,
      replacement: input.replacement,
      summary: input.summary,
    },
  };
}
