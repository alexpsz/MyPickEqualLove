import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controlsSource = await readFile(
  new URL("../src/components/Controls.tsx", import.meta.url),
  "utf8",
);
const clientSource = await readFile(
  new URL("../src/components/PickExperienceClient.tsx", import.meta.url),
  "utf8",
);
const headerSource = await readFile(
  new URL("../src/components/Header.tsx", import.meta.url),
  "utf8",
);
const contextSelectorSource = clientSource.slice(
  clientSource.indexOf("function ContextSelector("),
  clientSource.indexOf("const ACTIVE_MEMBERS_BY_SORT_ORDER"),
);

test("control actions cannot consume the context selector's desktop column", () => {
  assert.doesNotMatch(
    controlsSource,
    /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/,
    "the intrinsic width of the action row must not squeeze the configuration row",
  );
  assert.match(
    controlsSource,
    /lg:grid-cols-\[minmax\(220px,0\.72fr\)_minmax\(420px,1fr\)\]/,
    "desktop nickname and context columns need explicit, non-zero width priorities",
  );

  const actionsStart = controlsSource.indexOf(
    '<div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">',
  );
  const desktopConfigurationStart = controlsSource.indexOf(
    "lg:grid-cols-[minmax(220px,0.72fr)_minmax(420px,1fr)]",
  );
  assert.ok(
    desktopConfigurationStart >= 0 && actionsStart > desktopConfigurationStart,
  );
});

test("context selector remains one stable three-segment control", () => {
  assert.match(contextSelectorSource, /grid w-full grid-cols-3/);
  assert.match(contextSelectorSource, /sm:min-w-\[420px\]/);
  assert.doesNotMatch(
    contextSelectorSource,
    /flex-wrap/,
    "individual context segments must never wrap into another row",
  );
  assert.match(contextSelectorSource, /min-h-11 min-w-0/);
  assert.match(contextSelectorSource, /sm:whitespace-nowrap/);
});

test("mobile keeps each context label and date intact inside its own segment", () => {
  assert.match(
    contextSelectorSource,
    /flex flex-col items-center justify-center[\s\S]*sm:flex-row/,
  );
  assert.equal(
    (contextSelectorSource.match(/className="whitespace-nowrap"/g) ?? [])
      .length,
    2,
    "both the context label and its optional date need explicit no-wrap boundaries",
  );
  assert.match(
    contextSelectorSource,
    /aria-label=\{[\s\S]*context\.label[\s\S]*context\.shortDateLabel/,
    "the compact visual treatment must retain an explicit accessible name",
  );
});

test("mobile promotes the selection path and conditionally renders advanced controls", () => {
  const mobilePrimaryActionsStart = controlsSource.indexOf(
    '<div className="grid grid-cols-3 gap-2 sm:hidden">',
  );
  const mobilePrimaryActionsEnd = controlsSource.indexOf(
    "{isMoreOpen ? (",
    mobilePrimaryActionsStart,
  );
  const mobilePrimaryActions = controlsSource.slice(
    mobilePrimaryActionsStart,
    mobilePrimaryActionsEnd,
  );

  assert.match(
    mobilePrimaryActions,
    /controls\.searchSongs[\s\S]*controls\.pickAssistant[\s\S]*controls\.generateImage/,
    "the one-row mobile action grid must retain search, assistant, and generation",
  );
  assert.doesNotMatch(
    mobilePrimaryActions,
    /controls\.more/,
    "More belongs in the compact metric header, not as a fourth primary action",
  );
  assert.match(
    controlsSource,
    /selectedCount\}\/\{slotCount\}[\s\S]*controls\.more[\s\S]*sm:hidden/,
    "More must stay adjacent to the mobile progress metrics",
  );
  assert.match(
    controlsSource,
    /\{isMoreOpen \? \([\s\S]*id=\{morePanelId\}[\s\S]*export-nickname-mobile/,
    "closed advanced controls must not remain in the document or tab order",
  );
  assert.match(
    controlsSource,
    /if \(!controlsRef\.current\?\.contains\(event\.target as Node\)\)[\s\S]*closeMore\(\)/,
    "an outside pointer interaction must close More",
  );
  assert.match(
    controlsSource,
    /event\.key !== "Escape"[\s\S]*closeMore\(\)/,
    "Escape must close More and restore the trigger focus",
  );
  assert.match(
    controlsSource,
    /\{hasPicks \? \([\s\S]*controls\.clear[\s\S]*\) : null\}/,
    "the destructive control belongs at the bottom of More and is absent on an empty board",
  );
  assert.match(
    controlsSource,
    /const handleMobileClearAll = \(\) => \{[\s\S]*const clearButton = mobileClearButtonRef\.current;[\s\S]*if \(onClearAll\(\)\) \{[\s\S]*setIsMoreOpen\(false\);[\s\S]*requestAnimationFrame\(focusVisibleMoreButton\);[\s\S]*return;/,
    "a successful mobile clear must close More and restore focus to its visible trigger",
  );
  assert.match(
    controlsSource,
    /window\.requestAnimationFrame\(\(\) => \{[\s\S]*if \(clearButton\?\.isConnected\) return;[\s\S]*focusVisibleMoreButton\(\);/,
    "a failed clear must preserve its focus when the button remains mounted, but repair focus if an external update unmounts it",
  );
  assert.match(
    controlsSource,
    /ref=\{mobileClearButtonRef\}[\s\S]*onClick=\{handleMobileClearAll\}[\s\S]*controls\.clear/,
    "mobile Clear must use the success-aware wrapper instead of forwarding directly",
  );
  assert.match(
    controlsSource,
    /onClick=\{onClearAll\}[\s\S]*disabled=\{!hasPicks\}/,
    "desktop Clear must continue using its existing always-mounted behavior",
  );
  assert.match(
    clientSource,
    /const handleClearAllPicks = \(\) => \{[\s\S]*if \(!window\.confirm\(t\("errors\.clearAllConfirm"\)\)\) return false;[\s\S]*return commitUserMutation\("clear", \{\}\);/,
    "the parent clear handler must distinguish cancellation from a successful mutation",
  );
});

test("special activity details collapse only on mobile", () => {
  assert.match(
    clientSource,
    /collapseDetailsOnMobile=\{!isStandard\}/,
    "standard My Pick must remain concise without gaining an activity disclosure",
  );
  assert.match(
    controlsSource,
    /<div className="grid gap-3 sm:hidden">\{children\}<\/div>/,
    "the special context selector must remain directly before mobile actions",
  );
  assert.match(headerSource, /collapseDetailsOnMobile = false/);
  assert.match(
    headerSource,
    /const subtitleContent[\s\S]*resolvedSubtitle[\s\S]*\{subtitleContent\}[\s\S]*collapseDetailsOnMobile/,
    "the concise subtitle must remain visible before the mobile disclosure",
  );
  assert.match(
    headerSource,
    /id=\{mobileDetailsId\}[\s\S]*\{extendedDetails\}/,
    "only the extended description and metadata belong in the activity disclosure",
  );
  assert.match(
    headerSource,
    /isMobileDetailsOpen \? "block md:block" : "hidden md:block"/,
    "activity copy should stay available on desktop while defaulting closed on mobile",
  );
  assert.match(
    clientSource,
    /returnFocusKey=\{DIALOG_RETURN_KEYS\.generateImage\}[\s\S]*returnFocusFallbackKey=\{DIALOG_RETURN_KEYS\.globalSearch\}/,
    "responsive duplicate action markup must retain a visible keyed focus fallback",
  );
});
