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

import { SHELL_LOCALES, SHELL_MESSAGES, type ShellLocale } from "./messages";

const SHELL_PREFERENCES_STORAGE_KEY = "atlas.shell.preferences.v1";

type ShellTheme = "light" | "dark";

interface ShellPreferences {
  locale: ShellLocale;
  theme: ShellTheme;
}

interface ShellContextValue {
  locale: ShellLocale;
  messages: (typeof SHELL_MESSAGES)[ShellLocale];
  setLocale: (locale: ShellLocale) => void;
  theme: ShellTheme;
  toggleTheme: () => void;
}

const SERVER_PREFERENCES: ShellPreferences = {
  locale: "en",
  theme: "light",
};

let browserPreferences: ShellPreferences | null = null;

const ShellContext = createContext<ShellContextValue | null>(null);

function isShellLocale(value: string | undefined): value is ShellLocale {
  return SHELL_LOCALES.includes(value as ShellLocale);
}

function isShellTheme(value: string | undefined): value is ShellTheme {
  return value === "light" || value === "dark";
}

function resolveBrowserLocale(): ShellLocale {
  const browserLocales = navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const browserLocale of browserLocales) {
    if (isShellLocale(browserLocale)) {
      return browserLocale;
    }

    if (browserLocale.toLowerCase().startsWith("zh")) {
      return "zh-CN";
    }

    if (browserLocale.toLowerCase().startsWith("ja")) {
      return "ja";
    }

    if (browserLocale.toLowerCase().startsWith("ko")) {
      return "ko";
    }
  }

  return "en";
}

function readStoredPreferences(): Partial<ShellPreferences> | null {
  try {
    const storedValue = window.localStorage.getItem(
      SHELL_PREFERENCES_STORAGE_KEY,
    );

    if (!storedValue) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(storedValue);
    if (typeof parsedValue !== "object" || parsedValue === null) {
      return null;
    }

    const preferences = parsedValue as Partial<ShellPreferences>;
    return {
      locale: isShellLocale(preferences.locale)
        ? preferences.locale
        : undefined,
      theme: isShellTheme(preferences.theme) ? preferences.theme : undefined,
    };
  } catch {
    return null;
  }
}

function getBrowserPreferences(): ShellPreferences {
  if (browserPreferences) {
    return browserPreferences;
  }

  const storedPreferences = readStoredPreferences();
  browserPreferences = {
    locale: storedPreferences?.locale ?? resolveBrowserLocale(),
    theme:
      storedPreferences?.theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"),
  };
  return browserPreferences;
}

function subscribeToBrowserPreferences() {
  return () => {};
}

function writeStoredPreferences(preferences: ShellPreferences) {
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
    () => SERVER_PREFERENCES,
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
        setOverrides((currentOverrides) => ({
          ...currentOverrides,
          locale: nextLocale,
        }));
        writeStoredPreferences({ locale: nextLocale, theme });
      },
      theme,
      toggleTheme: () => {
        const nextTheme = theme === "light" ? "dark" : "light";
        setOverrides((currentOverrides) => ({
          ...currentOverrides,
          theme: nextTheme,
        }));
        writeStoredPreferences({ locale, theme: nextTheme });
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
