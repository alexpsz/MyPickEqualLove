"use client";

import type { Ref } from "react";
import type { MessageKey } from "../i18n/messages";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickInsights } from "../schema/pick-insights";
import type { Member, ReleaseType, TrackType } from "../schema/music";
import { DIALOG_RETURN_KEYS } from "../utils/useDialogA11y";
import JapaneseContent from "./JapaneseContent";

interface PickInsightsPanelProps {
  insights: PickInsights;
  membersById: Readonly<Record<string, Member>>;
  slotCount: number;
  onGenerateInsights: () => void;
  generating: boolean;
  generateButtonRef?: Ref<HTMLButtonElement>;
}

const RELEASE_TYPE_MESSAGE_KEYS: Record<ReleaseType, MessageKey> = {
  single: "search.releaseType.single",
  album: "search.releaseType.album",
  digital: "search.releaseType.digital",
  dvd_bd: "search.releaseType.dvdBd",
  other: "search.releaseType.other",
};

const TRACK_TYPE_MESSAGE_KEYS: Record<TrackType, MessageKey> = {
  title: "search.trackType.title",
  coupling: "search.trackType.coupling",
  album: "search.trackType.album",
  solo: "search.trackType.solo",
  unit: "search.trackType.unit",
  live: "search.trackType.live",
  other: "search.trackType.other",
};

export default function PickInsightsPanel({
  insights,
  membersById,
  slotCount,
  onGenerateInsights,
  generating,
  generateButtonRef,
}: PickInsightsPanelProps) {
  const { t } = useLocale();
  const selectedLabel = t("insights.selectedCount", {
    selected: insights.selectedCount,
    total: slotCount,
  });

  if (insights.selectedCount === 0) {
    return (
      <section
        id="pick-insights-panel"
        aria-labelledby="pick-insights-title"
        aria-busy={generating}
        className="official-panel-soft grid gap-3 p-4 sm:p-5"
      >
        <div>
          <h2
            id="pick-insights-title"
            className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--foreground)]"
          >
            {t("insights.title")}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
            {t("insights.empty")}
          </p>
        </div>
        <button
          type="button"
          disabled
          className="official-button official-button-primary justify-self-start disabled:opacity-50"
        >
          {t("insights.generateCard")}
        </button>
      </section>
    );
  }

  return (
    <section
      id="pick-insights-panel"
      aria-labelledby="pick-insights-title"
      aria-busy={generating}
      className="official-panel-soft grid gap-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="pick-insights-title"
            className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--foreground)]"
          >
            {t("insights.title")}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
            {selectedLabel}
            {insights.selectedCount === 1
              ? ` · ${t("insights.singlePick")}`
              : ""}
          </p>
        </div>
        <button
          ref={generateButtonRef}
          type="button"
          onClick={onGenerateInsights}
          disabled={generating}
          data-dialog-return-key={DIALOG_RETURN_KEYS.insights}
          aria-label={
            generating
              ? t("insights.generatingCard")
              : t("insights.generateCard")
          }
          className="official-button official-button-primary disabled:opacity-50"
        >
          {generating
            ? t("insights.generatingCard")
            : t("insights.generateCard")}
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Distribution
          title={t("insights.decades")}
          coverage={insights.decades.coverage}
          values={insights.decades.values.map(({ key, count }) => ({
            label: key,
            count,
          }))}
        />
        <Distribution
          title={t("insights.releaseYears")}
          coverage={insights.releaseYears.coverage}
          values={insights.releaseYears.values.map(({ key, count }) => ({
            label: key,
            count,
          }))}
        />
        <Distribution
          title={t("insights.trackTypes")}
          coverage={insights.trackTypes.coverage}
          values={insights.trackTypes.values.map(({ key, count }) => ({
            label: t(TRACK_TYPE_MESSAGE_KEYS[key]),
            count,
          }))}
        />
        <Distribution
          title={t("insights.releaseTypes")}
          coverage={insights.releaseTypes.coverage}
          values={insights.releaseTypes.values.map(({ key, count }) => ({
            label: t(RELEASE_TYPE_MESSAGE_KEYS[key]),
            count,
          }))}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Ranking
          title={t("insights.members")}
          eligible={insights.members.eligible}
          known={insights.members.coverage.known}
          total={insights.members.coverage.total}
          leaders={insights.members.leaders.map(
            (memberId) => membersById[memberId]?.name.ja ?? memberId,
          )}
          leaderCount={insights.members.leaderCount}
        />
        <Ranking
          title={t("insights.centers")}
          eligible={insights.centers.eligible}
          known={insights.centers.coverage.known}
          total={insights.centers.coverage.total}
          leaders={insights.centers.leaders.map(
            (memberId) => membersById[memberId]?.name.ja ?? memberId,
          )}
          leaderCount={insights.centers.leaderCount}
        />
      </div>

      <div className="grid gap-3">
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          {t("insights.creditNotationNotice")}
        </p>
        <div className="grid gap-3">
          <Ranking
            title={t("insights.lyricists")}
            eligible={insights.credits.lyricists.eligible}
            known={insights.credits.coverage.known}
            total={insights.credits.coverage.total}
            leaders={insights.credits.lyricists.leaders}
            leaderCount={insights.credits.lyricists.leaderCount}
          />
          <Ranking
            title={t("insights.composers")}
            eligible={insights.credits.composers.eligible}
            known={insights.credits.coverage.known}
            total={insights.credits.coverage.total}
            leaders={insights.credits.composers.leaders}
            leaderCount={insights.credits.composers.leaderCount}
          />
          <Ranking
            title={t("insights.arrangers")}
            eligible={insights.credits.arrangers.eligible}
            known={insights.credits.coverage.known}
            total={insights.credits.coverage.total}
            leaders={
              insights.credits.arrangers.leaderCount
                ? insights.credits.arrangers.leaders
                : []
            }
            leaderCount={insights.credits.arrangers.leaderCount}
          />
        </div>
      </div>
    </section>
  );
}

function Distribution({
  title,
  coverage,
  values,
}: {
  title: string;
  coverage: PickInsights["decades"]["coverage"];
  values: Array<{ label: string; count: number }>;
}) {
  const { t } = useLocale();
  return (
    <section className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
          {title}
        </h3>
        <Coverage known={coverage.known} total={coverage.total} />
      </div>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map(({ label, count }) => (
            <span
              key={label}
              className="rounded-full bg-[var(--project-primary-wash)] px-2 py-1 text-[12px] font-medium text-[var(--foreground)]"
            >
              {label} · {count}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-[var(--muted)]">
          {t("insights.noKnownData")}
        </p>
      )}
      {coverage.complete ? null : (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
          {t("insights.partialData")}
        </p>
      )}
    </section>
  );
}

function Ranking({
  title,
  eligible,
  known,
  total,
  leaders,
  leaderCount,
}: {
  title: string;
  eligible: boolean;
  known: number;
  total: number;
  leaders: string[];
  leaderCount: number | null;
}) {
  const { t } = useLocale();
  return (
    <section className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
          {title}
        </h3>
        <Coverage known={known} total={total} />
      </div>
      {eligible && leaders.length > 0 && leaderCount !== null ? (
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-[var(--foreground)]">
          <span className="text-[var(--muted)]">
            {t("insights.mostSelected")}:{" "}
          </span>
          {leaders.map((leader, index) => (
            <JapaneseContent key={leader}>
              {index > 0 ? " · " : ""}
              {leader}
            </JapaneseContent>
          ))}
          <span className="text-[var(--muted)]"> · {leaderCount}</span>
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
          {t("insights.insufficientData", { known, total })}
        </p>
      )}
    </section>
  );
}

function Coverage({ known, total }: { known: number; total: number }) {
  const { t } = useLocale();
  return (
    <span className="text-[11px] font-medium tabular-nums text-[var(--muted)]">
      {t("insights.coverage", { known, total })}
    </span>
  );
}
