"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { journeyMessage } from "../../i18n/journey/messages.js";
import {
  JOURNEY_LOCALES,
  resolveJourneyLocale,
  type JourneyLocale,
} from "../../i18n/journey/translate.js";
import styles from "./journey-ui.module.css";

const LANGUAGE_LABELS: Readonly<Record<JourneyLocale, string>> = {
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

interface JourneyPageFrameProps {
  readonly active: "journey" | "local-event";
  readonly children: (locale: JourneyLocale) => ReactNode;
}

export function JourneyPageFrame({ active, children }: JourneyPageFrameProps) {
  const [locale, setLocale] = useState<JourneyLocale>("en");

  useEffect(() => {
    setLocale(resolveJourneyLocale(navigator.languages));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link className={styles.brand} href="/">
            {journeyMessage(locale, "appName")}
          </Link>
          <nav
            className={styles.nav}
            aria-label={journeyMessage(locale, "journeyTitle")}
          >
            <Link
              className={styles.navLink}
              aria-current={active === "journey" ? "page" : undefined}
              data-active={active === "journey"}
              href="/journey/"
            >
              {journeyMessage(locale, "journeyTitle")}
            </Link>
            <Link
              className={styles.navLink}
              aria-current={active === "local-event" ? "page" : undefined}
              data-active={active === "local-event"}
              href="/local-event/"
            >
              {journeyMessage(locale, "localEventTitle")}
            </Link>
          </nav>
          <label className={styles.languageField}>
            <span>{journeyMessage(locale, "language")}</span>
            <select
              aria-label={journeyMessage(locale, "language")}
              onChange={(event) =>
                setLocale(event.currentTarget.value as JourneyLocale)
              }
              value={locale}
            >
              {JOURNEY_LOCALES.map((option) => (
                <option key={option} lang={option} value={option}>
                  {LANGUAGE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </header>
        {children(locale)}
      </div>
    </div>
  );
}
