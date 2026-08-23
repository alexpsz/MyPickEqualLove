import AppIcon, { type AppIconName } from "./AppIcon";
import { DIALOG_RETURN_KEYS } from "../utils/useDialogA11y";

export interface OnboardingEmptyStateCopy {
  title: string;
  description: string;
  searchTitle: string;
  searchDescription: string;
  assistantTitle: string;
  assistantDescription: string;
  importTitle: string;
  importDescription: string;
  dismiss: string;
}

interface OnboardingEmptyStateProps {
  variant: "standard" | "live";
  copy: OnboardingEmptyStateCopy;
  onSearch: () => void;
  onOpenAssistant: () => void;
  onImportShareLink: () => void;
  onDismiss: () => void;
}

export default function OnboardingEmptyState({
  variant,
  copy,
  onSearch,
  onOpenAssistant,
  onImportShareLink,
  onDismiss,
}: OnboardingEmptyStateProps) {
  return (
    <section
      data-onboarding-empty-state={variant}
      aria-labelledby="onboarding-empty-state-title"
      className="official-panel-soft mb-4 p-4 sm:mb-5 sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="onboarding-empty-state-title"
            className="text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:text-xl"
          >
            {copy.title}
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[var(--muted)] sm:text-sm">
            {copy.description}
          </p>
        </div>
        <button
          type="button"
          data-onboarding-action="dismiss"
          onClick={onDismiss}
          className="official-button official-button-quiet min-h-11 shrink-0 px-3"
        >
          <AppIcon name="close" size={14} />
          <span>{copy.dismiss}</span>
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3 sm:gap-3">
        <OnboardingAction
          action="search"
          returnFocusKey={DIALOG_RETURN_KEYS.onboardingSearch}
          icon="search"
          title={copy.searchTitle}
          description={copy.searchDescription}
          onClick={onSearch}
        />
        <OnboardingAction
          action="assistant"
          returnFocusKey={DIALOG_RETURN_KEYS.onboardingAssistant}
          icon="music"
          title={copy.assistantTitle}
          description={copy.assistantDescription}
          onClick={onOpenAssistant}
        />
        <OnboardingAction
          action="import"
          returnFocusKey={DIALOG_RETURN_KEYS.onboardingImport}
          icon="share"
          title={copy.importTitle}
          description={copy.importDescription}
          onClick={onImportShareLink}
        />
      </div>
    </section>
  );
}

function OnboardingAction({
  action,
  returnFocusKey,
  icon,
  title,
  description,
  onClick,
}: {
  action: "search" | "assistant" | "import";
  returnFocusKey: string;
  icon: AppIconName;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-onboarding-action={action}
      data-dialog-return-key={returnFocusKey}
      onClick={onClick}
      className="group flex min-h-24 w-full items-start gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] p-3.5 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--paper-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--project-primary)]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--project-primary-wash)] text-[var(--project-primary)]">
        <AppIcon name={icon} size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--foreground)]">
          {title}
        </span>
        <span className="mt-1 block text-[12px] leading-relaxed text-[var(--muted)] sm:text-[13px]">
          {description}
        </span>
      </span>
    </button>
  );
}
