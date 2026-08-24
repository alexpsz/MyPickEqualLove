"use client";

import type { CSSProperties } from "react";
import { EventEvidence } from "./EventEvidence.js";
import { RecordActionButton } from "./RecordActionButton.js";
import type {
  EventListItemViewModel,
  EventRecordHandler,
} from "../../features/events/event-presentation.js";
import {
  getEventsMessages,
  type EventsLocale,
} from "../../i18n/events/messages.js";

interface EventsListProps {
  readonly events: readonly EventListItemViewModel[];
  readonly locale?: EventsLocale;
  readonly onRecord?: EventRecordHandler;
}

const listStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  listStyle: "none",
  margin: 0,
  maxWidth: "100%",
  padding: 0,
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 0,
  padding: "1rem",
  width: "100%",
};

const factsStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
  margin: 0,
};

const factStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  color: "#4b5563",
  fontSize: "0.875rem",
  fontWeight: 600,
  margin: 0,
};

const valueStyle: CSSProperties = {
  margin: 0,
  overflowWrap: "anywhere",
};

export function EventsList({
  events,
  locale = "en",
  onRecord,
}: EventsListProps) {
  const messages = getEventsMessages(locale);

  return (
    <section aria-labelledby="atlas-events-list-title" data-events-list>
      <header>
        <h1 id="atlas-events-list-title">{messages.events}</h1>
        <p>{messages.eventsDescription}</p>
      </header>

      {events.length === 0 ? (
        <p role="status">{messages.noEvents}</p>
      ) : (
        <ul style={listStyle}>
          {events.map((event) => {
            const headingId = `event-summary-${event.eventId}`;
            return (
              <li key={event.eventId}>
                <article aria-labelledby={headingId} style={cardStyle}>
                  <header>
                    <p style={labelStyle}>{event.groupName}</p>
                    <h2 id={headingId} style={{ margin: 0 }}>
                      {event.eventName}
                    </h2>
                  </header>

                  <dl style={factsStyle}>
                    <div style={factStyle}>
                      <dt style={labelStyle}>{messages.venue}</dt>
                      <dd style={valueStyle}>{event.venueName}</dd>
                    </div>
                    <div style={factStyle}>
                      <dt style={labelStyle}>{messages.dates}</dt>
                      <dd style={valueStyle}>{event.dateRange}</dd>
                    </div>
                    <div style={factStyle}>
                      <dt style={labelStyle}>{messages.lifecycle}</dt>
                      <dd style={valueStyle}>{event.lifecycle}</dd>
                    </div>
                    <div style={factStyle}>
                      <dt style={labelStyle}>{messages.performances}</dt>
                      <dd style={valueStyle}>{event.performanceCount}</dd>
                    </div>
                  </dl>

                  {event.isEventOnly ? (
                    <p data-event-only role="status" style={valueStyle}>
                      {messages.eventOnlyDescription}
                    </p>
                  ) : null}

                  <EventEvidence
                    evidence={event.evidence}
                    messages={messages}
                    sectionId={`${headingId}-evidence`}
                  />
                  <RecordActionButton
                    action={event.recordAction}
                    messages={messages}
                    onRecord={onRecord}
                  />
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
