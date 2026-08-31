import {
  parseJourneyDocumentValue,
  type ExperienceMode,
  type JourneyDocumentV1,
  type JourneyIntent,
} from "../../contracts/journey-document.js";
import type { PublicEntityReference } from "../../contracts/public-reference.js";
import {
  addJourneyExperienceEntry,
  expectedJourneyRevision,
  recordPublicJourney,
  updateJourneyIntent,
} from "../journey/journey-controller.js";
import {
  validateCompareAndWriteJourneyInput,
  type JourneyRepository,
} from "../../ports/journey-repository.js";

export interface PublicExperienceRecordInput {
  readonly reference: PublicEntityReference<"event" | "performance">;
  readonly journeyId: string;
  readonly entryId: string;
  readonly mode: ExperienceMode;
  readonly occurredAt: string;
  readonly highlight: string;
  readonly songRefs: readonly PublicEntityReference<"song">[];
  readonly now: string;
}

export type PublicExperienceRecordResult =
  | {
      readonly status: "saved";
      readonly document: JourneyDocumentV1;
      readonly journeyId: string;
    }
  | {
      readonly status: "blocked";
      readonly reason:
        | "storage-unreadable"
        | "stale-reference"
        | "invalid-input"
        | "write-conflict"
        | "write-failed";
      readonly error: string;
    };

export interface PublicEventIntentInput {
  readonly reference: PublicEntityReference<"event">;
  readonly journeyId: string;
  readonly intent: Exclude<JourneyIntent, null>;
  readonly now: string;
}

function blocked(
  reason: Extract<
    PublicExperienceRecordResult,
    { status: "blocked" }
  >["reason"],
  error: string,
): PublicExperienceRecordResult {
  return { status: "blocked", reason, error };
}

async function commit(
  repository: JourneyRepository,
  current: JourneyDocumentV1 | null,
  next: JourneyDocumentV1,
): Promise<
  | { readonly ok: true; readonly document: JourneyDocumentV1 }
  | { readonly ok: false; readonly result: PublicExperienceRecordResult }
> {
  const validated = validateCompareAndWriteJourneyInput({
    expectedRevision: expectedJourneyRevision(current),
    next,
  });
  if (!validated.ok) {
    return {
      ok: false,
      result: blocked("invalid-input", validated.reason),
    };
  }
  const result = await repository.compareAndWrite(validated.value);
  if (result.status === "committed") {
    return { ok: true, document: result.readback.value };
  }
  if (result.status === "conflict") {
    return {
      ok: false,
      result: blocked(
        "write-conflict",
        "Journey changed before the save completed",
      ),
    };
  }
  return {
    ok: false,
    result: blocked("write-failed", result.error),
  };
}

export async function recordPublicExperience(
  repository: JourneyRepository,
  input: PublicExperienceRecordInput,
): Promise<PublicExperienceRecordResult> {
  if (
    input.songRefs.length > 3 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.occurredAt)
  ) {
    return blocked(
      "invalid-input",
      "An exact time and at most three songs are required",
    );
  }
  const normalizedHighlight = input.highlight.trim();

  const read = await repository.read();
  if (read.status !== "absent" && read.status !== "valid") {
    return blocked(
      "storage-unreadable",
      "Journey storage is not writable in its current state",
    );
  }

  const current = read.status === "valid" ? read.value : null;
  const journey = recordPublicJourney(current, {
    journeyId: input.journeyId,
    reference: input.reference,
    now: input.now,
  });
  if (journey.status === "stale-reference") {
    return blocked(
      "stale-reference",
      "An older source revision is already recorded",
    );
  }
  const withEntry = addJourneyExperienceEntry(
    journey.document,
    journey.journeyId,
    {
      entryId: input.entryId,
      mode: input.mode,
      occurredAt: input.occurredAt,
      memo: "",
      highlights: normalizedHighlight === "" ? [] : [normalizedHighlight],
      songRefs: input.songRefs,
      now: input.now,
    },
  );
  const next =
    journey.status === "created"
      ? parseJourneyDocumentValue({
          ...withEntry,
          revision: journey.document.revision,
        })
      : withEntry;
  const committed = await commit(repository, current, next);
  if (!committed.ok) return committed.result;
  return {
    status: "saved",
    document: committed.document,
    journeyId: journey.journeyId,
  };
}

export async function recordPublicEventIntent(
  repository: JourneyRepository,
  input: PublicEventIntentInput,
): Promise<PublicExperienceRecordResult> {
  const read = await repository.read();
  if (read.status !== "absent" && read.status !== "valid") {
    return blocked(
      "storage-unreadable",
      "Journey storage is not writable in its current state",
    );
  }

  const current = read.status === "valid" ? read.value : null;
  const journey = recordPublicJourney(current, {
    journeyId: input.journeyId,
    reference: input.reference,
    now: input.now,
  });
  if (journey.status === "stale-reference") {
    return blocked(
      "stale-reference",
      "An older source revision is already recorded",
    );
  }

  const withIntent = updateJourneyIntent(
    journey.document,
    journey.journeyId,
    input.intent,
    input.now,
  );
  const next =
    journey.status === "created"
      ? parseJourneyDocumentValue({
          ...withIntent,
          revision: journey.document.revision,
        })
      : withIntent;
  const committed = await commit(repository, current, next);
  if (!committed.ok) return committed.result;
  return {
    status: "saved",
    document: committed.document,
    journeyId: journey.journeyId,
  };
}
