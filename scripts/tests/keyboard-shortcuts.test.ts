import assert from "node:assert/strict";
import test from "node:test";

import {
  isShortcutEditableTarget,
  resolveKeyboardShortcut,
  type KeyboardShortcutContext,
  type KeyboardShortcutEventInput,
} from "../../src/utils/keyboardShortcuts";

function createEvent(
  overrides: Partial<KeyboardShortcutEventInput> = {},
): KeyboardShortcutEventInput {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    isComposing: false,
    key: "k",
    keyCode: 0,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...overrides,
  };
}

function createContext(
  overrides: Partial<KeyboardShortcutContext> = {},
): KeyboardShortcutContext {
  return {
    hasActiveDialog: false,
    hasOpenMenu: false,
    isEditableTarget: false,
    isExportRealm: false,
    isHydrated: true,
    isReordering: false,
    slotCount: 10,
    ...overrides,
  };
}

test("maps Ctrl+K and Meta+K only when the primary shortcut is exact", () => {
  assert.deepEqual(
    resolveKeyboardShortcut(createEvent({ ctrlKey: true }), createContext()),
    { type: "open-command-palette" },
  );
  assert.deepEqual(
    resolveKeyboardShortcut(createEvent({ metaKey: true }), createContext()),
    { type: "open-command-palette" },
  );
  assert.equal(
    resolveKeyboardShortcut(
      createEvent({ ctrlKey: true, metaKey: true }),
      createContext(),
    ),
    null,
  );
  assert.equal(
    resolveKeyboardShortcut(
      createEvent({ ctrlKey: true, shiftKey: true }),
      createContext(),
    ),
    null,
  );
});

test("maps slash, question mark, and every board digit", () => {
  assert.deepEqual(
    resolveKeyboardShortcut(createEvent({ key: "/" }), createContext()),
    { type: "open-search" },
  );
  assert.deepEqual(
    resolveKeyboardShortcut(
      createEvent({ key: "?", shiftKey: true }),
      createContext(),
    ),
    { type: "open-shortcuts" },
  );

  for (let digit = 1; digit <= 9; digit += 1) {
    assert.deepEqual(
      resolveKeyboardShortcut(
        createEvent({ key: String(digit) }),
        createContext(),
      ),
      { type: "focus-slot", slotIndex: digit - 1 },
    );
  }
  assert.deepEqual(
    resolveKeyboardShortcut(createEvent({ key: "0" }), createContext()),
    { type: "focus-slot", slotIndex: 9 },
  );
  assert.equal(
    resolveKeyboardShortcut(
      createEvent({ key: "5" }),
      createContext({ slotCount: 4 }),
    ),
    null,
  );
  assert.equal(
    resolveKeyboardShortcut(createEvent({ key: " " }), createContext()),
    null,
  );
  assert.equal(
    resolveKeyboardShortcut(createEvent({ key: "10" }), createContext()),
    null,
  );
});

test("yields slash, question mark, and digits to browser modifier shortcuts", () => {
  for (const key of ["/", "?", "1"]) {
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      assert.equal(
        resolveKeyboardShortcut(
          createEvent({ key, [modifier]: true }),
          createContext(),
        ),
        null,
      );
    }
  }
});

test("identifies editable fields and contenteditable descendants", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    assert.equal(
      isShortcutEditableTarget({ tagName } as unknown as EventTarget),
      true,
    );
  }
  assert.equal(
    isShortcutEditableTarget({
      isContentEditable: true,
    } as unknown as EventTarget),
    true,
  );
  assert.equal(
    isShortcutEditableTarget({
      closest: () => ({}) as Element,
    } as unknown as EventTarget),
    true,
  );
  assert.equal(
    isShortcutEditableTarget({
      isContentEditable: false,
      closest: () => ({}) as Element,
    } as unknown as EventTarget),
    true,
  );
});

test("yields before resolving during IME, repeated, or already-handled input", () => {
  for (const event of [
    createEvent({ isComposing: true }),
    createEvent({ keyCode: 229 }),
    createEvent({ defaultPrevented: true }),
    createEvent({ repeat: true }),
  ]) {
    assert.equal(resolveKeyboardShortcut(event, createContext()), null);
  }
});

test("yields for editable, modal, menu, reorder, export, and unhydrated states", () => {
  for (const context of [
    createContext({ isEditableTarget: true }),
    createContext({ hasActiveDialog: true }),
    createContext({ hasOpenMenu: true }),
    createContext({ isReordering: true }),
    createContext({ isExportRealm: true }),
    createContext({ isHydrated: false }),
  ]) {
    assert.equal(resolveKeyboardShortcut(createEvent(), context), null);
  }
});
