"use client";

import React from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { DIALOG_RETURN_KEYS } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";

interface ControlsProps {
  onClearAll: () => void;
  onGenerate: () => void;
  onGlobalSearch: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenBoardLibrary: () => void;
  nickname: string;
  nicknameMaxLength: number;
  onNicknameChange: (nickname: string) => void;
  generating: boolean;
  hasPicks: boolean;
  canUndo: boolean;
  canRedo: boolean;
  savedBoardCount: number;
  totalSongs: number;
  selectedCount: number;
  slotCount: number;
  metricLabel?: string;
  generateButtonRef?: React.Ref<HTMLButtonElement>;
  children?: React.ReactNode;
}

export default function Controls({
  onClearAll,
  onGenerate,
  onGlobalSearch,
  onUndo,
  onRedo,
  onOpenBoardLibrary,
  nickname,
  nicknameMaxLength,
  onNicknameChange,
  generating,
  hasPicks,
  canUndo,
  canRedo,
  savedBoardCount,
  totalSongs,
  selectedCount,
  slotCount,
  metricLabel,
  generateButtonRef,
  children,
}: ControlsProps) {
  const { t } = useLocale();

  return (
    <div
      data-page-reveal
      className="app-content-shell relative z-10 mb-4 px-4 sm:mb-5 sm:px-6 md:px-8"
    >
      <section className="official-panel-soft grid gap-3 p-3.5 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-[var(--line)] pb-2.5 sm:pb-3">
          <Metric
            label={metricLabel ?? t("controls.songs")}
            value={totalSongs}
          />
          <div
            className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em]"
            aria-live="polite"
          >
            <span className="text-[var(--muted)]">
              {t("controls.selected")}
            </span>
            <span className="tabular-nums text-[var(--foreground)]">
              {selectedCount}/{slotCount}
            </span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div
            className={`grid gap-4 ${
              children
                ? "sm:grid-cols-[minmax(220px,0.72fr)_minmax(0,1fr)] sm:items-end"
                : "lg:max-w-[620px]"
            }`}
          >
            <div className="grid gap-2">
              <label
                htmlFor="export-nickname"
                className="sr-only text-xs font-semibold tracking-[0.02em] text-[var(--muted)] sm:not-sr-only"
              >
                {t("controls.exportName")}
              </label>
              <div className="flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-white transition-[border-color,box-shadow] focus-within:border-[var(--focus-ring)] focus-within:shadow-[0_0_0_2px_var(--focus-ring)]">
                <input
                  id="export-nickname"
                  type="text"
                  value={nickname}
                  maxLength={nicknameMaxLength}
                  disabled={generating}
                  onChange={(event) => onNicknameChange(event.target.value)}
                  placeholder={t("controls.exportNamePlaceholder")}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] font-normal text-[var(--foreground)] outline-none placeholder:text-[var(--muted-soft)] disabled:opacity-50"
                />
                <span className="px-3 text-xs font-medium tabular-nums text-[var(--muted)]">
                  {nickname.length}/{nicknameMaxLength}
                </span>
              </div>
              <p className="hidden text-xs leading-relaxed text-[var(--muted)] sm:block">
                {t("controls.exportNameHint")}
              </p>
            </div>

            {children ? <div className="grid gap-3">{children}</div> : null}
          </div>

          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={onGlobalSearch}
              data-dialog-return-key={DIALOG_RETURN_KEYS.globalSearch}
              className="official-button w-full sm:w-auto"
            >
              <AppIcon name="search" />
              {t("controls.searchSongs")}
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || !hasPicks}
              ref={generateButtonRef}
              data-dialog-return-key={DIALOG_RETURN_KEYS.generateImage}
              className="official-button official-button-primary min-w-0 w-full sm:min-w-[168px] sm:w-auto"
            >
              {generating ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                  {t("controls.generating")}
                </>
              ) : (
                <>
                  <AppIcon name="image" />
                  {t("controls.generateImage")}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="official-button w-full sm:w-auto"
            >
              <AppIcon name="undo" />
              {t("controls.undo")}
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="official-button w-full sm:w-auto"
            >
              <AppIcon name="redo" />
              {t("controls.redo")}
            </button>
            <button
              type="button"
              onClick={onOpenBoardLibrary}
              data-dialog-return-key={DIALOG_RETURN_KEYS.boardLibrary}
              className="official-button w-full sm:w-auto"
            >
              <AppIcon name="archive" />
              {t("controls.myBoards", { count: savedBoardCount })}
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={!hasPicks}
              className="official-button official-button-quiet col-span-2 !min-h-9 justify-self-center !px-3 sm:col-span-1 sm:!min-h-11"
            >
              {t("controls.clear")}
            </button>
          </div>
          <span className="sr-only" aria-live="polite">
            {generating ? t("controls.generatingPreview") : ""}
          </span>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em]">
      <AppIcon
        name="music"
        className="text-[var(--project-primary)]"
        strokeWidth={2}
      />
      <span className="text-[var(--muted)]">{label}</span>
      <span className="tabular-nums text-[var(--foreground)]">{value}</span>
    </div>
  );
}
