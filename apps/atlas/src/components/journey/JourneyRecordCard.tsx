"use client";

import { useState, type FormEvent } from "react";
import type {
  ExperienceMode,
  JourneyDocumentV1,
  JourneyIntent,
  JourneyRecord,
} from "../../contracts/journey-document.js";
import {
  addJourneyExperienceEntry,
  deleteJourneyExperienceEntry,
  deleteJourneyRecord,
  updateJourneyExperienceEntry,
  updateJourneyIntent,
  updateLocalCustomSubject,
} from "../../features/journey/journey-controller.js";
import { journeyMessage } from "../../i18n/journey/messages.js";
import {
  formatJourneyDate,
  formatJourneyDateTime,
  type JourneyLocale,
} from "../../i18n/journey/translate.js";
import { InlineConfirmation } from "./InlineConfirmation.js";
import styles from "./journey-ui.module.css";

export type JourneyMutation = (current: JourneyDocumentV1) => JourneyDocumentV1;

function createEntryId() {
  if (typeof crypto.randomUUID !== "function") {
    throw new Error("Secure browser UUID generation is unavailable");
  }
  return `entry-${crypto.randomUUID()}`;
}

function parseIntent(value: FormDataEntryValue | null): JourneyIntent {
  return value === "interested" || value === "planned" ? value : null;
}

function parseMode(value: FormDataEntryValue | null): ExperienceMode {
  if (value === "in-person" || value === "livestream" || value === "archive") {
    return value;
  }
  throw new Error("A supported experience mode is required");
}

function canonicalTimestamp(value: FormDataEntryValue | null) {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("A valid experience date and time is required");
  }
  return parsed.toISOString();
}

function localDateTimeValue(timestamp: string) {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function highlightLines(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/\r?\n/);
}

function modeLabel(locale: JourneyLocale, mode: ExperienceMode) {
  return journeyMessage(
    locale,
    mode === "in-person"
      ? "modeInPerson"
      : mode === "livestream"
        ? "modeLivestream"
        : "modeArchive",
  );
}

function subjectFallback(record: JourneyRecord) {
  return record.subject.kind === "local-custom-event"
    ? record.subject.fallback
    : record.subject.reference.fallback;
}

function ExperienceFields({
  locale,
  disabled,
  entry,
}: {
  readonly locale: JourneyLocale;
  readonly disabled: boolean;
  readonly entry?: JourneyRecord["experienceEntries"][number];
}) {
  return (
    <>
      <div className={styles.twoColumns}>
        <label className={styles.field}>
          <span>{journeyMessage(locale, "mode")}</span>
          <select
            defaultValue={entry?.mode ?? "in-person"}
            disabled={disabled}
            name="mode"
          >
            <option value="in-person">
              {journeyMessage(locale, "modeInPerson")}
            </option>
            <option value="livestream">
              {journeyMessage(locale, "modeLivestream")}
            </option>
            <option value="archive">
              {journeyMessage(locale, "modeArchive")}
            </option>
          </select>
        </label>
        <label className={styles.field}>
          <span>{journeyMessage(locale, "occurredAt")}</span>
          <input
            defaultValue={localDateTimeValue(
              entry?.occurredAt ?? new Date().toISOString(),
            )}
            disabled={disabled}
            name="occurredAt"
            required
            type="datetime-local"
          />
        </label>
      </div>
      <label className={styles.field}>
        <span>{journeyMessage(locale, "memo")}</span>
        <textarea
          defaultValue={entry?.memo ?? ""}
          disabled={disabled}
          maxLength={10_000}
          name="memo"
        />
        <span className={styles.fieldHint}>
          {journeyMessage(locale, "memoHint")}
        </span>
      </label>
      <label className={styles.field}>
        <span>{journeyMessage(locale, "highlights")}</span>
        <textarea
          defaultValue={entry?.highlights.join("\n") ?? ""}
          disabled={disabled}
          name="highlights"
        />
        <span className={styles.fieldHint}>
          {journeyMessage(locale, "highlightsHint")}
        </span>
      </label>
    </>
  );
}

export function JourneyRecordCard({
  locale,
  record,
  busy,
  onMutate,
}: {
  readonly locale: JourneyLocale;
  readonly record: JourneyRecord;
  readonly busy: boolean;
  readonly onMutate: (mutation: JourneyMutation) => Promise<boolean>;
}) {
  const [confirmingJourneyDelete, setConfirmingJourneyDelete] = useState(false);
  const [confirmingEntryDelete, setConfirmingEntryDelete] = useState<
    string | null
  >(null);
  const fallback = subjectFallback(record);

  async function submitIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const intent = parseIntent(data.get("intent"));
    await onMutate((current) =>
      updateJourneyIntent(current, record.id, intent, new Date().toISOString()),
    );
  }

  async function submitSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onMutate((current) =>
      updateLocalCustomSubject(current, record.id, {
        title: String(data.get("title") ?? ""),
        date: String(data.get("date") ?? "") || null,
        venueName: String(data.get("venue") ?? "") || null,
        now: new Date().toISOString(),
      }),
    );
  }

  async function submitNewExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await onMutate((current) =>
      addJourneyExperienceEntry(current, record.id, {
        entryId: createEntryId(),
        mode: parseMode(data.get("mode")),
        occurredAt: canonicalTimestamp(data.get("occurredAt")),
        memo: String(data.get("memo") ?? ""),
        highlights: highlightLines(data.get("highlights")),
        now: new Date().toISOString(),
      }),
    );
    if (saved) form.reset();
  }

  async function submitExperience(
    event: FormEvent<HTMLFormElement>,
    entryId: string,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onMutate((current) =>
      updateJourneyExperienceEntry(current, record.id, entryId, {
        mode: parseMode(data.get("mode")),
        occurredAt: canonicalTimestamp(data.get("occurredAt")),
        memo: String(data.get("memo") ?? ""),
        highlights: highlightLines(data.get("highlights")),
        now: new Date().toISOString(),
      }),
    );
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div className={styles.metaRow}>
          <span className={styles.badge}>
            {record.subject.kind === "local-custom-event"
              ? journeyMessage(locale, "localOnly")
              : journeyMessage(locale, "publicMissing")}
          </span>
          <span className={styles.meta}>
            {journeyMessage(locale, "experienceCount", {
              count: record.experienceEntries.length,
            })}
          </span>
        </div>
        <h2 className={styles.cardTitle}>{fallback.title}</h2>
        <div className={styles.metaRow}>
          {fallback.date ? (
            <span className={styles.meta}>
              {formatJourneyDate(locale, fallback.date)}
            </span>
          ) : null}
          {fallback.venueName ? (
            <span className={styles.meta}>{fallback.venueName}</span>
          ) : null}
        </div>
      </header>

      <div className={styles.cardBody}>
        <form className={styles.compactForm} onSubmit={submitIntent}>
          <label className={styles.field}>
            <span>{journeyMessage(locale, "intent")}</span>
            <select
              defaultValue={record.intent ?? ""}
              disabled={busy}
              key={`${record.id}-intent-${record.updatedAt}`}
              name="intent"
            >
              <option value="">{journeyMessage(locale, "intentNone")}</option>
              <option value="interested">
                {journeyMessage(locale, "intentInterested")}
              </option>
              <option value="planned">
                {journeyMessage(locale, "intentPlanned")}
              </option>
            </select>
          </label>
          <div className={styles.actionRow}>
            <button
              className={styles.buttonSecondary}
              disabled={busy}
              type="submit"
            >
              {journeyMessage(locale, "saveIntent")}
            </button>
          </div>
        </form>

        {record.subject.kind === "local-custom-event" ? (
          <details className={styles.disclosure}>
            <summary>{journeyMessage(locale, "editEvent")}</summary>
            <div className={styles.disclosureContent}>
              <form className={styles.form} onSubmit={submitSubject}>
                <label className={styles.field}>
                  <span>{journeyMessage(locale, "title")}</span>
                  <input
                    defaultValue={record.subject.fallback.title}
                    disabled={busy}
                    maxLength={256}
                    name="title"
                    required
                    type="text"
                  />
                </label>
                <div className={styles.twoColumns}>
                  <label className={styles.field}>
                    <span>{journeyMessage(locale, "date")}</span>
                    <input
                      defaultValue={record.subject.fallback.date ?? ""}
                      disabled={busy}
                      name="date"
                      type="date"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{journeyMessage(locale, "venue")}</span>
                    <input
                      defaultValue={record.subject.fallback.venueName ?? ""}
                      disabled={busy}
                      maxLength={256}
                      name="venue"
                      type="text"
                    />
                  </label>
                </div>
                <button
                  className={styles.buttonSecondary}
                  disabled={busy}
                  type="submit"
                >
                  {journeyMessage(locale, "saveChanges")}
                </button>
              </form>
            </div>
          </details>
        ) : (
          <p className={styles.muted}>
            {journeyMessage(locale, "publicMissing")}
          </p>
        )}

        <section>
          <h3 className={styles.sectionTitle}>
            {journeyMessage(locale, "experiences")}
          </h3>
          <div className={styles.spacer} />
          {record.experienceEntries.length === 0 ? (
            <p className={styles.muted}>
              {journeyMessage(locale, "noExperiences")}
            </p>
          ) : (
            <ol className={styles.entryList}>
              {record.experienceEntries.map((entry) => (
                <li className={styles.entry} key={entry.id}>
                  <div className={styles.entryHeader}>
                    <h4>{modeLabel(locale, entry.mode)}</h4>
                    <time className={styles.meta} dateTime={entry.occurredAt}>
                      {formatJourneyDateTime(locale, entry.occurredAt)}
                    </time>
                  </div>
                  {entry.memo ? (
                    <p className={styles.memo}>{entry.memo}</p>
                  ) : null}
                  {entry.highlights.length > 0 ? (
                    <ul className={styles.highlightList}>
                      {entry.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  ) : null}
                  <details className={styles.disclosure}>
                    <summary>
                      {journeyMessage(locale, "editExperience")}
                    </summary>
                    <div className={styles.disclosureContent}>
                      <form
                        className={styles.form}
                        onSubmit={(event) =>
                          void submitExperience(event, entry.id)
                        }
                      >
                        <ExperienceFields
                          disabled={busy}
                          entry={entry}
                          locale={locale}
                        />
                        <button
                          className={styles.buttonSecondary}
                          disabled={busy}
                          type="submit"
                        >
                          {journeyMessage(locale, "saveChanges")}
                        </button>
                      </form>
                      <div className={styles.spacer} />
                      {confirmingEntryDelete === entry.id ? (
                        <InlineConfirmation
                          busy={busy}
                          confirmLabel="confirmDeleteExperience"
                          locale={locale}
                          message="deleteExperience"
                          onCancel={() => setConfirmingEntryDelete(null)}
                          onConfirm={() => {
                            void onMutate((current) =>
                              deleteJourneyExperienceEntry(
                                current,
                                record.id,
                                entry.id,
                                new Date().toISOString(),
                              ),
                            ).then((deleted) => {
                              if (deleted) setConfirmingEntryDelete(null);
                            });
                          }}
                        />
                      ) : (
                        <button
                          className={styles.buttonDanger}
                          disabled={busy}
                          onClick={() => setConfirmingEntryDelete(entry.id)}
                          type="button"
                        >
                          {journeyMessage(locale, "deleteExperience")}
                        </button>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>

        <details className={styles.disclosure}>
          <summary>{journeyMessage(locale, "addExperience")}</summary>
          <div className={styles.disclosureContent}>
            <form className={styles.form} onSubmit={submitNewExperience}>
              <ExperienceFields disabled={busy} locale={locale} />
              <button className={styles.button} disabled={busy} type="submit">
                {journeyMessage(locale, "saveExperience")}
              </button>
            </form>
          </div>
        </details>

        {confirmingJourneyDelete ? (
          <InlineConfirmation
            busy={busy}
            confirmLabel="confirmDeleteJourney"
            locale={locale}
            message="deleteJourney"
            onCancel={() => setConfirmingJourneyDelete(false)}
            onConfirm={() => {
              void onMutate((current) =>
                deleteJourneyRecord(
                  current,
                  record.id,
                  new Date().toISOString(),
                ),
              ).then((deleted) => {
                if (deleted) setConfirmingJourneyDelete(false);
              });
            }}
          />
        ) : (
          <button
            className={styles.buttonDanger}
            disabled={busy}
            onClick={() => setConfirmingJourneyDelete(true)}
            type="button"
          >
            {journeyMessage(locale, "deleteJourney")}
          </button>
        )}
      </div>
    </article>
  );
}
