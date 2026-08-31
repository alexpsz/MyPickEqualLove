"use client";

import { useState, type CSSProperties } from "react";

import type { PublicAtlasSiteId } from "../../contracts/identity";
import type { EventListItemViewModel } from "../../features/events/event-presentation";
import {
  getEventsMessages,
  getLifecycleLabel,
  type EventsLocale,
} from "../../i18n/events/messages";
import { SHELL_ROUTES } from "../../i18n/shell/shell-routes";

interface EventsDiscoveryProps {
  readonly events: readonly EventListItemViewModel[];
  readonly locale: EventsLocale;
}

export function EventsDiscovery({ events, locale }: EventsDiscoveryProps) {
  const messages = getEventsMessages(locale);
  const [siteId, setSiteId] = useState<"all" | PublicAtlasSiteId>("all");
  const visible =
    siteId === "all"
      ? events
      : events.filter((event) => event.siteId === siteId);
  const groups = [
    ["all", messages.allGroups],
    ["equal-love", "=LOVE"],
    ["nearly-equal-joy", "≒JOY"],
    ["not-equal-me", "≠ME"],
  ] as const;

  return (
    <div className="atlas-events atlas-events--discovery">
      <header className="atlas-events__hero">
        <h1>{messages.discoveryTitle}</h1>
        <p>{messages.discoveryDescription}</p>
      </header>
      <div
        aria-label={messages.group}
        className="atlas-events__filters"
        role="group"
      >
        {groups.map(([value, label]) => (
          <button
            aria-pressed={siteId === value}
            key={value}
            onClick={() => setSiteId(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="atlas-events__empty" role="status">
          {messages.noEvents}
        </p>
      ) : (
        <ol className="atlas-events__list">
          {visible.map((event) => (
            <li key={event.eventId}>
              <article
                className="atlas-events__card"
                style={{ "--event-accent": event.accentColor } as CSSProperties}
              >
                <span aria-hidden="true" className="atlas-events__marker" />
                <div className="atlas-events__card-main">
                  <p className="atlas-events__group">{event.groupName}</p>
                  <h2>{event.eventName}</h2>
                  <p className="atlas-events__meta">
                    <span>
                      <EventDiscoveryIcon name="calendar" />
                      <span>{event.dateRange}</span>
                    </span>
                    <span>
                      <EventDiscoveryIcon name="location" />
                      <span>{event.venueName}</span>
                    </span>
                  </p>
                  <p className="atlas-events__status">
                    {getLifecycleLabel(messages, event.lifecycle)} ·{" "}
                    {event.performanceCount} {messages.performances}
                  </p>
                </div>
                <div className="atlas-events__links">
                  <a
                    className="atlas-events__primary-link"
                    href={event.detailHref}
                  >
                    {messages.eventDetails}
                  </a>
                  {event.canonicalEventHref ? (
                    <a
                      className="atlas-events__secondary-link"
                      href={event.canonicalEventHref}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <span>{messages.openEventOnMyPick}</span>
                      <EventDiscoveryIcon name="external" />
                    </a>
                  ) : null}
                </div>
                <a
                  aria-label={`${messages.eventDetails}: ${event.eventName}`}
                  className="atlas-events__chevron"
                  href={event.detailHref}
                >
                  <EventDiscoveryIcon name="chevron" />
                </a>
              </article>
            </li>
          ))}
        </ol>
      )}
      <a className="atlas-events__local-event" href={SHELL_ROUTES.localEvent}>
        <span aria-hidden="true" className="atlas-events__local-event-icon">
          <EventDiscoveryIcon name="plus" />
        </span>
        <span className="atlas-events__local-event-copy">
          <span>{messages.localEventPrompt}</span>
          <strong>{messages.createLocalEvent}</strong>
        </span>
        <EventDiscoveryIcon name="chevron" />
      </a>
    </div>
  );
}

type EventDiscoveryIconName =
  | "calendar"
  | "chevron"
  | "external"
  | "location"
  | "plus";

function EventDiscoveryIcon({
  name,
}: {
  readonly name: EventDiscoveryIconName;
}) {
  return (
    <svg
      aria-hidden="true"
      className="atlas-events__icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      {name === "calendar" ? (
        <>
          <rect height="15" rx="2.25" width="17" x="3.5" y="5.5" />
          <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" />
        </>
      ) : null}
      {name === "chevron" ? <path d="m9 6 6 6-6 6" /> : null}
      {name === "external" ? (
        <>
          <path d="M8.25 15.75 16.5 7.5" />
          <path d="M10.25 7.5h6.25v6.25" />
        </>
      ) : null}
      {name === "location" ? (
        <>
          <path d="M19 10c0 5.25-7 10.5-7 10.5S5 15.25 5 10a7 7 0 1 1 14 0Z" />
          <circle cx="12" cy="10" r="2.25" />
        </>
      ) : null}
      {name === "plus" ? <path d="M12 5v14M5 12h14" /> : null}
    </svg>
  );
}
