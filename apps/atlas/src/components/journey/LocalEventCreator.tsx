"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  JourneyDocumentReadResult,
  JourneyIntent,
} from "../../contracts/journey-document.js";
import {
  createLocalCustomJourney,
  expectedJourneyRevision,
} from "../../features/journey/journey-controller.js";
import { journeyMessage } from "../../i18n/journey/messages.js";
import {
  createBrowserJourneyRepository,
  type LocalStorageJourneyRepository,
} from "../../storage/journey-storage.js";
import { validateCompareAndWriteJourneyInput } from "../../ports/journey-repository.js";
import {
  JourneyFeedbackAlert,
  JourneyReadAlert,
  type JourneyOperationFeedback,
} from "./JourneyAlerts.js";
import { JourneyPageFrame } from "./JourneyPageFrame.js";
import styles from "./journey-ui.module.css";

function createPrivateId(prefix: "journey" | "local-event") {
  if (typeof crypto.randomUUID !== "function") {
    throw new Error("Secure browser UUID generation is unavailable");
  }
  return `${prefix}-${crypto.randomUUID()}`;
}

function readCurrentDocument(read: JourneyDocumentReadResult) {
  if (read.status === "absent") return null;
  if (read.status === "valid") return read.value;
  throw new Error("Journey storage is not writable in its current read state");
}

export function LocalEventCreator() {
  const repositoryRef = useRef<LocalStorageJourneyRepository | null>(null);
  const [read, setRead] = useState<JourneyDocumentReadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<JourneyOperationFeedback | null>(
    null,
  );

  async function reload() {
    const repository = repositoryRef.current;
    if (repository === null) return;
    setFeedback(null);
    setRead(await repository.read());
  }

  useEffect(() => {
    const repository = createBrowserJourneyRepository();
    repositoryRef.current = repository;
    void repository.read().then(setRead);
    return () => {
      repositoryRef.current = null;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const repository = repositoryRef.current;
    if (repository === null || read === null) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setFeedback(null);
    try {
      const current = readCurrentDocument(read);
      const intentValue = String(formData.get("intent") ?? "");
      const intent: JourneyIntent =
        intentValue === "interested" || intentValue === "planned"
          ? intentValue
          : null;
      const next = createLocalCustomJourney(current, {
        journeyId: createPrivateId("journey"),
        localEventId: createPrivateId("local-event"),
        title: String(formData.get("title") ?? ""),
        date: String(formData.get("date") ?? "") || null,
        venueName: String(formData.get("venue") ?? "") || null,
        intent,
        now: new Date().toISOString(),
      });
      const validated = validateCompareAndWriteJourneyInput({
        expectedRevision: expectedJourneyRevision(current),
        next,
      });
      if (!validated.ok) {
        throw new Error(validated.reason);
      }
      const result = await repository.compareAndWrite(validated.value);
      if (result.status === "committed") {
        setRead(result.readback);
        setFeedback({ kind: "success", message: "created" });
        form.reset();
      } else {
        setFeedback({ kind: "mutation", result });
      }
    } catch (error) {
      setFeedback({
        kind: "validation",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <JourneyPageFrame active="local-event">
      {(locale) => (
        <>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>
              {journeyMessage(locale, "localOnly")}
            </p>
            <h1 className={styles.title}>
              {journeyMessage(locale, "localEventTitle")}
            </h1>
            <p className={styles.lede}>
              {journeyMessage(locale, "localEventIntro")}
            </p>
            <p className={styles.privacyNote}>
              <span className={styles.privacyDot} aria-hidden="true" />
              <span>{journeyMessage(locale, "noAutomaticMerge")}</span>
            </p>
          </section>

          <div className={styles.stack}>
            {read === null ? (
              <section className={styles.notice} role="status">
                <p>{journeyMessage(locale, "loading")}</p>
              </section>
            ) : (
              <JourneyReadAlert locale={locale} read={read} />
            )}
            <JourneyFeedbackAlert feedback={feedback} locale={locale} />
            {feedback?.kind === "mutation" &&
            feedback.result.status === "conflict" ? (
              <button
                className={styles.buttonSecondary}
                onClick={() => void reload()}
                type="button"
              >
                {journeyMessage(locale, "reload")}
              </button>
            ) : null}
            {read !== null &&
            (read.status === "absent" || read.status === "valid") ? (
              <section className={styles.panel}>
                <form className={styles.form} onSubmit={handleSubmit}>
                  <label className={styles.field}>
                    <span>
                      {journeyMessage(locale, "title")} ·{" "}
                      {journeyMessage(locale, "required")}
                    </span>
                    <input
                      autoComplete="off"
                      disabled={busy}
                      maxLength={256}
                      name="title"
                      required
                      type="text"
                    />
                  </label>
                  <div className={styles.twoColumns}>
                    <label className={styles.field}>
                      <span>
                        {journeyMessage(locale, "date")} ·{" "}
                        {journeyMessage(locale, "optional")}
                      </span>
                      <input disabled={busy} name="date" type="date" />
                    </label>
                    <label className={styles.field}>
                      <span>
                        {journeyMessage(locale, "venue")} ·{" "}
                        {journeyMessage(locale, "optional")}
                      </span>
                      <input
                        autoComplete="off"
                        disabled={busy}
                        maxLength={256}
                        name="venue"
                        type="text"
                      />
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span>{journeyMessage(locale, "intent")}</span>
                    <select defaultValue="" disabled={busy} name="intent">
                      <option value="">
                        {journeyMessage(locale, "intentNone")}
                      </option>
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
                      className={styles.button}
                      disabled={busy}
                      type="submit"
                    >
                      {journeyMessage(locale, "saveEvent")}
                    </button>
                    <a className={styles.buttonQuiet} href="/journey/">
                      {journeyMessage(locale, "openJourney")}
                    </a>
                  </div>
                </form>
              </section>
            ) : null}
          </div>
        </>
      )}
    </JourneyPageFrame>
  );
}
