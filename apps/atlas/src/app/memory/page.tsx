import type { Metadata } from "next";

import { GENERATED_PUBLIC_ATLAS_PROJECTION } from "@/adapters/generated-public-projection-reader";
import {
  MemoryRouteClient,
  type MemoryRouteContextRecord,
} from "@/components/memory/MemoryRouteClient";
import { eventPresentationOptions } from "@/config/canonical-mypick-links";
import {
  mapEventDetail,
  resolveStaticPublicReference,
} from "@/features/events/event-presentation";
import type { PublicEntityReference } from "@/contracts/public-reference";

export const metadata: Metadata = {
  title: "Memory | Atlas",
  description: "Turn one saved Atlas experience into a Memory PNG.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

function projectionReferences() {
  const projection = GENERATED_PUBLIC_ATLAS_PROJECTION;
  const options = eventPresentationOptions(projection);

  return projection.groups.flatMap((group) =>
    group.events.flatMap((event) => {
      const detail = mapEventDetail(projection, event.id, options);
      if (detail === null) return [];
      return [
        detail.recordAction.reference,
        ...detail.performances.map(
          (performance) => performance.recordAction.reference,
        ),
      ];
    }),
  );
}

function contextRecordFor(
  projection: typeof GENERATED_PUBLIC_ATLAS_PROJECTION,
  options: ReturnType<typeof eventPresentationOptions>,
  reference: PublicEntityReference<"event" | "performance">,
): MemoryRouteContextRecord | null {
  const resolved = resolveStaticPublicReference(projection, reference, options);
  if (resolved.status !== "resolved") return null;

  const date = resolved.performance?.date ?? reference.fallback.date;
  if (date === null) return null;

  return {
    entityId: reference.entityId,
    sourceRevision: resolved.sourceRevision,
    groupName: resolved.groupName,
    eventName: resolved.event.name,
    performanceName: resolved.performance?.name ?? null,
    date,
    venueName: resolved.performance?.venueName ?? resolved.event.venueName,
    exactMyPickHref: resolved.canonicalEventHref,
  };
}

function createContextRecords(): readonly MemoryRouteContextRecord[] {
  const projection = GENERATED_PUBLIC_ATLAS_PROJECTION;
  const options = eventPresentationOptions(projection);

  return projectionReferences().flatMap((reference) => {
    const record = contextRecordFor(projection, options, reference);
    return record === null ? [] : [record];
  });
}

export default function MemoryRoute() {
  const projection = GENERATED_PUBLIC_ATLAS_PROJECTION;
  return (
    <MemoryRouteClient
      contextRecords={createContextRecords()}
      sourceRevision={projection.sourceRevision}
    />
  );
}
