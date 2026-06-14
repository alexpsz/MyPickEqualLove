"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { RELEASE_TYPE_LABELS, TRACK_TYPE_LABELS } from "../config/equalLove";
import type {
  Member,
  PickSlot,
  ReleaseType,
  Song,
  TrackType,
} from "../schema/music";

type ReleaseFilter = "all" | ReleaseType;
type TrackFilter = "all" | TrackType;

interface SearchModalProps {
  activeSlot?: PickSlot;
  songs: Song[];
  members: Member[];
  releaseTypes: ReleaseType[];
  trackTypes: TrackType[];
  years: string[];
  tags: string[];
  onClose: () => void;
  onSelect: (song: Song) => void;
}

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

export default function SearchModal({
  activeSlot,
  songs,
  members,
  releaseTypes,
  trackTypes,
  years,
  tags,
  onClose,
  onSelect,
}: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [releaseTypeFilter, setReleaseTypeFilter] =
    useState<ReleaseFilter>("all");
  const [trackTypeFilter, setTrackTypeFilter] = useState<TrackFilter>("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [memberFilters, setMemberFilters] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState("all");
  const [isSearchOpen, setIsSearchOpen] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const membersById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])),
    [members],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isSearchOpen]);

  const filteredSongs = useMemo(() => {
    const q = normalizeStr(searchQuery);

    return songs.filter((song) => {
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

      if (tagFilter !== "all" && !song.tags?.includes(tagFilter)) {
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
        song.releaseTitle?.ja,
        song.releaseTitle?.romaji,
        song.releaseTitle?.en,
        song.releaseDate,
        song.releaseType,
        song.trackType,
        song.credits?.lyricist?.ja,
        song.credits?.lyricist?.romaji,
        song.credits?.composer?.ja,
        song.credits?.composer?.romaji,
        song.credits?.arranger?.ja,
        song.credits?.arranger?.romaji,
        ...(song.tags ?? []),
        ...getMemberNames(song, membersById),
      ];

      return searchableParts.some((part) => normalizeStr(part).includes(q));
    });
  }, [
    memberFilters,
    membersById,
    releaseTypeFilter,
    searchQuery,
    songs,
    tagFilter,
    trackTypeFilter,
    yearFilter,
  ]);

  const resetFilters = () => {
    setReleaseTypeFilter("all");
    setTrackTypeFilter("all");
    setYearFilter("all");
    setMemberFilters([]);
    setTagFilter("all");
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

  const activeCriteriaCount = [
    searchQuery.trim(),
    releaseTypeFilter !== "all",
    trackTypeFilter !== "all",
    yearFilter !== "all",
    memberFilters.length > 0,
    tagFilter !== "all",
  ].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/45 backdrop-blur-sm"
        aria-label="Close search modal"
      />

      <div className="official-panel relative z-10 flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-black bg-white p-5">
          <div>
            <h3 className="text-lg font-bold uppercase tracking-[0.22em] text-black">
              {activeSlot
                ? `Select Song for ${activeSlot.label}`
                : "Search All Songs"}
            </h3>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--equal-love-primary)]">
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

        <div className="official-stripe border-b border-black p-4">
          <button
            type="button"
            onClick={() =>
              setIsSearchOpen((currentIsSearchOpen) => !currentIsSearchOpen)
            }
            className="flex w-full items-center justify-between gap-3 border border-black bg-white px-4 py-3 text-left text-black transition-colors hover:bg-black hover:text-white"
            aria-controls="song-search-panel"
            aria-expanded={isSearchOpen}
          >
            <span className="flex min-w-0 items-center gap-3">
              <svg
                className="h-4 w-4 flex-shrink-0 stroke-current"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <span className="truncate text-xs font-black uppercase tracking-[0.14em]">
                Search & Filters
                {activeCriteriaCount > 0
                  ? ` · ${activeCriteriaCount} active`
                  : ""}
              </span>
            </span>
            <svg
              className={`h-4 w-4 flex-shrink-0 fill-none stroke-current transition-transform ${
                isSearchOpen ? "rotate-180" : ""
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

          {isSearchOpen ? (
            <div id="song-search-panel" className="mt-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by title, romaji, release, member, credits, or tags..."
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && filteredSongs[0]) {
                      onSelect(filteredSongs[0]);
                    }
                  }}
                  className="w-full border border-black bg-white py-3 pl-11 pr-4 text-sm text-black transition-all duration-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--equal-love-primary)]"
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

              <div className="mt-4 flex flex-col gap-3">
                <FilterRow label="Release">
                  {(["all", ...releaseTypes] as ReleaseFilter[]).map((type) => (
                    <FilterChip
                      key={type}
                      active={releaseTypeFilter === type}
                      onClick={() => setReleaseTypeFilter(type)}
                    >
                      {RELEASE_TYPE_LABELS[type] ?? type}
                    </FilterChip>
                  ))}
                </FilterRow>

                <FilterRow label="Track">
                  {(["all", ...trackTypes] as TrackFilter[]).map((type) => (
                    <FilterChip
                      key={type}
                      active={trackTypeFilter === type}
                      onClick={() => setTrackTypeFilter(type)}
                    >
                      {TRACK_TYPE_LABELS[type] ?? type}
                    </FilterChip>
                  ))}
                </FilterRow>

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

                <FilterRow label="Member">
                  <FilterChip
                    active={memberFilters.length === 0}
                    onClick={() => setMemberFilters([])}
                  >
                    All
                  </FilterChip>
                  {members.map((member) => (
                    <FilterChip
                      key={member.id}
                      active={memberFilters.includes(member.id)}
                      onClick={() => toggleMemberFilter(member.id)}
                    >
                      {member.name.ja.replace(/\s+/g, "")}
                    </FilterChip>
                  ))}
                </FilterRow>

                <FilterRow label="Tag">
                  <FilterChip
                    active={tagFilter === "all"}
                    onClick={() => setTagFilter("all")}
                  >
                    All
                  </FilterChip>
                  {tags.map((tag) => (
                    <FilterChip
                      key={tag}
                      active={tagFilter === tag}
                      onClick={() => setTagFilter(tag)}
                    >
                      {tag}
                    </FilterChip>
                  ))}
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="border border-black bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-black hover:text-white"
                  >
                    Reset
                  </button>
                </FilterRow>
              </div>
            </div>
          ) : null}
        </div>

        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto bg-white p-4">
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
                    <span className="flex-shrink-0 border border-[var(--equal-love-primary)] bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--equal-love-primary)]">
                      {song.releaseDate?.slice(0, 4) ?? "TBD"}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
                    {song.title.romaji} ·{" "}
                    {song.releaseTitle?.ja ?? "Release TBD"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {song.trackType && (
                      <span className="official-chip text-[var(--equal-love-blue)]">
                        {song.trackType}
                      </span>
                    )}
                    {(song.tags ?? []).slice(0, 4).map((tag) => (
                      <span key={tag} className="official-chip text-slate-500">
                        {tag}
                      </span>
                    ))}
                    {song.credits?.lyricist && (
                      <span className="official-chip text-[var(--equal-love-yellow)]">
                        Lyrics: {song.credits.lyricist.ja}
                      </span>
                    )}
                    {song.credits?.composer && (
                      <span className="official-chip text-[var(--equal-love-primary)]">
                        Music: {song.credits.composer.ja}
                      </span>
                    )}
                    {song.credits?.arranger && (
                      <span className="official-chip text-[var(--equal-love-purple)]">
                        Arrange: {song.credits.arranger.ja}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="py-12 text-center text-xs font-light text-slate-400">
              No songs found matching your search terms.
            </div>
          )}
        </div>

        <div className="border-t border-black bg-white p-4 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Showing {filteredSongs.length} of {songs.length} songs.
        </div>
      </div>
    </div>
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
    <div className="flex gap-2">
      <div className="w-16 flex-shrink-0 pt-1.5 text-[10px] font-black uppercase tracking-wider text-black">
        {label}
      </div>
      <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto pb-1">
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
        active
          ? "border-[var(--equal-love-primary)] bg-[var(--equal-love-primary)] text-white"
          : "border-slate-300 bg-white text-slate-500 hover:border-black hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}
