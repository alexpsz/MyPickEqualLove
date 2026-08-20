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
import { STORAGE_KEYS } from "../config/project";
import { EXPORT_REALM_HASH } from "../utils/exportCapture";
import {
  AUTO_THEME_PREFERENCE,
  applyThemeToRoot,
  parseThemePreference,
  persistThemePreference,
  readThemeStateFromDataset,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
  type ThemeState,
} from "../utils/themePreference";

interface ThemeContextValue extends ThemeState {
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [isExportRealm] = useState(isCurrentExportRealm);
  const [themeState, setThemeState] = useState<ThemeState>(
    readInitialThemeState,
  );

  const applyTheme = useCallback(
    (preference: ThemePreference, theme: ResolvedTheme) => {
      setThemeState({ preference, theme });
      if (typeof document === "undefined") return;

      applyThemeToRoot(
        document.documentElement,
        preference,
        theme,
        document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'),
      );
    },
    [],
  );

  useEffect(() => {
    if (isExportRealm) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.theme && event.key !== null) return;

      const preference = parseThemePreference(event.newValue);
      applyTheme(preference, resolveCurrentTheme(preference));
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [applyTheme, isExportRealm]);

  useEffect(() => {
    if (isExportRealm || themeState.preference !== AUTO_THEME_PREFERENCE) {
      return;
    }

    let mediaQuery: MediaQueryList;
    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      applyTheme(AUTO_THEME_PREFERENCE, event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [applyTheme, isExportRealm, themeState.preference]);

  const setPreference = useCallback(
    (preference: ThemePreference) => {
      if (isExportRealm) return;

      applyTheme(preference, resolveCurrentTheme(preference));
      persistThemePreference(getLocalStorage(), STORAGE_KEYS.theme, preference);
    },
    [applyTheme, isExportRealm],
  );

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ ...themeState, setPreference }),
    [setPreference, themeState],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

function isCurrentExportRealm() {
  return (
    typeof window !== "undefined" &&
    window.parent !== window &&
    window.location.hash === EXPORT_REALM_HASH
  );
}

function readInitialThemeState() {
  if (typeof document === "undefined") {
    return {
      preference: AUTO_THEME_PREFERENCE,
      theme: "light" as const,
    };
  }

  return readThemeStateFromDataset(document.documentElement.dataset);
}

function prefersDarkColorScheme() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function resolveCurrentTheme(preference: ThemePreference) {
  return preference === AUTO_THEME_PREFERENCE
    ? resolveTheme(preference, prefersDarkColorScheme())
    : resolveTheme(preference);
}

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
