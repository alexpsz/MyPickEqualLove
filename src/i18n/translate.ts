import { messages, type MessageKey, type MessageValues } from "./messages";
import type { AppLocale } from "./locales";

export type Translate = (key: MessageKey, values?: MessageValues) => string;

export function translate(
  locale: AppLocale,
  key: MessageKey,
  values?: MessageValues,
) {
  return formatMessage(messages[locale][key], values);
}

export function formatMessage(template: string, values?: MessageValues) {
  if (!values) return template;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
