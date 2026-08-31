import {
  MEMORY_NICKNAME_MAX_LENGTH,
  MEMORY_SNAPSHOT_SCHEMA_VERSION,
  normalizeMemoryNickname,
  parseMemorySnapshot,
  type MemorySnapshotV1,
} from "../contracts/memory-snapshot.js";
import type {
  ExperienceMode,
  JourneyDocumentReadResult,
  JourneyDocumentV1,
} from "../contracts/journey-document.js";
import type { PublicEntityReference } from "../contracts/public-reference.js";

export const MEMORY_SONG_LIMIT = 3 as const;

export interface MemorySourceEvent {
  readonly groupName: string | null;
  readonly eventName: string;
  readonly date: string;
  readonly performanceName: string | null;
}

export interface MemorySourceSong {
  readonly groupName: string;
  readonly title: string;
}

/**
 * A deliberately lossy, read-only projection of one real Journey experience.
 * It has no Journey ids, memo, intent, revision, raw storage, or unknown fields.
 */
export interface MemorySourceCandidate {
  readonly event: MemorySourceEvent;
  readonly venueName: string | null;
  readonly mode: ExperienceMode;
  readonly highlights: readonly string[];
  readonly songs: readonly MemorySourceSong[];
  /** UI-only; createMemorySnapshot deliberately never copies this href. */
  readonly exactMyPickHref: string | null;
}

export interface ResolvedMemoryPublicContext {
  readonly reference: PublicEntityReference<"event" | "performance">;
  readonly groupName: string;
  readonly eventName: string;
  readonly performanceName: string | null;
  readonly date: string;
  readonly venueName: string | null;
  /** Already policy-checked by the integration owner. */
  readonly exactMyPickHref: string | null;
}

export type MemoryPublicContextResolution =
  | {
      readonly status: "resolved";
      readonly context: ResolvedMemoryPublicContext;
    }
  | { readonly status: "stale" | "missing" };

export type MemoryPublicContextResolver = (
  reference: PublicEntityReference<"event" | "performance">,
) => MemoryPublicContextResolution;

export type MemoryCandidateReadResult =
  | {
      readonly status: "ready";
      readonly candidates: readonly MemorySourceCandidate[];
    }
  | { readonly status: "empty" }
  | { readonly status: "unavailable" };

export interface MemoryDisclosureSelection {
  readonly includePerformanceName: boolean;
  readonly includeMode: boolean;
  readonly nickname: string;
  readonly highlightIndexes: readonly number[];
  readonly songIndexes: readonly number[];
  readonly includeSummary: boolean;
  readonly summary: string;
}

export type MemorySnapshotBuildResult =
  | { readonly ok: true; readonly snapshot: MemorySnapshotV1 }
  | {
      readonly ok: false;
      readonly reason: "invalid-selection" | "invalid-snapshot";
    };

function occurredDate(occurredAt: string) {
  return occurredAt.slice(0, 10);
}

function exactMyPickHref(value: string | null) {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      /^\/live\/[a-z0-9-]+\/$/.test(url.pathname)
      ? value
      : null;
  } catch {
    return null;
  }
}

function resolvePublicCandidateEvent(
  reference: PublicEntityReference<"event" | "performance">,
  experienceDate: string,
  resolvePublicContext: MemoryPublicContextResolver | undefined,
): {
  readonly event: MemorySourceEvent;
  readonly venueName: string | null;
  readonly exactMyPickHref: string | null;
} {
  const fallback = reference.fallback;
  const fallbackResult = {
    event: {
      groupName: fallback.groupName,
      eventName: fallback.title,
      date: fallback.date ?? experienceDate,
      performanceName: null,
    },
    venueName: null,
    exactMyPickHref: null,
  };
  const resolution = resolvePublicContext?.(reference);
  if (resolution?.status !== "resolved") return fallbackResult;

  const context = resolution.context;
  if (
    context.reference.entityId !== reference.entityId ||
    context.reference.sourceRevision !== reference.sourceRevision
  ) {
    return fallbackResult;
  }

  return {
    event: {
      groupName: context.groupName,
      eventName: context.eventName,
      date: context.date,
      performanceName: context.performanceName,
    },
    venueName: context.venueName,
    exactMyPickHref: exactMyPickHref(context.exactMyPickHref),
  };
}

function candidatesFromDocument(
  document: JourneyDocumentV1,
  resolvePublicContext: MemoryPublicContextResolver | undefined,
): readonly MemorySourceCandidate[] {
  const candidates: MemorySourceCandidate[] = [];

  for (const journey of document.journeys) {
    const subject = journey.subject;

    for (const entry of journey.experienceEntries) {
      const context =
        subject.kind === "public-reference"
          ? resolvePublicCandidateEvent(
              subject.reference,
              occurredDate(entry.occurredAt),
              resolvePublicContext,
            )
          : {
              event: {
                groupName: null,
                eventName: subject.fallback.title,
                date: subject.fallback.date ?? occurredDate(entry.occurredAt),
                performanceName: null,
              },
              venueName: null,
              exactMyPickHref: null,
            };
      candidates.push({
        event: context.event,
        venueName: context.venueName,
        mode: entry.mode,
        highlights: [...entry.highlights],
        songs: entry.songRefs.slice(0, MEMORY_SONG_LIMIT).map((songRef) => ({
          groupName: songRef.fallback.groupName,
          title: songRef.fallback.title,
        })),
        exactMyPickHref: context.exactMyPickHref,
      });
    }
  }

  return candidates;
}

export function createMemorySourceCandidates(
  read: JourneyDocumentReadResult,
  resolvePublicContext?: MemoryPublicContextResolver,
): MemoryCandidateReadResult {
  if (read.status === "absent") {
    return { status: "empty" };
  }
  if (read.status !== "valid") {
    return { status: "unavailable" };
  }

  const candidates = candidatesFromDocument(read.value, resolvePublicContext);
  return candidates.length > 0
    ? { status: "ready", candidates }
    : { status: "empty" };
}

function selectedIndexes(
  indexes: readonly number[],
  itemCount: number,
): Set<number> | null {
  const selected = new Set<number>();
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= itemCount) {
      return null;
    }
    selected.add(index);
  }
  return selected.size === indexes.length ? selected : null;
}

export function createMemorySnapshot(
  candidate: MemorySourceCandidate,
  selection: MemoryDisclosureSelection,
  localGroupName: string,
): MemorySnapshotBuildResult {
  const highlightIndexes = selectedIndexes(
    selection.highlightIndexes,
    candidate.highlights.length,
  );
  const songIndexes = selectedIndexes(
    selection.songIndexes,
    candidate.songs.length,
  );
  const nickname = normalizeMemoryNickname(selection.nickname);
  const summary = selection.summary.trim();
  if (
    highlightIndexes === null ||
    songIndexes === null ||
    selection.nickname.length > MEMORY_NICKNAME_MAX_LENGTH ||
    highlightIndexes.size > 1 ||
    songIndexes.size > MEMORY_SONG_LIMIT ||
    (selection.includePerformanceName &&
      candidate.event.performanceName === null) ||
    (selection.includeSummary && summary.length === 0)
  ) {
    return { ok: false, reason: "invalid-selection" };
  }

  const parsed = parseMemorySnapshot({
    schemaVersion: MEMORY_SNAPSHOT_SCHEMA_VERSION,
    event: {
      groupName: candidate.event.groupName ?? localGroupName,
      eventName: candidate.event.eventName,
      date: candidate.event.date,
      performanceName: selection.includePerformanceName
        ? candidate.event.performanceName
        : null,
    },
    selected: {
      nickname: nickname.length > 0 ? { consent: true, value: nickname } : null,
      mode: selection.includeMode
        ? { consent: true, value: candidate.mode }
        : null,
      highlights: candidate.highlights.flatMap((highlight, index) =>
        highlightIndexes.has(index)
          ? [{ consent: true as const, value: highlight }]
          : [],
      ),
      songs: candidate.songs.flatMap((song, index) =>
        songIndexes.has(index)
          ? [{ consent: true as const, value: { ...song } }]
          : [],
      ),
      summary: selection.includeSummary
        ? { consent: true, value: summary }
        : null,
    },
  });

  return parsed.ok
    ? { ok: true, snapshot: parsed.value }
    : { ok: false, reason: "invalid-snapshot" };
}
