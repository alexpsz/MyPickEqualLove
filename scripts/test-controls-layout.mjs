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
  assert.match(
    controlsSource,
    /grid grid-cols-2 gap-2 sm:hidden[\s\S]*controls\.searchSongs[\s\S]*controls\.pickAssistant[\s\S]*controls\.generateImage[\s\S]*controls\.more/,
    "mobile must retain search, assistant, generation, and More in its first control layer",
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
    /isMobileDetailsOpen \? "block md:block" : "hidden md:block"/,
    "activity copy should stay available on desktop while defaulting closed on mobile",
  );
});
