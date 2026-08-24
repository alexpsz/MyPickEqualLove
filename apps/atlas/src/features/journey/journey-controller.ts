import {
  parseJourneyDocumentValue,
  type ExperienceMode,
  type JourneyDocumentV1,
  type JourneyIntent,
  type JourneyRecord,
} from "../../contracts/journey-document.js";
import type { JourneyRevisionExpectation } from "../../ports/journey-repository.js";

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

export interface ExperienceEntryDraft {
  readonly entryId: string;
  readonly mode: ExperienceMode;
  readonly occurredAt: string;
  readonly memo: string;
  readonly highlights: readonly string[];
  readonly now: string;
}

export interface ExperienceEntryUpdate {
  readonly mode: ExperienceMode;
  readonly occurredAt: string;
  readonly memo: string;
  readonly highlights: readonly string[];
  readonly now: string;
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
          songRefs: [],
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
