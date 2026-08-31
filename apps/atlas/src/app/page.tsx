import { GENERATED_PUBLIC_ATLAS_PROJECTION } from "@/adapters/generated-public-projection-reader";
import { EventsIndexRoute } from "@/components/events/EventsRouteClient";
import { eventPresentationOptions } from "@/config/canonical-mypick-links";
import { mapEventList } from "@/features/events/event-presentation";

export default function Home() {
  const projection = GENERATED_PUBLIC_ATLAS_PROJECTION;
  return (
    <EventsIndexRoute
      events={mapEventList(projection, eventPresentationOptions(projection))}
    />
  );
}
