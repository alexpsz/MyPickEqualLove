"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { JourneyDocumentReadResult } from "../../contracts/journey-document.js";
import {
  expectedJourneyRevision,
  sortJourneysForTimeline,
} from "../../features/journey/journey-controller.js";
import { journeyMessage } from "../../i18n/journey/messages.js";
import { validateCompareAndWriteJourneyInput } from "../../ports/journey-repository.js";
import {
  createBrowserJourneyRepository,
  type LocalStorageJourneyRepository,
} from "../../storage/journey-storage.js";
import {
  JourneyFeedbackAlert,
  JourneyReadAlert,
  type JourneyOperationFeedback,
} from "./JourneyAlerts.js";
import { JourneyBackupPanel } from "./JourneyBackupPanel.js";
import { JourneyPageFrame } from "./JourneyPageFrame.js";
import {
  JourneyRecordCard,
  type JourneyMutation,
} from "./JourneyRecordCard.js";
import { InlineConfirmation } from "./InlineConfirmation.js";
import styles from "./journey-ui.module.css";

function currentDocument(read: JourneyDocumentReadResult) {
  return read.status === "valid" ? read.value : null;
}

export function JourneyWorkspace() {
  const repositoryRef = useRef<LocalStorageJourneyRepository | null>(null);
  const [repository, setRepository] =
    useState<LocalStorageJourneyRepository | null>(null);
  const [read, setRead] = useState<JourneyDocumentReadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<JourneyOperationFeedback | null>(
    null,
  );
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

  async function reload() {
    const activeRepository = repositoryRef.current;
    if (activeRepository === null) return;
    setBusy(true);
    setFeedback(null);
    setConfirmingDeleteAll(false);
    try {
      setRead(await activeRepository.read());
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const activeRepository = createBrowserJourneyRepository();
    repositoryRef.current = activeRepository;
    setRepository(activeRepository);
    void activeRepository.read().then(setRead);
    return () => {
      repositoryRef.current = null;
    };
  }, []);

  async function mutate(mutation: JourneyMutation) {
    const activeRepository = repositoryRef.current;
    if (activeRepository === null || read === null || read.status !== "valid") {
      return false;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const next = mutation(read.value);
      const validated = validateCompareAndWriteJourneyInput({
        expectedRevision: expectedJourneyRevision(read.value),
        next,
      });
      if (!validated.ok) {
        throw new Error(validated.reason);
      }
      const result = await activeRepository.compareAndWrite(validated.value);
      if (result.status === "committed") {
        setRead(result.readback);
        setFeedback({ kind: "success", message: "saved" });
        return true;
      }
      setFeedback({ kind: "mutation", result });
      return false;
    } catch (error) {
      setFeedback({
        kind: "validation",
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    const activeRepository = repositoryRef.current;
    if (activeRepository === null || read === null) return;
    const document = currentDocument(read);
    if (document === null) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await activeRepository.deleteAll({
        expectedRevision: expectedJourneyRevision(document),
      });
      if (result.status === "deleted") {
        setRead(result.readback);
        setFeedback({ kind: "success", message: "deleteAllDone" });
        setConfirmingDeleteAll(false);
      } else {
        setFeedback({ kind: "mutation", result });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <JourneyPageFrame active="journey">
      {(locale) => {
        const document = read === null ? null : currentDocument(read);
        const timeline =
          document === null ? [] : sortJourneysForTimeline(document.journeys);
        const writeBlocked =
          read !== null && read.status !== "absent" && read.status !== "valid";
        const showReload =
          writeBlocked ||
          (feedback?.kind === "mutation" &&
            feedback.result.status !== "committed" &&
            feedback.result.status !== "deleted");

        return (
          <>
            <section className={styles.hero}>
              <p className={styles.eyebrow}>
                {journeyMessage(locale, "localOnly")}
              </p>
              <h1 className={styles.title}>
                {journeyMessage(locale, "journeyTitle")}
              </h1>
              <p className={styles.lede}>
                {journeyMessage(locale, "journeyIntro")}
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
              {showReload ? (
                <div className={styles.actionRow}>
                  <button
                    className={styles.buttonSecondary}
                    disabled={busy}
                    onClick={() => void reload()}
                    type="button"
                  >
                    {journeyMessage(locale, "reload")}
                  </button>
                </div>
              ) : null}

              {read !== null && !writeBlocked ? (
                <>
                  {timeline.length === 0 ? (
                    <section className={styles.emptyState}>
                      <h2 className={styles.sectionTitle}>
                        {journeyMessage(locale, "emptyTitle")}
                      </h2>
                      <p className={styles.lede}>
                        {journeyMessage(locale, "emptyBody")}
                      </p>
                      <div className={styles.spacer} />
                      <Link className={styles.button} href="/local-event/">
                        {journeyMessage(locale, "createLocalEvent")}
                      </Link>
                    </section>
                  ) : (
                    <>
                      <div className={styles.actionRow}>
                        <Link
                          className={styles.buttonSecondary}
                          href="/local-event/"
                        >
                          {journeyMessage(locale, "createLocalEvent")}
                        </Link>
                      </div>
                      <ol className={styles.timeline}>
                        {timeline.map((record) => (
                          <li key={record.id}>
                            <JourneyRecordCard
                              busy={busy}
                              locale={locale}
                              onMutate={mutate}
                              record={record}
                            />
                          </li>
                        ))}
                      </ol>
                    </>
                  )}

                  {repository !== null ? (
                    <JourneyBackupPanel
                      busy={busy}
                      current={document}
                      locale={locale}
                      onBusyChange={setBusy}
                      onCommitted={(nextRead) => {
                        setRead(nextRead);
                        setFeedback(null);
                      }}
                      repository={repository}
                    />
                  ) : null}

                  {document !== null ? (
                    <section className={styles.dangerZone}>
                      <h2>{journeyMessage(locale, "deleteAll")}</h2>
                      <p className={styles.lede}>
                        {journeyMessage(locale, "deleteAllWarning")}
                      </p>
                      <div className={styles.spacer} />
                      {confirmingDeleteAll ? (
                        <InlineConfirmation
                          busy={busy}
                          confirmLabel="confirmDeleteAll"
                          locale={locale}
                          message="deleteAllWarning"
                          onCancel={() => setConfirmingDeleteAll(false)}
                          onConfirm={() => void deleteAll()}
                        />
                      ) : (
                        <button
                          className={styles.buttonDanger}
                          disabled={busy}
                          onClick={() => setConfirmingDeleteAll(true)}
                          type="button"
                        >
                          {journeyMessage(locale, "deleteAll")}
                        </button>
                      )}
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </>
        );
      }}
    </JourneyPageFrame>
  );
}
