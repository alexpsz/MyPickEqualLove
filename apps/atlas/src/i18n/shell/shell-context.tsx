"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { SHELL_MESSAGES, type ShellLocale } from "./messages";
import {
  DEFAULT_SHELL_PREFERENCES,
  resolveShellPreferences,
  SHELL_PREFERENCES_STORAGE_KEY,
  type ShellPreferences,
  type ShellTheme,
} from "./shell-preferences";

export type { ShellPreferences, ShellTheme } from "./shell-preferences";

export interface ShellContextValue {
  locale: ShellLocale;
  messages: (typeof SHELL_MESSAGES)[ShellLocale];
  setLocale: (locale: ShellLocale) => void;
  theme: ShellTheme;
  toggleTheme: () => void;
}

let browserPreferences: ShellPreferences | null = null;

const ShellContext = createContext<ShellContextValue | null>(null);

function readStoredPreferences(): string | null {
  try {
    return window.localStorage.getItem(SHELL_PREFERENCES_STORAGE_KEY);
  } catch {
    return null;
  }
}

function resolveSystemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function getBrowserPreferences(): ShellPreferences {
  if (browserPreferences) {
    return browserPreferences;
  }

  browserPreferences = resolveShellPreferences({
    browserLanguage: navigator.language,
    browserLocales: navigator.languages,
    prefersDark: resolveSystemPrefersDark(),
    storedValue: readStoredPreferences(),
  });
  return browserPreferences;
}

function getServerPreferences(): ShellPreferences {
  return DEFAULT_SHELL_PREFERENCES;
}

function subscribeToBrowserPreferences() {
  return () => {};
}

function persistPreferences(preferences: ShellPreferences) {
  browserPreferences = preferences;

  try {
    window.localStorage.setItem(
      SHELL_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // A blocked localStorage implementation must not make the shell unusable.
  }
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const initialPreferences = useSyncExternalStore(
    subscribeToBrowserPreferences,
    getBrowserPreferences,
    getServerPreferences,
  );
  const [overrides, setOverrides] = useState<Partial<ShellPreferences>>({});
  const locale = overrides.locale ?? initialPreferences.locale;
  const theme = overrides.theme ?? initialPreferences.theme;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [locale, theme]);

  const value = useMemo<ShellContextValue>(
    () => ({
      locale,
      messages: SHELL_MESSAGES[locale],
      setLocale: (nextLocale) => {
        const nextPreferences: ShellPreferences = {
          locale: nextLocale,
          theme,
        };
        setOverrides(nextPreferences);
        persistPreferences(nextPreferences);
      },
      theme,
      toggleTheme: () => {
        const nextPreferences: ShellPreferences = {
          locale,
          theme: theme === "light" ? "dark" : "light",
        };
        setOverrides(nextPreferences);
        persistPreferences(nextPreferences);
      },
    }),
    [locale, theme],
  );

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell() {
  const context = useContext(ShellContext);

  if (!context) {
    throw new Error("useShell must be used inside ShellProvider.");
  }

  return context;
}
