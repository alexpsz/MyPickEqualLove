"use client";

import { useEffect, useState } from "react";

import { MEMORY_NICKNAME_MAX_LENGTH } from "../../contracts/memory-snapshot.js";
import { useShell } from "../../i18n/shell/shell-context.js";
import {
  getMemoryMessages,
  type MemoryMessages,
} from "../../i18n/memory/messages.js";
import {
  ATLAS_JOURNEY_STORAGE_KEY_V1,
  createBrowserJourneyRepository,
} from "../../storage/journey-storage.js";
import {
  canShareMemoryPng,
  createMemoryPublicationEnvironmentKey,
  createMemoryPublicationGate,
  downloadMemoryPng,
  generateMemoryPng,
  shareMemoryPng,
  type MemoryPublicationGate,
  type MemoryPublicationTicket,
  type MemoryPngArtifact,
} from "../../share/memory-browser.js";
import {
  createMemoryDrawPlan,
  type MemoryDrawPlanResult,
} from "../../share/memory-draw-plan.js";
import {
  createMemorySnapshot,
  createMemorySourceCandidates,
  type MemoryCandidateReadResult,
  type MemoryDisclosureSelection,
  type MemoryPublicContextResolver,
  type MemorySnapshotBuildResult,
  type MemorySourceCandidate,
} from "../../share/memory-selection.js";
import { MemoryCandidatePicker } from "./MemoryCandidatePicker.js";
import { MemoryPreview } from "./MemoryPreview.js";

import styles from "./memory-page.module.css";

const EMPTY_DISCLOSURE: MemoryDisclosureSelection = {
  includePerformanceName: false,
  includeMode: false,
  nickname: "",
  highlightIndexes: [],
  songIndexes: [],
  includeSummary: false,
  summary: "",
};

type MemoryNoticeKey =
  | "generated"
  | "generationCancelled"
  | "generationFailed"
  | "downloadStarted"
  | "downloadFailed"
  | "shareComplete"
  | "shareCancelled"
  | "shareUnavailable"
  | "shareRejected";

interface BoundMemoryArtifact {
  readonly artifact: MemoryPngArtifact;
  readonly shareSupported: boolean;
  readonly ticket: MemoryPublicationTicket;
}

function toggleIndex(indexes: readonly number[], index: number) {
  return indexes.includes(index)
    ? indexes.filter((candidate) => candidate !== index)
    : [...indexes, index];
}

function toggleSingleIndex(indexes: readonly number[], index: number) {
  return indexes.includes(index) ? [] : [index];
}

function defaultDisclosureForCandidate(
  candidate: MemorySourceCandidate,
  nickname = "",
): MemoryDisclosureSelection {
  return {
    includePerformanceName: candidate.event.performanceName !== null,
    includeMode: false,
    nickname,
    highlightIndexes: candidate.highlights.length > 0 ? [0] : [],
    songIndexes: candidate.songs.map((_, index) => index),
    includeSummary: false,
    summary: "",
  };
}

interface MemoryPublicationSessionProps {
  readonly environmentKey: string;
  readonly messages: MemoryMessages;
  readonly planResult: MemoryDrawPlanResult | null;
  readonly publicationGate: MemoryPublicationGate;
  readonly snapshotResult: MemorySnapshotBuildResult | null;
}

function MemoryPublicationSession({
  environmentKey,
  messages,
  planResult,
  publicationGate,
  snapshotResult,
}: MemoryPublicationSessionProps) {
  const [boundArtifact, setBoundArtifact] =
    useState<BoundMemoryArtifact | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [noticeKey, setNoticeKey] = useState<MemoryNoticeKey | null>(null);

  useEffect(
    () => () => {
      publicationGate.invalidate();
    },
    [publicationGate],
  );

  const artifactBinding =
    boundArtifact &&
    publicationGate.ownsArtifact(boundArtifact.ticket, environmentKey)
      ? boundArtifact
      : null;

  const handleGenerate = async () => {
    if (snapshotResult?.ok !== true || planResult?.ok !== true) return;

    const ticket = publicationGate.issue(environmentKey, "generate");
    if (ticket === null) return;

    setBoundArtifact(null);
    setGenerating(true);
    setSharing(false);
    setNoticeKey(null);

    const result = await generateMemoryPng(
      {
        async request() {
          return { status: "ready", snapshot: snapshotResult.snapshot };
        },
      },
      messages,
    );
    if (!publicationGate.settle(ticket, environmentKey, "generate")) return;

    setGenerating(false);
    if (result.status === "ready") {
      setBoundArtifact({
        artifact: result.artifact,
        shareSupported: canShareMemoryPng(result.artifact),
        ticket,
      });
      setNoticeKey("generated");
    } else if (result.status === "cancelled") {
      setNoticeKey("generationCancelled");
    } else {
      setNoticeKey("generationFailed");
    }
  };

  const handleDownload = () => {
    if (
      boundArtifact === null ||
      !publicationGate.ownsArtifact(boundArtifact.ticket, environmentKey)
    ) {
      return;
    }
    const result = downloadMemoryPng(boundArtifact.artifact);
    setNoticeKey(
      result.status === "started" ? "downloadStarted" : "downloadFailed",
    );
  };

  const handleShare = async () => {
    if (
      boundArtifact === null ||
      !boundArtifact.shareSupported ||
      !publicationGate.ownsArtifact(boundArtifact.ticket, environmentKey)
    ) {
      return;
    }

    const ticket = publicationGate.issue(environmentKey, "share");
    if (ticket === null) return;

    setSharing(true);
    setNoticeKey(null);
    const result = await shareMemoryPng(boundArtifact.artifact);
    if (!publicationGate.settle(ticket, environmentKey, "share")) return;

    setSharing(false);
    setNoticeKey(
      result.status === "shared"
        ? "shareComplete"
        : result.status === "cancelled"
          ? "shareCancelled"
          : result.status === "unsupported"
            ? "shareUnavailable"
            : "shareRejected",
    );
  };

  return (
    <section className={`${styles.panel} ${styles.previewPanel}`}>
      <div className={styles.sectionHeading}>
        <h2>{messages.previewTitle}</h2>
      </div>

      {snapshotResult?.ok !== true ? (
        <p className={styles.error} role="alert">
          {messages.invalidSelection}
        </p>
      ) : planResult?.ok !== true ? (
        <p className={styles.error} role="alert">
          {messages.contentTooLong}
        </p>
      ) : (
        <>
          <MemoryPreview
            className={styles.previewCard}
            plan={planResult.plan}
          />
          <div className={styles.previewActions}>
            <button
              className={styles.primaryButton}
              disabled={generating || sharing}
              onClick={() => void handleGenerate()}
              type="button"
            >
              {generating ? messages.generating : messages.generate}
            </button>

            {artifactBinding ? (
              <div className={styles.actions}>
                <button onClick={handleDownload} type="button">
                  {messages.download}
                </button>
                {artifactBinding.shareSupported ? (
                  <button
                    disabled={sharing}
                    onClick={() => void handleShare()}
                    type="button"
                  >
                    {messages.share}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}

      {artifactBinding && !artifactBinding.shareSupported ? (
        <p className={styles.assistiveCopy}>{messages.shareUnavailable}</p>
      ) : null}

      {noticeKey ? (
        <p aria-live="polite" className={styles.notice}>
          {messages[noticeKey]}
        </p>
      ) : null}
    </section>
  );
}

export interface MemoryPageProps {
  readonly resolvePublicContext?: MemoryPublicContextResolver;
}

export function MemoryPage({ resolvePublicContext }: MemoryPageProps = {}) {
  const { locale, theme } = useShell();
  const messages = getMemoryMessages(locale);
  const environmentKey = createMemoryPublicationEnvironmentKey(locale, theme);
  const [publicationGate] = useState(() => createMemoryPublicationGate());
  const [publicationRevision, setPublicationRevision] = useState(0);
  const [readState, setReadState] = useState<
    MemoryCandidateReadResult | { readonly status: "loading" }
  >({ status: "loading" });
  const [candidateIndex, setCandidateIndex] = useState<number | null>(null);
  const [selection, setSelection] =
    useState<MemoryDisclosureSelection>(EMPTY_DISCLOSURE);

  useEffect(() => {
    const repository = createBrowserJourneyRepository();
    let active = true;
    publicationGate.activate();

    const readJourney = async () => {
      const next = createMemorySourceCandidates(
        await repository.read(),
        resolvePublicContext,
      );
      if (!active) return;
      publicationGate.invalidate();
      setPublicationRevision((revision) => revision + 1);
      setReadState(next);
      setCandidateIndex(null);
      setSelection(EMPTY_DISCLOSURE);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ATLAS_JOURNEY_STORAGE_KEY_V1) {
        publicationGate.invalidate();
        setPublicationRevision((revision) => revision + 1);
        setReadState({ status: "loading" });
        setCandidateIndex(null);
        setSelection(EMPTY_DISCLOSURE);
        void readJourney();
      }
    };

    void readJourney();
    window.addEventListener("storage", handleStorage);
    return () => {
      active = false;
      publicationGate.deactivate();
      window.removeEventListener("storage", handleStorage);
    };
  }, [publicationGate, resolvePublicContext]);

  useEffect(() => {
    publicationGate.invalidate();
  }, [environmentKey, publicationGate]);

  const candidates = readState.status === "ready" ? readState.candidates : [];
  const candidate =
    candidateIndex === null ? null : (candidates[candidateIndex] ?? null);
  const displayCandidate = candidate
    ? {
        ...candidate,
        songs: candidate.songs.map((song) => ({
          ...song,
          groupName: candidate.event.groupName ?? song.groupName,
        })),
      }
    : null;
  const snapshotResult = displayCandidate
    ? createMemorySnapshot(displayCandidate, selection, messages.localGroupName)
    : null;
  const planResult =
    snapshotResult?.ok === true
      ? createMemoryDrawPlan(snapshotResult.snapshot, messages)
      : null;

  const invalidatePublication = () => {
    publicationGate.invalidate();
    setPublicationRevision((revision) => revision + 1);
  };

  const updateSelection = (next: MemoryDisclosureSelection) => {
    invalidatePublication();
    setSelection(next);
  };

  const selectCandidate = (value: string) => {
    invalidatePublication();
    const nextIndex = value === "" ? null : Number(value);
    const nextCandidate =
      nextIndex === null ? null : (candidates[nextIndex] ?? null);
    setCandidateIndex(nextCandidate === null ? null : nextIndex);
    setSelection((current) =>
      nextCandidate === null
        ? { ...EMPTY_DISCLOSURE, nickname: current.nickname }
        : defaultDisclosureForCandidate(nextCandidate, current.nickname),
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <a className={styles.backLink} href="/journey/">
          <span aria-hidden="true">←</span>
          {messages.backToJourney}
        </a>
        <h1>{messages.title}</h1>
        <p>{messages.description}</p>
      </header>

      {readState.status === "loading" ? (
        <section aria-live="polite" className={styles.stateCard}>
          <p>{messages.loading}</p>
        </section>
      ) : readState.status === "empty" ? (
        <section className={styles.stateCard}>
          <h2>{messages.emptyTitle}</h2>
          <p>{messages.emptyDescription}</p>
        </section>
      ) : readState.status === "unavailable" ? (
        <section className={styles.stateCard}>
          <h2>{messages.unavailableTitle}</h2>
          <p>{messages.unavailableDescription}</p>
        </section>
      ) : (
        <div className={styles.workspace}>
          <section className={`${styles.panel} ${styles.editorPanel}`}>
            <div className={styles.sectionHeading}>
              <h2>{messages.selectionTitle}</h2>
            </div>
            <MemoryCandidatePicker
              candidates={candidates}
              messages={messages}
              onValueChange={selectCandidate}
              value={candidateIndex === null ? "" : String(candidateIndex)}
            />

            {displayCandidate ? (
              <>
                <div className={styles.experienceCard}>
                  <p className={styles.experienceGroup}>
                    {displayCandidate.event.groupName ??
                      messages.localGroupName}
                  </p>
                  <h3>{displayCandidate.event.eventName}</h3>
                  {displayCandidate.event.performanceName ? (
                    <p className={styles.experiencePerformance}>
                      {displayCandidate.event.performanceName}
                    </p>
                  ) : null}
                  <div className={styles.experienceMeta}>
                    <span>{displayCandidate.event.date}</span>
                    {displayCandidate.venueName ? (
                      <span>{displayCandidate.venueName}</span>
                    ) : null}
                    <span className={styles.modePill}>
                      {messages.card.modes[displayCandidate.mode]}
                    </span>
                  </div>
                </div>

                <fieldset className={styles.disclosure}>
                  <legend>{messages.showTitle}</legend>

                  {displayCandidate.event.performanceName !== null ? (
                    <label className={styles.checkboxRow}>
                      <input
                        checked={selection.includePerformanceName}
                        onChange={(event) =>
                          updateSelection({
                            ...selection,
                            includePerformanceName: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                      <span>{messages.includePerformanceName}</span>
                    </label>
                  ) : null}

                  <label className={styles.checkboxRow}>
                    <input
                      checked={selection.includeMode}
                      onChange={(event) =>
                        updateSelection({
                          ...selection,
                          includeMode: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    <span>{messages.includeMode}</span>
                  </label>

                  <label className={styles.nicknameField}>
                    <span>{messages.nicknameLabel}</span>
                    <span className={styles.nicknameInput}>
                      <input
                        maxLength={MEMORY_NICKNAME_MAX_LENGTH}
                        onChange={(event) =>
                          updateSelection({
                            ...selection,
                            nickname: event.target.value.slice(
                              0,
                              MEMORY_NICKNAME_MAX_LENGTH,
                            ),
                          })
                        }
                        placeholder={messages.nicknamePlaceholder}
                        type="text"
                        value={selection.nickname}
                      />
                      <span aria-hidden="true" className={styles.nicknameCount}>
                        {selection.nickname.length}/{MEMORY_NICKNAME_MAX_LENGTH}
                      </span>
                    </span>
                  </label>

                  {displayCandidate.highlights.map((highlight, index) => (
                    <label className={styles.checkboxRow} key={index}>
                      <input
                        checked={selection.highlightIndexes.includes(index)}
                        onChange={() =>
                          updateSelection({
                            ...selection,
                            highlightIndexes: toggleSingleIndex(
                              selection.highlightIndexes,
                              index,
                            ),
                          })
                        }
                        type="checkbox"
                      />
                      <span>{`${messages.includeHighlight} ${highlight}`}</span>
                    </label>
                  ))}

                  {displayCandidate.songs.map((song, index) => (
                    <label className={styles.checkboxRow} key={index}>
                      <input
                        checked={selection.songIndexes.includes(index)}
                        onChange={() =>
                          updateSelection({
                            ...selection,
                            songIndexes: toggleIndex(
                              selection.songIndexes,
                              index,
                            ),
                          })
                        }
                        type="checkbox"
                      />
                      <span>{`${messages.includeSong} ${song.groupName} · ${song.title}`}</span>
                    </label>
                  ))}

                  <label className={styles.checkboxRow}>
                    <input
                      checked={selection.includeSummary}
                      onChange={(event) =>
                        updateSelection({
                          ...selection,
                          includeSummary: event.target.checked,
                          summary: event.target.checked
                            ? selection.summary
                            : "",
                        })
                      }
                      type="checkbox"
                    />
                    <span>{messages.includeSummary}</span>
                  </label>
                  {selection.includeSummary ? (
                    <label className={styles.summaryField}>
                      <span>{messages.summaryLabel}</span>
                      <textarea
                        maxLength={280}
                        onChange={(event) =>
                          updateSelection({
                            ...selection,
                            summary: event.target.value,
                          })
                        }
                        placeholder={messages.summaryPlaceholder}
                        rows={3}
                        value={selection.summary}
                      />
                    </label>
                  ) : null}
                </fieldset>

                {displayCandidate.exactMyPickHref ? (
                  <a
                    className={styles.myPickLink}
                    href={displayCandidate.exactMyPickHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {messages.makeMyPick}
                    <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </>
            ) : null}
          </section>

          {displayCandidate ? (
            <MemoryPublicationSession
              environmentKey={environmentKey}
              key={`${environmentKey}:${publicationRevision}`}
              messages={messages}
              planResult={planResult}
              publicationGate={publicationGate}
              snapshotResult={snapshotResult}
            />
          ) : null}
        </div>
      )}

      <p className={styles.privacyLine}>
        <span aria-hidden="true">✓</span>
        {messages.privacyLine}
      </p>
    </div>
  );
}
