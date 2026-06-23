"use client";

import React from "react";
import type { PickExperienceLayout } from "../schema/pick-experience";
import type { PickSlot, PickSlotId, Picks } from "../schema/music";
import PickSlotCard from "./PickSlotCard";

interface PickBoardProps {
  slots: PickSlot[];
  picks: Picks;
  layout?: PickExperienceLayout;
  showSlotMetadata?: boolean;
  onSlotClick: (slotId: PickSlotId) => void;
  onClearSlot: (slotId: PickSlotId, event: React.MouseEvent) => void;
}

export default function PickBoard({
  slots,
  picks,
  layout = "top10-grid",
  showSlotMetadata = false,
  onSlotClick,
  onClearSlot,
}: PickBoardProps) {
  const selectedCount = Object.keys(picks).length;
  const gridClassName =
    layout === "five-memory-list"
      ? "grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2"
      : "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5";

  return (
    <section className="relative z-10">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-black pb-6 md:flex-row md:items-end">
        <div>
          <h2 className="section-title">PICKS</h2>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {selectedCount}/{slots.length} songs selected
          </p>
        </div>
      </div>

      <div className={gridClassName}>
        {slots
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((slot) => (
            <PickSlotCard
              key={slot.id}
              slot={slot}
              song={picks[slot.id]}
              layout={layout}
              showSlotMetadata={showSlotMetadata}
              onClick={() => onSlotClick(slot.id)}
              onClear={(event) => onClearSlot(slot.id, event)}
            />
          ))}
      </div>
    </section>
  );
}
