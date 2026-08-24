"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ATLAS_BACKUP_MAX_BYTES,
  dryRunAtlasBackupRestore,
  encodeAtlasBackup,
  type AtlasBackupDryRunResult,
} from "../../backup/backup-codec.js";
import type {
  JourneyDocumentReadResult,
  JourneyDocumentV1,
} from "../../contracts/journey-document.js";
import { expectedJourneyRevision } from "../../features/journey/journey-controller.js";
import { journeyMessage } from "../../i18n/journey/messages.js";
import type { JourneyLocale } from "../../i18n/journey/translate.js";
import type { LocalStorageJourneyRepository } from "../../storage/journey-storage.js";
import {
  JourneyFeedbackAlert,
  TextNotice,
  type JourneyOperationFeedback,
} from "./JourneyAlerts.js";
import styles from "./journey-ui.module.css";

type ReadyDryRun = Extract<
  AtlasBackupDryRunResult,
  { readonly status: "ready" }
>;

type BackupFeedback =
  | { readonly status: "exported" }
  | { readonly status: "empty" }
  | { readonly status: "oversize" }
  | { readonly status: "corrupt" }
  | { readonly status: "future-version"; readonly version: number }
  | { readonly status: "invalid"; readonly error: string }
  | {
      readonly status: "capacity-failed";
      readonly required: number;
      readonly available: number;
    }
  | { readonly status: "estimate-unavailable" };

async function conservativeAvailableStorageBytes() {
  if (navigator.storage?.estimate === undefined) return null;
  try {
    const estimate = await navigator.storage.estimate();
    if (
      typeof estimate.quota !== "number" ||
      typeof estimate.usage !== "number" ||
      !Number.isFinite(estimate.quota) ||
      !Number.isFinite(estimate.usage)
    ) {
      return null;
    }
    const remaining = Math.max(0, Math.floor(estimate.quota - estimate.usage));
    return Math.min(remaining, ATLAS_BACKUP_MAX_BYTES);
  } catch {
    return null;
  }
}

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
  if (feedback.status === "capacity-failed") {
    return (
      <TextNotice
        locale={locale}
        title="importCapacity"
        tone="error"
        values={{
          required: feedback.required,
          available: feedback.available,
        }}
      />
    );
  }
  if (feedback.status === "estimate-unavailable") {
    return (
      <TextNotice locale={locale} title="estimateUnavailable" tone="error" />
    );
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

function SummaryCard({
  locale,
  title,
  summary,
}: {
  readonly locale: JourneyLocale;
  readonly title: "journeys" | "experiences";
  readonly summary: ReadyDryRun["applyPlan"]["summary"]["journeys"];
}) {
  return (
    <section className={styles.summaryCard}>
      <h3>{journeyMessage(locale, title)}</h3>
      <dl>
        <dt>{journeyMessage(locale, "before")}</dt>
        <dd>{summary.before}</dd>
        <dt>{journeyMessage(locale, "after")}</dt>
        <dd>{summary.after}</dd>
        <dt>{journeyMessage(locale, "added")}</dt>
        <dd>{summary.added}</dd>
        <dt>{journeyMessage(locale, "updated")}</dt>
        <dd>{summary.updated}</dd>
        <dt>{journeyMessage(locale, "removed")}</dt>
        <dd>{summary.deleted}</dd>
        <dt>{journeyMessage(locale, "unchanged")}</dt>
        <dd>{summary.unchanged}</dd>
      </dl>
    </section>
  );
}

export function JourneyBackupPanel({
  locale,
  current,
  repository,
  busy,
  onBusyChange,
  onCommitted,
}: {
  readonly locale: JourneyLocale;
  readonly current: JourneyDocumentV1 | null;
  readonly repository: LocalStorageJourneyRepository;
  readonly busy: boolean;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onCommitted: (read: JourneyDocumentReadResult) => void;
}) {
  const [feedback, setFeedback] = useState<BackupFeedback | null>(null);
  const [mutationFeedback, setMutationFeedback] =
    useState<JourneyOperationFeedback | null>(null);
  const [dryRun, setDryRun] = useState<ReadyDryRun | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dryRun !== null) confirmRef.current?.focus();
  }, [dryRun]);

  function handleExport() {
    setFeedback(null);
    setMutationFeedback(null);
    if (current === null) {
      setFeedback({ status: "empty" });
      return;
    }
    try {
      const exportedAt = new Date().toISOString();
      downloadBackup(
        encodeAtlasBackup({ exportedAt, journey: current }),
        exportedAt,
      );
      setFeedback({ status: "exported" });
    } catch (error) {
      setFeedback({
        status: "invalid",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setDryRun(null);
    setFeedback(null);
    setMutationFeedback(null);
    if (file === undefined) return;

    // File.size is checked before File.text() so oversized content is never read.
    if (file.size > ATLAS_BACKUP_MAX_BYTES) {
      setFeedback({ status: "oversize" });
      event.currentTarget.value = "";
      return;
    }

    onBusyChange(true);
    try {
      const availableBytes = await conservativeAvailableStorageBytes();
      if (availableBytes === null) {
        setFeedback({ status: "estimate-unavailable" });
        return;
      }
      const raw = await file.text();
      const result = dryRunAtlasBackupRestore({
        import: {
          status: "selected",
          raw,
          limits: { maximumBytes: ATLAS_BACKUP_MAX_BYTES },
        },
        current,
        now: new Date().toISOString(),
        transaction: {
          expectedRevision: expectedJourneyRevision(current),
          availableBytes,
        },
      });
      if (result.status === "ready") {
        setDryRun(result);
        return;
      }

      // Every non-ready P2 result explicitly clears the pending apply plan.
      setDryRun(null);
      if (result.status === "oversize") {
        setFeedback({ status: "oversize" });
      } else if (result.status === "corrupt") {
        setFeedback({ status: "corrupt" });
      } else if (result.status === "future-version") {
        setFeedback({ status: "future-version", version: result.version });
      } else if (result.status === "capacity-failed") {
        setFeedback({
          status: "capacity-failed",
          required: result.replacementByteLength,
          available: result.availableBytes,
        });
      } else if (result.status === "invalid") {
        setFeedback({
          status: "invalid",
          error: `${result.issue.path}: ${result.issue.message}`,
        });
      }
    } catch (error) {
      setDryRun(null);
      setFeedback({
        status: "invalid",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onBusyChange(false);
    }
  }

  async function applyRestore() {
    if (dryRun === null) return;
    onBusyChange(true);
    setMutationFeedback(null);
    try {
      const result = await repository.applyReplacePlan(dryRun.applyPlan);
      if (result.status === "committed") {
        onCommitted(result.readback);
        setDryRun(null);
        setMutationFeedback({ kind: "success", message: "restoreApplied" });
      } else {
        setMutationFeedback({ kind: "mutation", result });
      }
    } finally {
      onBusyChange(false);
    }
  }

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
          className={styles.fileInput}
          disabled={busy}
          onChange={(event) => void handleFile(event)}
          type="file"
        />
      </label>
      <div className={styles.spacer} />
      <BackupNotice feedback={feedback} locale={locale} />
      <JourneyFeedbackAlert feedback={mutationFeedback} locale={locale} />

      {dryRun !== null ? (
        <section className={styles.confirmation}>
          <h3>{journeyMessage(locale, "dryRunTitle")}</h3>
          <p>{journeyMessage(locale, "dryRunBody")}</p>
          <div className={styles.summaryGrid}>
            <SummaryCard
              locale={locale}
              summary={dryRun.applyPlan.summary.journeys}
              title="journeys"
            />
            <SummaryCard
              locale={locale}
              summary={dryRun.applyPlan.summary.experienceEntries}
              title="experiences"
            />
          </div>
          <div className={styles.actionRow}>
            <button
              className={styles.buttonDanger}
              disabled={busy}
              onClick={() => void applyRestore()}
              ref={confirmRef}
              type="button"
            >
              {journeyMessage(locale, "confirmRestore")}
            </button>
            <button
              className={styles.buttonQuiet}
              disabled={busy}
              onClick={() => setDryRun(null)}
              type="button"
            >
              {journeyMessage(locale, "discardRestore")}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
