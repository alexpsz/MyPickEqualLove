"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  JourneyDocumentReadResult,
  JourneyIntent,
} from "../../contracts/journey-document";
import {
  bindJourneyInteraction,
  createLocalCustomJourney,
  expectedJourneyRevision,
  nextJourneyInteractionGeneration,
  validateJourneyInteractionBinding,
  type JourneyInteractionBinding,
} from "../../features/journey/journey-controller";
import { journeyMessage } from "../../i18n/journey/messages";
import { validateCompareAndWriteJourneyInput } from "../../ports/journey-repository";
import {
  createBrowserJourneyRepository,
  type LocalStorageJourneyRepository,
} from "../../storage/journey-storage";
import {
  JourneyFeedbackAlert,
  JourneyReadAlert,
  type JourneyOperationFeedback,
} from "./JourneyAlerts";
import { JourneyPageFrame } from "./JourneyPageFrame";
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

function bindingForRead(
  read: JourneyDocumentReadResult | null,
  generation: number,
) {
  if (read?.status === "absent")
    return bindJourneyInteraction(null, generation);
  if (read?.status === "valid") {
    return bindJourneyInteraction(read.value.revision, generation);
  }
  return null;
}

export function LocalEventCreator() {
  const repositoryRef = useRef<LocalStorageJourneyRepository | null>(null);
  const readRef = useRef<JourneyDocumentReadResult | null>(null);
  const generationRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [read, setRead] = useState<JourneyDocumentReadResult | null>(null);
  const [interactionGeneration, setInteractionGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [feedback, setFeedback] = useState<JourneyOperationFeedback | null>(
    null,
  );

  const focusHeading = useCallback(() => {
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  const invalidateInteractions = useCallback(
    (moveFocus: boolean) => {
      generationRef.current = nextJourneyInteractionGeneration(
        generationRef.current,
      );
      setInteractionGeneration(generationRef.current);
      if (moveFocus) focusHeading();
    },
    [focusHeading],
  );

  const acceptAuthoritativeRead = useCallback(
    (
      nextRead: JourneyDocumentReadResult,
      message: "externalRefresh" | "reloaded" | null,
      moveFocus: boolean,
    ) => {
      readRef.current = nextRead;
      setRead(nextRead);
      setNeedsReload(false);
      setFeedback(message === null ? null : { kind: "success", message });
      invalidateInteractions(moveFocus);
    },
    [invalidateInteractions],
  );

  async function reload() {
    const repository = repositoryRef.current;
    if (repository === null) return;
    setBusy(true);
    try {
      acceptAuthoritativeRead(await repository.read(), "reloaded", true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const repository = createBrowserJourneyRepository();
    let active = true;
    repositoryRef.current = repository;
    void repository.read().then((nextRead) => {
      if (active) acceptAuthoritativeRead(nextRead, null, false);
    });

    function handleStorage(event: StorageEvent) {
      void repository
        .handleStorageEvent({
          key: event.key,
          storageArea: event.storageArea,
        })
        .then((result) => {
          if (active && result.status === "reread") {
            acceptAuthoritativeRead(result.read, "externalRefresh", true);
          }
        });
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      active = false;
      window.removeEventListener("storage", handleStorage);
      repositoryRef.current = null;
    };
  }, [acceptAuthoritativeRead]);

  function rejectStaleInteraction() {
    setNeedsReload(true);
    setFeedback({ kind: "stale" });
    invalidateInteractions(true);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    binding: JourneyInteractionBinding,
  ) {
    event.preventDefault();
    const repository = repositoryRef.current;
    const currentRead = readRef.current;
    const activeBinding = bindingForRead(currentRead, generationRef.current);
    if (repository === null || currentRead === null || activeBinding === null) {
      return;
    }
    if (!validateJourneyInteractionBinding(binding, activeBinding).ok) {
      rejectStaleInteraction();
      return;
    }

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
    try {
      const current = readCurrentDocument(currentRead);
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
        acceptAuthoritativeRead(result.readback, null, false);
        setFeedback({ kind: "success", message: "created" });
      } else {
        setFeedback({ kind: "mutation", result });
        setNeedsReload(true);
        invalidateInteractions(true);
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

  const formBinding = bindingForRead(read, interactionGeneration);
  const readBlocked =
    read !== null && read.status !== "absent" && read.status !== "valid";

  return (
    <JourneyPageFrame active="local-event">
      {(locale) => (
        <>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>
              {journeyMessage(locale, "localOnly")}
            </p>
            <h1 className={styles.title} ref={headingRef} tabIndex={-1}>
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
            {readBlocked || needsReload ? (
              <button
                className={styles.buttonSecondary}
                disabled={busy}
                onClick={() => void reload()}
                type="button"
              >
                {journeyMessage(locale, "reload")}
              </button>
            ) : null}
            {formBinding !== null && !needsReload ? (
              <section className={styles.panel}>
                <form
                  className={styles.form}
                  key={interactionGeneration}
                  onSubmit={(event) => void handleSubmit(event, formBinding)}
                >
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
