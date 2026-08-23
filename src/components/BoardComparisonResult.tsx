"use client";

import type { ReactNode } from "react";
import { SONGS_BY_ID } from "../data/songs";
import { useLocale } from "../i18n/LocaleProvider";
import { deriveBoardAffinity } from "../utils/boardAffinity";
import type {
  AvailableBoardComparison,
  BoardComparisonRankedSong,
  BoardComparisonSharedSong,
} from "../utils/boardComparison";
import JapaneseContent from "./JapaneseContent";

interface BoardComparisonResultProps {
  result: AvailableBoardComparison;
  exporting: boolean;
  onExport: () => void;
}

export default function BoardComparisonResult({
  result,
  exporting,
  onExport,
}: BoardComparisonResultProps) {
  const { t } = useLocale();
  const affinity = deriveBoardAffinity(result);
  if (!affinity) return null;

  return (
    <section
      aria-labelledby="board-comparison-result-heading"
      className="mt-5 border-t border-[var(--line)] pt-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id="board-comparison-result-heading"
          className="text-sm font-semibold text-[var(--foreground)]"
        >
          {t("boardComparison.resultHeading")}
        </h3>
        <p
          role="status"
          aria-live="polite"
          className="text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]"
        >
          {t("boardComparison.score", { score: affinity.points })}
        </p>
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] px-3 py-3 text-[12px] leading-relaxed text-[var(--muted)] sm:px-4">
        <p>{t("boardComparison.formulaBase")}</p>
        <p className="mt-1">
          {t("boardComparison.formulaRank", {
            shared: affinity.sharedSongCount,
            boardSize: affinity.boardSize,
            distance: affinity.totalRankDistance,
            score: affinity.points,
          })}
        </p>
        <p className="mt-1">{t("boardComparison.formulaRounded")}</p>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="official-button official-button-primary"
        >
          {exporting
            ? t("boardComparison.exportGenerating")
            : t("boardComparison.exportAction")}
        </button>
      </div>

      <ComparisonSection
        title={t("boardComparison.sharedHeading")}
        emptyLabel={t("boardComparison.none")}
        items={result.shared}
        renderItem={(song) => <SharedSong song={song} />}
      />
      <ComparisonSection
        title={t("boardComparison.onlyCurrentHeading")}
        emptyLabel={t("boardComparison.none")}
        items={result.onlyCurrent}
        renderItem={(song) => <RankedSong song={song} rankKind="current" />}
      />
      <ComparisonSection
        title={t("boardComparison.onlySharedHeading")}
        emptyLabel={t("boardComparison.none")}
        items={result.onlyShared}
        renderItem={(song) => <RankedSong song={song} rankKind="shared" />}
      />
    </section>
  );
}

function ComparisonSection<Item extends { songId: string }>({
  title,
  emptyLabel,
  items,
  renderItem,
}: {
  title: string;
  emptyLabel: string;
  items: readonly Item[];
  renderItem: (item: Item) => ReactNode;
}) {
  return (
    <section className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-[var(--muted)]">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]">
          {items.map((item) => (
            <li key={item.songId} className="px-3 py-3 sm:px-4">
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SharedSong({ song }: { song: BoardComparisonSharedSong }) {
  const { t } = useLocale();

  return (
    <div className="min-w-0">
      <SongTitle songId={song.songId} />
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
        {t("boardComparison.currentRank", { rank: song.currentRank })}
        <span aria-hidden="true"> · </span>
        {t("boardComparison.sharedRank", { rank: song.sharedRank })}
        <span aria-hidden="true"> · </span>
        {t("boardComparison.rankDifference", {
          difference: song.rankDifference,
        })}
      </p>
    </div>
  );
}

function RankedSong({
  song,
  rankKind,
}: {
  song: BoardComparisonRankedSong;
  rankKind: "current" | "shared";
}) {
  const { t } = useLocale();

  return (
    <div className="min-w-0">
      <SongTitle songId={song.songId} />
      <p className="mt-1 text-[12px] text-[var(--muted)]">
        {t(
          rankKind === "current"
            ? "boardComparison.currentRank"
            : "boardComparison.sharedRank",
          { rank: song.rank },
        )}
      </p>
    </div>
  );
}

function SongTitle({ songId }: { songId: string }) {
  const title = SONGS_BY_ID[songId]?.title.ja ?? songId;

  return (
    <p className="break-words text-[13px] font-semibold leading-snug text-[var(--foreground)]">
      <JapaneseContent>{title}</JapaneseContent>
    </p>
  );
}
