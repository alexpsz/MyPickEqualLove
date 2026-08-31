"use client";

import Link from "next/link";

import type { CSSProperties } from "react";

import type { EventDetailViewModel } from "../../features/events/event-presentation";
import {
  getEventsMessages,
  getLifecycleLabel,
  type EventsLocale,
} from "../../i18n/events/messages";
import { EventEvidence } from "./EventEvidence";
import { EventRecordForm } from "./EventRecordForm";

export function PublicEventPage({
  event,
  locale,
}: {
  readonly event: EventDetailViewModel;
  readonly locale: EventsLocale;
}) {
  const messages = getEventsMessages(locale);
  return (
    <div
      className="atlas-events atlas-events--detail"
      style={{ "--event-accent": event.accentColor } as CSSProperties}
    >
      <Link className="atlas-events__back" href="/events/">
        ← {messages.backToEvents}
      </Link>
      <header className="atlas-events__record-hero">
        <p className="atlas-events__group">{event.groupName}</p>
        <h1>{event.eventName}</h1>
        <dl className="atlas-events__facts">
          <div>
            <dt>{messages.dates}</dt>
            <dd>{event.dateRange}</dd>
          </div>
          <div>
            <dt>{messages.venue}</dt>
            <dd>{event.venueName}</dd>
          </div>
          <div>
            <dt>{messages.lifecycle}</dt>
            <dd>{getLifecycleLabel(messages, event.lifecycle)}</dd>
          </div>
        </dl>
        {event.canonicalEventHref ? (
          <a
            className="atlas-events__mypick-link"
            href={event.canonicalEventHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            {messages.openEventOnMyPick} ↗
          </a>
        ) : null}
      </header>

      {event.isEventOnly ? (
        <EventRecordForm action={event.recordAction} locale={locale} />
      ) : (
        <section className="atlas-events__performances">
          <h2>{messages.choosePerformance}</h2>
          <ol>
            {event.performances.map((performance) => (
              <li key={performance.performanceId}>
                <a href={performance.detailHref}>
                  <span>
                    <strong>{performance.performanceName}</strong>
                    <small>
                      {performance.date} · {performance.venueName}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <details className="atlas-events__evidence">
        <summary>{messages.evidence}</summary>
        <EventEvidence
          evidence={event.evidence}
          headingLevel={2}
          messages={messages}
          sectionId={`event-evidence-${event.eventId}`}
        />
      </details>
    </div>
  );
}
