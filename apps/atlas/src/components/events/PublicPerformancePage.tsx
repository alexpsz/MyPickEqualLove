"use client";

import type { PerformanceDetailViewModel } from "../../features/events/event-presentation";
import {
  getEventsMessages,
  getLifecycleLabel,
  type EventsLocale,
} from "../../i18n/events/messages";
import { EventEvidence } from "./EventEvidence";
import { EventRecordForm } from "./EventRecordForm";

export function PublicPerformancePage({
  performance,
  locale,
}: {
  readonly performance: PerformanceDetailViewModel;
  readonly locale: EventsLocale;
}) {
  const messages = getEventsMessages(locale);
  return (
    <div className="atlas-events atlas-events--performance">
      <a className="atlas-events__back" href={performance.eventDetailHref}>
        ← {messages.backToEvent}
      </a>
      <header className="atlas-events__record-hero">
        <p className="atlas-events__group">
          {performance.groupName} · {performance.eventName}
        </p>
        <h1>{performance.performanceName}</h1>
        <dl className="atlas-events__facts">
          <div>
            <dt>{messages.date}</dt>
            <dd>{performance.date}</dd>
          </div>
          <div>
            <dt>{messages.venue}</dt>
            <dd>{performance.venueName}</dd>
          </div>
          <div>
            <dt>{messages.lifecycle}</dt>
            <dd>{getLifecycleLabel(messages, performance.lifecycle)}</dd>
          </div>
        </dl>
        {performance.canonicalEventHref ? (
          <a
            className="atlas-events__mypick-link"
            href={performance.canonicalEventHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            {messages.openEventOnMyPick} ↗
          </a>
        ) : null}
      </header>
      <EventRecordForm
        action={performance.recordAction}
        locale={locale}
        songs={performance.setlist}
      />
      <details className="atlas-events__setlist">
        <summary>
          {messages.setlist} · {performance.setlist.length}
        </summary>
        {performance.setlist.length === 0 ? (
          <p>{messages.noSetlist}</p>
        ) : (
          <ol>
            {performance.setlist.map((song) => (
              <li key={`${song.order}-${song.songReference.entityId}`}>
                <span>{song.order}</span>
                {song.canonicalSongHref ? (
                  <a
                    href={song.canonicalSongHref}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {song.songTitle}
                  </a>
                ) : (
                  <span>{song.songTitle}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
      <details className="atlas-events__evidence">
        <summary>{messages.evidence}</summary>
        <EventEvidence
          evidence={performance.evidence}
          headingLevel={2}
          messages={messages}
          sectionId={`performance-evidence-${performance.performanceId}`}
        />
      </details>
    </div>
  );
}
