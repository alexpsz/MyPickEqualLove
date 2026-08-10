"use client";

import React from "react";
import type { PickSlot, PickSlotId, Picks } from "../schema/music";
import PickSlotCard, { type InteractivePickLayout } from "./PickSlotCard";

interface PickBoardProps {
  slots: PickSlot[];
  picks: Picks;
  layout?: InteractivePickLayout;
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
  const gridClassName =
    layout === "live-memory-grid"
      ? "live-memory-grid grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3"
      : "top10-interactive-grid grid min-w-0 grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:grid-cols-4 xl:grid-cols-5";

  return (
    <section data-page-reveal className="relative z-10 [--reveal-delay:160ms]">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="section-title">PICKS</h2>
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
