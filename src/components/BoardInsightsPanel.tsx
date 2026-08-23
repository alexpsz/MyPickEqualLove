"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import type {
  BoardInsightCoverage,
  BoardInsightCreditEntry,
  BoardInsights,
} from "../utils/boardInsights";
import {
  RELEASE_TYPE_MESSAGE_KEYS,
  TRACK_TYPE_MESSAGE_KEYS,
} from "../utils/songMetadata";
import JapaneseContent from "./JapaneseContent";

interface InsightCardProps {
  title: string;
  coverage?: BoardInsightCoverage;
  emptyLabel: string;
  hasEntries: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Coverage only earns a line when something is missing. On a complete board it
 * reads "10/10 (100%)" in every card at once, which is six repetitions of "no
 * problem here".
 */
function CoverageLabel({ coverage }: { coverage: BoardInsightCoverage }) {
  const { t } = useLocale();
  if (coverage.covered >= coverage.total) return null;

  return (
    <p className="text-xs font-medium tabular-nums text-[var(--muted)]">
      {t("insights.coverage", {
        covered: coverage.covered,
        total: coverage.total,
        percent: coverage.percent,
      })}
    </p>
  );
}

function InsightCard({
  title,
  coverage,
  emptyLabel,
  hasEntries,
  children,
  className = "",
}: InsightCardProps) {
  return (
    <section
      className={`rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {title}
        </h3>
        {coverage ? <CoverageLabel coverage={coverage} /> : null}
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

function SummaryChip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-baseline gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5">
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-sm font-semibold text-[var(--foreground)]">
        {children}
      </span>
    </li>
  );
}

/**
 * The few statements a reader can take away without adding anything up. Each
 * chip is omitted when the board does not actually support it, and a tie names
 * everyone that ties rather than picking one.
 */
function BoardSummary({ summary }: { summary: BoardInsights["summary"] }) {
  const { t } = useLocale();
  const separator = t("insights.summary.separator");
  const countLabel = (count: number) => t("insights.songCount", { count });
  const chips: ReactNode[] = [];

  if (summary.topYears.length > 0) {
    chips.push(
      <SummaryChip key="top-years" label={t("insights.summary.topYears")}>
        <span className="tabular-nums">
          {summary.topYears.map((entry) => entry.year).join(separator)}
        </span>
        {` · ${countLabel(summary.topYears[0].count)}`}
      </SummaryChip>,
    );
  }

  if (summary.titleTracks) {
    chips.push(
      <SummaryChip key="title-tracks" label={t("insights.summary.titleTracks")}>
        <span className="tabular-nums">
          {`${summary.titleTracks.count}/${summary.titleTracks.total}`}
        </span>
      </SummaryChip>,
    );
  }

  if (summary.yearSpan) {
    chips.push(
      <SummaryChip key="year-span" label={t("insights.summary.yearSpan")}>
        <span className="tabular-nums">
          {`${summary.yearSpan.from}–${summary.yearSpan.to}`}
        </span>
      </SummaryChip>,
    );
  }

  if (summary.topLyricists.length > 0) {
    chips.push(
      <SummaryChip
        key="top-lyricists"
        label={t("insights.summary.topLyricists")}
      >
        <JapaneseContent>
          {summary.topLyricists.map((entry) => entry.value.ja).join(separator)}
        </JapaneseContent>
        {` · ${countLabel(summary.topLyricists[0].count)}`}
      </SummaryChip>,
    );
  }

  if (chips.length === 0) return null;

  return <ul className="mt-4 flex flex-wrap gap-2">{chips}</ul>;
}

function CreditRow({
  entry,
  countLabel,
}: {
  entry: BoardInsightCreditEntry;
  countLabel: (count: number) => string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 text-sm">
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
  );
}

/**
 * Contributors for one role, ranked by how many of the board's songs they
 * worked on.
 *
 * Everyone credited on a single song is folded away by default. On a ten-song
 * board a role like arrangement is usually ten different people with one song
 * each, and printing that list ranks nothing while burying the names that do
 * repeat.
 */
function CreditDimension({
  title,
  insights,
  emptyLabel,
  countLabel,
}: {
  title: string;
  insights: BoardInsights["credits"]["lyricist"];
  emptyLabel: string;
  countLabel: (count: number) => string;
}) {
  const { t } = useLocale();
  const [showOnceOnly, setShowOnceOnly] = useState(false);
  const listId = useId();

  const repeated = insights.entries.filter((entry) => entry.count > 1);
  const onceOnly = insights.entries.filter((entry) => entry.count === 1);

  return (
    <div className="rounded-xl bg-[var(--background)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">
          {title}
        </h4>
        <CoverageLabel coverage={insights.coverage} />
      </div>
      {insights.entries.length > 0 ? (
        <>
          {repeated.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {repeated.map((entry) => (
                <CreditRow
                  key={entry.key}
                  entry={entry}
                  countLabel={countLabel}
                />
              ))}
            </ul>
          ) : null}
          {onceOnly.length > 0 ? (
            <>
              {/* Rendered even while collapsed so aria-controls always resolves. */}
              <ul id={listId} hidden={!showOnceOnly} className="mt-3 space-y-2">
                {onceOnly.map((entry) => (
                  <CreditRow
                    key={entry.key}
                    entry={entry}
                    countLabel={countLabel}
                  />
                ))}
              </ul>
              <button
                type="button"
                aria-expanded={showOnceOnly}
                aria-controls={listId}
                onClick={() => setShowOnceOnly((visible) => !visible)}
                className="mt-3 -ml-2 min-h-11 rounded-[10px] px-2 text-left text-xs font-medium text-[var(--muted)] outline-none transition-colors duration-150 hover:bg-[var(--quiet-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
              >
                {showOnceOnly
                  ? t("insights.hideOnceOnly")
                  : t("insights.showOnceOnly", { count: onceOnly.length })}
              </button>
            </>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

interface BoardInsightsPanelProps {
  insights: BoardInsights;
  selectedCount: number;
  targetCount: number;
  canExport: boolean;
  disabled: boolean;
  generating: boolean;
  exportButtonRef?: Ref<HTMLButtonElement>;
  exportReturnKey: string;
  onGenerate: () => void;
}

export default function BoardInsightsPanel({
  insights,
  selectedCount,
  targetCount,
  canExport,
  disabled,
  generating,
  exportButtonRef,
  exportReturnKey,
  onGenerate,
}: BoardInsightsPanelProps) {
  const { t } = useLocale();
  const countLabel = (count: number) => t("insights.songCount", { count });
  const emptyLabel = t("insights.noData");
  const yearTotal = insights.releaseYears.coverage.covered;

  return (
    <section
      aria-labelledby="board-insights-title"
      data-board-insights
      data-board-insights-selected-count={selectedCount}
      className="mt-5 mb-6 rounded-2xl border border-[var(--line)] bg-[var(--material-strong)] p-4 shadow-sm sm:mt-6 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <p
          data-board-insights-progress
          className="shrink-0 rounded-full bg-[var(--project-primary-wash)] px-3 py-1.5 text-xs font-semibold tabular-nums text-[var(--foreground)]"
        >
          {t("insights.selectionProgress", {
            selected: selectedCount,
            total: targetCount,
          })}
        </p>
      </div>

      <BoardSummary summary={insights.summary} />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InsightCard
          title={t("insights.releaseYears")}
          coverage={insights.releaseYears.coverage}
          emptyLabel={emptyLabel}
          hasEntries={insights.releaseYears.entries.length > 0}
        >
          <ul className="mt-3 space-y-2.5">
            {insights.releaseYears.entries.map((entry) => (
              <li key={entry.key} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium tabular-nums text-[var(--foreground)]">
                    {entry.year}
                  </span>
                  <CountBadge label={countLabel(entry.count)} />
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"
                >
                  <div
                    className="h-full rounded-full bg-[var(--project-primary)]"
                    style={{
                      width: `${yearTotal > 0 ? (entry.count / yearTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </InsightCard>

        <InsightCard
          title={t("insights.releaseTypes")}
          coverage={insights.releaseTypes.coverage}
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
          coverage={insights.trackTypes.coverage}
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
              emptyLabel={emptyLabel}
              countLabel={countLabel}
            />
            <CreditDimension
              title={t("insights.composer")}
              insights={insights.credits.composer}
              emptyLabel={emptyLabel}
              countLabel={countLabel}
            />
            <CreditDimension
              title={t("insights.arranger")}
              insights={insights.credits.arranger}
              emptyLabel={emptyLabel}
              countLabel={countLabel}
            />
          </div>
        </InsightCard>
      </div>

      {canExport ? (
        <div
          data-board-insights-export-action
          className="mt-4 flex justify-end"
        >
          <button
            ref={exportButtonRef}
            type="button"
            data-dialog-return-key={exportReturnKey}
            onClick={onGenerate}
            disabled={disabled}
            className="official-button official-button-primary min-h-11 w-full sm:w-auto"
          >
            {generating ? t("controls.generating") : t("insights.export.cta")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
