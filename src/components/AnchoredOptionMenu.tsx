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
import AppIcon from "./AppIcon";
import { APPLE_SPRING_GENTLE } from "./AppleMotion";
import MotionPresence from "./MotionPresence";

export interface AnchoredOption<T extends string> {
  value: T;
  label: string;
}

interface AnchoredOptionMenuProps<T extends string> {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly AnchoredOption<T>[];
  disabled: boolean;
}

export default function AnchoredOptionMenu<T extends string>({
  label,
  value,
  onValueChange,
  options,
  disabled,
}: AnchoredOptionMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const labelId = useId();
  const valueId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openFocusIndexRef = useRef(0);
  const focusOptionOnOpenRef = useRef(true);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selectedOption = options[selectedIndex];

  const closeMenu = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const openMenu = useCallback(
    (focusIndex = selectedIndex, focusOptionOnOpen = true) => {
      openFocusIndexRef.current = focusIndex;
      focusOptionOnOpenRef.current = focusOptionOnOpen;
      setIsOpen(true);
    },
    [selectedIndex],
  );

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => {
      if (focusOptionOnOpenRef.current) {
        optionRefs.current[openFocusIndexRef.current]?.focus();
      }
    }, 0);

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu(true);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus({ preventScroll: true });
  };

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const nextIndex =
      event.key === "ArrowDown"
        ? 0
        : event.key === "ArrowUp"
          ? options.length - 1
          : null;
    if (nextIndex === null) return;

    event.preventDefault();
    if (isOpen) {
      focusOption(nextIndex);
    } else {
      openMenu(nextIndex);
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
      nextIndex = (currentIndex + 1 + options.length) % options.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    focusOption(nextIndex);
  };

  const handleSelect = (nextValue: T) => {
    onValueChange(nextValue);
    closeMenu(true);
  };

  return (
    <div
      ref={rootRef}
      className="relative grid w-full min-w-0 gap-1 sm:w-[190px]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <span
        id={labelId}
        className="text-[11px] font-semibold text-[var(--muted)]"
      >
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(event) => {
          if (isOpen) {
            setIsOpen(false);
          } else {
            openMenu(selectedIndex, event.detail === 0);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        className={`flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-white px-3 text-left text-[13px] font-medium text-[var(--foreground)] outline-none transition-[border-color,box-shadow,background-color] duration-150 focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-50 ${
          isOpen ? "bg-[var(--project-primary-wash)]" : ""
        }`}
      >
        <span id={valueId} className="min-w-0 flex-1 truncate">
          {selectedOption?.label}
        </span>
        <AppIcon
          name="chevron-down"
          size={14}
          strokeWidth={1.65}
          className={`text-[var(--muted)] transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <MotionPresence value={isOpen ? true : null}>
        {(_, presenceState) => (
          <m.div
            id={menuId}
            role="menu"
            aria-label={label}
            aria-hidden={presenceState === "exiting"}
            inert={presenceState === "exiting"}
            onKeyDown={handleMenuKeyDown}
            className="apple-material absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[190px] max-w-[calc(100vw-2rem)] origin-top-left rounded-[14px] border-[var(--line)] bg-[rgba(255,255,255,0.97)] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] outline-none"
            initial={{ opacity: 0, scale: 0.985, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: -4 }}
            transition={APPLE_SPRING_GENTLE}
          >
            {options.map((option, index) => {
              const selected = option.value === value;

              return (
                <button
                  key={option.value}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={selected}
                  onClick={() => handleSelect(option.value)}
                  className={`group flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left outline-none transition-[background-color,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] active:scale-[0.985] ${
                    selected
                      ? "bg-[var(--project-primary-wash)] text-[var(--foreground)]"
                      : "text-[var(--foreground)] hover:bg-[var(--background)] focus-visible:bg-[var(--background)]"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.01em]">
                    {option.label}
                  </span>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {selected ? (
                      <AppIcon name="check" size={16} strokeWidth={2} />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </m.div>
        )}
      </MotionPresence>
    </div>
  );
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
