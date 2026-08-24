"use client";

import type { CSSProperties } from "react";
import type {
  EventRecordAction,
  EventRecordHandler,
} from "../../features/events/event-presentation.js";
import type { EventsMessages } from "../../i18n/events/messages.js";

interface RecordActionButtonProps {
  readonly action: EventRecordAction;
  readonly messages: EventsMessages;
  readonly onRecord?: EventRecordHandler;
}

const buttonStyle: CSSProperties = {
  background: "#111827",
  border: 0,
  borderRadius: 10,
  color: "#ffffff",
  cursor: "pointer",
  font: "inherit",
  minHeight: 44,
  padding: "0.625rem 0.875rem",
};

const unavailableStyle: CSSProperties = {
  color: "#4b5563",
  fontSize: "0.875rem",
  margin: "0.5rem 0 0",
};

export function RecordActionButton({
  action,
  messages,
  onRecord,
}: RecordActionButtonProps) {
  const isEvent = action.kind === "record-event";
  const statusId = `record-action-${action.reference.entityId}`;

  return (
    <div>
      <button
        aria-describedby={onRecord ? undefined : statusId}
        data-record-action={action.kind}
        disabled={!onRecord}
        onClick={onRecord ? () => onRecord(action) : undefined}
        style={{ ...buttonStyle, cursor: onRecord ? "pointer" : "not-allowed" }}
        type="button"
      >
        {isEvent ? messages.recordEvent : messages.recordPerformance}
      </button>
      {onRecord ? null : (
        <p id={statusId} style={unavailableStyle}>
          {messages.recordUnavailable}
        </p>
      )}
    </div>
  );
}
