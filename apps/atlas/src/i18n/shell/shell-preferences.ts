import { SHELL_LOCALES, type ShellLocale } from "./messages";

export const SHELL_PREFERENCES_STORAGE_KEY = "atlas.shell.preferences.v1";

export type ShellTheme = "light" | "dark";
export type ShellLocalePreference = "auto" | ShellLocale;

export interface ShellPreferences {
  locale: ShellLocale;
  localePreference: ShellLocalePreference;
  theme: ShellTheme;
}

export interface ShellPreferenceBootstrapInput {
  browserLanguage?: string;
  browserLocales?: readonly string[];
  prefersDark: boolean;
  storedValue?: string | null;
}

export const DEFAULT_SHELL_PREFERENCES: ShellPreferences = {
  locale: "en",
  localePreference: "auto",
  theme: "light",
};

const BCP47_LANGUAGE_TAG = /^([a-z]{2,3})(?:-[a-z0-9]{1,8})*$/i;

export function isShellLocale(value: string | undefined): value is ShellLocale {
  return SHELL_LOCALES.includes(value as ShellLocale);
}

export function isShellLocalePreference(
  value: string | undefined,
): value is ShellLocalePreference {
  return value === "auto" || isShellLocale(value);
}

export function isShellTheme(value: string | undefined): value is ShellTheme {
  return value === "light" || value === "dark";
}

export function parseShellPreferences(
  storedValue: string | null | undefined,
): Partial<ShellPreferences> {
  if (!storedValue) {
    return {};
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);
    if (typeof parsedValue !== "object" || parsedValue === null) {
      return {};
    }

    const preferences = parsedValue as Partial<ShellPreferences>;
    return {
      locale: isShellLocale(preferences.locale)
        ? preferences.locale
        : undefined,
      localePreference: isShellLocalePreference(preferences.localePreference)
        ? preferences.localePreference
        : undefined,
      theme: isShellTheme(preferences.theme) ? preferences.theme : undefined,
    };
  } catch {
    return {};
  }
}

export function resolveShellLocale(
  browserLocales: readonly string[] | undefined,
  browserLanguage: string | undefined,
): ShellLocale {
  const candidates = [...(browserLocales ?? [])];
  if (browserLanguage && !candidates.includes(browserLanguage)) {
    candidates.push(browserLanguage);
  }

  for (const browserLocale of candidates) {
    const languageTag = BCP47_LANGUAGE_TAG.exec(browserLocale);
    const baseLanguage = languageTag?.[1]?.toLowerCase();

    switch (baseLanguage) {
      case "zh":
        return "zh-CN";
      case "en":
        return "en";
      case "ja":
        return "ja";
      case "ko":
        return "ko";
      default:
        break;
    }
  }

  return DEFAULT_SHELL_PREFERENCES.locale;
}

export function resolveShellPreferences({
  browserLanguage,
  browserLocales,
  prefersDark,
  storedValue,
}: ShellPreferenceBootstrapInput): ShellPreferences {
  const storedPreferences = parseShellPreferences(storedValue);
  const browserLocale = resolveShellLocale(browserLocales, browserLanguage);
  const localePreference =
    storedPreferences.localePreference ??
    storedPreferences.locale ??
    DEFAULT_SHELL_PREFERENCES.localePreference;

  return {
    locale: localePreference === "auto" ? browserLocale : localePreference,
    localePreference,
    theme: storedPreferences.theme ?? (prefersDark ? "dark" : "light"),
  };
}

const serializedStorageKey = JSON.stringify(SHELL_PREFERENCES_STORAGE_KEY);

// This runs in the static document before React hydrates. It intentionally
// stores and reads only the versioned shell preference pair.
export const SHELL_THEME_BOOTSTRAP_SCRIPT = `(function () {
  var root = document.documentElement;
  var theme = null;
  try {
    var storedValue = window.localStorage.getItem(${serializedStorageKey});
    if (storedValue) {
      var storedPreferences = JSON.parse(storedValue);
      if (storedPreferences && (storedPreferences.theme === "light" || storedPreferences.theme === "dark")) {
        theme = storedPreferences.theme;
      }
    }
  } catch (_) {}
  if (theme !== "light" && theme !== "dark") {
    try {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (_) {
      theme = "light";
    }
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
})();`;
