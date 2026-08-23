"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import {
  BACKUP_MAX_DOCUMENT_CHARACTERS,
  type BackupDocument,
  type BackupFailure,
  type RestorePlan,
  type RestorePlanSuccess,
} from "../utils/backupDocument";
import type { BackupRestoreTransactionResult } from "../utils/boardTransaction";
import { downloadTextFile } from "../utils/imageActions";

interface LocalBackupPanelProps {
  projectName: string;
  fileName: string;
  disabled: boolean;
  createDocument: () => BackupDocument;
  prepareRestore: (text: string) => RestorePlan;
  applyRestore: (plan: RestorePlanSuccess) => BackupRestoreTransactionResult;
}

type PanelMessage = {
  key: MessageKey;
  values?: Record<string, string | number>;
};

export default function LocalBackupPanel({
  projectName,
  fileName,
  disabled,
  createDocument,
  prepareRestore,
  applyRestore,
}: LocalBackupPanelProps) {
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlanSuccess | null>(
    null,
  );
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const [reading, setReading] = useState(false);

  const handleDownload = () => {
    setMessage(null);
    try {
      const document = createDocument();
      downloadTextFile(
        `${JSON.stringify(document, null, 2)}\n`,
        fileName,
        "application/json;charset=utf-8",
      );
      setMessage({ key: "backup.downloadReady" });
    } catch {
      setMessage({ key: "backup.error.storage" });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setRestorePlan(null);
    setMessage(null);
    if (!file) return;
    if (file.size > BACKUP_MAX_DOCUMENT_CHARACTERS * 4) {
      setMessage({ key: "backup.error.limit" });
      return;
    }

    const reader = new FileReader();
    setReading(true);
    reader.addEventListener("load", () => {
      setReading(false);
      if (typeof reader.result !== "string") {
        setMessage({ key: "backup.error.file" });
        return;
      }
      const plan = prepareRestore(reader.result);
      if (!plan.ok) {
        setMessage(toFailureMessage(plan.error));
        return;
      }
      setRestorePlan(plan);
    });
    reader.addEventListener("error", () => {
      setReading(false);
      setMessage({ key: "backup.error.file" });
    });
    reader.readAsText(file);
  };

  const handleConfirmRestore = () => {
    if (!restorePlan) return;
    const result = applyRestore(restorePlan);
    if (result.status === "committed" || result.status === "noop") {
      window.alert(t("backup.restoreSuccess"));
      window.location.reload();
      return;
    }
    setRestorePlan(null);
    if (result.status === "conflict") {
      setMessage({ key: "backup.error.conflict" });
    } else if (result.status === "write-failed") {
      setMessage({
        key: result.rollbackComplete
          ? "backup.error.rolledBack"
          : "backup.error.rollbackIncomplete",
      });
    } else {
      setMessage({ key: "backup.error.storage" });
    }
  };

  return (
    <section
      data-page-reveal
      className="app-content-shell relative z-10 px-4 pb-6 sm:px-6 md:px-8"
      aria-labelledby="local-backup-title"
    >
      <details className="official-panel-soft p-4 sm:p-5">
        <summary className="cursor-pointer list-none">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--project-primary)] uppercase">
            {t("backup.eyebrow")}
          </p>
          <h2
            id="local-backup-title"
            className="mt-1 text-base font-semibold text-[var(--foreground)] sm:text-lg"
          >
            {t("backup.title")}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
            {t("backup.summary")}
          </p>
        </summary>

        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            {t("backup.singleSite", { project: projectName })}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {t("backup.separateSites")}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="official-button official-button-primary min-h-11"
              disabled={disabled || reading}
              onClick={handleDownload}
            >
              {t("backup.download")}
            </button>
            <button
              type="button"
              className="official-button min-h-11"
              disabled={disabled || reading}
              onClick={() => fileInputRef.current?.click()}
            >
              {reading ? t("backup.reading") : t("backup.chooseFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept=".json,application/json"
              disabled={disabled || reading}
              onChange={handleFileChange}
              aria-label={t("backup.chooseFile")}
            />
          </div>

          {message ? (
            <p
              className="mt-3 text-sm leading-relaxed text-[var(--muted)]"
              role="status"
            >
              {t(message.key, message.values)}
            </p>
          ) : null}

          {restorePlan ? (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                {t("backup.reviewTitle")}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                {t("backup.reviewHint")}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <SummaryCount
                  label={t("backup.add")}
                  value={restorePlan.summary.add}
                />
                <SummaryCount
                  label={t("backup.overwrite")}
                  value={restorePlan.summary.overwrite}
                />
                <SummaryCount
                  label={t("backup.remove")}
                  value={restorePlan.summary.remove}
                />
                <SummaryCount
                  label={t("backup.skip")}
                  value={restorePlan.summary.skip}
                />
              </dl>

              {restorePlan.boardSummary ? (
                <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                  {t("backup.boardSummary", {
                    add: restorePlan.boardSummary.add,
                    overwrite: restorePlan.boardSummary.overwrite,
                    skip: restorePlan.boardSummary.skip,
                    remove: restorePlan.boardSummary.remove,
                  })}
                </p>
              ) : null}
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                {restorePlan.localeIncluded
                  ? t("backup.localeIncluded")
                  : t("backup.localeAutomatic")}
              </p>
              <p className="mt-3 text-sm font-medium leading-relaxed text-[var(--foreground)]">
                {t("backup.overwriteWarning")}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="official-button official-button-primary min-h-11"
                  onClick={handleConfirmRestore}
                >
                  {t("backup.confirm")}
                </button>
                <button
                  type="button"
                  className="official-button min-h-11"
                  onClick={() => setRestorePlan(null)}
                >
                  {t("backup.cancel")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--background)] px-3 py-2">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 font-semibold text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function toFailureMessage(error: BackupFailure): PanelMessage {
  switch (error.code) {
    case "unsupported-version":
    case "unsupported-format":
      return { key: "backup.error.version" };
    case "project-mismatch":
      return { key: "backup.error.project" };
    case "limit-exceeded":
      return { key: "backup.error.limit" };
    case "storage-unavailable":
      return { key: "backup.error.storage" };
    case "invalid-json":
    case "invalid-document":
    case "invalid-entry":
      return { key: "backup.error.invalid" };
  }
}
