"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as m from "motion/react-m";
import { useLocale } from "../i18n/LocaleProvider";
import { DIALOG_RETURN_KEYS, useDialogA11y } from "../utils/useDialogA11y";
import AppIcon, { type AppIconName } from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import type { PresenceState } from "./MotionPresence";

export type CommandPaletteAction =
  | "search"
  | "pick-assistant"
  | "board-library"
  | "undo"
  | "redo"
  | "preview"
  | "archetype";

export type CommandPaletteView = "commands" | "shortcuts";

export interface CommandPaletteCommand {
  action: CommandPaletteAction;
  disabled?: boolean;
  icon: AppIconName;
  label: string;
}

interface CommandPaletteProps {
  commands: CommandPaletteCommand[];
  presenceState: PresenceState;
  view: CommandPaletteView;
  onClose: () => void;
  onSelect: (action: CommandPaletteAction) => void;
  onViewChange: (view: CommandPaletteView) => void;
}

export default function CommandPalette({
  commands,
  presenceState,
  view,
  onClose,
  onSelect,
  onViewChange,
}: CommandPaletteProps) {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  const visibleCommands = useMemo(() => {
    const normalizedFilter = filter.trim().toLocaleLowerCase();
    if (!normalizedFilter) return commands;

    return commands.filter((command) =>
      command.label.toLocaleLowerCase().includes(normalizedFilter),
    );
  }, [commands, filter]);

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting",
    initialFocusRef: view === "commands" ? filterInputRef : closeButtonRef,
    returnFocusKey: DIALOG_RETURN_KEYS.commandPalette,
  });

  useEffect(() => {
    if (presenceState === "exiting") return;

    const timer = window.setTimeout(() => {
      (view === "commands"
        ? filterInputRef.current
        : closeButtonRef.current
      )?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [presenceState, view]);

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
        aria-label={t("commands.closeAria")}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
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
        aria-labelledby="command-palette-title"
        aria-describedby="command-palette-description"
        className="apple-sheet relative z-10 flex max-h-[86dvh] w-full max-w-xl flex-col overflow-hidden rounded-b-none border-x-0 border-b-0 focus:outline-none sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              id="command-palette-title"
              className="text-[22px] font-semibold tracking-[-0.035em] text-[var(--foreground)] sm:text-[26px]"
            >
              {view === "commands" ? t("commands.title") : t("shortcuts.title")}
            </h2>
            <p
              id="command-palette-description"
              className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]"
            >
              {view === "commands"
                ? t("commands.subtitle")
                : t("shortcuts.description")}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact shrink-0"
            aria-label={t("commands.closeAria")}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        {view === "commands" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 sm:p-6">
            <label className="grid gap-2">
              <span className="text-xs font-semibold tracking-[0.02em] text-[var(--muted)]">
                {t("commands.filterLabel")}
              </span>
              <div className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 focus-within:border-[var(--focus-ring)] focus-within:shadow-[0_0_0_2px_var(--focus-ring)]">
                <AppIcon
                  name="search"
                  size={16}
                  className="text-[var(--muted)]"
                />
                <input
                  ref={filterInputRef}
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t("commands.filterPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-soft)]"
                />
              </div>
            </label>

            <div
              className="mt-4 grid gap-2"
              aria-label={t("commands.listAria")}
            >
              {visibleCommands.map((command) => (
                <button
                  key={command.action}
                  type="button"
                  disabled={command.disabled}
                  data-command-palette-action={command.action}
                  onClick={() => onSelect(command.action)}
                  className="official-button min-h-12 w-full justify-start gap-3 px-3 text-left disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--project-primary-wash)] text-[var(--project-primary)]">
                    <AppIcon name={command.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {command.label}
                  </span>
                  {command.disabled ? (
                    <span className="text-xs font-normal text-[var(--muted)]">
                      {t("commands.unavailable")}
                    </span>
                  ) : (
                    <AppIcon
                      name="chevron-right"
                      size={16}
                      className="text-[var(--muted)]"
                    />
                  )}
                </button>
              ))}
              {visibleCommands.length === 0 ? (
                <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] bg-[var(--paper)] p-4 text-sm leading-relaxed text-[var(--muted)]">
                  {t("commands.empty")}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              data-command-palette-shortcuts
              onClick={() => onViewChange("shortcuts")}
              className="official-button official-button-quiet mt-4 w-full justify-start gap-3 px-3"
            >
              <AppIcon name="keyboard" size={16} />
              {t("commands.shortcuts")}
              <span className="ml-auto rounded border border-[var(--line)] bg-[var(--paper)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
                ?
              </span>
            </button>
          </div>
        ) : (
          <ShortcutGuide onBack={() => onViewChange("commands")} />
        )}
      </m.div>
    </div>
  );
}

function ShortcutGuide({ onBack }: { onBack: () => void }) {
  const { t } = useLocale();
  const shortcuts = [
    { keys: "⌘K / Ctrl+K", label: t("shortcuts.openPalette") },
    { keys: "/", label: t("shortcuts.openSearch") },
    { keys: "?", label: t("shortcuts.openGuide") },
    { keys: "1–9 / 0", label: t("shortcuts.focusSlots") },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 sm:p-6">
      <div className="grid gap-2">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.keys}
            className="grid grid-cols-[minmax(7.25rem,auto)_minmax(0,1fr)] items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3 py-3"
          >
            <kbd className="w-fit rounded border border-[var(--line-strong)] bg-[var(--background)] px-2 py-1 text-[12px] font-semibold text-[var(--foreground)]">
              {shortcut.keys}
            </kbd>
            <span className="text-sm leading-relaxed text-[var(--foreground)]">
              {shortcut.label}
            </span>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {t("shortcuts.yieldTitle")}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
          {t("shortcuts.yieldDescription")}
        </p>
      </section>

      <button
        type="button"
        onClick={onBack}
        className="official-button official-button-quiet mt-4 w-full"
      >
        <AppIcon name="chevron-right" size={16} className="rotate-180" />
        {t("shortcuts.back")}
      </button>
    </div>
  );
}
