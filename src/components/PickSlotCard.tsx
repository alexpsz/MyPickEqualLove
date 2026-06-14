"use client";

import React from "react";
import type { Member, PickSlot, Song } from "../schema/music";

interface PickSlotCardProps {
  slot: PickSlot;
  song?: Song;
  membersById: Record<string, Member>;
  onClick: () => void;
  onClear: (event: React.MouseEvent) => void;
}

const categoryColors = [
  "var(--equal-love-primary)",
  "var(--equal-love-mint)",
  "var(--equal-love-purple)",
  "var(--equal-love-blue)",
  "var(--equal-love-yellow)",
];

const getYear = (song: Song) => song.releaseDate?.slice(0, 4) ?? "TBD";

const getMemberNames = (song: Song, membersById: Record<string, Member>) =>
  (song.centerMemberIds ?? [])
    .map((memberId) => membersById[memberId]?.name.ja)
    .filter(Boolean)
    .join(" / ");

export default function PickSlotCard({
  slot,
  song,
  membersById,
  onClick,
  onClear,
}: PickSlotCardProps) {
  const centerNames = song ? getMemberNames(song, membersById) : "";
  const color =
    categoryColors[(Math.max(slot.sortOrder, 1) - 1) % categoryColors.length];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className="group relative grid min-h-[292px] cursor-pointer grid-rows-[auto_1fr] border border-black bg-white transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[var(--equal-love-primary)]"
      aria-label={
        song ? `Replace ${slot.label}: ${song.title.ja}` : `Pick song for ${slot.label}`
      }
    >
      <div className="flex items-center justify-between border-b border-black">
        <div
          className="px-3 py-2 text-[13px] font-bold uppercase tracking-[0.18em] text-white"
          style={{ backgroundColor: color }}
        >
          {slot.label}
        </div>
        <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-black">
          My Pick
        </div>
      </div>

      {song ? (
        <div className="grid grid-rows-[minmax(0,1fr)_auto]">
          <div className="relative min-h-[170px] overflow-hidden border-b border-black bg-[var(--paper-soft)]">
            <img
              src={song.coverUrl}
              alt={`${song.title.ja} cover`}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-white/92 p-3">
              <div className="line-clamp-2 text-base font-bold leading-tight text-black">
                {song.title.ja}
              </div>
              <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {song.title.romaji}
              </div>
            </div>
          </div>

          <div className="space-y-3 p-3">
            <div className="flex flex-wrap gap-1.5">
              <span className="official-chip" style={{ color }}>
                {getYear(song)}
              </span>
              {song.trackType && (
                <span className="official-chip text-[var(--equal-love-blue)]">
                  {song.trackType}
                </span>
              )}
              {(song.tags ?? []).slice(0, 2).map((tag) => (
                <span key={tag} className="official-chip text-slate-500">
                  {tag}
                </span>
              ))}
            </div>
            <div className="border-t border-dashed border-slate-300 pt-2 text-[10px] leading-relaxed text-slate-600">
              <div className="truncate">
                <span className="font-bold uppercase tracking-[0.12em] text-black">
                  Release
                </span>{" "}
                {song.releaseTitle?.ja ?? "TBD"}
              </div>
              {centerNames && (
                <div className="truncate">
                  <span className="font-bold uppercase tracking-[0.12em] text-black">
                    Center
                  </span>{" "}
                  {centerNames}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center border border-black bg-white text-black opacity-0 transition-all duration-300 hover:bg-black hover:text-white group-hover:opacity-100"
            aria-label={`Clear ${slot.label}`}
          >
            <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="official-stripe flex min-h-[240px] flex-col items-center justify-center gap-4 p-5 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-3xl font-light text-white"
            style={{ backgroundColor: color }}
          >
            +
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-black">
            Pick Song
          </div>
        </div>
      )}
    </div>
  );
}
