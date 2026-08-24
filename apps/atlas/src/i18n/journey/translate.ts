import type { ShellLocale } from "../shell/messages.js";

export type JourneyLocale = ShellLocale;

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
