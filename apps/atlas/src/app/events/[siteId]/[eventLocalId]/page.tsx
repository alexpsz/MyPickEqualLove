import { notFound } from "next/navigation";

import { GENERATED_PUBLIC_ATLAS_PROJECTION } from "@/adapters/generated-public-projection-reader";
import { EventDetailRoute } from "@/components/events/EventsRouteClient";
import { eventPresentationOptions } from "@/config/canonical-mypick-links";
import { mapEventDetail } from "@/features/events/event-presentation";
import { eventIdFromRoute } from "@/features/events/event-routes";

export const dynamicParams = false;

export function generateStaticParams() {
  return GENERATED_PUBLIC_ATLAS_PROJECTION.groups.flatMap((group) =>
    group.events.map((event) => ({
      siteId: group.siteId,
      eventLocalId: event.id.split(":")[2],
    })),
  );
}

export default async function EventPage({
  params,
}: {
  readonly params: Promise<{ siteId: string; eventLocalId: string }>;
}) {
  const routeParams = await params;
  const eventId = eventIdFromRoute(routeParams);
  if (!eventId) notFound();
  const projection = GENERATED_PUBLIC_ATLAS_PROJECTION;
  const event = mapEventDetail(
    projection,
    eventId,
    eventPresentationOptions(projection),
  );
  if (!event) notFound();
  return <EventDetailRoute event={event} />;
}
