"use client";

import type { CSSProperties } from "react";
import { EventEvidence } from "./EventEvidence.js";
import { RecordActionButton } from "./RecordActionButton.js";
import type {
  EventRecordHandler,
  PerformanceDetailViewModel,
} from "../../features/events/event-presentation.js";
import {
  getEventsMessages,
  getLifecycleLabel,
  type EventsLocale,
} from "../../i18n/events/messages.js";

interface PerformanceDetailProps {
  readonly performance: PerformanceDetailViewModel;
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

const setlistStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const setlistItemStyle: CSSProperties = {
  alignItems: "start",
  background: "var(--atlas-surface, #ffffff)",
  border: "1px solid var(--atlas-border, #d1d5db)",
  borderRadius: 12,
  display: "grid",
  gap: 8,
  gridTemplateColumns: "minmax(2rem, auto) minmax(0, 1fr)",
  minWidth: 0,
  padding: 12,
};

const songLinkStyle: CSSProperties = {
  alignItems: "center",
  color: "var(--atlas-accent, #1d4ed8)",
  display: "inline-flex",
  minHeight: 44,
  overflowWrap: "anywhere",
};

export function PerformanceDetail({
  performance,
  locale = "en",
  onRecord,
}: PerformanceDetailProps) {
  const messages = getEventsMessages(locale);
  const titleId = `performance-detail-${performance.performanceId}`;
  const setlistId = `${titleId}-setlist`;

  return (
    <article
      aria-labelledby={titleId}
      data-performance-detail
      style={detailStyle}
    >
      <header>
        <p style={labelStyle}>
          {performance.groupName} · {performance.eventName}
        </p>
        <h1 id={titleId}>{performance.performanceName}</h1>
      </header>

      <dl style={factsStyle}>
        <div style={factStyle}>
          <dt style={labelStyle}>{messages.date}</dt>
          <dd style={valueStyle}>{performance.date}</dd>
        </div>
        <div style={factStyle}>
          <dt style={labelStyle}>{messages.dates}</dt>
          <dd style={valueStyle}>{performance.eventDateRange}</dd>
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
      </dl>

      <EventEvidence
        evidence={performance.evidence}
        headingLevel={2}
        messages={messages}
        sectionId={`${titleId}-evidence`}
      />
      <RecordActionButton
        action={performance.recordAction}
        messages={messages}
        onRecord={onRecord}
      />

      <section aria-labelledby={setlistId}>
        <h2 id={setlistId}>{messages.setlist}</h2>
        {performance.isSetlistAvailable ? (
          <ol style={setlistStyle}>
            {performance.setlist.map((song) => (
              <li
                key={`${song.order}-${song.songReference.entityId}`}
                style={setlistItemStyle}
              >
                <strong>{song.order}</strong>
                <div style={{ minWidth: 0 }}>
                  {song.canonicalSongHref ? (
                    <a href={song.canonicalSongHref} style={songLinkStyle}>
                      {song.songTitle} — {messages.openOnMyPick}
                    </a>
                  ) : (
                    <>
                      <p style={valueStyle}>{song.songTitle}</p>
                      <p data-c0-song-fallback style={labelStyle}>
                        {messages.noCanonicalSongLink}
                      </p>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p data-setlist-empty role="status">
            {messages.noSetlist}
          </p>
        )}
      </section>
    </article>
  );
}
