"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUTO_LOCALE_PREFERENCE,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isAppLocale,
  resolveLocalePreference,
  resolveNavigatorLocale,
  type AppLocale,
  type LocalePreference,
} from "./locales";
import type { MessageKey, MessageValues } from "./messages";
import { translate } from "./translate";
import { isExportRealmHash } from "../utils/exportCapture";

interface LocaleContextValue {
  locale: AppLocale;
  preference: LocalePreference;
  ready: boolean;
  setPreference: (preference: LocalePreference) => void;
  t: (key: MessageKey, values?: MessageValues) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export default function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE);
  const [preference, setPreferenceState] = useState<LocalePreference>(
    AUTO_LOCALE_PREFERENCE,
  );
  const [ready, setReady] = useState(false);
  const [isExportRealm] = useState(
    () =>
      typeof window !== "undefined" &&
      window.parent !== window &&
      isExportRealmHash(window.location.hash),
  );

  useEffect(() => {
    if (isExportRealm) {
      setPreferenceState(DEFAULT_LOCALE);
      setLocale(DEFAULT_LOCALE);
      setReady(true);
      return;
    }

    const storedPreference = readStoredLocalePreference();
    const nextPreference = storedPreference ?? AUTO_LOCALE_PREFERENCE;

    setPreferenceState(nextPreference);
    setLocale(resolveLocalePreference(nextPreference));
    setReady(true);
  }, [isExportRealm]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  useEffect(() => {
    if (isExportRealm || preference !== AUTO_LOCALE_PREFERENCE) return;

    const handleLanguageChange = () => setLocale(resolveNavigatorLocale());
    window.addEventListener("languagechange", handleLanguageChange);
    return () =>
      window.removeEventListener("languagechange", handleLanguageChange);
  }, [isExportRealm, preference]);

  const setPreference = useCallback(
    (nextPreference: LocalePreference) => {
      if (isExportRealm) return;
      setPreferenceState(nextPreference);
      setLocale(resolveLocalePreference(nextPreference));
      writeStoredLocalePreference(nextPreference);
    },
    [isExportRealm],
  );

  const t = useCallback(
    (key: MessageKey, values?: MessageValues) => translate(locale, key, values),
    [locale],
  );

  const contextValue = useMemo<LocaleContextValue>(
    () => ({ locale, preference, ready, setPreference, t }),
    [locale, preference, ready, setPreference, t],
  );

  return (
    <LocaleContext.Provider value={contextValue}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}

function readStoredLocalePreference() {
  try {
    const storedValue = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(storedValue) ? storedValue : null;
  } catch {
    return null;
  }
}

function writeStoredLocalePreference(preference: LocalePreference) {
  try {
    if (preference === AUTO_LOCALE_PREFERENCE) {
      window.localStorage.removeItem(LOCALE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(LOCALE_STORAGE_KEY, preference);
  } catch {
    // Language selection remains active for this page when storage is blocked.
  }
}
