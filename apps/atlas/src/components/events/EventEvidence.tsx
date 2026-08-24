import type { CSSProperties, ReactNode } from "react";
import type { EventEvidenceViewModel } from "../../features/events/event-presentation.js";
import {
  getExcludedKindLabel,
  getUnresolvedKindLabel,
  type EventsMessages,
} from "../../i18n/events/messages.js";

type EvidenceHeadingLevel = 2 | 3 | 4;
type HeadingLevel = EvidenceHeadingLevel | 5;

interface EventEvidenceProps {
  readonly evidence: EventEvidenceViewModel;
  readonly headingLevel: EvidenceHeadingLevel;
  readonly messages: EventsMessages;
  readonly sectionId: string;
}

interface EvidenceHeadingProps {
  readonly children: ReactNode;
  readonly id: string;
  readonly level: HeadingLevel;
}

const surfaceStyle: CSSProperties = {
  background: "var(--atlas-surface, #ffffff)",
  border: "1px solid var(--atlas-border, #d1d5db)",
  borderRadius: 12,
  color: "var(--atlas-text, #111827)",
  display: "grid",
  gap: 16,
  maxWidth: "100%",
  minWidth: 0,
  padding: 16,
};

const factsStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
  margin: 0,
};

const factStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const headingStyle: CSSProperties = {
  color: "var(--atlas-text, #111827)",
  margin: 0,
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

const listStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  margin: 0,
  paddingInlineStart: 20,
};

const linkStyle: CSSProperties = {
  alignItems: "center",
  color: "var(--atlas-accent, #1d4ed8)",
  display: "inline-flex",
  minHeight: 44,
  overflowWrap: "anywhere",
};

function EvidenceHeading({ children, id, level }: EvidenceHeadingProps) {
  switch (level) {
    case 2:
      return (
        <h2 id={id} style={headingStyle}>
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 id={id} style={headingStyle}>
          {children}
        </h3>
      );
    case 4:
      return (
        <h4 id={id} style={headingStyle}>
          {children}
        </h4>
      );
    case 5:
      return (
        <h5 id={id} style={headingStyle}>
          {children}
        </h5>
      );
  }
}

function subsectionHeadingLevel(
  headingLevel: EvidenceHeadingLevel,
): HeadingLevel {
  return (headingLevel + 1) as HeadingLevel;
}

function verificationLabel(
  messages: EventsMessages,
  status: EventEvidenceViewModel["verificationStatus"],
): string {
  return messages[status];
}

export function EventEvidence({
  evidence,
  headingLevel,
  messages,
  sectionId,
}: EventEvidenceProps) {
  const sourcesId = `${sectionId}-sources`;
  const excludedId = `${sectionId}-excluded`;
  const unresolvedId = `${sectionId}-unresolved`;
  const subheadingLevel = subsectionHeadingLevel(headingLevel);

  return (
    <section
      aria-labelledby={sectionId}
      data-events-evidence
      style={surfaceStyle}
    >
      <EvidenceHeading id={sectionId} level={headingLevel}>
        {messages.evidence}
      </EvidenceHeading>

      <dl style={factsStyle}>
        <div style={factStyle}>
          <dt style={labelStyle}>{messages.verification}</dt>
          <dd
            data-verification-status={evidence.verificationStatus}
            style={valueStyle}
          >
            {verificationLabel(messages, evidence.verificationStatus)}
          </dd>
        </div>
        <div style={factStyle}>
          <dt style={labelStyle}>{messages.coverage}</dt>
          <dd data-coverage style={valueStyle}>
            {evidence.coverage.included}/{evidence.coverage.total}
          </dd>
        </div>
      </dl>

      <section aria-labelledby={sourcesId}>
        <EvidenceHeading id={sourcesId} level={subheadingLevel}>
          {messages.sources}
        </EvidenceHeading>
        {evidence.sourceUrls.length === 0 ? (
          <p style={valueStyle}>{messages.noSources}</p>
        ) : (
          <ul style={listStyle}>
            {evidence.sourceUrls.map((sourceUrl) => (
              <li key={sourceUrl}>
                <a
                  href={sourceUrl}
                  rel="noreferrer"
                  style={linkStyle}
                  target="_blank"
                >
                  {sourceUrl}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={excludedId}>
        <EvidenceHeading id={excludedId} level={subheadingLevel}>
          {messages.excluded}
        </EvidenceHeading>
        {evidence.excluded.length === 0 ? (
          <p style={valueStyle}>{messages.noExcluded}</p>
        ) : (
          <ul data-excluded-items style={listStyle}>
            {evidence.excluded.map((item, index) => (
              <li key={`${item.kind}-${item.sourceId}-${index}`}>
                {getExcludedKindLabel(messages, item.kind)}: {item.sourceId} —{" "}
                {item.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={unresolvedId}>
        <EvidenceHeading id={unresolvedId} level={subheadingLevel}>
          {messages.unresolved}
        </EvidenceHeading>
        {evidence.unresolved.length === 0 ? (
          <p data-unresolved-items style={valueStyle}>
            {messages.noUnresolved}
          </p>
        ) : (
          <ul data-unresolved-items style={listStyle}>
            {evidence.unresolved.map((item, index) => (
              <li key={`${item.kind}-${item.sourceValue}-${index}`}>
                {getUnresolvedKindLabel(messages, item.kind)}:{" "}
                {item.sourceValue} — {item.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
