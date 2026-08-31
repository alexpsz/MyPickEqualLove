import {
  createEventEntityId,
  createPerformanceEntityId,
  isPublicAtlasSiteId,
  parseNamespacedEntityId,
  type NamespacedEntityId,
} from "../../contracts/identity.js";

export interface EventRouteParams {
  readonly siteId: string;
  readonly eventLocalId: string;
}

export interface PerformanceRouteParams extends EventRouteParams {
  readonly performanceLocalId: string;
}

export function eventHref(eventId: NamespacedEntityId<"event">): string {
  const parsed = parseNamespacedEntityId(eventId);
  if (!parsed.ok || parsed.value.kind !== "event") {
    throw new Error("A valid public Event id is required");
  }
  return `/events/${parsed.value.siteId}/${parsed.value.localId}/`;
}

export function performanceHref(
  performanceId: NamespacedEntityId<"performance">,
): string {
  const parsed = parseNamespacedEntityId(performanceId);
  if (!parsed.ok || parsed.value.kind !== "performance") {
    throw new Error("A valid public Performance id is required");
  }
  return `/events/${parsed.value.siteId}/${parsed.value.eventLocalId}/${parsed.value.localId}/`;
}

export function eventIdFromRoute(
  params: EventRouteParams,
): NamespacedEntityId<"event"> | null {
  if (!isPublicAtlasSiteId(params.siteId)) return null;
  try {
    return createEventEntityId(params.siteId, params.eventLocalId);
  } catch {
    return null;
  }
}

export function performanceIdFromRoute(
  params: PerformanceRouteParams,
): NamespacedEntityId<"performance"> | null {
  if (!isPublicAtlasSiteId(params.siteId)) return null;
  try {
    return createPerformanceEntityId(
      params.siteId,
      params.eventLocalId,
      params.performanceLocalId,
    );
  } catch {
    return null;
  }
}
