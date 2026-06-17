"use client";

import React from "react";
import { PROJECT_THEME_COLOR } from "../config/project";
import type { Song } from "../schema/music";

interface PickSlotCardProps {
  song?: Song;
  onClick: () => void;
  onClear: (event: React.MouseEvent) => void;
}

const getYear = (song: Song) => song.releaseDate?.slice(0, 4) ?? "TBD";

export default function PickSlotCard({
  song,
  onClick,
  onClear,
}: PickSlotCardProps) {
  const color = PROJECT_THEME_COLOR;

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
      className="group relative grid min-h-[292px] min-w-0 cursor-pointer grid-rows-[auto_1fr] overflow-hidden border border-black bg-white transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[var(--project-primary)]"
      aria-label={song ? `Replace pick: ${song.title.ja}` : "Pick song"}
    >
      {song ? (
        <div className="row-span-2 grid min-w-0 max-w-full grid-rows-[auto_auto] overflow-hidden">
          <div className="relative min-w-0 max-w-full overflow-hidden border-b border-black bg-[var(--paper-soft)]">
            <img
              src={song.coverUrl}
              alt={`${song.title.ja} cover`}
              className="block h-auto w-full max-w-full transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
              <div className="line-clamp-2 text-base font-bold leading-tight">
                {song.title.ja}
              </div>
              <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
                {song.title.romaji}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-3 overflow-hidden p-3">
            <div className="flex flex-wrap gap-1.5">
              <span className="official-chip" style={{ color }}>
                {getYear(song)}
              </span>
              {song.trackType && (
                <span className="official-chip" style={{ color }}>
                  {song.trackType}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center border border-black bg-white text-black opacity-0 transition-all duration-300 hover:bg-black hover:text-white group-hover:opacity-100"
            aria-label={`Clear ${song.title.ja}`}
          >
            <svg
              className="h-3 w-3 fill-current"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end border-b border-black">
            <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-black">
              My Pick
            </div>
          </div>
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
        </>
      )}
    </div>
  );
}
