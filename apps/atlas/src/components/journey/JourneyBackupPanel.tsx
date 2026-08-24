"use client";

import { useState } from "react";
import { encodeAtlasBackup } from "../../backup/backup-codec.js";
import type { JourneyDocumentV1 } from "../../contracts/journey-document.js";
import { journeyMessage } from "../../i18n/journey/messages.js";
import type { JourneyLocale } from "../../i18n/journey/translate.js";
import { TextNotice } from "./JourneyAlerts.js";
import styles from "./journey-ui.module.css";

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

export function JourneyBackupPanel({
  locale,
  current,
  busy,
}: {
  readonly locale: JourneyLocale;
  readonly current: JourneyDocumentV1 | null;
  readonly busy: boolean;
}) {
  const [feedback, setFeedback] = useState<BackupFeedback | null>(null);

  function handleExport() {
    setFeedback(null);
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
      <TextNotice
        body="restoreCapacityPendingBody"
        locale={locale}
        title="restoreCapacityPendingTitle"
        tone="warning"
      />
      <label className={styles.field}>
        <span>{journeyMessage(locale, "importBackup")}</span>
        <input
          accept="application/json,.json"
          aria-describedby="journey-restore-capacity-pending"
          className={styles.fileInput}
          disabled
          type="file"
        />
      </label>
      <p className={styles.fieldHint} id="journey-restore-capacity-pending">
        {journeyMessage(locale, "restoreCapacityPendingBody")}
      </p>
      <div className={styles.spacer} />
      <BackupNotice feedback={feedback} locale={locale} />
    </section>
  );
}
