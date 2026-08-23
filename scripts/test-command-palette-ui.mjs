import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (relativePath) =>
  readFileSync(resolve(repositoryRoot, relativePath), "utf8");

const clientSource = read("src/components/PickExperienceClient.tsx");
const controlsSource = read("src/components/Controls.tsx");
const paletteSource = read("src/components/CommandPalette.tsx");
const messagesSource = read("src/i18n/messages.ts");

for (const action of [
  "search",
  "pick-assistant",
  "board-library",
  "undo",
  "redo",
  "preview",
  "archetype",
]) {
  assert.match(clientSource, new RegExp(`action: "${action}"`));
}

assert.match(
  clientSource,
  /pendingCommandPaletteActionRef\.current = action;\s*setCommandPaletteView\(null\);/,
);
assert.match(
  clientSource,
  /const handleCommandPaletteExitComplete = \(\) => \{[\s\S]*?window\.requestAnimationFrame\(\(\) => runCommandPaletteAction\(action\)\);/,
);
assert.match(
  clientSource,
  /<MotionPresence\s+[\s\S]*?value=\{commandPaletteView\}[\s\S]*?onExitComplete=\{handleCommandPaletteExitComplete\}/,
);

const shortcutHandler = clientSource.slice(
  clientSource.indexOf("const handleKeyboardShortcut"),
  clientSource.indexOf(
    'window.addEventListener("keydown", handleKeyboardShortcut)',
  ),
);
assert.match(
  shortcutHandler,
  /if \(!action\) return;[\s\S]*?event\.preventDefault\(\);/,
);
assert.match(shortcutHandler, /\[aria-modal="true"\], dialog\[open\]/);
assert.match(
  shortcutHandler,
  /\[role="menu"\], \[role="listbox"\], \[aria-haspopup="menu"\]\[aria-expanded="true"\], \[aria-haspopup="listbox"\]\[aria-expanded="true"\]/,
);
assert.doesNotMatch(shortcutHandler, /, \[aria-expanded="true"\]/);
assert.match(clientSource, /:popover-open/);
assert.match(
  shortcutHandler,
  /\[data-reorder-source="true"\], \[data-dragging="true"\]/,
);

const digitFocusBranch = shortcutHandler.slice(
  shortcutHandler.indexOf('if (action.type === "focus-slot")'),
  shortcutHandler.indexOf("event.preventDefault();\n      if (action.type"),
);
assert.match(digitFocusBranch, /slot\.scrollIntoView\(/);
assert.match(digitFocusBranch, /slotAction\.focus\(/);
assert.doesNotMatch(digitFocusBranch, /\.click\(/);

const mobilePrimaryActionsStart = controlsSource.indexOf(
  '<div className="grid grid-cols-3 gap-2 sm:hidden">',
);
const mobilePrimaryActions = controlsSource.slice(
  mobilePrimaryActionsStart,
  controlsSource.indexOf("{isMoreOpen ?", mobilePrimaryActionsStart),
);
const mobileAssistantAction = mobilePrimaryActions.slice(
  mobilePrimaryActions.indexOf("ref={pickAssistantButtonRef}"),
  mobilePrimaryActions.indexOf(
    "</button>",
    mobilePrimaryActions.indexOf("ref={pickAssistantButtonRef}"),
  ),
);

assert.match(mobilePrimaryActions, /grid grid-cols-3 gap-2 sm:hidden/);
assert.equal(
  (mobilePrimaryActions.match(/<button/g) ?? []).length,
  3,
  "mobile primary controls must contain exactly search, Assistant, and generate",
);
assert.doesNotMatch(controlsSource, /data-command-palette-entry="mobile"/);
assert.match(controlsSource, /data-command-palette-entry="desktop"/);
assert.match(mobileAssistantAction, /t\("controls\.pickAssistant"\)/);
assert.doesNotMatch(mobileAssistantAction, /pickAssistantShort|truncate/);
assert.match(paletteSource, /role="dialog"/);
assert.match(paletteSource, /aria-modal="true"/);
assert.match(paletteSource, /useDialogA11y\(/);
assert.doesNotMatch(paletteSource, /(bg-white|#fff(?:fff)?|white\/)/i);

for (const key of [
  "commands.entry",
  "commands.title",
  "commands.filterLabel",
  "commands.shortcuts",
  "shortcuts.title",
  "shortcuts.focusSlots",
  "shortcuts.yieldDescription",
]) {
  const matches = messagesSource.match(
    new RegExp(`"${key.replace(".", "\\.")}":`, "g"),
  );
  assert.equal(matches?.length, 4, `${key} must exist in all four catalogs`);
}

console.log("Command palette UI contracts passed.");
