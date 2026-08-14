"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { DIALOG_RETURN_KEYS } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";

interface ControlsProps {
  onClearAll: () => boolean;
  onGenerate: () => void;
  onGlobalSearch: () => void;
  onOpenPickAssistant: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenBoardLibrary: () => void;
  onCopyBoardLink: () => void;
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
  shortlistCount: number;
  slotCount: number;
  metricLabel?: string;
  generateButtonRef?: React.Ref<HTMLButtonElement>;
  pickAssistantButtonRef?: React.Ref<HTMLButtonElement>;
  boardLinkCopied?: boolean;
  children?: React.ReactNode;
}

export default function Controls({
  onClearAll,
  onGenerate,
  onGlobalSearch,
  onOpenPickAssistant,
  onUndo,
  onRedo,
  onOpenBoardLibrary,
  onCopyBoardLink,
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
  shortlistCount,
  slotCount,
  metricLabel,
  generateButtonRef,
  pickAssistantButtonRef,
  boardLinkCopied = false,
  children,
}: ControlsProps) {
  const { t } = useLocale();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const morePanelId = useId();
  const controlsRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileClearButtonRef = useRef<HTMLButtonElement>(null);

  const focusVisibleMoreButton = () => {
    const moreButton = moreButtonRef.current;
    if (moreButton?.getClientRects().length) {
      moreButton.focus({ preventScroll: true });
    }
  };

  const handleMobileClearAll = () => {
    const clearButton = mobileClearButtonRef.current;
    if (onClearAll()) {
      setIsMoreOpen(false);
      window.requestAnimationFrame(focusVisibleMoreButton);
      return;
    }

    window.requestAnimationFrame(() => {
      if (clearButton?.isConnected) return;
      focusVisibleMoreButton();
    });
  };

  useEffect(() => {
    if (!isMoreOpen) return;

    const closeMore = () => {
      setIsMoreOpen(false);
      moreButtonRef.current?.focus({ preventScroll: true });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        closeMore();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMore();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreOpen]);

  return (
    <div
      data-page-reveal
      className="app-content-shell relative z-10 mb-4 px-4 sm:mb-5 sm:px-6 md:px-8"
    >
      <section
        ref={controlsRef}
        className="official-panel-soft grid gap-3 p-3.5 sm:p-5"
      >
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
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setIsMoreOpen((open) => !open)}
            aria-expanded={isMoreOpen}
            aria-controls={isMoreOpen ? morePanelId : undefined}
            className="official-button ml-auto w-auto gap-1 !px-2 text-[12px] sm:hidden"
          >
            <AppIcon name="menu" size={16} />
            {t("controls.more")}
            <AppIcon
              name="chevron-down"
              size={14}
              className={`transition-transform duration-150 ${
                isMoreOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        <div className="grid gap-3 sm:gap-4">
          {children ? (
            <div className="grid gap-3 sm:hidden">{children}</div>
          ) : null}

          <div className="grid grid-cols-3 gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => {
                setIsMoreOpen(false);
                onGlobalSearch();
              }}
              data-dialog-return-key={DIALOG_RETURN_KEYS.globalSearch}
              aria-label={t("controls.searchSongs")}
              className="official-button min-w-0 gap-1 !px-1.5 !text-[13px] leading-tight"
            >
              <AppIcon name="search" size={16} />
              <span className="min-w-0 truncate">
                {t("controls.searchSongsShort")}
              </span>
            </button>
            <button
              ref={pickAssistantButtonRef}
              type="button"
              onClick={() => {
                setIsMoreOpen(false);
                onOpenPickAssistant();
              }}
              data-dialog-return-key={DIALOG_RETURN_KEYS.pickAssistant}
              aria-label={t("controls.pickAssistant")}
              className="official-button min-w-0 gap-0.5 !px-1 !text-[13px] leading-tight"
            >
              <AppIcon name="music" size={16} />
              <span className="min-w-0 truncate">
                {t("controls.pickAssistantShort")}
              </span>
              {shortlistCount > 0 ? (
                <span className="rounded-full bg-[var(--background)] px-1 text-[10px] tabular-nums text-[var(--muted)]">
                  {shortlistCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMoreOpen(false);
                onGenerate();
              }}
              disabled={generating || !hasPicks}
              ref={generateButtonRef}
              data-dialog-return-key={DIALOG_RETURN_KEYS.generateImage}
              aria-label={t("controls.generateImage")}
              className="official-button official-button-primary min-w-0 gap-1 !px-1.5 !text-[13px] leading-tight"
            >
              {generating ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                  {t("controls.generating")}
                </>
              ) : (
                <>
                  <AppIcon name="image" size={16} />
                  <span className="min-w-0 truncate">
                    {t("controls.generateImageShort")}
                  </span>
                </>
              )}
            </button>
          </div>

          {isMoreOpen ? (
            <div
              id={morePanelId}
              className="grid gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--background)] p-3 sm:hidden"
            >
              <NicknameField
                id="export-nickname-mobile"
                nickname={nickname}
                nicknameMaxLength={nicknameMaxLength}
                generating={generating}
                onNicknameChange={onNicknameChange}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCopyBoardLink}
                  disabled={!hasPicks}
                  data-dialog-return-key={DIALOG_RETURN_KEYS.copyBoardLink}
                  className="official-button w-full leading-tight"
                >
                  {boardLinkCopied ? (
                    <AppIcon name="check" />
                  ) : (
                    <AppIcon name="external" />
                  )}
                  {boardLinkCopied
                    ? t("controls.boardLinkCopied")
                    : t("controls.copyBoardLink")}
                </button>
                <button
                  type="button"
                  onClick={onOpenBoardLibrary}
                  data-dialog-return-key={DIALOG_RETURN_KEYS.boardLibrary}
                  className="official-button w-full"
                >
                  <AppIcon name="archive" />
                  {t("controls.myBoards", { count: savedBoardCount })}
                </button>
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="official-button w-full"
                >
                  <AppIcon name="undo" />
                  {t("controls.undo")}
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="official-button w-full"
                >
                  <AppIcon name="redo" />
                  {t("controls.redo")}
                </button>
                {hasPicks ? (
                  <button
                    ref={mobileClearButtonRef}
                    type="button"
                    onClick={handleMobileClearAll}
                    className="official-button official-button-quiet col-span-2 !min-h-11 justify-self-stretch !px-3 text-red-700"
                  >
                    {t("controls.clear")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="hidden sm:grid sm:gap-4">
            <div
              className={`grid gap-4 ${
                children
                  ? "lg:w-fit lg:grid-cols-[minmax(220px,280px)_minmax(420px,560px)] lg:items-start"
                  : "sm:max-w-[360px]"
              }`}
            >
              <NicknameField
                id="export-nickname-desktop"
                nickname={nickname}
                nicknameMaxLength={nicknameMaxLength}
                generating={generating}
                onNicknameChange={onNicknameChange}
                showHint
              />

              {children ? <div className="grid gap-3">{children}</div> : null}
            </div>

            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-start">
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
                ref={pickAssistantButtonRef}
                type="button"
                onClick={onOpenPickAssistant}
                data-dialog-return-key={DIALOG_RETURN_KEYS.pickAssistant}
                className="official-button w-full sm:w-auto"
              >
                <AppIcon name="music" />
                {t("controls.pickAssistant")}
                <span className="rounded-full bg-[var(--background)] px-1.5 text-xs tabular-nums text-[var(--muted)]">
                  {shortlistCount}
                </span>
              </button>
              <button
                type="button"
                onClick={onCopyBoardLink}
                disabled={!hasPicks}
                data-dialog-return-key={DIALOG_RETURN_KEYS.copyBoardLink}
                className="official-button w-full leading-tight sm:w-auto"
              >
                {boardLinkCopied ? (
                  <AppIcon name="check" />
                ) : (
                  <AppIcon name="external" />
                )}
                {boardLinkCopied
                  ? t("controls.boardLinkCopied")
                  : t("controls.copyBoardLink")}
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
          </div>
          <span className="sr-only" aria-live="polite">
            {generating
              ? t("controls.generatingPreview")
              : boardLinkCopied
                ? t("controls.boardLinkCopied")
                : ""}
          </span>
        </div>
      </section>
    </div>
  );
}

function NicknameField({
  id,
  nickname,
  nicknameMaxLength,
  generating,
  onNicknameChange,
  showHint = false,
}: {
  id: string;
  nickname: string;
  nicknameMaxLength: number;
  generating: boolean;
  onNicknameChange: (nickname: string) => void;
  showHint?: boolean;
}) {
  const { t } = useLocale();

  return (
    <div className="grid gap-2">
      <label
        htmlFor={id}
        className="text-xs font-semibold tracking-[0.02em] text-[var(--muted)]"
      >
        {t("controls.exportName")}
      </label>
      <div className="flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-white transition-[border-color,box-shadow] focus-within:border-[var(--focus-ring)] focus-within:shadow-[0_0_0_2px_var(--focus-ring)]">
        <input
          id={id}
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
      {showHint ? (
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          {t("controls.exportNameHint")}
        </p>
      ) : null}
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
