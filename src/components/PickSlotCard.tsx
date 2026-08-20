"use client";

import React, { useRef } from "react";
import { AnimatePresence, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import { useLocale } from "../i18n/LocaleProvider";
import type { PickSlot, Song } from "../schema/music";
import { getConfirmedSongCredits } from "../utils/songCredits";
import { getPickSlotReturnKey } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import JapaneseContent, {
  LocalizedTextWithJapaneseValue,
} from "./JapaneseContent";
import { APPLE_OPACITY, APPLE_SPRING } from "./AppleMotion";
import { usePrefersReducedMotion } from "./MotionPresence";

interface PickSlotCardProps {
  slot: PickSlot;
  song?: Song;
  layout?: InteractivePickLayout;
  showSlotMetadata?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onClear: (event: React.MouseEvent) => void;
  reorderHandleProps?: ReorderHandleProps;
  reorderSurfaceProps?: ReorderSurfaceProps;
}

export interface ReorderHandleProps {
  active: boolean;
  controlsKeyboardToolbar: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: React.PointerEventHandler<HTMLButtonElement>;
  onLostPointerCapture: React.PointerEventHandler<HTMLButtonElement>;
}

export interface ReorderSurfaceProps {
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: React.PointerEventHandler<HTMLButtonElement>;
  onLostPointerCapture: React.PointerEventHandler<HTMLButtonElement>;
  onContextMenu: React.MouseEventHandler<HTMLButtonElement>;
}

export type InteractivePickLayout = "top10-grid" | "live-memory-grid";

export default function PickSlotCard({
  slot,
  song,
  layout = "top10-grid",
  showSlotMetadata = false,
  onClick,
  onClear,
  reorderHandleProps,
  reorderSurfaceProps,
}: PickSlotCardProps) {
  const { t } = useLocale();
  const compact = layout === "live-memory-grid";
  const prefersReducedMotion = usePrefersReducedMotion();
  const articleRef = useRef<HTMLElement>(null);

  const handleClear = (event: React.MouseEvent) => {
    onClear(event);
    window.requestAnimationFrame(() => {
      articleRef.current
        ?.querySelector<HTMLElement>('[data-card-current="true"] button')
        ?.focus();
    });
  };

  return (
    <article
      ref={articleRef}
      className="group relative min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] shadow-[0_1px_2px_rgba(0,0,0,0.025),0_8px_24px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150"
    >
      <div className="relative">
        <AnimatePresence initial={false} mode="sync">
          <AnimatedCardFace
            key={song?.id ?? "empty"}
            reducedMotion={prefersReducedMotion}
          >
            <CardFace
              slot={slot}
              song={song}
              compact={compact}
              showSlotMetadata={showSlotMetadata}
              onClick={onClick}
              onClear={handleClear}
              reorderSurfaceProps={song ? reorderSurfaceProps : undefined}
            />
          </AnimatedCardFace>
        </AnimatePresence>
      </div>
      {song && reorderHandleProps ? (
        <button
          type="button"
          data-reorder-handle
          aria-label={t("reorder.handleAria", {
            title: song.title.ja,
            position: slot.label,
          })}
          aria-describedby="pick-reorder-instructions"
          aria-pressed={reorderHandleProps.controlsKeyboardToolbar}
          aria-controls={
            reorderHandleProps.controlsKeyboardToolbar
              ? "pick-reorder-toolbar"
              : undefined
          }
          data-active={reorderHandleProps.active ? "true" : undefined}
          className="pick-reorder-handle icon-button icon-button-compact icon-button-overlay right-11 top-0 z-30 text-[var(--muted)]"
          onClick={reorderHandleProps.onClick}
          onKeyDown={reorderHandleProps.onKeyDown}
          onPointerDown={reorderHandleProps.onPointerDown}
          onPointerMove={reorderHandleProps.onPointerMove}
          onPointerUp={reorderHandleProps.onPointerUp}
          onPointerCancel={reorderHandleProps.onPointerCancel}
          onLostPointerCapture={reorderHandleProps.onLostPointerCapture}
        >
          <AppIcon name="grip" size={14} />
        </button>
      ) : null}
    </article>
  );
}

function AnimatedCardFace({
  children,
  reducedMotion,
}: {
  children: React.ReactNode;
  reducedMotion: boolean;
}) {
  const isPresent = useIsPresent();

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { opacity: APPLE_OPACITY, scale: APPLE_SPRING }
      }
      data-card-current={isPresent ? "true" : "false"}
      aria-hidden={!isPresent}
      inert={!isPresent}
      className={`${isPresent ? "relative" : "absolute inset-0"} origin-center bg-[var(--paper)]`}
    >
      {children}
    </m.div>
  );
}

function CardFace({
  slot,
  song,
  compact,
  showSlotMetadata,
  onClick,
  onClear,
  reorderSurfaceProps,
}: {
  slot: PickSlot;
  song?: Song;
  compact: boolean;
  showSlotMetadata: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onClear: (event: React.MouseEvent) => void;
  reorderSurfaceProps?: ReorderSurfaceProps;
}) {
  const { t } = useLocale();
  const returnKey = getPickSlotReturnKey(slot.id);

  if (!song) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-dialog-return-key={returnKey}
        className={`grid w-full text-left transition-transform duration-100 active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${
          compact
            ? "min-h-[224px] grid-rows-[44px_minmax(180px,1fr)]"
            : "grid-rows-[44px_auto_44px]"
        }`}
        aria-label={t("pick.chooseAria", { slot: slot.label })}
      >
        <CardHeader label={slot.label} stateLabel={t("pick.empty")} />
        <div
          className={`flex flex-col items-center justify-center gap-3 border-y border-[var(--line)] px-4 text-center ${
            compact ? "min-h-[180px]" : "aspect-square w-full"
          }`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--line-strong)] text-[var(--muted)] transition-[background-color,border-color,color,transform] duration-150 group-hover:border-[var(--project-primary)] group-hover:bg-[var(--project-primary-wash)] group-hover:text-[var(--foreground)] group-active:scale-95">
            <AppIcon name="plus" />
          </span>
          {compact ? (
            <span className="max-w-[15rem] text-[13px] font-medium leading-snug text-[var(--muted)]">
              {showSlotMetadata
                ? (slot.subtitle ?? t("pick.chooseSong"))
                : t("pick.chooseSong")}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <span className="flex min-h-11 items-center justify-center px-3 text-center text-[13px] font-medium leading-snug text-[var(--muted)]">
            {t("pick.chooseSong")}
          </span>
        ) : null}
      </button>
    );
  }

  const creditsDescriptionId = `${returnKey}-credits-${song.id}`;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        data-reorder-surface
        data-dialog-return-key={returnKey}
        className={`pick-card-action grid w-full text-left transition-transform duration-100 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${
          compact
            ? "min-h-[224px] grid-rows-[44px_minmax(180px,1fr)]"
            : "grid-rows-[44px_auto_44px]"
        }`}
        aria-describedby={creditsDescriptionId}
        aria-label={t("pick.replaceAria", {
          slot: slot.label,
          title: song.title.ja,
        })}
        onPointerDown={reorderSurfaceProps?.onPointerDown}
        onPointerMove={reorderSurfaceProps?.onPointerMove}
        onPointerUp={reorderSurfaceProps?.onPointerUp}
        onPointerCancel={reorderSurfaceProps?.onPointerCancel}
        onLostPointerCapture={reorderSurfaceProps?.onLostPointerCapture}
        onContextMenu={reorderSurfaceProps?.onContextMenu}
      >
        <CardHeader label={slot.label} reserveAction />
        {compact ? (
          <div className="flex min-h-[180px] min-w-0 border-t border-[var(--line)] bg-[var(--paper-soft)]">
            <div className="pick-cover-surface pick-cover-surface-compact relative isolate aspect-square w-[clamp(150px,46%,180px)] shrink-0 self-center overflow-hidden border-r border-[var(--line)] bg-[var(--paper)]">
              <img
                src={song.coverUrl}
                draggable={false}
                alt={t("pick.coverAlt", { title: song.title.ja })}
                className="pick-cover-image block h-full w-full object-contain"
                loading="lazy"
              />
              <CoverCreditsOverlay id={creditsDescriptionId} song={song} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
              <div className="line-clamp-2 text-sm font-semibold tracking-[-0.015em] text-[var(--foreground)]">
                <JapaneseContent>{song.title.ja}</JapaneseContent>
              </div>
              {showSlotMetadata && slot.subtitle ? (
                <div className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[var(--muted)]">
                  {slot.subtitle}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="pick-cover-surface relative isolate aspect-square w-full overflow-hidden border-y border-[var(--line)] bg-[var(--paper-soft)]">
              <img
                src={song.coverUrl}
                draggable={false}
                alt={t("pick.coverAlt", { title: song.title.ja })}
                className="pick-cover-image block h-full w-full object-contain"
                loading="lazy"
              />
              <CoverCreditsOverlay id={creditsDescriptionId} song={song} />
            </div>
            <div className="flex min-h-11 min-w-0 items-center px-3.5">
              <div className="truncate text-sm font-semibold tracking-[-0.015em] text-[var(--foreground)]">
                <JapaneseContent>{song.title.ja}</JapaneseContent>
              </div>
            </div>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onClear}
        className="icon-button icon-button-compact icon-button-overlay right-0 top-0 z-20 text-[var(--muted)]"
        aria-label={t("pick.clearAria", { title: song.title.ja })}
      >
        <AppIcon name="close" size={14} />
      </button>
    </>
  );
}

function CoverCreditsOverlay({ id, song }: { id: string; song: Song }) {
  const { t } = useLocale();
  const credits = getConfirmedSongCredits(song);

  return (
    <div
      id={id}
      className="pick-cover-credits absolute inset-0 z-10 flex flex-col justify-center gap-1.5 p-2 text-white opacity-0"
      data-cover-credits
      data-credits-confirmed={credits ? "true" : "false"}
    >
      {credits ? (
        <>
          <CreditRow
            accent="lyrics"
            text={t("search.creditLyrics", { name: credits.lyricist.ja })}
            value={credits.lyricist.ja}
          />
          <CreditRow
            accent="music"
            text={t("search.creditMusic", { name: credits.composer.ja })}
            value={credits.composer.ja}
          />
          <CreditRow
            accent="arrange"
            text={t("search.creditArrange", { name: credits.arranger.ja })}
            value={credits.arranger.ja}
          />
        </>
      ) : (
        <span className="pick-cover-credit-row justify-center text-center">
          {t("credits.unconfirmed")}
        </span>
      )}
    </div>
  );
}

function CreditRow({
  accent,
  text,
  value,
}: {
  accent: "lyrics" | "music" | "arrange";
  text: string;
  value: string;
}) {
  return (
    <span className="pick-cover-credit-row">
      <span
        className={`pick-cover-credit-dot pick-cover-credit-dot--${accent}`}
        aria-hidden="true"
      />
      <span className="pick-cover-credit-text min-w-0">
        <LocalizedTextWithJapaneseValue text={text} value={value} />
      </span>
    </span>
  );
}

function CardHeader({
  label,
  stateLabel,
  reserveAction = false,
}: {
  label: string;
  stateLabel?: string;
  reserveAction?: boolean;
}) {
  return (
    <div
      className={`flex min-h-11 items-center justify-between gap-3 py-2.5 pl-3.5 ${
        reserveAction ? "pr-24" : "pr-3.5"
      }`}
    >
      <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
        {label}
      </span>
      {stateLabel ? (
        <span className="shrink-0 text-xs font-medium text-[var(--muted)]">
          {stateLabel}
        </span>
      ) : null}
    </div>
  );
}
