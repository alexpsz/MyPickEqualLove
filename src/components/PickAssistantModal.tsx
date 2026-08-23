"use client";

import { useEffect, useMemo, useRef } from "react";
import * as m from "motion/react-m";
import { useLocale } from "../i18n/LocaleProvider";
import type { Song } from "../schema/music";
import {
  deriveTournament,
  type ComparisonOutcome,
  type PickAssistantSession,
  type RankedPickPlan,
} from "../utils/pickAssistant";
import { useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import JapaneseContent from "./JapaneseContent";
import type { PresenceState } from "./MotionPresence";

export type PickAssistantStorageIssue =
  | "corrupt"
  | "future"
  | "expired"
  | "conflict"
  | "unavailable";

interface PickAssistantModalProps {
  shortlist: Song[];
  session: PickAssistantSession | null;
  applicationPlan: RankedPickPlan | null;
  slotLabels: Readonly<Record<string, string>>;
  currentPickCount: number;
  currentBoardCandidateCount: number;
  minimumCandidates: number;
  maximumCandidates: number;
  randomSampleActive: boolean;
  randomSampleCount: number;
  longSessionCandidates: number;
  shortlistMaximumComparisons: number;
  storageIssue: PickAssistantStorageIssue | null;
  mutationsBlocked: boolean;
  reviewNotice: boolean;
  presenceState: PresenceState;
  returnFocusKey: string;
  onClose: () => void;
  onBrowseCandidates: () => void;
  onCreateRandomSample: () => void;
  onUseCurrentBoard: () => void;
  onRemoveCandidate: (songId: string) => void;
  onClear: () => void;
  onStart: () => void;
  onCompare: (outcome: ComparisonOutcome) => void;
  onSkip: () => void;
  onUndo: () => void;
  onRestart: () => void;
  onApply: () => void;
  onResetStorage: () => void;
}

export default function PickAssistantModal({
  shortlist,
  session,
  applicationPlan,
  slotLabels,
  currentPickCount,
  currentBoardCandidateCount,
  minimumCandidates,
  maximumCandidates,
  randomSampleActive,
  randomSampleCount,
  longSessionCandidates,
  shortlistMaximumComparisons,
  storageIssue,
  mutationsBlocked,
  reviewNotice,
  presenceState,
  returnFocusKey,
  onClose,
  onBrowseCandidates,
  onCreateRandomSample,
  onUseCurrentBoard,
  onRemoveCandidate,
  onClear,
  onStart,
  onCompare,
  onSkip,
  onUndo,
  onRestart,
  onApply,
  onResetStorage,
}: PickAssistantModalProps) {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const leftChoiceRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const browseCandidatesRef = useRef<HTMLButtonElement>(null);
  const songsById = useMemo(
    () => Object.fromEntries(shortlist.map((song) => [song.id, song])),
    [shortlist],
  );
  const tournament = useMemo(
    () => (session ? deriveTournament(session) : null),
    [session],
  );
  const currentPairKey =
    tournament?.status === "comparing"
      ? `${tournament.pair.leftId}:${tournament.pair.rightId}`
      : null;

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting",
    autoFocus: false,
    returnFocusKey,
  });

  useEffect(() => {
    if (presenceState === "exiting") return;
    const timer = window.setTimeout(() => {
      if (currentPairKey) {
        leftChoiceRef.current?.focus();
      } else if (tournament?.status === "complete") {
        applyRef.current?.focus();
      } else if (shortlist.length < minimumCandidates) {
        browseCandidatesRef.current?.focus();
      } else {
        panelRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    currentPairKey,
    minimumCandidates,
    presenceState,
    shortlist.length,
    tournament?.status,
  ]);

  const handleClear = () => {
    if (window.confirm(t("assistant.clearConfirm"))) onClear();
  };
  const handleRestart = () => {
    if (window.confirm(t("assistant.restartConfirm"))) onRestart();
  };
  const handleResetStorage = () => {
    if (window.confirm(t("assistant.resetConfirm"))) onResetStorage();
  };

  return (
    <div
      className={`motion-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 ${presenceState === "exiting" ? "pointer-events-none" : ""}`}
      data-presence={presenceState}
      aria-hidden={presenceState === "exiting"}
      inert={presenceState === "exiting"}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={presenceState === "exiting"}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        aria-label={t("assistant.closeAria")}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={APPLE_OPACITY}
      />

      <m.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-hidden={presenceState === "exiting"}
        inert={presenceState === "exiting"}
        aria-labelledby="pick-assistant-title"
        aria-busy={mutationsBlocked}
        className="apple-sheet relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] border-x-0 border-b-0 focus:outline-none sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id="pick-assistant-title"
              className="text-[22px] font-semibold tracking-[-0.035em] text-[var(--foreground)]"
            >
              {t("assistant.title")}
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">
              {t("assistant.subtitle", {
                count: shortlist.length,
                max: maximumCandidates,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact shrink-0"
            aria-label={t("assistant.closeAria")}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <div className="no-scrollbar grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain bg-[var(--background)] px-4 py-4 sm:px-6 sm:py-5">
          {reviewNotice && !storageIssue ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900"
            >
              {t("assistant.previewRefreshed")}
            </p>
          ) : null}
          {storageIssue ? (
            <StorageIssue issue={storageIssue} onReset={handleResetStorage} />
          ) : tournament?.status === "comparing" ? (
            <ComparisonView
              leftSong={songsById[tournament.pair.leftId]}
              rightSong={songsById[tournament.pair.rightId]}
              decisionsMade={tournament.decisionsMade}
              maximumComparisons={tournament.maximumComparisons}
              canUndo={Boolean(session?.decisions.length)}
              leftChoiceRef={leftChoiceRef}
              onCompare={onCompare}
              onSkip={onSkip}
              onUndo={onUndo}
              onRestart={handleRestart}
              mutationsBlocked={mutationsBlocked}
            />
          ) : tournament?.status === "complete" && applicationPlan ? (
            <ResultView
              orderedIds={tournament.orderedIds}
              songsById={songsById}
              plan={applicationPlan}
              slotLabels={slotLabels}
              currentPickCount={currentPickCount}
              applyRef={applyRef}
              onApply={onApply}
              onUndo={onUndo}
              onRestart={handleRestart}
              mutationsBlocked={mutationsBlocked}
            />
          ) : (
            <ShortlistView
              shortlist={shortlist}
              minimumCandidates={minimumCandidates}
              maximumCandidates={maximumCandidates}
              randomSampleActive={randomSampleActive}
              randomSampleCount={randomSampleCount}
              longSessionCandidates={longSessionCandidates}
              shortlistMaximumComparisons={shortlistMaximumComparisons}
              currentBoardCandidateCount={currentBoardCandidateCount}
              browseCandidatesRef={browseCandidatesRef}
              onBrowseCandidates={onBrowseCandidates}
              onCreateRandomSample={onCreateRandomSample}
              onUseCurrentBoard={onUseCurrentBoard}
              onRemoveCandidate={onRemoveCandidate}
              onClear={handleClear}
              onStart={onStart}
              mutationsBlocked={mutationsBlocked}
            />
          )}
        </div>
      </m.div>
    </div>
  );
}

function ShortlistView({
  shortlist,
  minimumCandidates,
  maximumCandidates,
  randomSampleActive,
  randomSampleCount,
  longSessionCandidates,
  shortlistMaximumComparisons,
  currentBoardCandidateCount,
  browseCandidatesRef,
  onBrowseCandidates,
  onCreateRandomSample,
  onUseCurrentBoard,
  onRemoveCandidate,
  onClear,
  onStart,
  mutationsBlocked,
}: {
  shortlist: Song[];
  minimumCandidates: number;
  maximumCandidates: number;
  randomSampleActive: boolean;
  randomSampleCount: number;
  longSessionCandidates: number;
  shortlistMaximumComparisons: number;
  currentBoardCandidateCount: number;
  browseCandidatesRef: React.RefObject<HTMLButtonElement | null>;
  onBrowseCandidates: () => void;
  onCreateRandomSample: () => void;
  onUseCurrentBoard: () => void;
  onRemoveCandidate: (songId: string) => void;
  onClear: () => void;
  onStart: () => void;
  mutationsBlocked: boolean;
}) {
  const { t } = useLocale();
  const canImportCurrentBoard =
    currentBoardCandidateCount >= minimumCandidates &&
    currentBoardCandidateCount <= maximumCandidates;
  const canCreateRandomSample = randomSampleCount >= minimumCandidates;
  if (shortlist.length === 0) {
    return (
      <div className="grid gap-4">
        <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] px-6 py-14 text-center">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">
            {t("assistant.emptyTitle")}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
            {t("assistant.emptyHint", { count: minimumCandidates })}
          </p>
          <div
            className={`mx-auto mt-6 grid max-w-sm gap-2 ${canImportCurrentBoard ? "sm:grid-cols-2" : ""}`}
          >
            <button
              ref={browseCandidatesRef}
              type="button"
              onClick={onBrowseCandidates}
              disabled={mutationsBlocked}
              className="official-button official-button-primary w-full"
            >
              <AppIcon name="search" size={16} />
              {t("assistant.browseCandidates")}
            </button>
            {canImportCurrentBoard ? (
              <button
                type="button"
                onClick={onUseCurrentBoard}
                disabled={mutationsBlocked}
                className="official-button w-full"
              >
                {t("assistant.useCurrentBoard", {
                  count: currentBoardCandidateCount,
                })}
              </button>
            ) : null}
          </div>
        </div>

        {canCreateRandomSample ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--project-primary-wash)] px-5 py-4">
            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--project-primary)] uppercase">
              {t("assistant.randomSampleLabel")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              {t("assistant.randomSampleHint", { count: randomSampleCount })}
            </p>
            <button
              type="button"
              onClick={onCreateRandomSample}
              disabled={mutationsBlocked}
              className="official-button mt-3 w-full sm:w-auto"
            >
              <AppIcon name="sparkles" size={16} />
              {t("assistant.randomSampleAction", {
                count: randomSampleCount,
              })}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {randomSampleActive ? (
        <p
          role="status"
          className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--project-primary-wash)] px-3 py-2 text-sm leading-relaxed text-[var(--foreground)]"
        >
          <span className="font-semibold">
            {t("assistant.randomSampleLabel")}
          </span>{" "}
          {t("assistant.randomSampleReady", { count: shortlist.length })}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {t("assistant.shortlistTitle")}
        </h3>
        <button
          type="button"
          onClick={onClear}
          disabled={mutationsBlocked}
          className="official-button official-button-quiet !px-3"
        >
          {t("assistant.clear")}
        </button>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]">
        {shortlist.map((song, index) => (
          <div
            key={song.id}
            className={`flex min-h-[68px] items-center gap-3 px-3 py-2 ${index > 0 ? "border-t border-[var(--line)]" : ""}`}
          >
            <SongCover song={song} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-[var(--foreground)]">
                <JapaneseContent>{song.title.ja}</JapaneseContent>
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {song.title.romaji}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemoveCandidate(song.id)}
              disabled={mutationsBlocked}
              className="icon-button icon-button-compact shrink-0"
              aria-label={t("assistant.removeCandidateAria", {
                title: song.title.ja,
              })}
            >
              <AppIcon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
      {shortlist.length < minimumCandidates ? (
        <p className="text-sm text-[var(--muted)]">
          {t("assistant.minimumHint", { count: minimumCandidates })}
        </p>
      ) : shortlist.length > longSessionCandidates ? (
        <p
          className="rounded-[var(--radius-sm)] bg-[var(--project-primary-wash)] px-3 py-2 text-sm leading-relaxed text-[var(--foreground)]"
          role="status"
        >
          {t("assistant.longSession", { count: shortlistMaximumComparisons })}
        </p>
      ) : (
        <p className="text-sm tabular-nums text-[var(--muted)]">
          {t("assistant.startEstimate", { count: shortlistMaximumComparisons })}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:justify-end">
        <button
          ref={browseCandidatesRef}
          type="button"
          onClick={onBrowseCandidates}
          disabled={mutationsBlocked}
          className="official-button w-full sm:w-auto"
        >
          <AppIcon name="search" size={16} />
          {t("assistant.browseCandidates")}
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={mutationsBlocked || shortlist.length < minimumCandidates}
          className="official-button official-button-primary w-full sm:w-auto"
        >
          <AppIcon name="check" size={16} />
          {t("assistant.start")}
        </button>
        {canImportCurrentBoard ? (
          <button
            type="button"
            onClick={onUseCurrentBoard}
            disabled={mutationsBlocked}
            className="official-button official-button-quiet w-full sm:w-auto"
          >
            {t("assistant.useCurrentBoard", {
              count: currentBoardCandidateCount,
            })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ComparisonView({
  leftSong,
  rightSong,
  decisionsMade,
  maximumComparisons,
  canUndo,
  leftChoiceRef,
  onCompare,
  onSkip,
  onUndo,
  onRestart,
  mutationsBlocked,
}: {
  leftSong?: Song;
  rightSong?: Song;
  decisionsMade: number;
  maximumComparisons: number;
  canUndo: boolean;
  leftChoiceRef: React.RefObject<HTMLButtonElement | null>;
  onCompare: (outcome: ComparisonOutcome) => void;
  onSkip: () => void;
  onUndo: () => void;
  onRestart: () => void;
  mutationsBlocked: boolean;
}) {
  const { t } = useLocale();
  if (!leftSong || !rightSong) return null;

  return (
    <div className="grid gap-4">
      <div className="text-center">
        <h3 className="text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">
          {t("assistant.compareTitle")}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t("assistant.compareHint")}
        </p>
        <p
          className="mt-2 text-xs font-medium tabular-nums text-[var(--muted)]"
          aria-live="polite"
        >
          {t("assistant.progress", {
            done: decisionsMade,
            remaining: Math.max(0, maximumComparisons - decisionsMade),
          })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <ComparisonCard
          song={leftSong}
          buttonRef={leftChoiceRef}
          onClick={() => onCompare("left")}
          disabled={mutationsBlocked}
        />
        <ComparisonCard
          song={rightSong}
          onClick={() => onCompare("right")}
          disabled={mutationsBlocked}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
        <button
          type="button"
          onClick={() => onCompare("tie")}
          disabled={mutationsBlocked}
          className="official-button"
        >
          {t("assistant.tie")}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={mutationsBlocked}
          className="official-button"
        >
          {t("assistant.skip")}
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={mutationsBlocked || !canUndo}
          className="official-button official-button-quiet"
        >
          {t("assistant.undo")}
        </button>
        <button
          type="button"
          onClick={onRestart}
          disabled={mutationsBlocked}
          className="official-button official-button-quiet"
        >
          {t("assistant.restart")}
        </button>
      </div>
    </div>
  );
}

function ComparisonCard({
  song,
  buttonRef,
  onClick,
  disabled,
}: {
  song: Song;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  disabled: boolean;
}) {
  const { t } = useLocale();
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("assistant.chooseAria", { title: song.title.ja })}
      className="group overflow-hidden rounded-[var(--radius-md)] border border-[var(--line-strong)] bg-[var(--paper)] text-left transition-[border-color,box-shadow,transform] duration-150 hover:border-[var(--project-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:scale-[0.985]"
    >
      <img
        src={song.coverUrl}
        alt=""
        className="aspect-square w-full object-cover"
      />
      <div className="p-3 sm:p-4">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--foreground)] sm:text-[16px]">
          <JapaneseContent>{song.title.ja}</JapaneseContent>
        </p>
        <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">
          {song.title.romaji}
        </p>
      </div>
    </button>
  );
}

function ResultView({
  orderedIds,
  songsById,
  plan,
  slotLabels,
  currentPickCount,
  applyRef,
  onApply,
  onUndo,
  onRestart,
  mutationsBlocked,
}: {
  orderedIds: string[];
  songsById: Record<string, Song>;
  plan: RankedPickPlan;
  slotLabels: Readonly<Record<string, string>>;
  currentPickCount: number;
  applyRef: React.RefObject<HTMLButtonElement | null>;
  onApply: () => void;
  onUndo: () => void;
  onRestart: () => void;
  mutationsBlocked: boolean;
}) {
  const { t } = useLocale();
  const placementsBySongId = new Map(
    plan.placements.map((placement) => [placement.songId, placement]),
  );
  const skippedBySongId = new Map(
    plan.skipped.map((skipped) => [skipped.songId, skipped]),
  );

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">
          {t("assistant.completeTitle")}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {t("assistant.completeHint")}
        </p>
      </div>
      <ol className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]">
        {orderedIds.map((songId, index) => {
          const song = songsById[songId];
          if (!song) return null;
          const placement = placementsBySongId.get(songId);
          const skipped = skippedBySongId.get(songId);
          return (
            <li
              key={songId}
              className={`flex min-h-[70px] items-center gap-3 px-3 py-2 ${index > 0 ? "border-t border-[var(--line)]" : ""}`}
            >
              <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-[var(--muted)]">
                {index + 1}
              </span>
              <SongCover song={song} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                  <JapaneseContent>{song.title.ja}</JapaneseContent>
                </p>
                <p
                  className={`mt-0.5 text-xs ${placement ? "text-[var(--muted)]" : "font-medium text-amber-700"}`}
                >
                  {placement
                    ? t("assistant.placement", {
                        slot: slotLabels[placement.slotId] ?? placement.slotId,
                      })
                    : skipped
                      ? t(getSkipMessageKey(skipped.reason))
                      : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {currentPickCount > 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("assistant.replaceNotice", { count: currentPickCount })}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button
          type="button"
          onClick={onUndo}
          disabled={mutationsBlocked}
          className="official-button official-button-quiet"
        >
          {t("assistant.undo")}
        </button>
        <button
          type="button"
          onClick={onRestart}
          disabled={mutationsBlocked}
          className="official-button official-button-quiet"
        >
          {t("assistant.restart")}
        </button>
        <button
          ref={applyRef}
          type="button"
          onClick={onApply}
          disabled={mutationsBlocked || plan.placements.length === 0}
          className="official-button official-button-primary col-span-2 sm:col-span-1"
        >
          <AppIcon name="check" size={16} />
          {t("assistant.apply")}
        </button>
      </div>
    </div>
  );
}

function StorageIssue({
  issue,
  onReset,
}: {
  issue: PickAssistantStorageIssue;
  onReset: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-[var(--radius-md)] border border-amber-200 bg-[var(--paper)] px-5 py-8 text-center">
      <h3 className="text-lg font-semibold text-[var(--foreground)]">
        {t("assistant.storageBlockedTitle")}
      </h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
        {t(`assistant.storage.${issue}`)}
      </p>
      <button type="button" onClick={onReset} className="official-button mt-5">
        <AppIcon name="reset" size={16} />
        {t("assistant.resetStorage")}
      </button>
    </div>
  );
}

function SongCover({ song }: { song: Song }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[9px] border border-[var(--line)] bg-[var(--background)]">
      <img
        src={song.coverUrl}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  );
}

function getSkipMessageKey(
  reason: RankedPickPlan["skipped"][number]["reason"],
) {
  switch (reason) {
    case "ineligible":
      return "assistant.skippedIneligible" as const;
    case "capacity":
      return "assistant.skippedCapacity" as const;
    case "duplicate":
      return "assistant.skippedDuplicate" as const;
  }
}
