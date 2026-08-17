"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as m from "motion/react-m";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey, MessageValues } from "../i18n/messages";
import type { Member, ReleaseType, Song, TrackType } from "../schema/music";
import { getConfirmedSongCredits } from "../utils/songCredits";
import {
  RELEASE_TYPE_MESSAGE_KEYS,
  TRACK_TYPE_MESSAGE_KEYS,
} from "../utils/songMetadata";
import {
  filterSongsForSearch,
  getFirstSearchResultForEnter,
  isGraduatedMemberVisibilityFilterActive,
  normalizeSongSearchText,
  rankSongsByQuery,
  shouldShowGraduatedMemberFeaturesByDefault,
  type SearchSelectionMode,
} from "../utils/songSearch";
import { useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import JapaneseContent, {
  LocalizedTextWithJapaneseValue,
} from "./JapaneseContent";
import type { PresenceState } from "./MotionPresence";

type ReleaseFilter = "all" | ReleaseType;
type TrackFilter = "all" | TrackType;

export type { SearchSelectionMode } from "../utils/songSearch";

interface SearchModalProps {
  songs: Song[];
  members: Member[];
  releaseTypes: ReleaseType[];
  trackTypes: TrackType[];
  years: string[];
  autoFocusSearch?: boolean;
  contextLabel?: string;
  resultBadgesBySongId?: Record<string, string[]>;
  selectedSongsById?: Record<string, SelectedSongPresentation>;
  emptyMessage?: string;
  selectedRanksBySongId?: Record<string, number>;
  recentSongIds?: string[];
  selectionMode?: SearchSelectionMode;
  candidateSongIds?: ReadonlySet<string>;
  candidateEligibleSongIds?: ReadonlySet<string>;
  candidateLimitReached?: boolean;
  candidateChangesBlocked?: boolean;
  candidateMutationPending?: boolean;
  maximumCandidates?: number;
  suspended?: boolean;
  resumeFocusRef?: RefObject<HTMLElement | null>;
  presenceState: PresenceState;
  returnFocusKey: string;
  onClose: () => void;
  onSelect: (song: Song) => void;
  onToggleCandidate?: (song: Song) => void;
  onReturnToAssistant?: () => void;
  onOpenDetail: (song: Song, trigger: HTMLButtonElement) => void;
}

export interface SelectedSongPresentation {
  position: string;
  action: "focus" | "move" | "swap" | "here";
}

const PRIMARY_TRACK_TYPES = ["title", "coupling", "album"] as const;
const EMPTY_SONG_ID_SET: ReadonlySet<string> = new Set();

type Translate = (key: MessageKey, values?: MessageValues) => string;

const RELEASE_FILTER_MESSAGE_KEYS: Record<ReleaseFilter, MessageKey> = {
  all: "search.releaseType.all",
  ...RELEASE_TYPE_MESSAGE_KEYS,
};

const TRACK_FILTER_MESSAGE_KEYS: Record<TrackFilter, MessageKey> = {
  all: "search.trackType.all",
  ...TRACK_TYPE_MESSAGE_KEYS,
};

const formatSongMeta = (song: Song, t: Translate) =>
  [
    song.releaseDate?.slice(0, 4),
    song.releaseType
      ? t(RELEASE_TYPE_MESSAGE_KEYS[song.releaseType])
      : undefined,
    song.trackType ? t(TRACK_TYPE_MESSAGE_KEYS[song.trackType]) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

function SongCredits({ song, t }: { song: Song; t: Translate }) {
  const confirmedCredits = getConfirmedSongCredits(song);

  if (!confirmedCredits) {
    return (
      <p className="mt-1 hidden truncate text-xs text-[var(--muted-soft)] sm:block">
        {t("credits.unconfirmed")}
      </p>
    );
  }

  const credits = [
    {
      text: t("search.creditLyrics", {
        name: confirmedCredits.lyricist.ja,
      }),
      value: confirmedCredits.lyricist.ja,
    },
    {
      text: t("search.creditMusic", {
        name: confirmedCredits.composer.ja,
      }),
      value: confirmedCredits.composer.ja,
    },
    {
      text: t("search.creditArrange", {
        name: confirmedCredits.arranger.ja,
      }),
      value: confirmedCredits.arranger.ja,
    },
  ];

  return (
    <p className="mt-1 hidden truncate text-xs text-[var(--muted-soft)] sm:block">
      {credits.map((credit, index) => (
        <React.Fragment key={`${credit.value}-${index}`}>
          {index > 0 ? " / " : null}
          <LocalizedTextWithJapaneseValue
            text={credit.text}
            value={credit.value}
          />
        </React.Fragment>
      ))}
    </p>
  );
}

export default function SearchModal({
  songs,
  members,
  releaseTypes,
  trackTypes,
  years,
  autoFocusSearch = true,
  contextLabel,
  resultBadgesBySongId = {},
  selectedSongsById = {},
  emptyMessage,
  selectedRanksBySongId = {},
  recentSongIds = [],
  selectionMode = "board",
  candidateSongIds = EMPTY_SONG_ID_SET,
  candidateEligibleSongIds,
  candidateLimitReached = false,
  candidateChangesBlocked = false,
  candidateMutationPending = false,
  maximumCandidates = 0,
  suspended = false,
  resumeFocusRef,
  presenceState,
  returnFocusKey,
  onClose,
  onSelect,
  onToggleCandidate,
  onReturnToAssistant,
  onOpenDetail,
}: SearchModalProps) {
  const { t } = useLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const [releaseTypeFilter, setReleaseTypeFilter] =
    useState<ReleaseFilter>("all");
  const [trackTypeFilter, setTrackTypeFilter] = useState<TrackFilter>("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [memberFilters, setMemberFilters] = useState<string[]>([]);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [showGraduatedMembers, setShowGraduatedMembers] = useState(() =>
    shouldShowGraduatedMemberFeaturesByDefault(selectionMode),
  );
  const [hideSelected, setHideSelected] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearchQuery = useMemo(
    () => normalizeSongSearchText(searchQuery),
    [searchQuery],
  );
  const recentSongIdSet = useMemo(
    () => new Set(recentSongIds),
    [recentSongIds],
  );
  const isAssistantShortlistMode = selectionMode === "assistant-shortlist";

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting" && !suspended,
    autoFocus: false,
    initialFocusRef: resumeFocusRef,
    returnFocusKey,
  });

  const membersById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])),
    [members],
  );
  const quickTrackTypes = useMemo(
    () =>
      PRIMARY_TRACK_TYPES.filter((trackType) => trackTypes.includes(trackType)),
    [trackTypes],
  );
  const activeMembers = useMemo(
    () => members.filter((member) => member.active),
    [members],
  );
  const graduatedMembers = useMemo(
    () => members.filter((member) => member.active === false),
    [members],
  );
  const graduatedMemberIds = useMemo(
    () => new Set(graduatedMembers.map((member) => member.id)),
    [graduatedMembers],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (autoFocusSearch && !shouldAvoidSearchAutoFocus()) {
        searchInputRef.current?.focus();
        return;
      }
      panelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoFocusSearch]);

  useEffect(() => {
    setShowGraduatedMembers(
      shouldShowGraduatedMemberFeaturesByDefault(selectionMode),
    );
  }, [selectionMode]);

  const filteredSongs = useMemo(() => {
    const filterMatches = filterSongsForSearch(songs, {
      normalizedQuery: normalizedSearchQuery,
      releaseTypeFilter,
      trackTypeFilter,
      yearFilter,
      memberFilters,
      showGraduatedMembers,
      hideSelected,
      selectedRanksBySongId,
    });

    return rankSongsByQuery(
      filterMatches,
      normalizedSearchQuery,
      membersById,
    ).map(({ song }) => song);
  }, [
    hideSelected,
    memberFilters,
    membersById,
    normalizedSearchQuery,
    releaseTypeFilter,
    selectedRanksBySongId,
    showGraduatedMembers,
    songs,
    trackTypeFilter,
    yearFilter,
  ]);

  const resetFilters = () => {
    setReleaseTypeFilter("all");
    setTrackTypeFilter("all");
    setYearFilter("all");
    setMemberFilters([]);
    setShowGraduatedMembers(
      shouldShowGraduatedMemberFeaturesByDefault(selectionMode),
    );
    setHideSelected(false);
  };

  const selectQuickFilter = (filter: TrackFilter | "digital") => {
    if (filter === "all") {
      setReleaseTypeFilter("all");
      setTrackTypeFilter("all");
      return;
    }
    if (filter === "digital") {
      setReleaseTypeFilter("digital");
      setTrackTypeFilter("all");
      return;
    }
    setTrackTypeFilter(filter);
    if (releaseTypeFilter === "digital") setReleaseTypeFilter("all");
  };

  const toggleMemberFilter = (memberId: string) => {
    setMemberFilters((current) =>
      current.includes(memberId)
        ? current.filter((currentId) => currentId !== memberId)
        : [...current, memberId],
    );
  };

  const toggleShowGraduatedMembers = () => {
    if (showGraduatedMembers) {
      setMemberFilters((current) =>
        current.filter((memberId) => !graduatedMemberIds.has(memberId)),
      );
    }
    setShowGraduatedMembers((current) => !current);
  };

  const activeFilterCount = [
    releaseTypeFilter !== "all",
    trackTypeFilter !== "all",
    yearFilter !== "all",
    memberFilters.length > 0,
    isGraduatedMemberVisibilityFilterActive(
      selectionMode,
      showGraduatedMembers,
    ),
    hideSelected,
  ].filter(Boolean).length;

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const firstResult = getFirstSearchResultForEnter(filteredSongs, {
      key: event.key,
      isComposing: event.nativeEvent.isComposing,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
    if (!firstResult) return;
    event.preventDefault();
    if (isAssistantShortlistMode) {
      const isCandidate = candidateSongIds.has(firstResult.id);
      if (
        candidateChangesBlocked ||
        candidateMutationPending ||
        (!isCandidate && candidateLimitReached)
      ) {
        return;
      }
      onToggleCandidate?.(firstResult);
      return;
    }
    onSelect(firstResult);
  };

  const panelMotion = {
    opacity: 1,
    y: 0,
    scale: 1,
  };

  return (
    <div
      className="motion-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      data-presence={presenceState}
      aria-hidden={presenceState === "exiting" || suspended}
      inert={presenceState === "exiting" || suspended}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={presenceState === "exiting"}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        aria-label={t("search.closeAria")}
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
        aria-labelledby="search-modal-title"
        className="apple-sheet relative z-10 flex h-[100dvh] max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-none border-x-0 border-b-0 focus:outline-none sm:h-auto sm:max-h-[88dvh] sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={panelMotion}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2
              id="search-modal-title"
              className="truncate text-[22px] font-semibold tracking-[-0.035em] text-[var(--foreground)]"
            >
              {t(
                isAssistantShortlistMode
                  ? "assistant.searchTitle"
                  : "search.title",
              )}
            </h2>
            <p
              className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]"
              aria-live="polite"
            >
              {isAssistantShortlistMode ? (
                t("assistant.searchHint")
              ) : (
                <>
                  {contextLabel ? `${contextLabel} · ` : ""}
                  {t("search.matchingSongs", { count: filteredSongs.length })}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact shrink-0"
            aria-label={t("search.closeAria")}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--background)] [-webkit-overflow-scrolling:touch]">
          <div className="apple-material sticky top-0 z-20 rounded-none border-x-0 border-t-0 px-4 py-3 sm:px-6">
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{t("search.fieldLabel")}</span>
                <AppIcon
                  name="search"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={t("search.placeholder")}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-white pl-10 pr-3 text-[15px] text-[var(--foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-soft)] focus:border-[var(--focus-ring)] focus:shadow-[0_0_0_2px_var(--focus-ring)]"
                />
              </label>
              <button
                type="button"
                onClick={() => setIsMoreFiltersOpen((current) => !current)}
                className="official-button shrink-0"
                aria-controls="song-more-filters"
                aria-expanded={isMoreFiltersOpen}
              >
                <AppIcon name="filter" size={16} />
                <span className="hidden sm:inline">{t("search.filters")}</span>
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-[var(--project-primary)] px-1.5 text-xs font-semibold text-black">
                    {activeFilterCount}
                  </span>
                ) : null}
                <AppIcon
                  name="chevron-down"
                  size={16}
                  className={`transition-transform duration-150 ${
                    isMoreFiltersOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>

            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
              <FilterChip
                active={
                  releaseTypeFilter === "all" && trackTypeFilter === "all"
                }
                onClick={() => selectQuickFilter("all")}
              >
                {t("search.all")}
              </FilterChip>
              {quickTrackTypes.map((trackType) => (
                <FilterChip
                  key={trackType}
                  active={trackTypeFilter === trackType}
                  onClick={() => selectQuickFilter(trackType)}
                >
                  {t(TRACK_FILTER_MESSAGE_KEYS[trackType])}
                </FilterChip>
              ))}
              <FilterChip
                active={
                  releaseTypeFilter === "digital" && trackTypeFilter === "all"
                }
                onClick={() => selectQuickFilter("digital")}
              >
                {t("search.digital")}
              </FilterChip>
              {Object.keys(selectedRanksBySongId).length > 0 ? (
                <FilterChip
                  active={hideSelected}
                  onClick={() => setHideSelected((current) => !current)}
                  muted
                >
                  {t("search.hideSelected")}
                </FilterChip>
              ) : null}
            </div>
          </div>

          <div
            className="filter-reveal border-b border-[var(--line)]"
            data-open={isMoreFiltersOpen}
            aria-hidden={!isMoreFiltersOpen}
            inert={!isMoreFiltersOpen}
          >
            <div className="filter-reveal-inner">
              <div className="filter-reveal-content px-4 py-3 sm:px-6">
                <div
                  id="song-more-filters"
                  className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white p-4"
                >
                  <div className="grid gap-4">
                    <FilterRow label={t("search.year")}>
                      {["all", ...years].map((year) => (
                        <FilterChip
                          key={year}
                          active={yearFilter === year}
                          onClick={() => setYearFilter(year)}
                        >
                          {year === "all" ? t("search.all") : year}
                        </FilterChip>
                      ))}
                    </FilterRow>
                    <MemberFilterRow
                      activeMembers={activeMembers}
                      graduatedMembers={graduatedMembers}
                      memberFilters={memberFilters}
                      showGraduatedMembers={showGraduatedMembers}
                      onClearMembers={() => setMemberFilters([])}
                      onToggleGraduated={toggleShowGraduatedMembers}
                      onToggleMember={toggleMemberFilter}
                    />
                    <FilterRow label={t("search.release")}>
                      {(["all", ...releaseTypes] as ReleaseFilter[]).map(
                        (type) => (
                          <FilterChip
                            key={type}
                            active={releaseTypeFilter === type}
                            onClick={() => setReleaseTypeFilter(type)}
                          >
                            {t(RELEASE_FILTER_MESSAGE_KEYS[type])}
                          </FilterChip>
                        ),
                      )}
                    </FilterRow>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="official-button official-button-quiet"
                      >
                        <AppIcon name="reset" size={16} />
                        {t("search.resetFilters")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-3 sm:px-6 sm:py-4">
            {filteredSongs.length > 0 ? (
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white">
                {filteredSongs.map((song, index) => {
                  const selected = selectedSongsById[song.id];
                  const selectedRank = selectedRanksBySongId[song.id];
                  const isRecentlyViewed = recentSongIdSet.has(song.id);
                  const isCandidate = candidateSongIds.has(song.id);
                  const candidateDisabled =
                    candidateChangesBlocked ||
                    candidateMutationPending ||
                    (!isCandidate &&
                      candidateEligibleSongIds !== undefined &&
                      !candidateEligibleSongIds.has(song.id)) ||
                    (!isCandidate && candidateLimitReached) ||
                    !onToggleCandidate;

                  return (
                    <div
                      key={song.id}
                      className={`song-result-row flex min-h-[76px] w-full items-stretch transition-colors duration-150 hover:bg-[var(--background)] ${
                        selected ? "bg-[var(--project-primary-wash)]" : ""
                      } ${index > 0 ? "border-t border-[var(--line)]" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          isAssistantShortlistMode
                            ? onToggleCandidate?.(song)
                            : onSelect(song)
                        }
                        disabled={isAssistantShortlistMode && candidateDisabled}
                        aria-pressed={
                          isAssistantShortlistMode ? isCandidate : undefined
                        }
                        aria-label={
                          isAssistantShortlistMode
                            ? isCandidate
                              ? t("assistant.removeCandidateAria", {
                                  title: song.title.ja,
                                })
                              : t("assistant.addCandidateAria", {
                                  title: song.title.ja,
                                })
                            : undefined
                        }
                        className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] active:bg-[var(--project-primary-wash)]"
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--background)]">
                          <img
                            src={song.coverUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.015em] text-[var(--foreground)]">
                              <JapaneseContent>{song.title.ja}</JapaneseContent>
                            </h3>
                            <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                              {song.releaseDate?.slice(0, 4) ?? t("search.tbd")}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                            {song.title.romaji}
                          </p>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[var(--muted)]">
                            <span className="truncate">
                              {formatSongMeta(song, t)}
                            </span>
                            {selected ? (
                              <>
                                <ResultBadge>
                                  {t("search.selectedAt", {
                                    position: selected.position,
                                  })}
                                </ResultBadge>
                                <ResultBadge muted>
                                  {t(
                                    selected.action === "move"
                                      ? "search.moveSelected"
                                      : selected.action === "swap"
                                        ? "search.swapSelected"
                                        : selected.action === "here"
                                          ? "search.alreadyHere"
                                          : "search.focusSelected",
                                  )}
                                </ResultBadge>
                              </>
                            ) : selectedRank !== undefined ? (
                              <ResultBadge>
                                {t("search.selectedRank", {
                                  rank: selectedRank,
                                })}
                              </ResultBadge>
                            ) : null}
                            {isAssistantShortlistMode && isCandidate ? (
                              <ResultBadge>
                                {t("assistant.candidate")}
                              </ResultBadge>
                            ) : null}
                            {isRecentlyViewed ? (
                              <ResultBadge muted>
                                {t("search.recentlyViewed")}
                              </ResultBadge>
                            ) : null}
                            {resultBadgesBySongId[song.id]?.map((badge) => (
                              <ResultBadge key={badge}>{badge}</ResultBadge>
                            ))}
                          </div>
                          <SongCredits song={song} t={t} />
                        </div>
                        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-[var(--muted)] transition-[background-color,color,transform] duration-150 group-hover:bg-[var(--project-primary)] group-hover:text-black group-active:scale-95 sm:flex">
                          <AppIcon
                            name={
                              isAssistantShortlistMode
                                ? isCandidate
                                  ? "check"
                                  : "music"
                                : selected
                                  ? "check"
                                  : "plus"
                            }
                            size={16}
                          />
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center border-l border-[var(--line)] px-1">
                        {!isAssistantShortlistMode ? (
                          <button
                            type="button"
                            onClick={() => onToggleCandidate?.(song)}
                            disabled={candidateDisabled}
                            aria-pressed={isCandidate}
                            aria-label={
                              isCandidate
                                ? t("assistant.removeCandidateAria", {
                                    title: song.title.ja,
                                  })
                                : t("assistant.addCandidateAria", {
                                    title: song.title.ja,
                                  })
                            }
                            title={
                              isCandidate
                                ? t("assistant.candidate")
                                : t("assistant.addCandidate")
                            }
                            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-45 ${
                              isCandidate
                                ? "bg-[var(--project-primary-wash)] text-[var(--foreground)]"
                                : "text-[var(--muted)] hover:bg-white hover:text-[var(--foreground)]"
                            }`}
                          >
                            <AppIcon
                              name={isCandidate ? "check" : "music"}
                              size={16}
                            />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={t("search.openDetailsAria", {
                            title: song.title.ja,
                          })}
                          title={t("search.openDetails")}
                          onClick={(event) =>
                            onOpenDetail(song, event.currentTarget)
                          }
                          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-white hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        >
                          <AppIcon name="info" size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-6 py-14 text-center text-sm text-[var(--muted)]">
                {emptyMessage ?? t("search.noMatches")}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-14 items-center justify-between gap-3 border-t border-[var(--line)] bg-white px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] text-xs text-[var(--muted)] sm:px-6">
          <span
            aria-live={isAssistantShortlistMode ? "polite" : undefined}
            aria-busy={
              isAssistantShortlistMode ? candidateMutationPending : undefined
            }
          >
            {isAssistantShortlistMode
              ? t("assistant.selectionCount", {
                  count: candidateSongIds.size,
                  max: maximumCandidates,
                })
              : t("search.showingCount", {
                  shown: filteredSongs.length,
                  total: songs.length,
                })}
          </span>
          {isAssistantShortlistMode ? (
            <button
              type="button"
              onClick={onReturnToAssistant}
              disabled={candidateMutationPending}
              className="official-button official-button-primary shrink-0"
            >
              {t("assistant.returnToAssistant")}
            </button>
          ) : null}
        </div>
      </m.div>
    </div>
  );
}

function shouldAvoidSearchAutoFocus() {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches ||
    /Android|iP(hone|ad|od)|Mobile/i.test(navigator.userAgent)
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[84px_minmax(0,1fr)] sm:items-start">
      <div className="pt-1.5 text-xs font-semibold text-[var(--muted)]">
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">{children}</div>
    </div>
  );
}

function MemberFilterRow({
  activeMembers,
  graduatedMembers,
  memberFilters,
  showGraduatedMembers,
  onClearMembers,
  onToggleGraduated,
  onToggleMember,
}: {
  activeMembers: Member[];
  graduatedMembers: Member[];
  memberFilters: string[];
  showGraduatedMembers: boolean;
  onClearMembers: () => void;
  onToggleGraduated: () => void;
  onToggleMember: (memberId: string) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="grid gap-2 sm:grid-cols-[84px_minmax(0,1fr)] sm:items-start">
      <div className="pt-1.5 text-xs font-semibold text-[var(--muted)]">
        {t("search.member")}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <FilterChip
          active={memberFilters.length === 0}
          onClick={onClearMembers}
        >
          {t("search.all")}
        </FilterChip>
        {activeMembers.map((member) => (
          <FilterChip
            key={member.id}
            active={memberFilters.includes(member.id)}
            onClick={() => onToggleMember(member.id)}
          >
            <JapaneseContent>
              {member.name.ja.replace(/\s+/g, "")}
            </JapaneseContent>
          </FilterChip>
        ))}
        {graduatedMembers.length > 0 ? (
          <FilterChip
            active={showGraduatedMembers}
            onClick={onToggleGraduated}
            muted
          >
            {t("search.graduated")}
          </FilterChip>
        ) : null}
        {showGraduatedMembers
          ? graduatedMembers.map((member) => (
              <FilterChip
                key={member.id}
                active={memberFilters.includes(member.id)}
                onClick={() => onToggleMember(member.id)}
                muted
              >
                <JapaneseContent>
                  {member.name.ja.replace(/\s+/g, "")}
                </JapaneseContent>
              </FilterChip>
            ))
          : null}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  muted = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
        active
          ? "border-[var(--project-primary)] bg-[var(--project-primary-wash)] text-[var(--foreground)]"
          : muted
            ? "border-[var(--line)] bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)]"
            : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function ResultBadge({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] ${
        muted
          ? "bg-[var(--background)] text-[var(--muted)]"
          : "bg-[var(--project-primary-wash)] text-[var(--foreground)]"
      }`}
    >
      {children}
    </span>
  );
}
