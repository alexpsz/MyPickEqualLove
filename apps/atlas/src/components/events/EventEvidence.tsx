import type { CSSProperties } from "react";
import type { EventEvidenceViewModel } from "../../features/events/event-presentation.js";
import type { EventsMessages } from "../../i18n/events/messages.js";

interface EventEvidenceProps {
  readonly evidence: EventEvidenceViewModel;
  readonly messages: EventsMessages;
  readonly sectionId: string;
}

const surfaceStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
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

const listStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  margin: 0,
  paddingInlineStart: 20,
};

const linkStyle: CSSProperties = {
  alignItems: "center",
  color: "#1d4ed8",
  display: "inline-flex",
  minHeight: 44,
  overflowWrap: "anywhere",
};

function verificationLabel(
  messages: EventsMessages,
  status: EventEvidenceViewModel["verificationStatus"],
): string {
  return messages[status];
}

export function EventEvidence({
  evidence,
  messages,
  sectionId,
}: EventEvidenceProps) {
  const sourcesId = `${sectionId}-sources`;
  const excludedId = `${sectionId}-excluded`;
  const unresolvedId = `${sectionId}-unresolved`;

  return (
    <section
      aria-labelledby={sectionId}
      data-events-evidence
      style={surfaceStyle}
    >
      <h2 id={sectionId} style={{ margin: 0 }}>
        {messages.evidence}
      </h2>

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
        <h3 id={sourcesId} style={{ margin: 0 }}>
          {messages.sources}
        </h3>
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
        <h3 id={excludedId} style={{ margin: 0 }}>
          {messages.excluded}
        </h3>
        {evidence.excluded.length === 0 ? (
          <p style={valueStyle}>{messages.noExcluded}</p>
        ) : (
          <ul data-excluded-items style={listStyle}>
            {evidence.excluded.map((item, index) => (
              <li key={`${item.kind}-${item.sourceId}-${index}`}>
                {item.kind}: {item.sourceId} — {item.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={unresolvedId}>
        <h3 id={unresolvedId} style={{ margin: 0 }}>
          {messages.unresolved}
        </h3>
        {evidence.unresolved.length === 0 ? (
          <p data-unresolved-items style={valueStyle}>
            {messages.noUnresolved}
          </p>
        ) : (
          <ul data-unresolved-items style={listStyle}>
            {evidence.unresolved.map((item, index) => (
              <li key={`${item.kind}-${item.sourceValue}-${index}`}>
                {item.kind}: {item.sourceValue} — {item.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
