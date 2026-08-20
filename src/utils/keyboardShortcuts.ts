export type KeyboardShortcutAction =
  | { type: "open-command-palette" }
  | { type: "open-search" }
  | { type: "open-shortcuts" }
  | { type: "focus-slot"; slotIndex: number };

export interface KeyboardShortcutEventInput {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  keyCode: number;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
}

export interface KeyboardShortcutContext {
  hasActiveDialog: boolean;
  hasOpenMenu: boolean;
  isEditableTarget: boolean;
  isExportRealm: boolean;
  isHydrated: boolean;
  isReordering: boolean;
  slotCount: number;
}

type EditableTargetLike = {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
  tagName?: string;
};

export function isShortcutEditableTarget(target: EventTarget | null) {
  const element = target as EditableTargetLike | null;
  if (!element) return false;

  const tagName = element.tagName?.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (element.isContentEditable === true) {
    return true;
  }

  return Boolean(
    element.closest?.('[contenteditable]:not([contenteditable="false"])'),
  );
}

export function resolveKeyboardShortcut(
  event: KeyboardShortcutEventInput,
  context: KeyboardShortcutContext,
): KeyboardShortcutAction | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    context.isEditableTarget ||
    !context.isHydrated ||
    context.isExportRealm ||
    context.hasActiveDialog ||
    context.hasOpenMenu ||
    context.isReordering
  ) {
    return null;
  }

  const isExactPrimaryK =
    event.key.toLowerCase() === "k" &&
    event.ctrlKey !== event.metaKey &&
    !event.altKey &&
    !event.shiftKey;
  if (isExactPrimaryK) return { type: "open-command-palette" };

  if (event.altKey || event.ctrlKey || event.metaKey) return null;

  if (event.key === "/") return { type: "open-search" };
  if (event.key === "?") return { type: "open-shortcuts" };

  if (!/^[0-9]$/.test(event.key)) return null;
  const digit = Number(event.key);

  const slotIndex = digit === 0 ? 9 : digit - 1;
  if (slotIndex >= context.slotCount) return null;

  return { type: "focus-slot", slotIndex };
}
