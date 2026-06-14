"use client";

import React from "react";
import type { Member, PickSlot, PickSlotId, Picks } from "../schema/music";
import PickSlotCard from "./PickSlotCard";

interface PickBoardProps {
  slots: PickSlot[];
  picks: Picks;
  membersById: Record<string, Member>;
  onSlotClick: (slotId: PickSlotId) => void;
  onClearSlot: (slotId: PickSlotId, event: React.MouseEvent) => void;
}

export default function PickBoard({
  slots,
  picks,
  membersById,
  onSlotClick,
  onClearSlot,
}: PickBoardProps) {
  const selectedCount = Object.keys(picks).length;

  return (
    <section className="relative z-10">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-black pb-6 md:flex-row md:items-end">
        <div>
          <h2 className="section-title">PICKS</h2>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {selectedCount}/{slots.length} songs selected
          </p>
        </div>
        <div className="grid grid-cols-5 border border-black bg-white" aria-hidden="true">
          {[
            "var(--equal-love-primary)",
            "var(--equal-love-mint)",
            "var(--equal-love-purple)",
            "var(--equal-love-blue)",
            "var(--equal-love-yellow)",
          ].map((color) => (
            <span
              key={color}
              className="h-7 w-10 border-r border-black last:border-r-0"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {slots
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((slot) => (
            <PickSlotCard
              key={slot.id}
              slot={slot}
              song={picks[slot.id]}
              membersById={membersById}
              onClick={() => onSlotClick(slot.id)}
              onClear={(event) => onClearSlot(slot.id, event)}
            />
          ))}
      </div>
    </section>
  );
}
