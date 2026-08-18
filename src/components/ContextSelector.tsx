"use client";

import type { ExperienceContext } from "../data/pickExperiences";
import { useLocale } from "../i18n/LocaleProvider";

export default function ContextSelector({
  contexts,
  activeContextId,
  onChange,
}: {
  contexts: ExperienceContext[];
  activeContextId?: string;
  onChange: (contextId: string) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold text-[var(--muted)]">
        {t("context.selectorLabel")}
      </div>
      <div className="grid w-full grid-cols-3 rounded-[var(--radius-sm)] bg-[var(--background)] p-1 sm:w-fit sm:min-w-[420px]">
        {contexts.map((context) => (
          <button
            key={context.id}
            type="button"
            onClick={() => onChange(context.id)}
            aria-pressed={activeContextId === context.id}
            aria-label={
              context.shortDateLabel
                ? `${context.label}, ${context.shortDateLabel}`
                : context.label
            }
            className={`min-h-11 min-w-0 rounded-[9px] border px-1 py-1 text-[13px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] sm:px-3 sm:py-2 ${
              activeContextId === context.id
                ? "border-[var(--line)] bg-white text-[var(--foreground)] shadow-sm"
                : "border-transparent bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span
              aria-hidden="true"
              className="flex flex-col items-center justify-center gap-0.5 leading-tight sm:flex-row sm:gap-1 sm:whitespace-nowrap sm:leading-normal"
            >
              <span className="whitespace-nowrap">{context.label}</span>
              {context.shortDateLabel ? (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="whitespace-nowrap">
                    {context.shortDateLabel}
                  </span>
                </>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
