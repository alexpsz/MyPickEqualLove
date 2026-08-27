import type { JourneyDocumentV1 } from "../contracts/journey-document.js";
import {
  validateJourneyOpaqueRecoveryTransition,
  validateJourneyRevisionTransition,
  type JourneyOpaqueRawExpectation,
  type JourneyRevisionExpectation,
  type JourneyStorageExpectation,
  type JourneyUnreadableStatus,
} from "./journey-repository.js";

export interface RestoreEntitySummary {
  readonly before: number;
  readonly after: number;
  readonly added: number;
  readonly updated: number;
  readonly deleted: number;
  readonly unchanged: number;
}

export interface RestoreSummary {
  readonly journeys: RestoreEntitySummary;
  readonly experienceEntries: RestoreEntitySummary;
}

export interface OpaqueRecoverySummary {
  readonly current: {
    readonly status: JourneyUnreadableStatus;
    readonly countsAvailable: false;
  };
  readonly replacement: {
    readonly journeys: number;
    readonly experienceEntries: number;
  };
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
      readonly expectedRevision: JourneyStorageExpectation;
      readonly current: JourneyDocumentV1 | null;
      readonly replacement: JourneyDocumentV1;
    };

export interface JourneyReplaceApplyPlan {
  readonly kind: "replace-journey-document";
  readonly expectedRevision: JourneyRevisionExpectation;
  readonly replacement: JourneyDocumentV1;
  readonly summary: RestoreSummary;
}

export interface JourneyRecoveryApplyPlan {
  readonly kind: "recover-journey-document-from-raw";
  readonly expectation: JourneyOpaqueRawExpectation;
  readonly replacement: JourneyDocumentV1;
  readonly summary: OpaqueRecoverySummary;
}

export type JourneyRestoreApplyPlan =
  | JourneyReplaceApplyPlan
  | JourneyRecoveryApplyPlan;

export type RestorePlanResult =
  | { readonly status: "ready"; readonly applyPlan: JourneyRestoreApplyPlan }
  | {
      readonly status:
        | "cancelled"
        | "corrupt"
        | "future-version"
        | "capacity-failed";
      readonly applyPlan: null;
    }
  | {
      readonly status: "invalid";
      readonly applyPlan: null;
      readonly reason: string;
    };

function summarizeByIdentity<T>(
  before: readonly T[],
  after: readonly T[],
  identity: (value: T) => string,
): RestoreEntitySummary {
  const beforeById = new Map(before.map((value) => [identity(value), value]));
  const afterById = new Map(after.map((value) => [identity(value), value]));
  let updated = 0;
  let unchanged = 0;
  for (const [id, afterValue] of afterById) {
    const beforeValue = beforeById.get(id);
    if (beforeValue === undefined) continue;
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      unchanged += 1;
    } else {
      updated += 1;
    }
  }
  return {
    before: before.length,
    after: after.length,
    added: [...afterById.keys()].filter((id) => !beforeById.has(id)).length,
    updated,
    deleted: [...beforeById.keys()].filter((id) => !afterById.has(id)).length,
    unchanged,
  };
}

export function createRestoreSummary(
  current: JourneyDocumentV1 | null,
  replacement: JourneyDocumentV1,
): RestoreSummary {
  const beforeJourneys = current?.journeys ?? [];
  const afterJourneys = replacement.journeys;
  const beforeEntries = beforeJourneys.flatMap((journey) =>
    journey.experienceEntries.map((entry) => ({
      identity: `${journey.id}\u0000${entry.id}`,
      entry,
    })),
  );
  const afterEntries = afterJourneys.flatMap((journey) =>
    journey.experienceEntries.map((entry) => ({
      identity: `${journey.id}\u0000${entry.id}`,
      entry,
    })),
  );
  return {
    journeys: summarizeByIdentity(
      beforeJourneys,
      afterJourneys,
      (journey) => journey.id,
    ),
    experienceEntries: summarizeByIdentity(
      beforeEntries,
      afterEntries,
      (entry) => entry.identity,
    ),
  };
}

export function createOpaqueRecoverySummary(
  status: JourneyUnreadableStatus,
  replacement: JourneyDocumentV1,
): OpaqueRecoverySummary {
  return {
    current: { status, countsAvailable: false },
    replacement: {
      journeys: replacement.journeys.length,
      experienceEntries: replacement.journeys.reduce(
        (count, journey) => count + journey.experienceEntries.length,
        0,
      ),
    },
  };
}

function currentMatchesExpectation(
  current: JourneyDocumentV1 | null,
  expectedRevision: JourneyStorageExpectation,
) {
  if (expectedRevision.state === "present") {
    return current !== null && current.revision === expectedRevision.revision;
  }
  return current === null;
}

/** Pure planning boundary. It never reads or writes personal storage. */
export function createRestorePlan(input: RestorePlanInput): RestorePlanResult {
  if (input.status !== "valid") {
    return input.status === "invalid"
      ? { status: "invalid", applyPlan: null, reason: input.reason }
      : { status: input.status, applyPlan: null };
  }
  if (!currentMatchesExpectation(input.current, input.expectedRevision)) {
    return {
      status: "invalid",
      applyPlan: null,
      reason: "current document does not match the expected revision state",
    };
  }
  const revision =
    input.expectedRevision.state === "unreadable"
      ? validateJourneyOpaqueRecoveryTransition(
          input.expectedRevision,
          input.replacement.revision,
        )
      : validateJourneyRevisionTransition(
          input.expectedRevision,
          input.replacement.revision,
        );
  if (!revision.ok) {
    return {
      status: "invalid",
      applyPlan: null,
      reason: "replacement revision is not the next consecutive revision",
    };
  }
  if (input.expectedRevision.state === "unreadable") {
    return {
      status: "ready",
      applyPlan: {
        kind: "recover-journey-document-from-raw",
        expectation: input.expectedRevision,
        replacement: input.replacement,
        summary: createOpaqueRecoverySummary(
          input.expectedRevision.status,
          input.replacement,
        ),
      },
    };
  }
  return {
    status: "ready",
    applyPlan: {
      kind: "replace-journey-document",
      expectedRevision: input.expectedRevision,
      replacement: input.replacement,
      summary: createRestoreSummary(input.current, input.replacement),
    },
  };
}
