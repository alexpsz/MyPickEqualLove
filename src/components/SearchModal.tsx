"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { RELEASE_TYPE_LABELS, TRACK_TYPE_LABELS } from "../config/project";
import type { Member, ReleaseType, Song, TrackType } from "../schema/music";

type ReleaseFilter = "all" | ReleaseType;
type TrackFilter = "all" | TrackType;

interface SearchModalProps {
  songs: Song[];
  members: Member[];
  releaseTypes: ReleaseType[];
  trackTypes: TrackType[];
  years: string[];
  autoFocusSearch?: boolean;
  onClose: () => void;
  onSelect: (song: Song) => void;
}

const PRIMARY_TRACK_TYPES = ["title", "coupling", "album"] as const;

const normalizeStr = (value: string | undefined): string => {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf＝=]/g, "");
};

const getMemberNames = (song: Song, membersById: Record<string, Member>) =>
  [...(song.memberIds ?? []), ...(song.centerMemberIds ?? [])]
    .map((memberId) => membersById[memberId])
    .filter(Boolean)
    .flatMap((member) => [
      member.name.ja,
      member.name.romaji,
      member.name.en ?? "",
    ]);

const GRADUATED_MEMBER_FEATURE_TAGS = new Set([
  "graduated_member",
  "graduation_solo",
  "graduation_unit",
]);

const isGraduatedMemberFeature = (song: Song) =>
  (song.tags ?? []).some((tag) => GRADUATED_MEMBER_FEATURE_TAGS.has(tag));

const formatTypeValue = (value: string | undefined) =>
  value?.replace(/_/g, " ").toUpperCase();

const formatSongMeta = (song: Song) =>
  [
    song.releaseDate?.slice(0, 4),
    formatTypeValue(song.releaseType),
    formatTypeValue(song.trackType),
  ]
    .filter(Boolean)
    .join(" · ");

const formatSongCredits = (song: Song) =>
  [
    song.credits?.lyricist ? `Lyrics: ${song.credits.lyricist.ja}` : "",
    song.credits?.composer ? `Music: ${song.credits.composer.ja}` : "",
    song.credits?.arranger ? `Arrange: ${song.credits.arranger.ja}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

export default function SearchModal({
  songs,
  members,
  releaseTypes,
  trackTypes,
  years,
  autoFocusSearch = true,
  onClose,
  onSelect,
}: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [releaseTypeFilter, setReleaseTypeFilter] =
    useState<ReleaseFilter>("all");
  const [trackTypeFilter, setTrackTypeFilter] = useState<TrackFilter>("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [memberFilters, setMemberFilters] = useState<string[]>([]);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [showGraduatedMembers, setShowGraduatedMembers] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  const filteredSongs = useMemo(() => {
    const q = normalizeStr(searchQuery);

    return songs.filter((song) => {
      if (!q && !showGraduatedMembers && isGraduatedMemberFeature(song)) {
        return false;
      }

      if (
        releaseTypeFilter !== "all" &&
        song.releaseType !== releaseTypeFilter
      ) {
        return false;
      }

      if (trackTypeFilter !== "all" && song.trackType !== trackTypeFilter) {
        return false;
      }

      if (yearFilter !== "all" && !song.releaseDate?.startsWith(yearFilter)) {
        return false;
      }

      if (
        memberFilters.length > 0 &&
        !memberFilters.some(
          (memberId) =>
            song.memberIds?.includes(memberId) ||
            song.centerMemberIds?.includes(memberId),
        )
      ) {
        return false;
      }

      if (!q) return true;

      const searchableParts = [
        song.title.ja,
        song.title.romaji,
        song.title.en,
        song.artist.ja,
        song.artist.romaji,
        song.artist.en,
        song.credits?.lyricist?.ja,
        song.credits?.lyricist?.romaji,
        song.credits?.composer?.ja,
        song.credits?.composer?.romaji,
        song.credits?.arranger?.ja,
        song.credits?.arranger?.romaji,
        ...getMemberNames(song, membersById),
      ];

      return searchableParts.some((part) => normalizeStr(part).includes(q));
    });
  }, [
    memberFilters,
    membersById,
    releaseTypeFilter,
    searchQuery,
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
    setShowGraduatedMembers(false);
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
    if (releaseTypeFilter === "digital") {
      setReleaseTypeFilter("all");
    }
  };

  const toggleMemberFilter = (memberId: string) => {
    setMemberFilters((currentMemberFilters) =>
      currentMemberFilters.includes(memberId)
        ? currentMemberFilters.filter(
            (currentMemberId) => currentMemberId !== memberId,
          )
        : [...currentMemberFilters, memberId],
    );
  };

  const toggleShowGraduatedMembers = () => {
    if (showGraduatedMembers) {
      setMemberFilters((currentMemberFilters) =>
        currentMemberFilters.filter(
          (memberId) => !graduatedMemberIds.has(memberId),
        ),
      );
    }

    setShowGraduatedMembers(
      (currentShowGraduatedMembers) => !currentShowGraduatedMembers,
    );
  };

  const activeFilterCount = [
    releaseTypeFilter !== "all",
    trackTypeFilter !== "all",
    yearFilter !== "all",
    memberFilters.length > 0,
    showGraduatedMembers,
  ].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/45 backdrop-blur-sm"
        aria-label="Close search modal"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="official-panel relative z-10 flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden bg-white focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black bg-white p-5">
          <div>
            <h3 className="text-lg font-bold uppercase tracking-[0.22em] text-black">
              Select Song
            </h3>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--project-primary)]">
              Top Picks board · {filteredSongs.length} matching songs
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center border border-black bg-white text-black transition-colors hover:bg-black hover:text-white"
            aria-label="Close search modal"
          >
            <svg
              className="h-4 w-4 fill-current"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z" />
            </svg>
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto bg-white overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className="official-stripe border-b border-black p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <input
                    type="text"
                    placeholder="Search by title, romaji, member, credits..."
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && filteredSongs[0]) {
                        onSelect(filteredSongs[0]);
                      }
                    }}
                    className="w-full border border-black bg-white py-3 pl-11 pr-4 text-sm text-black transition-all duration-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--project-primary)]"
                  />
                  <svg
                    className="absolute left-4 top-3.5 h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setIsMoreFiltersOpen(
                      (currentIsMoreFiltersOpen) => !currentIsMoreFiltersOpen,
                    )
                  }
                  className="flex shrink-0 items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors hover:border-black hover:text-black"
                  aria-controls="song-more-filters"
                  aria-expanded={isMoreFiltersOpen}
                >
                  Filters
                  {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
                  <svg
                    className={`h-3.5 w-3.5 fill-none stroke-current transition-transform ${
                      isMoreFiltersOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                <FilterChip
                  active={
                    releaseTypeFilter === "all" && trackTypeFilter === "all"
                  }
                  onClick={() => selectQuickFilter("all")}
                >
                  All
                </FilterChip>
                {quickTrackTypes.map((trackType) => (
                  <FilterChip
                    key={trackType}
                    active={trackTypeFilter === trackType}
                    onClick={() => selectQuickFilter(trackType)}
                  >
                    {TRACK_TYPE_LABELS[trackType] ?? trackType}
                  </FilterChip>
                ))}
                <FilterChip
                  active={
                    releaseTypeFilter === "digital" && trackTypeFilter === "all"
                  }
                  onClick={() => selectQuickFilter("digital")}
                >
                  Digital
                </FilterChip>
              </div>

              {isMoreFiltersOpen ? (
                <div
                  id="song-more-filters"
                  className="flex flex-col gap-3 border border-slate-200 bg-white p-3"
                >
                  <FilterRow label="Year">
                    {["all", ...years].map((year) => (
                      <FilterChip
                        key={year}
                        active={yearFilter === year}
                        onClick={() => setYearFilter(year)}
                      >
                        {year === "all" ? "All" : year}
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

                  <FilterRow label="Release Type">
                    {(["all", ...releaseTypes] as ReleaseFilter[]).map(
                      (type) => (
                        <FilterChip
                          key={type}
                          active={releaseTypeFilter === type}
                          onClick={() => setReleaseTypeFilter(type)}
                        >
                          {RELEASE_TYPE_LABELS[type] ?? type}
                        </FilterChip>
                      ),
                    )}
                  </FilterRow>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="border border-black bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-black hover:text-white"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 p-4">
            {filteredSongs.length > 0 ? (
              filteredSongs.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => onSelect(song)}
                  className="flex w-full cursor-pointer items-center gap-4 border border-slate-200 bg-white p-3.5 text-left transition-all duration-300 hover:border-black hover:bg-[var(--paper-soft)]"
                >
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden border border-black bg-slate-100">
                    <img
                      src={song.coverUrl}
                      alt={`${song.title.ja} cover`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="truncate text-sm font-bold text-slate-950">
                        {song.title.ja}
                      </h4>
                      <span className="flex-shrink-0 border border-[var(--project-primary)] bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--project-primary)]">
                        {song.releaseDate?.slice(0, 4) ?? "TBD"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
                      {song.title.romaji}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                      {formatSongMeta(song)}
                    </div>
                    {formatSongCredits(song) ? (
                      <div className="mt-2 line-clamp-2 text-[10px] font-medium leading-5 text-slate-500">
                        {formatSongCredits(song)}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))
            ) : (
              <div className="py-12 text-center text-xs font-light text-slate-400">
                No songs found matching your search terms.
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-black bg-white p-4 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Showing {filteredSongs.length} of {songs.length} songs.
        </div>
      </div>
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
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="w-24 flex-shrink-0 pt-1.5 text-[10px] font-black uppercase tracking-wider text-black">
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
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="w-24 flex-shrink-0 pt-1.5 text-[10px] font-black uppercase tracking-wider text-black">
        Member
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-2">
          <FilterChip
            active={memberFilters.length === 0}
            onClick={onClearMembers}
          >
            All
          </FilterChip>
          {graduatedMembers.length > 0 ? (
            <FilterChip
              active={showGraduatedMembers}
              onClick={onToggleGraduated}
            >
              GRADUATED
            </FilterChip>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {activeMembers.map((member) => (
            <FilterChip
              key={member.id}
              active={memberFilters.includes(member.id)}
              onClick={() => onToggleMember(member.id)}
            >
              {member.name.ja.replace(/\s+/g, "")}
            </FilterChip>
          ))}
        </div>
        {showGraduatedMembers ? (
          <div className="col-start-2 flex min-w-0 flex-wrap gap-2">
            {graduatedMembers.map((member) => (
              <FilterChip
                key={member.id}
                active={memberFilters.includes(member.id)}
                onClick={() => onToggleMember(member.id)}
                muted
              >
                {member.name.ja.replace(/\s+/g, "")}
              </FilterChip>
            ))}
          </div>
        ) : null}
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
  const inactiveClassName = muted
    ? "border-slate-300 bg-slate-100 text-slate-500 opacity-80 hover:border-black hover:text-black"
    : "border-slate-300 bg-white text-slate-500 hover:border-black hover:text-black";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
        active
          ? "border-[var(--project-primary)] bg-[var(--project-primary)] text-white"
          : inactiveClassName
      }`}
    >
      {children}
    </button>
  );
}
