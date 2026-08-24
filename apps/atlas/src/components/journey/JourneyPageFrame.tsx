"use client";

import type { ReactNode } from "react";
import { useShell } from "../../i18n/shell/shell-context.js";
import type { JourneyLocale } from "../../i18n/journey/translate.js";
import styles from "./journey-ui.module.css";

interface JourneyPageFrameProps {
  readonly active: "journey" | "local-event";
  readonly children: (locale: JourneyLocale) => ReactNode;
}

export function JourneyPageFrame({ active, children }: JourneyPageFrameProps) {
  const { locale, messages } = useShell();
  const pageLabel =
    active === "journey"
      ? messages.navigation.journey
      : messages.navigation.localEvent;

  return (
    <section aria-label={pageLabel} className={styles.page}>
      <div className={styles.shell}>{children(locale)}</div>
    </section>
  );
}
