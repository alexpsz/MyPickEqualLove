"use client";

import type { CSSProperties } from "react";
import { EventEvidence } from "./EventEvidence.js";
import { RecordActionButton } from "./RecordActionButton.js";
import type {
  EventDetailViewModel,
  EventRecordHandler,
} from "../../features/events/event-presentation.js";
import {
  getEventsMessages,
  getLifecycleLabel,
  type EventsLocale,
} from "../../i18n/events/messages.js";

interface EventDetailProps {
  readonly event: EventDetailViewModel;
  readonly locale?: EventsLocale;
  readonly onRecord?: EventRecordHandler;
}

const detailStyle: CSSProperties = {
  background: "var(--atlas-surface, #ffffff)",
  color: "var(--atlas-text, #111827)",
  display: "grid",
  gap: 20,
  maxWidth: "100%",
  minWidth: 0,
  padding: "1rem",
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
  color: "var(--atlas-text-muted, #4b5563)",
  fontSize: "0.875rem",
  fontWeight: 600,
  margin: 0,
};

const valueStyle: CSSProperties = {
  color: "var(--atlas-text, #111827)",
  margin: 0,
  overflowWrap: "anywhere",
};

const performanceListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const performanceStyle: CSSProperties = {
  background: "var(--atlas-surface, #ffffff)",
  border: "1px solid var(--atlas-border, #d1d5db)",
  borderRadius: 12,
  display: "grid",
  gap: 12,
  minWidth: 0,
  padding: 16,
};

export function EventDetail({
  event,
  locale = "en",
  onRecord,
}: EventDetailProps) {
  const messages = getEventsMessages(locale);
  const titleId = `event-detail-${event.eventId}`;
  const performancesId = `${titleId}-performances`;

  return (
    <article aria-labelledby={titleId} data-event-detail style={detailStyle}>
      <header>
        <p style={labelStyle}>{event.groupName}</p>
        <h1 id={titleId}>{event.eventName}</h1>
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
          <dt style={labelStyle}>{messages.timezone}</dt>
          <dd style={valueStyle}>{event.timezone}</dd>
        </div>
        <div style={factStyle}>
          <dt style={labelStyle}>{messages.lifecycle}</dt>
          <dd style={valueStyle}>
            {getLifecycleLabel(messages, event.lifecycle)}
          </dd>
        </div>
      </dl>

      <EventEvidence
        evidence={event.evidence}
        headingLevel={2}
        messages={messages}
        sectionId={`${titleId}-evidence`}
      />
      <RecordActionButton
        action={event.recordAction}
        messages={messages}
        onRecord={onRecord}
      />

      <section aria-labelledby={performancesId}>
        <h2 id={performancesId}>{messages.performances}</h2>
        {event.isEventOnly ? (
          <div data-event-only role="status">
            <h3>{messages.eventOnlyTitle}</h3>
            <p>{messages.eventOnlyDescription}</p>
          </div>
        ) : (
          <ul style={performanceListStyle}>
            {event.performances.map((performance) => {
              const performanceHeadingId = `performance-summary-${performance.performanceId}`;
              return (
                <li key={performance.performanceId}>
                  <article
                    aria-labelledby={performanceHeadingId}
                    style={performanceStyle}
                  >
                    <h3 id={performanceHeadingId} style={{ margin: 0 }}>
                      {performance.performanceName}
                    </h3>
                    <dl style={factsStyle}>
                      <div style={factStyle}>
                        <dt style={labelStyle}>{messages.date}</dt>
                        <dd style={valueStyle}>{performance.date}</dd>
                      </div>
                      <div style={factStyle}>
                        <dt style={labelStyle}>{messages.venue}</dt>
                        <dd style={valueStyle}>{performance.venueName}</dd>
                      </div>
                      <div style={factStyle}>
                        <dt style={labelStyle}>{messages.timezone}</dt>
                        <dd style={valueStyle}>{performance.timezone}</dd>
                      </div>
                      <div style={factStyle}>
                        <dt style={labelStyle}>{messages.lifecycle}</dt>
                        <dd style={valueStyle}>
                          {getLifecycleLabel(messages, performance.lifecycle)}
                        </dd>
                      </div>
                      <div style={factStyle}>
                        <dt style={labelStyle}>{messages.setlistCount}</dt>
                        <dd style={valueStyle}>{performance.setlistCount}</dd>
                      </div>
                    </dl>
                    <EventEvidence
                      evidence={performance.evidence}
                      headingLevel={4}
                      messages={messages}
                      sectionId={`${performanceHeadingId}-evidence`}
                    />
                    <RecordActionButton
                      action={performance.recordAction}
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
    </article>
  );
}
