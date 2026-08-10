export const SUPPORTED_LOCALES = ["zh-CN", "en", "ja", "ko"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = AppLocale | "auto";

export const DEFAULT_LOCALE: AppLocale = "en";
export const AUTO_LOCALE_PREFERENCE = "auto" as const;
export const LOCALE_STORAGE_KEY = "mypick_locale_override_v1";

export const LOCALE_OPTIONS: ReadonlyArray<{
  value: LocalePreference;
  nativeLabel: string;
}> = [
  { value: "auto", nativeLabel: "Auto" },
  { value: "zh-CN", nativeLabel: "简体中文" },
  { value: "en", nativeLabel: "English" },
  { value: "ja", nativeLabel: "日本語" },
  { value: "ko", nativeLabel: "한국어" },
];

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALE_SET.has(value);
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === AUTO_LOCALE_PREFERENCE || isAppLocale(value);
}

export function matchSupportedLocale(languageTag: string | undefined | null) {
  if (!languageTag) return null;

  const normalized = languageTag.trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) return null;

  if (normalized === "zh" || normalized.startsWith("zh-")) {
    return "zh-CN" satisfies AppLocale;
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en" satisfies AppLocale;
  }
  if (normalized === "ja" || normalized.startsWith("ja-")) {
    return "ja" satisfies AppLocale;
  }
  if (normalized === "ko" || normalized.startsWith("ko-")) {
    return "ko" satisfies AppLocale;
  }

  return null;
}

export function resolvePreferredLocale(
  languageTags: readonly (string | undefined | null)[],
): AppLocale {
  for (const languageTag of languageTags) {
    const matchedLocale = matchSupportedLocale(languageTag);
    if (matchedLocale) return matchedLocale;
  }

  return DEFAULT_LOCALE;
}

export function resolveNavigatorLocale(
  navigatorLike?: Pick<Navigator, "language" | "languages">,
) {
  const resolvedNavigator =
    navigatorLike ?? (typeof navigator === "undefined" ? null : navigator);
  if (!resolvedNavigator) return DEFAULT_LOCALE;

  const preferredLanguages = resolvedNavigator.languages?.length
    ? Array.from(resolvedNavigator.languages)
    : [resolvedNavigator.language];

  return resolvePreferredLocale(preferredLanguages);
}

export function resolveLocalePreference(
  preference: LocalePreference,
  navigatorLike?: Pick<Navigator, "language" | "languages">,
) {
  if (preference !== AUTO_LOCALE_PREFERENCE) return preference;
  return resolveNavigatorLocale(navigatorLike);
}
