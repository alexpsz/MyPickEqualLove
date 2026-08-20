import type { ReactNode } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import type {
  BoardInsightCoverage,
  BoardInsights,
} from "../utils/boardInsights";
import {
  RELEASE_TYPE_MESSAGE_KEYS,
  TRACK_TYPE_MESSAGE_KEYS,
} from "../utils/songMetadata";
import JapaneseContent from "./JapaneseContent";

interface InsightCardProps {
  title: string;
  coverageLabel?: string;
  emptyLabel: string;
  hasEntries: boolean;
  children: ReactNode;
  className?: string;
}

function InsightCard({
  title,
  coverageLabel,
  emptyLabel,
  hasEntries,
  children,
  className = "",
}: InsightCardProps) {
  return (
    <section
      className={`rounded-2xl border border-black/8 bg-white/70 p-4 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {title}
        </h3>
        {coverageLabel ? (
          <p className="text-xs font-medium tabular-nums text-[var(--muted)]">
            {coverageLabel}
          </p>
        ) : null}
      </div>
      {hasEntries ? (
        children
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

function CountBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-[var(--project-primary-wash)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--foreground)]">
      {label}
    </span>
  );
}

function CreditDimension({
  title,
  insights,
  coverageLabel,
  emptyLabel,
  countLabel,
}: {
  title: string;
  insights: BoardInsights["credits"]["lyricist"];
  coverageLabel: (coverage: BoardInsightCoverage) => string;
  emptyLabel: string;
  countLabel: (count: number) => string;
}) {
  return (
    <div className="rounded-xl bg-black/[0.025] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">
          {title}
        </h4>
        <p className="text-xs font-medium tabular-nums text-[var(--muted)]">
          {coverageLabel(insights.coverage)}
        </p>
      </div>
      {insights.entries.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {insights.entries.map((entry) => (
            <li
              key={entry.key}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <span className="min-w-0 break-words text-[var(--foreground)]">
                <JapaneseContent>{entry.value.ja}</JapaneseContent>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {entry.value.romaji}
                </span>
                {entry.value.en ? (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {entry.value.en}
                  </span>
                ) : null}
              </span>
              <CountBadge label={countLabel(entry.count)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

export default function BoardInsightsPanel({
  insights,
}: {
  insights: BoardInsights;
}) {
  const { t } = useLocale();
  const coverageLabel = (coverage: BoardInsightCoverage) =>
    t("insights.coverage", {
      covered: coverage.covered,
      total: coverage.total,
      percent: coverage.percent,
    });
  const countLabel = (count: number) => t("insights.songCount", { count });
  const emptyLabel = t("insights.noData");

  return (
    <section
      aria-labelledby="board-insights-title"
      data-board-insights
      className="mt-5 mb-6 rounded-2xl border border-black/10 bg-white/85 p-4 shadow-sm sm:mt-6 sm:p-5"
    >
      <div className="max-w-2xl">
        <h2
          id="board-insights-title"
          className="text-base font-semibold tracking-[-0.01em] text-[var(--foreground)] sm:text-lg"
        >
          {t("insights.title")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {t("insights.description")}
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InsightCard
          title={t("insights.releaseYears")}
          coverageLabel={coverageLabel(insights.releaseYears.coverage)}
          emptyLabel={emptyLabel}
          hasEntries={insights.releaseYears.entries.length > 0}
        >
          <ul className="mt-3 space-y-2">
            {insights.releaseYears.entries.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium tabular-nums text-[var(--foreground)]">
                  {entry.year}
                </span>
                <CountBadge label={countLabel(entry.count)} />
              </li>
            ))}
          </ul>
        </InsightCard>

        <InsightCard
          title={t("insights.releaseTypes")}
          coverageLabel={coverageLabel(insights.releaseTypes.coverage)}
          emptyLabel={emptyLabel}
          hasEntries={insights.releaseTypes.entries.length > 0}
        >
          <ul className="mt-3 space-y-2">
            {insights.releaseTypes.entries.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 text-[var(--foreground)]">
                  {t(RELEASE_TYPE_MESSAGE_KEYS[entry.value])}
                </span>
                <CountBadge label={countLabel(entry.count)} />
              </li>
            ))}
          </ul>
        </InsightCard>

        <InsightCard
          title={t("insights.trackTypes")}
          coverageLabel={coverageLabel(insights.trackTypes.coverage)}
          emptyLabel={emptyLabel}
          hasEntries={insights.trackTypes.entries.length > 0}
        >
          <ul className="mt-3 space-y-2">
            {insights.trackTypes.entries.map((entry) => (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 text-[var(--foreground)]">
                  {t(TRACK_TYPE_MESSAGE_KEYS[entry.value])}
                </span>
                <CountBadge label={countLabel(entry.count)} />
              </li>
            ))}
          </ul>
        </InsightCard>

        <InsightCard
          title={t("insights.credits")}
          emptyLabel={emptyLabel}
          hasEntries
          className="md:col-span-2"
        >
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <CreditDimension
              title={t("insights.lyricist")}
              insights={insights.credits.lyricist}
              coverageLabel={coverageLabel}
              emptyLabel={emptyLabel}
              countLabel={countLabel}
            />
            <CreditDimension
              title={t("insights.composer")}
              insights={insights.credits.composer}
              coverageLabel={coverageLabel}
              emptyLabel={emptyLabel}
              countLabel={countLabel}
            />
            <CreditDimension
              title={t("insights.arranger")}
              insights={insights.credits.arranger}
              coverageLabel={coverageLabel}
              emptyLabel={emptyLabel}
              countLabel={countLabel}
            />
          </div>
        </InsightCard>
      </div>
    </section>
  );
}
