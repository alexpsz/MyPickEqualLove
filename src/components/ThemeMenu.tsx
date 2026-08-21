"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import * as m from "motion/react-m";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import type { ThemePreference } from "../utils/themePreference";
import { APPLE_SPRING_GENTLE } from "./AppleMotion";
import AppIcon, { type AppIconName } from "./AppIcon";
import MotionPresence from "./MotionPresence";
import { useTheme } from "./ThemeProvider";

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  icon: AppIconName;
}> = [
  { value: "auto", icon: "monitor" },
  { value: "light", icon: "sun" },
  { value: "dark", icon: "moon" },
];

export default function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openFocusIndexRef = useRef(0);
  const focusOptionOnOpenRef = useRef(true);
  const preferenceIndex = Math.max(
    0,
    THEME_OPTIONS.findIndex((option) => option.value === preference),
  );

  const closeMenuAndRestoreFocus = useCallback(() => {
    triggerRef.current?.focus({ preventScroll: true });
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => {
      if (focusOptionOnOpenRef.current) {
        optionRefs.current[openFocusIndexRef.current]?.focus();
      }
    }, 0);

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenuAndRestoreFocus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenuAndRestoreFocus, isOpen]);

  const openMenu = (focusIndex = preferenceIndex, focusOptionOnOpen = true) => {
    openFocusIndexRef.current = focusIndex;
    focusOptionOnOpenRef.current = focusOptionOnOpen;
    setIsOpen(true);
  };

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(THEME_OPTIONS.length - 1);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const focusTarget = event.shiftKey
        ? triggerRef.current
        : findNextDocumentTabStop(triggerRef.current);
      setIsOpen(false);
      focusTarget?.focus({ preventScroll: true });
      return;
    }

    const currentIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex =
        (currentIndex + 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    } else if (event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = THEME_OPTIONS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  const handleSelect = (nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    closeMenuAndRestoreFocus();
  };

  return (
    <div
      ref={rootRef}
      className="relative h-11 w-11"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) =>
          isOpen
            ? setIsOpen(false)
            : openMenu(preferenceIndex, event.detail === 0)
        }
        onKeyDown={handleTriggerKeyDown}
        className={joinClassNames(
          "icon-button",
          isOpen &&
            "[&::before]:border-[var(--line-strong)] [&::before]:bg-[var(--paper)] [&::before]:shadow-sm",
        )}
        aria-label={t("theme.selectorLabel")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        title={t("theme.selectorLabel")}
      >
        <span className="relative z-10 flex items-center" aria-hidden="true">
          <AppIcon
            name={THEME_OPTIONS[preferenceIndex]?.icon ?? "monitor"}
            size={16}
          />
          <AppIcon
            name="chevron-down"
            size={14}
            strokeWidth={1.65}
            className={joinClassNames(
              "-ml-0.5 text-[var(--muted)] transition-transform duration-150",
              isOpen && "rotate-180",
            )}
          />
        </span>
      </button>

      <MotionPresence value={isOpen ? true : null}>
        {(_, presenceState) => (
          <m.div
            id={menuId}
            role="menu"
            aria-label={t("theme.selectorLabel")}
            aria-hidden={presenceState === "exiting"}
            inert={presenceState === "exiting"}
            onKeyDown={handleMenuKeyDown}
            className="apple-material absolute right-0 top-[calc(100%+6px)] z-50 w-[208px] max-w-[calc(100vw-1.5rem)] origin-top-right rounded-[14px] border-[var(--line)] bg-[var(--menu-surface)] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] outline-none"
            initial={{ opacity: 0, scale: 0.985, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: -4 }}
            transition={APPLE_SPRING_GENTLE}
          >
            {THEME_OPTIONS.map((option, index) => {
              const selected = option.value === preference;
              return (
                <div key={option.value}>
                  {index === 1 ? (
                    <div
                      role="separator"
                      className="mx-3 my-1 h-px bg-[var(--line)]"
                    />
                  ) : null}
                  <button
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-checked={selected}
                    onClick={() => handleSelect(option.value)}
                    className={joinClassNames(
                      "group flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left outline-none transition-[background-color,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] active:scale-[0.985]",
                      selected
                        ? "bg-[var(--project-primary-wash)] text-[var(--foreground)]"
                        : "text-[var(--foreground)] hover:bg-[var(--background)] focus-visible:bg-[var(--background)]",
                    )}
                  >
                    <AppIcon
                      name={option.icon}
                      size={16}
                      className="text-[var(--muted)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.01em]">
                      {getThemeLabel(option.value, t)}
                    </span>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {selected ? (
                        <AppIcon name="check" size={16} strokeWidth={2} />
                      ) : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </m.div>
        )}
      </MotionPresence>
    </div>
  );
}

function getThemeLabel(
  preference: ThemePreference,
  t: (key: MessageKey) => string,
) {
  if (preference === "light") return t("theme.light");
  if (preference === "dark") return t("theme.dark");
  return t("theme.auto");
}

function joinClassNames(
  ...classNames: Array<string | false | null | undefined>
) {
  return classNames.filter(Boolean).join(" ");
}

const DOCUMENT_TAB_STOP_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function findNextDocumentTabStop(current: HTMLElement | null) {
  if (!current) return null;

  const tabStops = Array.from(
    document.querySelectorAll<HTMLElement>(DOCUMENT_TAB_STOP_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest("[inert]") &&
      element.getClientRects().length > 0,
  );
  const currentIndex = tabStops.indexOf(current);
  return currentIndex >= 0 ? (tabStops[currentIndex + 1] ?? null) : null;
}
