"use client";

import { useShell } from "../../i18n/shell/shell-context";
import type {
  EventDetailViewModel,
  EventListItemViewModel,
  PerformanceDetailViewModel,
} from "../../features/events/event-presentation";
import { EventsDiscovery } from "./EventsDiscovery";
import { PublicEventPage } from "./PublicEventPage";
import { PublicPerformancePage } from "./PublicPerformancePage";

export function EventsIndexRoute({
  events,
}: {
  readonly events: readonly EventListItemViewModel[];
}) {
  const { locale } = useShell();
  return <EventsDiscovery events={events} locale={locale} />;
}

export function EventDetailRoute({
  event,
}: {
  readonly event: EventDetailViewModel;
}) {
  const { locale } = useShell();
  return <PublicEventPage event={event} locale={locale} />;
}

export function PerformanceDetailRoute({
  performance,
}: {
  readonly performance: PerformanceDetailViewModel;
}) {
  const { locale } = useShell();
  return <PublicPerformancePage locale={locale} performance={performance} />;
}
