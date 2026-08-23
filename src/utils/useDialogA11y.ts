"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export const DIALOG_RETURN_KEYS = {
  sisterProjects: "sister-projects",
  globalSearch: "global-search",
  generateImage: "generate-image",
  boardLibrary: "board-library",
  copyBoardLink: "copy-board-link",
  commandPalette: "command-palette",
  pickAssistant: "pick-assistant",
  archetype: "archetype-result",
  onboardingSearch: "onboarding-search",
  onboardingAssistant: "onboarding-assistant",
  onboardingImport: "onboarding-import",
} as const;

export function getPickSlotReturnKey(slotId: string) {
  return `pick-slot-${slotId}`;
}

export function setActiveDialogReturnFocusKey(key: string) {
  if (!rootDialogSessionActive) return;
  rootDialogOpenerKey = key;
}

let bodyLockCount = 0;
let previousBodyOverflow = "";
let rootDialogOpener: HTMLElement | null = null;
let rootDialogOpenerKey: string | null = null;
let rootDialogFallbackKey: string | null = null;
let rootDialogSessionActive = false;

interface UseDialogA11yOptions {
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  active?: boolean;
  autoFocus?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  returnFocusKey?: string;
  returnFocusFallbackKey?: string;
}

function isFocusableCandidate(element: HTMLElement | null) {
  return Boolean(
    element?.isConnected &&
    !element.hasAttribute("disabled") &&
    !element.closest("[inert]") &&
    element.getClientRects().length > 0,
  );
}

function getFirstFocusableElement(dialog: HTMLElement | null) {
  return Array.from(
    dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
  ).find(isFocusableCandidate);
}

function focusDialog(
  dialog: HTMLElement | null,
  initialFocusTarget: HTMLElement | null,
  autoFocus: boolean,
) {
  const target = isFocusableCandidate(initialFocusTarget)
    ? initialFocusTarget
    : autoFocus
      ? getFirstFocusableElement(dialog)
      : dialog;
  (target ?? dialog)?.focus();
}

function findReturnTargetByKey(key: string | null) {
  if (!key) return null;
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-dialog-return-key]"),
  ).find(
    (element) =>
      element.dataset.dialogReturnKey === key && isFocusableCandidate(element),
  );
}

function isUsableReturnTarget(element: HTMLElement | null) {
  return (
    element !== document.body &&
    element !== document.documentElement &&
    isFocusableCandidate(element)
  );
}

export function useDialogA11y({
  dialogRef,
  onClose,
  active = true,
  autoFocus = true,
  initialFocusRef,
  returnFocusRef,
  returnFocusKey,
  returnFocusFallbackKey,
}: UseDialogA11yOptions) {
  const onCloseRef = useRef(onClose);
  const activeRef = useRef(active);
  const wasActiveRef = useRef(active);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active || wasActive) return;

    const focusTimer = window.setTimeout(() => {
      focusDialog(
        dialogRef.current,
        initialFocusRef?.current ?? null,
        autoFocus,
      );
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [active, autoFocus, dialogRef, initialFocusRef]);

  useEffect(() => {
    if (bodyLockCount === 0 && !rootDialogSessionActive) {
      rootDialogOpener =
        returnFocusRef?.current ??
        findReturnTargetByKey(returnFocusKey ?? null) ??
        (document.activeElement as HTMLElement | null);
      rootDialogOpenerKey =
        returnFocusKey ?? rootDialogOpener?.dataset.dialogReturnKey ?? null;
      rootDialogFallbackKey = returnFocusFallbackKey ?? null;
      rootDialogSessionActive = true;
    }
    lockBodyScroll();

    const focusTimer = window.setTimeout(() => {
      if (!autoFocus) return;
      if (!activeRef.current) return;
      focusDialog(dialogRef.current, initialFocusRef?.current ?? null, true);
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isFocusableCandidate);

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const focusedElement = document.activeElement;

      if (!dialogRef.current.contains(focusedElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && focusedElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && focusedElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      unlockBodyScroll();

      if (bodyLockCount === 0) {
        window.requestAnimationFrame(() => {
          if (
            bodyLockCount !== 0 ||
            document.querySelector(
              '[aria-modal="true"]:not([aria-hidden="true"])',
            )
          ) {
            return;
          }

          const focusTarget = rootDialogOpener;
          const focusTargetKey = rootDialogOpenerKey;
          const fallbackFocusTargetKey = rootDialogFallbackKey;
          const keyedFocusTarget = findReturnTargetByKey(focusTargetKey);
          const fallbackFocusTarget = findReturnTargetByKey(
            fallbackFocusTargetKey,
          );
          const connectedFocusTarget = isUsableReturnTarget(focusTarget)
            ? focusTarget
            : null;
          rootDialogOpener = null;
          rootDialogOpenerKey = null;
          rootDialogFallbackKey = null;
          rootDialogSessionActive = false;
          (
            keyedFocusTarget ??
            connectedFocusTarget ??
            fallbackFocusTarget
          )?.focus();
        });
      }
    };
  }, [
    autoFocus,
    dialogRef,
    initialFocusRef,
    returnFocusFallbackKey,
    returnFocusKey,
    returnFocusRef,
  ]);
}

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLockCount += 1;
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}
