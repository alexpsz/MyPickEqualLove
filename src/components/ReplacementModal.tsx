"use client";

import React, { useRef } from "react";
import * as m from "motion/react-m";
import type { ReplacementSlotState } from "../data/pickExperiences";
import type { PickSlot, PickSlotId, Picks, Song } from "../schema/music";
import { useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import type { PresenceState } from "./MotionPresence";

interface ReplacementModalProps {
  song: Song;
  slots: PickSlot[];
  picks: Picks;
  slotStates?: ReplacementSlotState[];
  showSlotLabels?: boolean;
  presenceState: PresenceState;
  onReplace: (slotId: PickSlotId) => void;
  onClose: () => void;
}

export default function ReplacementModal({
  song,
  slots,
  picks,
  slotStates = [],
  showSlotLabels = false,
  presenceState,
  onReplace,
  onClose,
}: ReplacementModalProps) {
  const slotStatesById = Object.fromEntries(
    slotStates.map((state) => [state.slotId, state]),
  );
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting",
  });

  return (
    <div
      className="motion-overlay fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      data-presence={presenceState}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={presenceState === "exiting"}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        aria-label="Cancel replacement"
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
        aria-labelledby="replacement-modal-title"
        className="apple-sheet relative z-10 flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none border-x-0 border-b-0 focus:outline-none sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--background)]">
            <img
              src={song.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="replacement-modal-title"
              className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--foreground)]"
            >
              Replace a pick
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">
              Choose a slot for{" "}
              <span className="font-medium text-[var(--foreground)]">
                {song.title.ja}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact shrink-0"
            aria-label="Close replacement dialog"
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 sm:p-5">
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white">
            {slots
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((slot, index) => {
                const currentSong = picks[slot.id];
                const slotState = slotStatesById[slot.id];
                const disabled = Boolean(slotState?.disabledReason);

                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) onReplace(slot.id);
                    }}
                    className={`group flex min-h-[72px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${
                      index > 0 ? "border-t border-[var(--line)]" : ""
                    } ${
                      disabled
                        ? "cursor-not-allowed opacity-45"
                        : "hover:bg-[var(--background)] active:bg-[var(--project-primary-wash)]"
                    }`}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[9px] border border-[var(--line)] bg-[var(--background)]">
                      {currentSong ? (
                        <img
                          src={currentSong.coverUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
                          <AppIcon name="music" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--muted)]">
                        {showSlotLabels ? slot.label : `Pick ${slot.label}`}
                      </p>
                      <p className="mt-0.5 truncate text-[15px] font-semibold text-[var(--foreground)]">
                        {currentSong?.title.ja ?? "Empty slot"}
                      </p>
                      {slotState?.disabledReason ? (
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                          {slotState.disabledReason}
                        </p>
                      ) : null}
                    </div>
                    <AppIcon
                      name="chevron-right"
                      size={16}
                      className="text-[var(--muted-soft)] transition-colors group-hover:text-[var(--foreground)]"
                    />
                  </button>
                );
              })}
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--line)] bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <button type="button" onClick={onClose} className="official-button">
            Cancel
          </button>
        </div>
      </m.div>
    </div>
  );
}
