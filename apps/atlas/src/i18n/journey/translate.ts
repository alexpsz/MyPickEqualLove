export const JOURNEY_LOCALES = ["zh-CN", "en", "ja", "ko"] as const;

export type JourneyLocale = (typeof JOURNEY_LOCALES)[number];

export function resolveJourneyLocale(
  languages: readonly string[],
): JourneyLocale {
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("ja")) return "ja";
    if (normalized.startsWith("ko")) return "ko";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

export function formatJourneyDateTime(
  locale: JourneyLocale,
  timestamp: string,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function formatJourneyDate(locale: JourneyLocale, date: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}
