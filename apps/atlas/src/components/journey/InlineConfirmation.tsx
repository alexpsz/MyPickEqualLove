"use client";

import { useEffect, useRef } from "react";
import {
  journeyMessage,
  type JourneyMessageKey,
} from "../../i18n/journey/messages";
import type { JourneyLocale } from "../../i18n/journey/translate";
import styles from "./journey-ui.module.css";

export function InlineConfirmation({
  locale,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly locale: JourneyLocale;
  readonly message: JourneyMessageKey;
  readonly confirmLabel: JourneyMessageKey;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className={styles.confirmation} role="group">
      <p>{journeyMessage(locale, message)}</p>
      <div className={styles.actionRow}>
        <button
          className={styles.buttonDanger}
          disabled={busy}
          onClick={onConfirm}
          ref={confirmRef}
          type="button"
        >
          {journeyMessage(locale, confirmLabel)}
        </button>
        <button
          className={styles.buttonQuiet}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          {journeyMessage(locale, "cancel")}
        </button>
      </div>
    </div>
  );
}
