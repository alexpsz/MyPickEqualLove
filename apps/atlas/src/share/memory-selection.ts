import {
  MEMORY_SNAPSHOT_SCHEMA_VERSION,
  parseMemorySnapshot,
  type MemorySnapshotV1,
} from "../contracts/memory-snapshot.js";
import type {
  ExperienceMode,
  JourneyDocumentReadResult,
  JourneyDocumentV1,
} from "../contracts/journey-document.js";

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
  readonly mode: ExperienceMode;
  readonly highlights: readonly string[];
  readonly songs: readonly MemorySourceSong[];
}

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

function candidatesFromDocument(
  document: JourneyDocumentV1,
): readonly MemorySourceCandidate[] {
  const candidates: MemorySourceCandidate[] = [];

  for (const journey of document.journeys) {
    const subject = journey.subject;
    const fallback =
      subject.kind === "local-custom-event"
        ? subject.fallback
        : subject.reference.fallback;

    for (const entry of journey.experienceEntries) {
      candidates.push({
        event: {
          groupName:
            subject.kind === "local-custom-event"
              ? null
              : subject.reference.fallback.groupName,
          eventName: fallback.title,
          date: fallback.date ?? occurredDate(entry.occurredAt),
          // Public performance fallbacks intentionally remain one readable
          // title. The C0 reference contract does not expose a second trusted
          // event/performance split, so this renderer does not infer one.
          performanceName: null,
        },
        mode: entry.mode,
        highlights: [...entry.highlights],
        songs: entry.songRefs.map((songRef) => ({
          groupName: songRef.fallback.groupName,
          title: songRef.fallback.title,
        })),
      });
    }
  }

  return candidates;
}

export function createMemorySourceCandidates(
  read: JourneyDocumentReadResult,
): MemoryCandidateReadResult {
  if (read.status === "absent") {
    return { status: "empty" };
  }
  if (read.status !== "valid") {
    return { status: "unavailable" };
  }

  const candidates = candidatesFromDocument(read.value);
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
  const summary = selection.summary.trim();
  if (
    highlightIndexes === null ||
    songIndexes === null ||
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
