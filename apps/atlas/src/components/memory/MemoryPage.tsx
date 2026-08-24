"use client";

import { useEffect, useState } from "react";

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
  type MemorySnapshotBuildResult,
} from "../../share/memory-selection.js";
import { MemoryPreview } from "./MemoryPreview.js";

import styles from "./memory-page.module.css";

const EMPTY_DISCLOSURE: MemoryDisclosureSelection = {
  includePerformanceName: false,
  includeMode: false,
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
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2>{messages.previewTitle}</h2>
        <p>{messages.previewDescription}</p>
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
          <button
            className={styles.primaryButton}
            disabled={generating || sharing}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {generating ? messages.generating : messages.generate}
          </button>
        </>
      )}

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
          ) : (
            <p>{messages.shareUnavailable}</p>
          )}
        </div>
      ) : null}

      {noticeKey ? (
        <p aria-live="polite" className={styles.notice}>
          {messages[noticeKey]}
        </p>
      ) : null}
    </section>
  );
}

export function MemoryPage() {
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
      const next = createMemorySourceCandidates(await repository.read());
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
  }, [publicationGate]);

  useEffect(() => {
    publicationGate.invalidate();
  }, [environmentKey, publicationGate]);

  const candidates = readState.status === "ready" ? readState.candidates : [];
  const candidate =
    candidateIndex === null ? null : (candidates[candidateIndex] ?? null);
  const snapshotResult = candidate
    ? createMemorySnapshot(candidate, selection, messages.localGroupName)
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
    setCandidateIndex(value === "" ? null : Number(value));
    setSelection(EMPTY_DISCLOSURE);
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{messages.eyebrow}</p>
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
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <h2>{messages.selectionTitle}</h2>
              <p>{messages.selectionDescription}</p>
            </div>
            <label className={styles.selectField}>
              <span>{messages.candidateLabel}</span>
              <select
                onChange={(event) => selectCandidate(event.target.value)}
                value={candidateIndex === null ? "" : String(candidateIndex)}
              >
                <option value="">{messages.candidatePlaceholder}</option>
                {candidates.map((item, index) => (
                  <option key={index} value={index}>
                    {`${item.event.groupName ?? messages.localGroupName} · ${item.event.eventName} · ${item.event.date}`}
                  </option>
                ))}
              </select>
            </label>

            {candidate ? (
              <>
                <div className={styles.requiredCard}>
                  <h3>{messages.requiredTitle}</h3>
                  <p>{messages.requiredDescription}</p>
                </div>

                <fieldset className={styles.disclosure}>
                  <legend>{messages.optionalTitle}</legend>
                  <p>{messages.optionalDescription}</p>

                  {candidate.event.performanceName !== null ? (
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

                  {candidate.highlights.map((highlight, index) => (
                    <label className={styles.checkboxRow} key={index}>
                      <input
                        checked={selection.highlightIndexes.includes(index)}
                        onChange={() =>
                          updateSelection({
                            ...selection,
                            highlightIndexes: toggleIndex(
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

                  {candidate.songs.map((song, index) => (
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
                      <small>{messages.summaryPrivacy}</small>
                    </label>
                  ) : null}
                </fieldset>
              </>
            ) : null}
          </section>

          {candidate ? (
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
    </div>
  );
}
