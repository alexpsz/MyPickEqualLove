import type { JourneyDocumentReadResult } from "../../contracts/journey-document.js";
import type {
  JourneyDeleteMutationResult,
  JourneyMutationFailure,
  JourneyWriteMutationResult,
} from "../../ports/journey-repository.js";
import type { JourneyReplacePlanApplyResult } from "../../storage/journey-storage.js";
import {
  journeyMessage,
  type JourneyMessageKey,
} from "../../i18n/journey/messages.js";
import type { JourneyLocale } from "../../i18n/journey/translate.js";
import styles from "./journey-ui.module.css";

export type JourneyOperationFeedback =
  | { readonly kind: "success"; readonly message: JourneyMessageKey }
  | { readonly kind: "stale" }
  | { readonly kind: "validation"; readonly error: string }
  | {
      readonly kind: "mutation";
      readonly result:
        | JourneyWriteMutationResult
        | JourneyDeleteMutationResult
        | JourneyReplacePlanApplyResult;
    };

interface TextNoticeProps {
  readonly locale: JourneyLocale;
  readonly tone: "error" | "success" | "warning";
  readonly title: JourneyMessageKey;
  readonly body?: JourneyMessageKey;
  readonly values?: Readonly<Record<string, string | number>>;
}

export function TextNotice({
  locale,
  tone,
  title,
  body,
  values,
}: TextNoticeProps) {
  return (
    <section
      aria-live={tone === "success" ? "polite" : "assertive"}
      className={styles.notice}
      data-tone={tone}
      role={tone === "success" ? "status" : "alert"}
    >
      <h2>{journeyMessage(locale, title, values)}</h2>
      {body ? <p>{journeyMessage(locale, body, values)}</p> : null}
    </section>
  );
}

export function JourneyReadAlert({
  locale,
  read,
}: {
  readonly locale: JourneyLocale;
  readonly read: JourneyDocumentReadResult;
}) {
  if (read.status === "absent" || read.status === "valid") return null;
  if (read.status === "corrupt") {
    return (
      <TextNotice
        body="readCorruptBody"
        locale={locale}
        title="readCorruptTitle"
        tone="error"
      />
    );
  }
  if (read.status === "future-version") {
    return (
      <TextNotice
        body="readFutureBody"
        locale={locale}
        title="readFutureTitle"
        tone="error"
        values={{ version: read.version }}
      />
    );
  }
  if (read.status === "invalid") {
    return (
      <TextNotice
        body="readInvalidBody"
        locale={locale}
        title="readInvalidTitle"
        tone="error"
        values={{ error: `${read.issue.path}: ${read.issue.message}` }}
      />
    );
  }
  return (
    <TextNotice
      body="readFailedBody"
      locale={locale}
      title="readFailedTitle"
      tone="error"
      values={{ error: read.error }}
    />
  );
}

function failureBody(locale: JourneyLocale, failure: JourneyMutationFailure) {
  const stageKey: JourneyMessageKey =
    failure.stage === "read-before-write"
      ? "stageRead"
      : failure.stage === "write"
        ? "stageWrite"
        : "stageReadback";
  const rollback =
    failure.rollback.status === "restored"
      ? journeyMessage(locale, "rollbackRestored")
      : failure.rollback.status === "not-required"
        ? journeyMessage(locale, "rollbackNotRequired")
        : journeyMessage(locale, "rollbackFailed", {
            error: failure.rollback.error,
          });
  return `${journeyMessage(locale, stageKey)} ${failure.error} ${rollback}`;
}

export function JourneyFeedbackAlert({
  locale,
  feedback,
}: {
  readonly locale: JourneyLocale;
  readonly feedback: JourneyOperationFeedback | null;
}) {
  if (feedback === null) return null;
  if (feedback.kind === "success") {
    return (
      <TextNotice locale={locale} title={feedback.message} tone="success" />
    );
  }
  if (feedback.kind === "stale") {
    return (
      <TextNotice
        body="staleDraftBody"
        locale={locale}
        title="staleDraftTitle"
        tone="warning"
      />
    );
  }
  if (feedback.kind === "validation") {
    return (
      <TextNotice
        locale={locale}
        title="validationError"
        tone="error"
        values={{ error: feedback.error }}
      />
    );
  }
  const result = feedback.result;
  if (result.status === "conflict") {
    return (
      <TextNotice
        body="conflictBody"
        locale={locale}
        title="conflictTitle"
        tone="warning"
      />
    );
  }
  if (result.status === "failure") {
    return (
      <section
        aria-live="assertive"
        className={styles.notice}
        data-tone="error"
        role="alert"
      >
        <h2>{journeyMessage(locale, "writeFailedTitle")}</h2>
        <p>{failureBody(locale, result)}</p>
      </section>
    );
  }
  if (result.status === "invalid-plan") {
    return (
      <TextNotice
        locale={locale}
        title="validationError"
        tone="error"
        values={{ error: result.reason }}
      />
    );
  }
  return null;
}
