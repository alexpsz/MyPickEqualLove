import {
  parseJourneyDocumentValue,
  type ExperienceMode,
  type JourneyDocumentReadResult,
  type JourneyDocumentV1,
  type JourneyIntent,
  type JourneyRecord,
} from "../../contracts/journey-document";
import {
  parsePublicReferenceValue,
  type PublicEntityReference,
} from "../../contracts/public-reference";
import type {
  JourneyRevisionExpectation,
  JourneyStorageExpectation,
} from "../../ports/journey-repository";

export interface LocalCustomJourneyDraft {
  readonly journeyId: string;
  readonly localEventId: string;
  readonly title: string;
  readonly date: string | null;
  readonly venueName: string | null;
  readonly intent: JourneyIntent;
  readonly now: string;
}

export interface LocalCustomSubjectDraft {
  readonly title: string;
  readonly date: string | null;
  readonly venueName: string | null;
  readonly now: string;
}

export interface PublicJourneyDraft {
  readonly journeyId: string;
  readonly reference: PublicEntityReference<"event" | "performance">;
  readonly now: string;
}

export type RecordPublicJourneyResult =
  | {
      readonly status: "created";
      readonly document: JourneyDocumentV1;
      readonly journeyId: string;
    }
  | {
      readonly status: "existing" | "stale-reference";
      readonly document: JourneyDocumentV1;
      readonly journeyId: string;
    };

export interface ExperienceEntryDraft {
  readonly entryId: string;
  readonly mode: ExperienceMode;
  readonly occurredAt: string;
  readonly memo: string;
  readonly highlights: readonly string[];
  readonly songRefs?: readonly PublicEntityReference<"song">[];
  readonly now: string;
}

export interface ExperienceEntryUpdate {
  readonly mode: ExperienceMode;
  readonly occurredAt: string;
  readonly memo: string;
  readonly highlights: readonly string[];
  readonly songRefs?: readonly PublicEntityReference<"song">[];
  readonly now: string;
}

export interface JourneyInteractionBinding {
  readonly revision: number | null;
  readonly generation: number;
}

export type JourneyInteractionBindingResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "revision-changed" | "session-invalidated";
    };

export type JourneyRestoreSession<T> =
  | { readonly status: "idle" }
  | {
      readonly status: "ready";
      readonly binding: JourneyInteractionBinding;
      readonly plan: T;
    };

export type JourneyRestoreConsumption<T> =
  | { readonly status: "empty"; readonly next: JourneyRestoreSession<T> }
  | { readonly status: "stale"; readonly next: JourneyRestoreSession<T> }
  | {
      readonly status: "consumed";
      readonly plan: T;
      readonly next: JourneyRestoreSession<T>;
    };

export function bindJourneyInteraction(
  revision: number | null,
  generation: number,
): JourneyInteractionBinding {
  if (revision !== null && (!Number.isInteger(revision) || revision < 0)) {
    throw new Error("A null or non-negative Journey revision is required");
  }
  if (!Number.isInteger(generation) || generation < 0) {
    throw new Error("A non-negative interaction generation is required");
  }
  return { revision, generation };
}

export function validateJourneyInteractionBinding(
  binding: JourneyInteractionBinding,
  current: JourneyInteractionBinding,
): JourneyInteractionBindingResult {
  if (binding.generation !== current.generation) {
    return { ok: false, reason: "session-invalidated" };
  }
  if (binding.revision !== current.revision) {
    return { ok: false, reason: "revision-changed" };
  }
  return { ok: true };
}

export function nextJourneyInteractionGeneration(current: number) {
  if (!Number.isInteger(current) || current < 0) {
    throw new Error("A non-negative interaction generation is required");
  }
  return current + 1;
}

export function idleJourneyRestoreSession<T>(): JourneyRestoreSession<T> {
  return { status: "idle" };
}

export function stageJourneyRestorePlan<T>(
  binding: JourneyInteractionBinding,
  plan: T,
): JourneyRestoreSession<T> {
  return { status: "ready", binding, plan };
}

export function clearJourneyRestorePlan<T>(): JourneyRestoreSession<T> {
  return idleJourneyRestoreSession<T>();
}

export function consumeJourneyRestorePlan<T>(
  session: JourneyRestoreSession<T>,
  current: JourneyInteractionBinding,
): JourneyRestoreConsumption<T> {
  const next = idleJourneyRestoreSession<T>();
  if (session.status === "idle") return { status: "empty", next };
  if (!validateJourneyInteractionBinding(session.binding, current).ok) {
    return { status: "stale", next };
  }
  return { status: "consumed", plan: session.plan, next };
}

function normalizeRequiredText(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("A title is required");
  }
  return normalized;
}

function normalizeNullableText(value: string | null) {
  if (value === null) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length === 0 ? null : normalized;
}

function normalizeHighlights(values: readonly string[]) {
  const normalized = values
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value) => value.length > 0);
  return [...new Set(normalized)];
}

function normalizeSongReferences(
  values: readonly PublicEntityReference<"song">[],
) {
  const normalized: PublicEntityReference<"song">[] = [];
  const revisionsByEntity = new Map<string, string>();
  for (const [index, value] of values.entries()) {
    const reference = parsePublicReferenceValue(value, `$.songRefs[${index}]`, [
      "song",
    ]);
    const knownRevision = revisionsByEntity.get(reference.entityId);
    if (
      knownRevision !== undefined &&
      knownRevision !== reference.sourceRevision
    ) {
      throw new Error("One song cannot use multiple source revisions");
    }
    if (knownRevision === undefined) {
      revisionsByEntity.set(reference.entityId, reference.sourceRevision);
      normalized.push(reference);
    }
  }
  return normalized;
}

function nextDocument(
  current: JourneyDocumentV1 | null,
  journeys: readonly JourneyRecord[],
  now: string,
) {
  return parseJourneyDocumentValue({
    schemaVersion: 1,
    revision: current === null ? 0 : current.revision + 1,
    updatedAt: now,
    journeys,
  });
}

function replaceJourney(
  current: JourneyDocumentV1,
  journeyId: string,
  update: (journey: JourneyRecord) => JourneyRecord,
  now: string,
) {
  const index = current.journeys.findIndex(
    (journey) => journey.id === journeyId,
  );
  if (index < 0) {
    throw new Error("Journey record no longer exists");
  }
  return nextDocument(
    current,
    current.journeys.map((journey, journeyIndex) =>
      journeyIndex === index ? update(journey) : journey,
    ),
    now,
  );
}

export function expectedJourneyRevision(
  current: JourneyDocumentV1 | null,
): JourneyRevisionExpectation {
  return current === null
    ? { state: "absent" }
    : { state: "present", revision: current.revision };
}

export function expectedJourneyStorage(
  read: JourneyDocumentReadResult,
): JourneyStorageExpectation | null {
  if (read.status === "absent") return { state: "absent" };
  if (read.status === "valid") {
    return { state: "present", revision: read.value.revision };
  }
  if (
    read.status === "corrupt" ||
    read.status === "future-version" ||
    read.status === "invalid"
  ) {
    return { state: "unreadable", status: read.status, raw: read.raw };
  }
  return null;
}

export function createLocalCustomJourney(
  current: JourneyDocumentV1 | null,
  draft: LocalCustomJourneyDraft,
) {
  const journey: JourneyRecord = {
    id: draft.journeyId,
    subject: {
      kind: "local-custom-event",
      localId: draft.localEventId,
      fallback: {
        title: normalizeRequiredText(draft.title),
        date: draft.date,
        venueName: normalizeNullableText(draft.venueName),
      },
    },
    intent: draft.intent,
    experienceEntries: [],
    createdAt: draft.now,
    updatedAt: draft.now,
  };
  return nextDocument(
    current,
    [...(current?.journeys ?? []), journey],
    draft.now,
  );
}

export function recordPublicJourney(
  current: JourneyDocumentV1 | null,
  draft: PublicJourneyDraft,
): RecordPublicJourneyResult {
  const reference = parsePublicReferenceValue(draft.reference, "$.reference", [
    "event",
    "performance",
  ]);
  const existing = current?.journeys.find(
    (journey) =>
      journey.subject.kind === "public-reference" &&
      journey.subject.reference.entityId === reference.entityId,
  );
  if (current !== null && existing !== undefined) {
    return {
      status:
        existing.subject.kind === "public-reference" &&
        existing.subject.reference.sourceRevision === reference.sourceRevision
          ? "existing"
          : "stale-reference",
      document: current,
      journeyId: existing.id,
    };
  }

  const journey: JourneyRecord = {
    id: draft.journeyId,
    subject: { kind: "public-reference", reference },
    intent: null,
    experienceEntries: [],
    createdAt: draft.now,
    updatedAt: draft.now,
  };
  return {
    status: "created",
    document: nextDocument(
      current,
      [...(current?.journeys ?? []), journey],
      draft.now,
    ),
    journeyId: draft.journeyId,
  };
}

export function updateLocalCustomSubject(
  current: JourneyDocumentV1,
  journeyId: string,
  draft: LocalCustomSubjectDraft,
) {
  return replaceJourney(
    current,
    journeyId,
    (journey) => {
      if (journey.subject.kind !== "local-custom-event") {
        throw new Error("Public Journey subjects cannot be edited locally");
      }
      return {
        ...journey,
        subject: {
          ...journey.subject,
          fallback: {
            title: normalizeRequiredText(draft.title),
            date: draft.date,
            venueName: normalizeNullableText(draft.venueName),
          },
        },
        updatedAt: draft.now,
      };
    },
    draft.now,
  );
}

export function updateJourneyIntent(
  current: JourneyDocumentV1,
  journeyId: string,
  intent: JourneyIntent,
  now: string,
) {
  return replaceJourney(
    current,
    journeyId,
    (journey) => ({ ...journey, intent, updatedAt: now }),
    now,
  );
}

export function addJourneyExperienceEntry(
  current: JourneyDocumentV1,
  journeyId: string,
  draft: ExperienceEntryDraft,
) {
  return replaceJourney(
    current,
    journeyId,
    (journey) => ({
      ...journey,
      experienceEntries: [
        ...journey.experienceEntries,
        {
          id: draft.entryId,
          mode: draft.mode,
          occurredAt: draft.occurredAt,
          memo: draft.memo.trim(),
          highlights: normalizeHighlights(draft.highlights),
          songRefs: normalizeSongReferences(draft.songRefs ?? []),
          createdAt: draft.now,
          updatedAt: draft.now,
        },
      ],
      updatedAt: draft.now,
    }),
    draft.now,
  );
}

export function updateJourneyExperienceEntry(
  current: JourneyDocumentV1,
  journeyId: string,
  entryId: string,
  draft: ExperienceEntryUpdate,
) {
  return replaceJourney(
    current,
    journeyId,
    (journey) => {
      const entryIndex = journey.experienceEntries.findIndex(
        (entry) => entry.id === entryId,
      );
      if (entryIndex < 0) {
        throw new Error("Experience entry no longer exists");
      }
      return {
        ...journey,
        experienceEntries: journey.experienceEntries.map((entry, index) =>
          index === entryIndex
            ? {
                ...entry,
                mode: draft.mode,
                occurredAt: draft.occurredAt,
                memo: draft.memo.trim(),
                highlights: normalizeHighlights(draft.highlights),
                songRefs:
                  draft.songRefs === undefined
                    ? entry.songRefs
                    : normalizeSongReferences(draft.songRefs),
                updatedAt: draft.now,
              }
            : entry,
        ),
        updatedAt: draft.now,
      };
    },
    draft.now,
  );
}

export function deleteJourneyExperienceEntry(
  current: JourneyDocumentV1,
  journeyId: string,
  entryId: string,
  now: string,
) {
  return replaceJourney(
    current,
    journeyId,
    (journey) => {
      if (!journey.experienceEntries.some((entry) => entry.id === entryId)) {
        throw new Error("Experience entry no longer exists");
      }
      return {
        ...journey,
        experienceEntries: journey.experienceEntries.filter(
          (entry) => entry.id !== entryId,
        ),
        updatedAt: now,
      };
    },
    now,
  );
}

export function deleteJourneyRecord(
  current: JourneyDocumentV1,
  journeyId: string,
  now: string,
) {
  if (!current.journeys.some((journey) => journey.id === journeyId)) {
    throw new Error("Journey record no longer exists");
  }
  return nextDocument(
    current,
    current.journeys.filter((journey) => journey.id !== journeyId),
    now,
  );
}

export function timelineDateForJourney(journey: JourneyRecord) {
  const latestExperience = journey.experienceEntries.reduce<string | null>(
    (latest, entry) =>
      latest === null || entry.occurredAt > latest ? entry.occurredAt : latest,
    null,
  );
  if (latestExperience !== null) return latestExperience;
  const subjectDate =
    journey.subject.kind === "local-custom-event"
      ? journey.subject.fallback.date
      : journey.subject.reference.fallback.date;
  return subjectDate ?? journey.updatedAt;
}

export function sortJourneysForTimeline(journeys: readonly JourneyRecord[]) {
  return [...journeys].sort((left, right) => {
    const dateOrder = timelineDateForJourney(right).localeCompare(
      timelineDateForJourney(left),
    );
    return dateOrder === 0
      ? right.updatedAt.localeCompare(left.updatedAt)
      : dateOrder;
  });
}
