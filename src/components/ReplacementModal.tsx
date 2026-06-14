"use client";

import React, { useEffect } from "react";
import type { PickSlot, PickSlotId, Picks, Song } from "../schema/music";

interface ReplacementModalProps {
  song: Song;
  slots: PickSlot[];
  picks: Picks;
  onReplace: (slotId: PickSlotId) => void;
  onClose: () => void;
}

export default function ReplacementModal({
  song,
  slots,
  picks,
  onReplace,
  onClose,
}: ReplacementModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/50 backdrop-blur-sm"
        aria-label="Cancel replacement"
      />

      <div className="official-panel relative z-10 w-full max-w-2xl overflow-hidden bg-white">
        <div className="border-b border-black p-5">
          <h3 className="text-lg font-bold uppercase tracking-[0.2em] text-black">
            Choose Slot to Replace
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Board is full. Place <span className="font-bold text-rose-600">{song.title.ja}</span>{" "}
            into one of your Top Picks.
          </p>
        </div>

        <div className="official-stripe grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {slots
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((slot) => {
              const currentSong = picks[slot.id];
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onReplace(slot.id)}
                  className="flex items-center gap-3 border border-slate-300 bg-white p-3 text-left transition-all hover:border-black"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center bg-[var(--equal-love-primary)] text-xs font-black text-white">
                    {slot.label}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">
                      {currentSong?.title.ja ?? "Empty Slot"}
                    </div>
                    <div className="truncate text-[10px] font-medium text-slate-500">
                      {currentSong?.title.romaji ?? "No current pick"}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>

        <div className="flex justify-end border-t border-black bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="official-button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
