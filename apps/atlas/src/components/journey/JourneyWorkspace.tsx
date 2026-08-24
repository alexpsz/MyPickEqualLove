"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { JourneyDocumentReadResult } from "../../contracts/journey-document.js";
import {
  bindJourneyInteraction,
  expectedJourneyRevision,
  nextJourneyInteractionGeneration,
  sortJourneysForTimeline,
  validateJourneyInteractionBinding,
  type JourneyInteractionBinding,
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

function focusAfterRender(
  preferred: RefObject<HTMLElement | null>,
  fallback: RefObject<HTMLElement | null>,
) {
  requestAnimationFrame(() => {
    (preferred.current ?? fallback.current)?.focus();
  });
}

export function JourneyWorkspace() {
  const repositoryRef = useRef<LocalStorageJourneyRepository | null>(null);
  const readRef = useRef<JourneyDocumentReadResult | null>(null);
  const generationRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deleteAllButtonRef = useRef<HTMLButtonElement>(null);
  const [read, setRead] = useState<JourneyDocumentReadResult | null>(null);
  const [interactionGeneration, setInteractionGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [feedback, setFeedback] = useState<JourneyOperationFeedback | null>(
    null,
  );
  const [deleteAllBinding, setDeleteAllBinding] =
    useState<JourneyInteractionBinding | null>(null);

  const focusWorkspace = useCallback(() => {
    focusAfterRender(headingRef, headingRef);
  }, []);

  const invalidateInteractions = useCallback(
    (moveFocus: boolean) => {
      generationRef.current = nextJourneyInteractionGeneration(
        generationRef.current,
      );
      setInteractionGeneration(generationRef.current);
      setDeleteAllBinding(null);
      if (moveFocus) focusWorkspace();
    },
    [focusWorkspace],
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
    const activeRepository = repositoryRef.current;
    if (activeRepository === null) return;
    setBusy(true);
    try {
      acceptAuthoritativeRead(await activeRepository.read(), "reloaded", true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const activeRepository = createBrowserJourneyRepository();
    let active = true;
    repositoryRef.current = activeRepository;
    void activeRepository.read().then((nextRead) => {
      if (active) acceptAuthoritativeRead(nextRead, null, false);
    });

    function handleStorage(event: StorageEvent) {
      void activeRepository
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

  function currentInteractionBinding() {
    const currentRead = readRef.current;
    return currentRead?.status === "valid"
      ? bindJourneyInteraction(
          currentRead.value.revision,
          generationRef.current,
        )
      : null;
  }

  function rejectStaleInteraction() {
    setNeedsReload(true);
    setFeedback({ kind: "stale" });
    invalidateInteractions(true);
  }

  async function mutate(
    binding: JourneyInteractionBinding,
    mutation: JourneyMutation,
  ) {
    const activeRepository = repositoryRef.current;
    const currentRead = readRef.current;
    const activeBinding = currentInteractionBinding();
    if (
      activeRepository === null ||
      currentRead?.status !== "valid" ||
      activeBinding === null
    ) {
      return false;
    }
    if (!validateJourneyInteractionBinding(binding, activeBinding).ok) {
      rejectStaleInteraction();
      return false;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const next = mutation(currentRead.value);
      const validated = validateCompareAndWriteJourneyInput({
        expectedRevision: expectedJourneyRevision(currentRead.value),
        next,
      });
      if (!validated.ok) {
        throw new Error(validated.reason);
      }
      const result = await activeRepository.compareAndWrite(validated.value);
      if (result.status === "committed") {
        acceptAuthoritativeRead(result.readback, null, false);
        setFeedback({ kind: "success", message: "saved" });
        return true;
      }
      setFeedback({ kind: "mutation", result });
      setNeedsReload(true);
      invalidateInteractions(true);
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

  function closeDeleteAllConfirmation() {
    setDeleteAllBinding(null);
    focusAfterRender(deleteAllButtonRef, headingRef);
  }

  async function deleteAll(binding: JourneyInteractionBinding) {
    const activeRepository = repositoryRef.current;
    const currentRead = readRef.current;
    const activeBinding = currentInteractionBinding();
    if (
      activeRepository === null ||
      currentRead?.status !== "valid" ||
      activeBinding === null
    ) {
      closeDeleteAllConfirmation();
      return;
    }
    if (!validateJourneyInteractionBinding(binding, activeBinding).ok) {
      rejectStaleInteraction();
      closeDeleteAllConfirmation();
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = await activeRepository.deleteAll({
        expectedRevision: expectedJourneyRevision(currentRead.value),
      });
      if (result.status === "deleted") {
        acceptAuthoritativeRead(result.readback, null, false);
        setFeedback({ kind: "success", message: "deleteAllDone" });
      } else {
        setFeedback({ kind: "mutation", result });
        setNeedsReload(true);
        invalidateInteractions(false);
      }
    } finally {
      setBusy(false);
      setDeleteAllBinding(null);
      focusAfterRender(deleteAllButtonRef, headingRef);
    }
  }

  return (
    <JourneyPageFrame active="journey">
      {(locale) => {
        const document = read === null ? null : currentDocument(read);
        const timeline =
          document === null ? [] : sortJourneysForTimeline(document.journeys);
        const readBlocked =
          read !== null && read.status !== "absent" && read.status !== "valid";
        const writeBlocked = readBlocked || needsReload;

        return (
          <>
            <section className={styles.hero}>
              <p className={styles.eyebrow}>
                {journeyMessage(locale, "localOnly")}
              </p>
              <h1 className={styles.title} ref={headingRef} tabIndex={-1}>
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
              {readBlocked || needsReload ? (
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
                          <li key={`${record.id}:${interactionGeneration}`}>
                            <JourneyRecordCard
                              busy={busy}
                              documentRevision={document?.revision ?? 0}
                              interactionGeneration={interactionGeneration}
                              locale={locale}
                              onFocusFallback={focusWorkspace}
                              onMutate={mutate}
                              record={record}
                            />
                          </li>
                        ))}
                      </ol>
                    </>
                  )}

                  <JourneyBackupPanel
                    busy={busy}
                    current={document}
                    locale={locale}
                    onRestoreCommitted={(restoredRead) => {
                      acceptAuthoritativeRead(restoredRead, null, false);
                    }}
                  />

                  {document !== null ? (
                    <section className={styles.dangerZone}>
                      <h2>{journeyMessage(locale, "deleteAll")}</h2>
                      <p className={styles.lede}>
                        {journeyMessage(locale, "deleteAllWarning")}
                      </p>
                      <div className={styles.spacer} />
                      {deleteAllBinding !== null ? (
                        <InlineConfirmation
                          busy={busy}
                          confirmLabel="confirmDeleteAll"
                          locale={locale}
                          message="deleteAllWarning"
                          onCancel={closeDeleteAllConfirmation}
                          onConfirm={() => void deleteAll(deleteAllBinding)}
                        />
                      ) : (
                        <button
                          className={styles.buttonDanger}
                          disabled={busy}
                          onClick={() => {
                            const binding = currentInteractionBinding();
                            if (binding !== null) setDeleteAllBinding(binding);
                          }}
                          ref={deleteAllButtonRef}
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
