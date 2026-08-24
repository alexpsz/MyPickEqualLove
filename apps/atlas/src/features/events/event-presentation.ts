import type {
  ProjectionEvent,
  ProjectionExcludedItem,
  ProjectionGroup,
  ProjectionPerformance,
  ProjectionSetlistEntry,
  ProjectionUnresolvedItem,
  PublicAtlasProjectionV1,
} from "../../contracts/public-atlas-projection.js";
import type {
  AtlasLifecycle,
  AtlasVerificationStatus,
  ProjectionCoverage,
} from "../../contracts/public-atlas-projection.js";
import {
  parseNamespacedEntityId,
  type NamespacedEntityId,
  type PublicAtlasSiteId,
} from "../../contracts/identity.js";
import type {
  PublicEntityReference,
  ReadableFallbackSnapshot,
} from "../../contracts/public-reference.js";

export interface EventEvidenceViewModel {
  readonly verificationStatus: AtlasVerificationStatus;
  readonly sourceUrls: readonly string[];
  readonly coverage: ProjectionCoverage;
  readonly excluded: readonly ProjectionExcludedItem[];
  readonly unresolved: readonly ProjectionUnresolvedItem[];
}

export type EventRecordAction =
  | {
      readonly kind: "record-event";
      readonly reference: PublicEntityReference<"event">;
    }
  | {
      readonly kind: "record-performance";
      readonly reference: PublicEntityReference<"performance">;
    };

export type EventRecordHandler = (action: EventRecordAction) => void;

export interface ExactCanonicalSongLink {
  readonly entityId: NamespacedEntityId<"song">;
  readonly sourceRevision: string;
  readonly canonicalHref: string;
}

/**
 * An explicit coordinator-supplied policy, expected to be backed by the
 * registry adapter. Mapping rows never establish their own trusted origin.
 */
export type CanonicalSongSiteOrigins = Readonly<
  Partial<Record<PublicAtlasSiteId, string>>
>;

export interface EventPresentationOptions {
  readonly canonicalSongLinks?: readonly ExactCanonicalSongLink[];
  readonly canonicalSongSiteOrigins?: CanonicalSongSiteOrigins;
}

export interface EventListItemViewModel {
  readonly eventId: NamespacedEntityId<"event">;
  readonly groupName: string;
  readonly eventName: string;
  readonly venueName: string;
  readonly dateRange: string;
  readonly timezone: string;
  readonly lifecycle: AtlasLifecycle;
  readonly performanceCount: number;
  readonly isEventOnly: boolean;
  readonly evidence: EventEvidenceViewModel;
  readonly recordAction: EventRecordAction;
}

export interface PerformanceSummaryViewModel {
  readonly performanceId: NamespacedEntityId<"performance">;
  readonly performanceName: string;
  readonly venueName: string;
  readonly date: string;
  readonly timezone: string;
  readonly lifecycle: AtlasLifecycle;
  readonly setlistCount: number;
  readonly evidence: EventEvidenceViewModel;
  readonly recordAction: EventRecordAction;
}

export interface EventDetailViewModel extends EventListItemViewModel {
  readonly performances: readonly PerformanceSummaryViewModel[];
}

export interface SetlistSongViewModel {
  readonly order: number;
  readonly songReference: PublicEntityReference<"song">;
  readonly songTitle: string;
  readonly canonicalSongHref: string | null;
}

export interface PerformanceDetailViewModel extends PerformanceSummaryViewModel {
  readonly groupName: string;
  readonly eventId: NamespacedEntityId<"event">;
  readonly eventName: string;
  readonly eventDateRange: string;
  readonly isSetlistAvailable: boolean;
  readonly setlist: readonly SetlistSongViewModel[];
}

function dateRangeLabel(dates: ProjectionEvent["dates"]): string {
  return dates.start === dates.end
    ? dates.start
    : `${dates.start} — ${dates.end}`;
}

function evidenceOf(
  item: Pick<
    ProjectionEvent | ProjectionPerformance,
    "verificationStatus" | "sourceUrls" | "coverage" | "excluded" | "unresolved"
  >,
): EventEvidenceViewModel {
  return {
    verificationStatus: item.verificationStatus,
    sourceUrls: item.sourceUrls,
    coverage: item.coverage,
    excluded: item.excluded,
    unresolved: item.unresolved,
  };
}

function eventFallback(
  groupName: string,
  event: ProjectionEvent,
): ReadableFallbackSnapshot {
  return {
    groupName,
    title: event.displayName,
    date: event.dates.start,
    venueName: event.venue.displayName,
  };
}

function performanceFallback(
  groupName: string,
  event: ProjectionEvent,
  performance: ProjectionPerformance,
): ReadableFallbackSnapshot {
  return {
    groupName,
    title: `${event.displayName} — ${performance.displayName}`,
    date: performance.date,
    venueName: performance.venue.displayName,
  };
}

function eventAction(
  group: ProjectionGroup,
  event: ProjectionEvent,
  sourceRevision: string,
): EventRecordAction {
  return {
    kind: "record-event",
    reference: {
      entityId: event.id,
      sourceRevision,
      fallback: eventFallback(group.displayName, event),
    },
  };
}

function performanceAction(
  group: ProjectionGroup,
  event: ProjectionEvent,
  performance: ProjectionPerformance,
  sourceRevision: string,
): EventRecordAction {
  return {
    kind: "record-performance",
    reference: {
      entityId: performance.id,
      sourceRevision,
      fallback: performanceFallback(group.displayName, event, performance),
    },
  };
}

function mapEventSummary(
  group: ProjectionGroup,
  event: ProjectionEvent,
  sourceRevision: string,
): EventListItemViewModel {
  return {
    eventId: event.id,
    groupName: group.displayName,
    eventName: event.displayName,
    venueName: event.venue.displayName,
    dateRange: dateRangeLabel(event.dates),
    timezone: event.timezone,
    lifecycle: event.lifecycle,
    performanceCount: event.performances.length,
    isEventOnly: event.performances.length === 0,
    evidence: evidenceOf(event),
    recordAction: eventAction(group, event, sourceRevision),
  };
}

function mapPerformanceSummary(
  group: ProjectionGroup,
  event: ProjectionEvent,
  performance: ProjectionPerformance,
  sourceRevision: string,
): PerformanceSummaryViewModel {
  return {
    performanceId: performance.id,
    performanceName: performance.displayName,
    venueName: performance.venue.displayName,
    date: performance.date,
    timezone: performance.timezone,
    lifecycle: performance.lifecycle,
    setlistCount: performance.setlist.length,
    evidence: evidenceOf(performance),
    recordAction: performanceAction(group, event, performance, sourceRevision),
  };
}

function parseTrustedSiteOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.pathname !== "/" ||
      url.href !== `${url.origin}/`
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * A song link is intentionally unavailable unless an explicit site-origin
 * policy and exactly one full-ID mapping agree with the accepted reference.
 */
export function resolveExactCanonicalSongHref(
  songReference: PublicEntityReference<"song">,
  canonicalSongLinks: readonly ExactCanonicalSongLink[] = [],
  canonicalSongSiteOrigins?: CanonicalSongSiteOrigins,
): string | null {
  const parsedSongId = parseNamespacedEntityId(songReference.entityId);
  if (!parsedSongId.ok || parsedSongId.value.kind !== "song") {
    return null;
  }

  const candidatesForSong = canonicalSongLinks.filter(
    (candidate) => candidate.entityId === songReference.entityId,
  );
  if (candidatesForSong.length !== 1) {
    return null;
  }

  const candidate = candidatesForSong[0];
  if (candidate.sourceRevision !== songReference.sourceRevision) {
    return null;
  }

  const trustedOrigin = parseTrustedSiteOrigin(
    canonicalSongSiteOrigins?.[parsedSongId.value.siteId],
  );
  if (!trustedOrigin) {
    return null;
  }

  try {
    const url = new URL(candidate.canonicalHref);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.origin !== trustedOrigin ||
      url.pathname !== `/songs/${parsedSongId.value.localId}/`
    ) {
      return null;
    }
    return candidate.canonicalHref;
  } catch {
    return null;
  }
}

function mapSetlistEntry(
  entry: ProjectionSetlistEntry,
  options: EventPresentationOptions,
): SetlistSongViewModel {
  return {
    order: entry.order,
    songReference: entry.songRef,
    songTitle: entry.songRef.fallback.title,
    canonicalSongHref: resolveExactCanonicalSongHref(
      entry.songRef,
      options.canonicalSongLinks,
      options.canonicalSongSiteOrigins,
    ),
  };
}

function findEvent(
  projection: PublicAtlasProjectionV1,
  eventId: NamespacedEntityId<"event">,
): { readonly group: ProjectionGroup; readonly event: ProjectionEvent } | null {
  for (const group of projection.groups) {
    const event = group.events.find((candidate) => candidate.id === eventId);
    if (event) {
      return { group, event };
    }
  }
  return null;
}

function findPerformance(
  projection: PublicAtlasProjectionV1,
  performanceId: NamespacedEntityId<"performance">,
): {
  readonly group: ProjectionGroup;
  readonly event: ProjectionEvent;
  readonly performance: ProjectionPerformance;
} | null {
  for (const group of projection.groups) {
    for (const event of group.events) {
      const performance = event.performances.find(
        (candidate) => candidate.id === performanceId,
      );
      if (performance) {
        return { group, event, performance };
      }
    }
  }
  return null;
}

/** Maps only a C0-accepted projection; it never parses authoring data. */
export function mapEventList(
  projection: PublicAtlasProjectionV1,
): readonly EventListItemViewModel[] {
  return projection.groups.flatMap((group) =>
    group.events.map((event) =>
      mapEventSummary(group, event, projection.sourceRevision),
    ),
  );
}

export function mapEventDetail(
  projection: PublicAtlasProjectionV1,
  eventId: NamespacedEntityId<"event">,
): EventDetailViewModel | null {
  const found = findEvent(projection, eventId);
  if (!found) {
    return null;
  }
  return {
    ...mapEventSummary(found.group, found.event, projection.sourceRevision),
    performances: found.event.performances.map((performance) =>
      mapPerformanceSummary(
        found.group,
        found.event,
        performance,
        projection.sourceRevision,
      ),
    ),
  };
}

export function mapPerformanceDetail(
  projection: PublicAtlasProjectionV1,
  performanceId: NamespacedEntityId<"performance">,
  options: EventPresentationOptions = {},
): PerformanceDetailViewModel | null {
  const found = findPerformance(projection, performanceId);
  if (!found) {
    return null;
  }
  return {
    ...mapPerformanceSummary(
      found.group,
      found.event,
      found.performance,
      projection.sourceRevision,
    ),
    groupName: found.group.displayName,
    eventId: found.event.id,
    eventName: found.event.displayName,
    eventDateRange: dateRangeLabel(found.event.dates),
    isSetlistAvailable: found.performance.setlist.length > 0,
    setlist: found.performance.setlist.map((entry) =>
      mapSetlistEntry(entry, options),
    ),
  };
}
