"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { MemoryMessages } from "../../i18n/memory/messages.js";
import type { MemorySourceCandidate } from "../../share/memory-selection.js";

import styles from "./memory-page.module.css";

export interface MemoryCandidatePickerOption {
  readonly value: string;
  readonly primary: string;
  readonly secondary: string | null;
}

export type MemoryCandidatePickerKeyAction =
  | { readonly type: "none" }
  | { readonly type: "open" | "move"; readonly activeIndex: number }
  | { readonly type: "commit" | "commit-and-tab"; readonly activeIndex: number }
  | { readonly type: "close" };

interface ResolveMemoryCandidatePickerKeyInput {
  readonly activeIndex: number;
  readonly isOpen: boolean;
  readonly key: string;
  readonly optionCount: number;
  readonly selectedIndex: number;
}

interface MemoryCandidatePickerProps {
  readonly candidates: readonly MemorySourceCandidate[];
  readonly messages: MemoryMessages;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}

const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function findAdjacentTabStop(
  current: HTMLElement,
  direction: -1 | 1,
): HTMLElement | null {
  const tabStops = Array.from(
    document.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      element.tabIndex >= 0 &&
      !element.hasAttribute("inert") &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  });
  const currentIndex = tabStops.indexOf(current);
  return currentIndex < 0 ? null : (tabStops[currentIndex + direction] ?? null);
}

export function buildMemoryCandidatePickerOptions(
  candidates: readonly MemorySourceCandidate[],
  messages: MemoryMessages,
): readonly MemoryCandidatePickerOption[] {
  return [
    {
      value: "",
      primary: messages.candidatePlaceholder,
      secondary: null,
    },
    ...candidates.map((candidate, index) => ({
      value: String(index),
      primary: candidate.event.eventName,
      secondary: `${candidate.event.groupName ?? messages.localGroupName} · ${candidate.event.date} · ${messages.card.modes[candidate.mode]}`,
    })),
  ];
}

function boundedOptionIndex(index: number, optionCount: number) {
  return Math.min(Math.max(index, 0), Math.max(optionCount - 1, 0));
}

export function resolveMemoryCandidatePickerKey({
  activeIndex,
  isOpen,
  key,
  optionCount,
  selectedIndex,
}: ResolveMemoryCandidatePickerKeyInput): MemoryCandidatePickerKeyAction {
  if (optionCount <= 0) return { type: "none" };

  if (!isOpen) {
    if (key === "ArrowUp" || key === "Home") {
      return { type: "open", activeIndex: 0 };
    }
    if (key === "End") {
      return { type: "open", activeIndex: optionCount - 1 };
    }
    if (key === "ArrowDown" || key === "Enter" || key === " ") {
      return {
        type: "open",
        activeIndex: boundedOptionIndex(selectedIndex, optionCount),
      };
    }
    return { type: "none" };
  }

  if (key === "ArrowDown") {
    return {
      type: "move",
      activeIndex: boundedOptionIndex(activeIndex + 1, optionCount),
    };
  }
  if (key === "ArrowUp") {
    return {
      type: "move",
      activeIndex: boundedOptionIndex(activeIndex - 1, optionCount),
    };
  }
  if (key === "Home") return { type: "move", activeIndex: 0 };
  if (key === "End") {
    return { type: "move", activeIndex: optionCount - 1 };
  }
  if (key === "Enter" || key === " ") {
    return {
      type: "commit",
      activeIndex: boundedOptionIndex(activeIndex, optionCount),
    };
  }
  if (key === "Tab") {
    return {
      type: "commit-and-tab",
      activeIndex: boundedOptionIndex(activeIndex, optionCount),
    };
  }
  if (key === "Escape") return { type: "close" };
  return { type: "none" };
}

export function commitMemoryCandidatePickerOption(
  options: readonly MemoryCandidatePickerOption[],
  optionIndex: number,
  onValueChange: (value: string) => void,
) {
  const option = options[optionIndex];
  if (!option) return false;
  onValueChange(option.value);
  return true;
}

function selectedOptionIndex(
  options: readonly MemoryCandidatePickerOption[],
  value: string,
) {
  const index = options.findIndex((option) => option.value === value);
  return index < 0 ? 0 : index;
}

export function MemoryCandidatePicker({
  candidates,
  messages,
  onValueChange,
  value,
}: MemoryCandidatePickerProps) {
  const options = useMemo(
    () => buildMemoryCandidatePickerOptions(candidates, messages),
    [candidates, messages],
  );
  const committedIndex = selectedOptionIndex(options, value);
  const committedOption = options[committedIndex] ?? options[0];
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(committedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const labelId = useId();
  const valueId = useId();
  const listboxId = useId();

  const optionId = useCallback(
    (index: number) => `${listboxId}-option-${index}`,
    [listboxId],
  );

  const closePicker = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const openPicker = useCallback((nextActiveIndex: number) => {
    setActiveIndex(nextActiveIndex);
    setIsOpen(true);
  }, []);

  const commitOption = useCallback(
    (optionIndex: number, restoreFocus = true) => {
      if (
        commitMemoryCandidatePickerOption(options, optionIndex, onValueChange)
      ) {
        closePicker(restoreFocus);
      }
    },
    [closePicker, onValueChange, options],
  );

  useEffect(() => {
    if (!isOpen) return;
    const activeOption = optionRefs.current[activeIndex];
    activeOption?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closePicker(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closePicker, isOpen]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const action = resolveMemoryCandidatePickerKey({
      activeIndex,
      isOpen,
      key: event.key,
      optionCount: options.length,
      selectedIndex: committedIndex,
    });
    if (action.type === "none") return;

    if (action.type === "commit-and-tab") {
      event.preventDefault();
      const direction = event.shiftKey ? -1 : 1;
      commitOption(action.activeIndex, false);
      window.requestAnimationFrame(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        findAdjacentTabStop(trigger, direction)?.focus({ preventScroll: true });
      });
      return;
    }

    event.preventDefault();
    if (action.type === "open") {
      openPicker(action.activeIndex);
    } else if (action.type === "move") {
      setActiveIndex(action.activeIndex);
    } else if (action.type === "commit") {
      commitOption(action.activeIndex);
    } else {
      event.stopPropagation();
      closePicker(true);
    }
  };

  const handleTriggerClick = () => {
    if (isOpen) {
      closePicker(false);
    } else {
      openPicker(committedIndex);
    }
  };

  return (
    <div
      className={styles.selectField}
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closePicker(false);
        }
      }}
    >
      <span className={styles.candidateLabel} id={labelId}>
        {messages.candidateLabel}
      </span>
      <div className={styles.candidatePicker}>
        <div
          aria-activedescendant={isOpen ? optionId(activeIndex) : undefined}
          aria-autocomplete="none"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-labelledby={`${labelId} ${valueId}`}
          aria-readonly="true"
          className={styles.candidateTrigger}
          data-memory-candidate-trigger
          onClick={handleTriggerClick}
          onKeyDown={handleKeyDown}
          ref={triggerRef}
          role="combobox"
          tabIndex={0}
        >
          <span className={styles.candidateTriggerCopy} id={valueId}>
            <span className={styles.candidateOptionPrimary}>
              {committedOption?.primary}
            </span>
            {committedOption?.secondary ? (
              <span className={styles.candidateOptionSecondary}>
                {committedOption.secondary}
              </span>
            ) : null}
          </span>
          <svg
            aria-hidden="true"
            className={styles.candidateChevron}
            viewBox="0 0 16 16"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </div>

        <div
          aria-labelledby={labelId}
          className={styles.candidateListbox}
          data-memory-candidate-listbox
          hidden={!isOpen}
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const active = isOpen
              ? index === activeIndex
              : index === committedIndex;
            const committed = option.value === value;

            return (
              <div
                aria-selected={active}
                className={styles.candidateOption}
                data-active={active || undefined}
                data-committed={committed || undefined}
                data-memory-candidate-option={option.value}
                id={optionId(index)}
                key={option.value}
                onClick={() => commitOption(index)}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
              >
                <span className={styles.candidateOptionCopy}>
                  <span className={styles.candidateOptionPrimary}>
                    {option.primary}
                  </span>
                  {option.secondary ? (
                    <span className={styles.candidateOptionSecondary}>
                      {option.secondary}
                    </span>
                  ) : null}
                </span>
                <span aria-hidden="true" className={styles.candidateCheckSlot}>
                  {committed ? "✓" : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
