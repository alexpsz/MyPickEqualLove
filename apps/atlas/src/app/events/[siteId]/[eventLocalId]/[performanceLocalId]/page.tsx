import { notFound } from "next/navigation";

import { GENERATED_PUBLIC_ATLAS_PROJECTION } from "@/adapters/generated-public-projection-reader";
import { PerformanceDetailRoute } from "@/components/events/EventsRouteClient";
import { eventPresentationOptions } from "@/config/canonical-mypick-links";
import { mapPerformanceDetail } from "@/features/events/event-presentation";
import { performanceIdFromRoute } from "@/features/events/event-routes";

export const dynamicParams = false;

export function generateStaticParams() {
  return GENERATED_PUBLIC_ATLAS_PROJECTION.groups.flatMap((group) =>
    group.events.flatMap((event) =>
      event.performances.map((performance) => ({
        siteId: group.siteId,
        eventLocalId: event.id.split(":")[2],
        performanceLocalId: performance.id.split(":")[3],
      })),
    ),
  );
}

export default async function PerformancePage({
  params,
}: {
  readonly params: Promise<{
    siteId: string;
    eventLocalId: string;
    performanceLocalId: string;
  }>;
}) {
  const routeParams = await params;
  const performanceId = performanceIdFromRoute(routeParams);
  if (!performanceId) notFound();
  const projection = GENERATED_PUBLIC_ATLAS_PROJECTION;
  const performance = mapPerformanceDetail(
    projection,
    performanceId,
    eventPresentationOptions(projection),
  );
  if (!performance) notFound();
  return <PerformanceDetailRoute performance={performance} />;
}
