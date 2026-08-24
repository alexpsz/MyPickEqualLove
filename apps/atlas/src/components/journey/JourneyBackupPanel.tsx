"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  ATLAS_BACKUP_MAX_BYTES,
  dryRunAtlasBackupRestore,
  encodeAtlasBackup,
  type AtlasBackupDryRunResult,
} from "../../backup/backup-codec";
import type {
  JourneyDocumentReadResult,
  JourneyDocumentV1,
} from "../../contracts/journey-document";
import { expectedJourneyRevision } from "../../features/journey/journey-controller";
import {
  journeyMessage,
  type JourneyMessageKey,
} from "../../i18n/journey/messages";
import type { JourneyLocale } from "../../i18n/journey/translate";
import type { JourneyReplaceApplyPlan } from "../../ports/restore-plan";
import {
  createBrowserJourneyRepository,
  type JourneyReplaceEligibilityInput,
  type JourneyReplaceEligibilityResult,
  type JourneyReplacePlanApplyResult,
} from "../../storage/journey-storage";
import { JourneyFeedbackAlert, TextNotice } from "./JourneyAlerts";
import styles from "./journey-ui.module.css";

type ReadyDryRun = Extract<
  AtlasBackupDryRunResult,
  { readonly status: "ready" }
>;

type RestoreFeedback =
  | {
      readonly status: "oversize" | "corrupt" | "invalid" | "capacity-failed";
      readonly error?: string;
      readonly required?: number;
    }
  | {
      readonly status: "future-version";
      readonly version: number;
    }
  | {
      readonly status: "ineligible";
      readonly required: number;
    }
  | {
      readonly status: "eligibility-error" | "unexpected";
      readonly error: string;
    }
  | { readonly status: "stale" }
  | {
      readonly status: "apply-result";
      readonly result: JourneyReplacePlanApplyResult;
    }
  | { readonly status: "applied" };

export interface JourneyBackupFile {
  readonly size: number;
  text(): Promise<string>;
}

export interface JourneyBackupWorkflowRepository {
  read(): Promise<JourneyDocumentReadResult>;
  preflightReplaceEligibility(
    input: JourneyReplaceEligibilityInput,
  ): Promise<JourneyReplaceEligibilityResult>;
  applyReplacePlan(
    plan: JourneyReplaceApplyPlan,
  ): Promise<JourneyReplacePlanApplyResult>;
}

type RestoreCommittedHandler = (
  read: Extract<JourneyDocumentReadResult, { readonly status: "valid" }>,
) => void;

interface RestoreSession {
  readonly binding: string;
  readonly dryRun: ReadyDryRun;
  readonly eligibility: Extract<
    JourneyReplaceEligibilityResult,
    { readonly status: "eligible" }
  >;
}

export type JourneyBackupWorkflowState =
  | {
      readonly status: "idle";
      readonly feedback: RestoreFeedback | null;
      readonly session: null;
    }
  | {
      readonly status: "reading" | "applying";
      readonly feedback: null;
      readonly session: null;
    }
  | {
      readonly status: "review";
      readonly feedback: null;
      readonly session: RestoreSession;
    };

export interface JourneyBackupWorkflowDependencies {
  readonly getCurrent: () => JourneyDocumentV1 | null;
  readonly getRepository: () => JourneyBackupWorkflowRepository;
  readonly now: () => string;
  readonly onCommittedRead: RestoreCommittedHandler;
  readonly onStateChange: (state: JourneyBackupWorkflowState) => void;
  readonly onFocusRequest: () => void;
}

const IDLE_RESTORE_STATE: JourneyBackupWorkflowState = {
  status: "idle",
  feedback: null,
  session: null,
};

function documentBinding(document: JourneyDocumentV1 | null) {
  return document === null
    ? "absent"
    : `${document.revision}:${document.updatedAt}:${JSON.stringify(document)}`;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function feedbackForDryRun(
  result: Exclude<AtlasBackupDryRunResult, ReadyDryRun>,
): RestoreFeedback | null {
  if (result.status === "cancelled") return null;
  if (result.status === "oversize") return { status: "oversize" };
  if (result.status === "corrupt") return { status: "corrupt" };
  if (result.status === "future-version") {
    return { status: "future-version", version: result.version };
  }
  if (result.status === "capacity-failed") {
    return {
      status: "capacity-failed",
      required: result.replacementByteLength,
    };
  }
  return {
    status: "invalid",
    error: `${result.issue.path}: ${result.issue.message}`,
  };
}

function rereadMatchesCommitted(
  read: JourneyDocumentReadResult,
  result: Extract<
    JourneyReplacePlanApplyResult,
    { readonly status: "committed" }
  >,
): read is Extract<JourneyDocumentReadResult, { readonly status: "valid" }> {
  return (
    read.status === "valid" &&
    JSON.stringify(read.value) === JSON.stringify(result.readback.value)
  );
}

/**
 * One-shot restore workflow used by the UI and its behavior tests. P2 creates
 * the pure plan; P1 alone decides whether it is eligible and applies it.
 */
export function createJourneyBackupWorkflow(
  dependencies: JourneyBackupWorkflowDependencies,
) {
  let connectionGeneration = 0;
  let activeConnection: number | null = null;
  let operation = 0;
  let state = IDLE_RESTORE_STATE;

  function publish(
    next: JourneyBackupWorkflowState,
    connection = activeConnection,
  ) {
    if (connection === null || activeConnection !== connection) return false;
    state = next;
    dependencies.onStateChange(next);
    return true;
  }

  function settle(
    feedback: RestoreFeedback | null,
    focus = true,
    connection = activeConnection,
  ) {
    if (publish({ status: "idle", feedback, session: null }, connection)) {
      if (focus) dependencies.onFocusRequest();
    }
  }

  function isCurrent(connection: number, ticket: number) {
    return activeConnection === connection && operation === ticket;
  }

  function connect() {
    const connection = ++connectionGeneration;
    activeConnection = connection;
    operation += 1;
    state = IDLE_RESTORE_STATE;
    dependencies.onStateChange(IDLE_RESTORE_STATE);
    return () => {
      if (activeConnection !== connection) return;
      activeConnection = null;
      operation += 1;
      state = IDLE_RESTORE_STATE;
    };
  }

  function beginPicker() {
    if (activeConnection === null) return;
    operation += 1;
    publish(IDLE_RESTORE_STATE);
  }

  async function selectFile(file: JourneyBackupFile | null) {
    const connection = activeConnection;
    if (connection === null) return;
    const ticket = ++operation;
    publish({ status: "reading", feedback: null, session: null }, connection);
    if (file === null) {
      settle(null, false, connection);
      return;
    }
    if (file.size > ATLAS_BACKUP_MAX_BYTES) {
      settle({ status: "oversize" }, true, connection);
      return;
    }

    const current = dependencies.getCurrent();
    const binding = documentBinding(current);
    try {
      const raw = await file.text();
      if (
        !isCurrent(connection, ticket) ||
        binding !== documentBinding(dependencies.getCurrent())
      ) {
        return;
      }
      const dryRun = dryRunAtlasBackupRestore({
        import: {
          status: "selected",
          raw,
          limits: { maximumBytes: ATLAS_BACKUP_MAX_BYTES },
        },
        current,
        now: dependencies.now(),
        transaction: {
          expectedRevision: expectedJourneyRevision(current),
          availableBytes: ATLAS_BACKUP_MAX_BYTES,
        },
      });
      if (dryRun.status !== "ready") {
        settle(feedbackForDryRun(dryRun), true, connection);
        return;
      }

      const eligibility = await dependencies
        .getRepository()
        .preflightReplaceEligibility({ plan: dryRun.applyPlan });
      if (
        !isCurrent(connection, ticket) ||
        binding !== documentBinding(dependencies.getCurrent())
      ) {
        return;
      }
      if (eligibility.status === "eligible") {
        publish(
          {
            status: "review",
            feedback: null,
            session: { binding, dryRun, eligibility },
          },
          connection,
        );
        return;
      }
      if (eligibility.status === "ineligible") {
        settle(
          {
            status: "ineligible",
            required: eligibility.requiredStorageUnits,
          },
          true,
          connection,
        );
        return;
      }
      settle(
        { status: "eligibility-error", error: eligibility.error },
        true,
        connection,
      );
    } catch (error) {
      if (isCurrent(connection, ticket)) {
        settle(
          { status: "unexpected", error: describeError(error) },
          true,
          connection,
        );
      }
    }
  }

  function discard() {
    const connection = activeConnection;
    if (connection === null) return;
    operation += 1;
    settle(null, true, connection);
  }

  function invalidateForCurrentChange() {
    const connection = activeConnection;
    if (connection === null) return;
    const hadActiveRestore = state.status !== "idle";
    operation += 1;
    settle(
      hadActiveRestore ? { status: "stale" } : null,
      hadActiveRestore,
      connection,
    );
  }

  async function apply() {
    const connection = activeConnection;
    if (connection === null || state.status !== "review") {
      return "ignored" as const;
    }
    const session = state.session;
    const ticket = ++operation;
    publish({ status: "applying", feedback: null, session: null }, connection);
    if (session.binding !== documentBinding(dependencies.getCurrent())) {
      settle({ status: "stale" }, true, connection);
      return "rejected" as const;
    }

    try {
      const result = await dependencies
        .getRepository()
        .applyReplacePlan(session.dryRun.applyPlan);
      if (!isCurrent(connection, ticket)) return "ignored" as const;
      if (result.status !== "committed") {
        settle({ status: "apply-result", result }, true, connection);
        return "rejected" as const;
      }
      const reread = await dependencies.getRepository().read();
      if (!isCurrent(connection, ticket)) return "ignored" as const;
      if (!rereadMatchesCommitted(reread, result)) {
        settle(
          {
            status: "unexpected",
            error: `authoritative reread returned ${reread.status}`,
          },
          true,
          connection,
        );
        return "rejected" as const;
      }
      dependencies.onCommittedRead(reread);
      settle({ status: "applied" }, true, connection);
      return "applied" as const;
    } catch (error) {
      if (isCurrent(connection, ticket)) {
        settle(
          { status: "unexpected", error: describeError(error) },
          true,
          connection,
        );
      }
      return "rejected" as const;
    }
  }

  return {
    apply,
    beginPicker,
    connect,
    discard,
    invalidateForCurrentChange,
    selectFile,
  };
}

function createJourneyBackupWorkflowBinding({
  current: initialCurrent,
  onRestoreCommitted: initialOnRestoreCommitted,
  onStateChange,
}: {
  readonly current: JourneyDocumentV1 | null;
  readonly onRestoreCommitted: RestoreCommittedHandler;
  readonly onStateChange: (state: JourneyBackupWorkflowState) => void;
}) {
  let current = initialCurrent;
  let onRestoreCommitted = initialOnRestoreCommitted;
  let onFocusRequest = () => {};
  let repository: JourneyBackupWorkflowRepository | null = null;
  const workflow = createJourneyBackupWorkflow({
    getCurrent: () => current,
    getRepository: () => {
      repository ??= createBrowserJourneyRepository();
      return repository;
    },
    now: () => new Date().toISOString(),
    onCommittedRead: (read) => onRestoreCommitted(read),
    onStateChange,
    onFocusRequest: () => onFocusRequest(),
  });

  return {
    workflow,
    update({
      current: nextCurrent,
      onRestoreCommitted: nextOnRestoreCommitted,
      onFocusRequest: nextOnFocusRequest,
    }: {
      readonly current: JourneyDocumentV1 | null;
      readonly onRestoreCommitted: RestoreCommittedHandler;
      readonly onFocusRequest: () => void;
    }) {
      current = nextCurrent;
      onRestoreCommitted = nextOnRestoreCommitted;
      onFocusRequest = nextOnFocusRequest;
    },
  };
}

type BackupFeedback =
  | { readonly status: "exported" }
  | { readonly status: "empty" }
  | { readonly status: "invalid"; readonly error: string };

function downloadBackup(raw: string, exportedAt: string) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `atlas-journey-backup-${exportedAt.slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function BackupNotice({
  locale,
  feedback,
}: {
  readonly locale: JourneyLocale;
  readonly feedback: BackupFeedback | null;
}) {
  if (feedback === null) return null;
  if (feedback.status === "exported") {
    return <TextNotice locale={locale} title="backupExported" tone="success" />;
  }
  if (feedback.status === "empty") {
    return <TextNotice locale={locale} title="backupEmpty" tone="warning" />;
  }
  return (
    <TextNotice
      locale={locale}
      title="importInvalid"
      tone="error"
      values={{ error: feedback.error }}
    />
  );
}

function RestoreNotice({
  feedback,
  locale,
}: {
  readonly feedback: RestoreFeedback | null;
  readonly locale: JourneyLocale;
}) {
  if (feedback === null) return null;
  if (feedback.status === "apply-result") {
    return (
      <JourneyFeedbackAlert
        feedback={{ kind: "mutation", result: feedback.result }}
        locale={locale}
      />
    );
  }
  if (feedback.status === "stale") {
    return (
      <TextNotice
        body="restoreStaleBody"
        locale={locale}
        title="restoreStaleTitle"
        tone="warning"
      />
    );
  }
  if (feedback.status === "applied") {
    return <TextNotice locale={locale} title="restoreApplied" tone="success" />;
  }
  if (feedback.status === "oversize") {
    return <TextNotice locale={locale} title="importOversize" tone="error" />;
  }
  if (feedback.status === "corrupt") {
    return <TextNotice locale={locale} title="importCorrupt" tone="error" />;
  }
  if (feedback.status === "future-version") {
    return (
      <TextNotice
        locale={locale}
        title="importFuture"
        tone="error"
        values={{ version: feedback.version }}
      />
    );
  }
  if (feedback.status === "ineligible") {
    return (
      <TextNotice
        locale={locale}
        title="importIneligible"
        tone="error"
        values={{
          limit: ATLAS_BACKUP_MAX_BYTES,
          required: feedback.required,
        }}
      />
    );
  }
  if (feedback.status === "capacity-failed") {
    return (
      <TextNotice
        locale={locale}
        title="importIneligible"
        tone="error"
        values={{
          limit: ATLAS_BACKUP_MAX_BYTES,
          required: feedback.required ?? 0,
        }}
      />
    );
  }
  const error = feedback.error ?? journeyMessage(locale, "estimateUnavailable");
  return (
    <TextNotice
      locale={locale}
      title={
        feedback.status === "unexpected" ? "restoreUnexpected" : "importInvalid"
      }
      tone="error"
      values={{ error }}
    />
  );
}

function SummaryCard({
  locale,
  title,
  summary,
}: {
  readonly locale: JourneyLocale;
  readonly title: JourneyMessageKey;
  readonly summary: ReadyDryRun["applyPlan"]["summary"]["journeys"];
}) {
  const rows = [
    ["before", summary.before],
    ["after", summary.after],
    ["added", summary.added],
    ["updated", summary.updated],
    ["removed", summary.deleted],
    ["unchanged", summary.unchanged],
  ] as const;
  return (
    <section className={styles.summaryCard}>
      <h3>{journeyMessage(locale, title)}</h3>
      <dl>
        {rows.map(([key, value]) => (
          <div className={styles.summaryRow} key={key}>
            <dt>{journeyMessage(locale, key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function JourneyBackupPanel({
  locale,
  current,
  busy,
  onRestoreCommitted,
}: {
  readonly locale: JourneyLocale;
  readonly current: JourneyDocumentV1 | null;
  readonly busy: boolean;
  readonly onRestoreCommitted: RestoreCommittedHandler;
}) {
  const [backupFeedback, setBackupFeedback] = useState<BackupFeedback | null>(
    null,
  );
  const [restoreState, setRestoreState] =
    useState<JourneyBackupWorkflowState>(IDLE_RESTORE_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [workflowBinding] = useState(() =>
    createJourneyBackupWorkflowBinding({
      current,
      onRestoreCommitted,
      onStateChange: setRestoreState,
    }),
  );
  const workflow = workflowBinding.workflow;
  const currentBinding = documentBinding(current);
  const previousBindingRef = useRef(currentBinding);

  useEffect(() => {
    workflowBinding.update({
      current,
      onRestoreCommitted,
      onFocusRequest: () => {
        requestAnimationFrame(() => fileInputRef.current?.focus());
      },
    });
  }, [current, onRestoreCommitted, workflowBinding]);

  useEffect(() => {
    if (previousBindingRef.current !== currentBinding) {
      previousBindingRef.current = currentBinding;
      if (fileInputRef.current !== null) fileInputRef.current.value = "";
      if (restoreState.feedback?.status !== "applied") {
        workflow.invalidateForCurrentChange();
      }
    }
  }, [currentBinding, restoreState.feedback, workflow]);

  useEffect(() => {
    if (restoreState.status === "review") {
      confirmRef.current?.focus();
    }
  }, [restoreState.status]);

  useEffect(() => {
    const disconnect = workflow.connect();
    const fileInput = fileInputRef.current;
    return () => {
      if (fileInput !== null) fileInput.value = "";
      disconnect();
    };
  }, [workflow]);

  function handleExport() {
    setBackupFeedback(null);
    if (current === null) {
      setBackupFeedback({ status: "empty" });
      return;
    }
    try {
      const exportedAt = new Date().toISOString();
      downloadBackup(
        encodeAtlasBackup({ exportedAt, journey: current }),
        exportedAt,
      );
      setBackupFeedback({ status: "exported" });
    } catch (error) {
      setBackupFeedback({ status: "invalid", error: describeError(error) });
    }
  }

  function handlePickerClick(event: MouseEvent<HTMLInputElement>) {
    event.currentTarget.value = "";
    workflow.beginPicker();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    void workflow.selectFile(file);
  }

  const restoreBusy =
    restoreState.status === "reading" || restoreState.status === "applying";
  const needsReload =
    restoreState.status === "idle" &&
    (restoreState.feedback?.status === "apply-result" ||
      restoreState.feedback?.status === "unexpected" ||
      restoreState.feedback?.status === "stale");

  return (
    <section className={styles.panel}>
      <h2>{journeyMessage(locale, "backupTitle")}</h2>
      <p className={styles.lede}>{journeyMessage(locale, "backupIntro")}</p>
      <div className={styles.spacer} />
      <div className={styles.actionRow}>
        <button
          className={styles.buttonSecondary}
          disabled={busy || current === null}
          onClick={handleExport}
          type="button"
        >
          {journeyMessage(locale, "exportBackup")}
        </button>
      </div>
      <div className={styles.spacer} />
      <label className={styles.field}>
        <span>{journeyMessage(locale, "importBackup")}</span>
        <input
          accept="application/json,.json"
          aria-describedby="journey-restore-limit"
          className={styles.fileInput}
          disabled={busy || restoreBusy}
          onChange={handleFileChange}
          onClick={handlePickerClick}
          ref={fileInputRef}
          type="file"
        />
      </label>
      <p className={styles.fieldHint} id="journey-restore-limit">
        {journeyMessage(locale, "importLimitHint", {
          bytes: ATLAS_BACKUP_MAX_BYTES,
        })}
      </p>
      <div className={styles.spacer} />
      <BackupNotice feedback={backupFeedback} locale={locale} />
      {restoreState.status === "idle" ? (
        <RestoreNotice feedback={restoreState.feedback} locale={locale} />
      ) : null}
      {needsReload ? (
        <div className={styles.restoreReload}>
          <button
            className={styles.buttonSecondary}
            onClick={() => window.location.reload()}
            type="button"
          >
            {journeyMessage(locale, "reload")}
          </button>
        </div>
      ) : null}
      {restoreState.status === "reading" ? (
        <p aria-live="polite" className={styles.fieldHint} role="status">
          {journeyMessage(locale, "restoreReading")}
        </p>
      ) : null}
      {restoreState.status === "review" ? (
        <section
          aria-labelledby="journey-restore-review-title"
          className={styles.restoreReview}
        >
          <h3 id="journey-restore-review-title">
            {journeyMessage(locale, "dryRunTitle")}
          </h3>
          <p>{journeyMessage(locale, "dryRunBody")}</p>
          <div className={styles.summaryGrid}>
            <SummaryCard
              locale={locale}
              summary={restoreState.session.dryRun.applyPlan.summary.journeys}
              title="journeys"
            />
            <SummaryCard
              locale={locale}
              summary={
                restoreState.session.dryRun.applyPlan.summary.experienceEntries
              }
              title="experiences"
            />
          </div>
          <TextNotice
            body="restoreEligibilityBody"
            locale={locale}
            title="restoreEligibilityTitle"
            tone="warning"
            values={{
              bytes: restoreState.session.eligibility.requiredStorageUnits,
            }}
          />
          <div className={styles.confirmation}>
            <p>{journeyMessage(locale, "restoreReplaceWarning")}</p>
            <div className={styles.actionRow}>
              <button
                className={styles.buttonDanger}
                disabled={busy}
                onClick={() => void workflow.apply()}
                ref={confirmRef}
                type="button"
              >
                {journeyMessage(locale, "confirmRestore")}
              </button>
              <button
                className={styles.buttonQuiet}
                disabled={busy}
                onClick={workflow.discard}
                type="button"
              >
                {journeyMessage(locale, "discardRestore")}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {restoreState.status === "applying" ? (
        <p aria-live="polite" className={styles.fieldHint} role="status">
          {journeyMessage(locale, "restoreApplying")}
        </p>
      ) : null}
    </section>
  );
}
