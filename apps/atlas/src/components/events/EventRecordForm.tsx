"use client";

import { useState, type FormEvent } from "react";

import {
  JourneyNativeSelect,
  JourneyNativeTemporalInput,
} from "../journey/JourneyFormControls";
import type {
  ExperienceMode,
  JourneyIntent,
} from "../../contracts/journey-document";
import type {
  EventRecordAction,
  SetlistSongViewModel,
} from "../../features/events/event-presentation";
import {
  resolvePerformanceOccurredAt,
  usesOfficialPerformanceStart,
} from "../../features/events/event-record-time";
import {
  recordPublicEventIntent,
  recordPublicExperience,
} from "../../features/events/public-experience-recorder";
import {
  getEventsMessages,
  type EventsLocale,
} from "../../i18n/events/messages";
import { SHELL_ROUTES } from "../../i18n/shell/shell-routes";

interface EventRecordFormProps {
  readonly action: EventRecordAction;
  readonly locale: EventsLocale;
  readonly songs?: readonly SetlistSongViewModel[];
}

function newLocalId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function formatOfficialStartTime(startAt: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(Date.parse(startAt));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute} (${timezone})`;
}

export function EventRecordForm({
  action,
  locale,
  songs = [],
}: EventRecordFormProps) {
  const messages = getEventsMessages(locale);
  const [mode, setMode] = useState<ExperienceMode>("in-person");
  const [occurredAt, setOccurredAt] = useState("");
  const [highlight, setHighlight] = useState("");
  const [selectedSongIds, setSelectedSongIds] = useState<readonly string[]>([]);
  const [intent, setIntent] =
    useState<Exclude<JourneyIntent, null>>("interested");
  const [validationError, setValidationError] = useState<
    "experienceTime" | null
  >(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );
  const officialStartAt =
    action.kind === "record-performance" &&
    usesOfficialPerformanceStart(action, mode)
      ? action.officialStartAt
      : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let resolvedOccurredAt: string | null = null;
    if (action.kind === "record-performance") {
      const resolution = resolvePerformanceOccurredAt(action, mode, occurredAt);
      if (resolution.status === "invalid-personal-time") {
        setValidationError("experienceTime");
        setStatus("idle");
        return;
      }
      resolvedOccurredAt = resolution.occurredAt;
    }
    setValidationError(null);
    setStatus("saving");
    try {
      const { createBrowserJourneyRepository } =
        await import("../../storage/journey-storage");
      const repository = createBrowserJourneyRepository();
      const now = new Date().toISOString();
      let result;
      if (action.kind === "record-event") {
        result = await recordPublicEventIntent(repository, {
          reference: action.reference,
          journeyId: newLocalId("public_event"),
          intent,
          now,
        });
      } else {
        if (resolvedOccurredAt === null) {
          setStatus("failed");
          return;
        }
        result = await recordPublicExperience(repository, {
          reference: action.reference,
          journeyId: newLocalId("public_performance"),
          entryId: newLocalId("experience"),
          mode,
          occurredAt: resolvedOccurredAt,
          highlight,
          songRefs: songs
            .filter((song) =>
              selectedSongIds.includes(song.songReference.entityId),
            )
            .map((song) => song.songReference),
          now,
        });
      }
      setStatus(result.status === "saved" ? "saved" : "failed");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <form
      className="atlas-event-record"
      data-event-record-form
      noValidate
      onSubmit={submit}
    >
      <header>
        <h2>
          {action.kind === "record-event"
            ? messages.planEventTitle
            : messages.recordMomentTitle}
        </h2>
        <p>
          {action.kind === "record-event"
            ? messages.planEventDescription
            : messages.recordMomentDescription}
        </p>
      </header>

      {action.kind === "record-event" ? (
        <fieldset className="atlas-event-record__choices">
          <legend>{messages.lifecycle}</legend>
          {(["interested", "planned"] as const).map((value) => (
            <label key={value}>
              <input
                checked={intent === value}
                name="intent"
                onChange={() => setIntent(value)}
                type="radio"
                value={value}
              />
              <span>
                {value === "interested"
                  ? messages.interested
                  : messages.planned}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <div className="atlas-event-record__grid">
            <label>
              <span>{messages.mode}</span>
              <JourneyNativeSelect
                onChange={(event) => {
                  setMode(event.target.value as ExperienceMode);
                  setValidationError(null);
                }}
                value={mode}
              >
                <option value="in-person">{messages.modeInPerson}</option>
                <option value="livestream">{messages.modeLivestream}</option>
                <option value="archive">{messages.modeArchive}</option>
              </JourneyNativeSelect>
            </label>
            {officialStartAt !== null &&
            action.kind === "record-performance" ? (
              <div className="atlas-event-record__official-time">
                <span>{messages.officialStartTime}</span>
                <time dateTime={officialStartAt}>
                  {formatOfficialStartTime(officialStartAt, action.timezone)}
                </time>
                <small>{messages.officialStartTimeHint}</small>
              </div>
            ) : (
              <label>
                <span>{messages.experienceTime}</span>
                <JourneyNativeTemporalInput
                  aria-describedby={
                    validationError === "experienceTime"
                      ? "atlas-event-record-time-error"
                      : undefined
                  }
                  aria-invalid={validationError === "experienceTime"}
                  onChange={(event) => {
                    setOccurredAt(event.target.value);
                    if (validationError === "experienceTime") {
                      setValidationError(null);
                    }
                  }}
                  required
                  type="datetime-local"
                  value={occurredAt}
                />
              </label>
            )}
          </div>
          {validationError === "experienceTime" ? (
            <p
              className="atlas-event-record__validation"
              id="atlas-event-record-time-error"
              role="alert"
            >
              {messages.experienceTimeRequired}
            </p>
          ) : null}
          <label className="atlas-event-record__highlight">
            <span>{messages.highlight}</span>
            <textarea
              maxLength={256}
              onChange={(event) => setHighlight(event.target.value)}
              placeholder={messages.highlightPlaceholder}
              rows={3}
              value={highlight}
            />
            <small>{messages.highlightHint}</small>
          </label>
          {songs.length > 0 ? (
            <fieldset className="atlas-event-record__songs">
              <legend>
                {messages.favoriteSongs}{" "}
                <small>{messages.favoriteSongsHint}</small>
              </legend>
              {songs.map((song) => {
                const selected = selectedSongIds.includes(
                  song.songReference.entityId,
                );
                return (
                  <label key={`${song.order}-${song.songReference.entityId}`}>
                    <input
                      checked={selected}
                      disabled={!selected && selectedSongIds.length >= 3}
                      onChange={() =>
                        setSelectedSongIds((current) =>
                          selected
                            ? current.filter(
                                (id) => id !== song.songReference.entityId,
                              )
                            : [...current, song.songReference.entityId],
                        )
                      }
                      type="checkbox"
                    />
                    <span>{song.songTitle}</span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
        </>
      )}

      <button
        className="atlas-events__primary"
        disabled={status === "saving"}
        type="submit"
      >
        {status === "saving"
          ? messages.saving
          : action.kind === "record-event"
            ? messages.savePlan
            : messages.saveMoment}
      </button>
      {status === "saved" ? (
        <div className="atlas-event-record__success" role="status">
          <p>{messages.saved}</p>
          <a href={SHELL_ROUTES.journey}>{messages.openJourney}</a>
          <a href={SHELL_ROUTES.memory}>{messages.createMemory}</a>
        </div>
      ) : null}
      {status === "failed" ? <p role="alert">{messages.saveFailed}</p> : null}
    </form>
  );
}
