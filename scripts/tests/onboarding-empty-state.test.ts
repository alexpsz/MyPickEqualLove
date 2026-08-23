import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OnboardingEmptyState, {
  type OnboardingEmptyStateCopy,
} from "../../src/components/OnboardingEmptyState";
import { messages } from "../../src/i18n/messages";
import {
  completeOnboarding,
  loadOnboardingState,
} from "../../src/utils/onboardingState";
import { DIALOG_RETURN_KEYS } from "../../src/utils/useDialogA11y";

const STORAGE_KEY = "equal_love_onboarding_v1";

class MemoryStorage {
  readonly values = new Map<string, string>();
  writes = 0;
  failReads = false;
  failWrites = false;

  getItem(key: string) {
    if (this.failReads) throw new Error("read blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("write blocked");
    this.writes += 1;
    this.values.set(key, value);
  }
}

const copy: OnboardingEmptyStateCopy = {
  title: "Start",
  description: "Choose a path",
  searchTitle: "Search songs",
  searchDescription: "Browse songs",
  assistantTitle: "Use Assistant",
  assistantDescription: "Compare songs",
  importTitle: "Import link",
  importDescription: "Review a shared board",
  dismiss: "Hide guide",
};

test("missing onboarding state completes once and persists across loads", () => {
  const storage = new MemoryStorage();

  assert.deepEqual(loadOnboardingState(storage, STORAGE_KEY), {
    status: "missing",
  });
  assert.deepEqual(completeOnboarding(storage, STORAGE_KEY), {
    status: "completed",
  });
  assert.equal(storage.writes, 1);
  assert.deepEqual(loadOnboardingState(storage, STORAGE_KEY), {
    status: "completed",
  });
  assert.deepEqual(completeOnboarding(storage, STORAGE_KEY), {
    status: "completed",
  });
  assert.equal(storage.writes, 1);
});

test("unknown or illegal onboarding documents fail closed without overwrite", () => {
  for (const raw of [
    "not-json",
    "null",
    "[]",
    JSON.stringify({ version: 2, completed: true }),
    JSON.stringify({ version: 1, completed: false }),
    JSON.stringify({ version: 1, completed: true, extra: true }),
  ]) {
    const storage = new MemoryStorage();
    storage.values.set(STORAGE_KEY, raw);

    assert.deepEqual(loadOnboardingState(storage, STORAGE_KEY), {
      status: "blocked",
      reason: "invalid",
    });
    assert.deepEqual(completeOnboarding(storage, STORAGE_KEY), {
      status: "blocked",
      reason: "invalid",
    });
    assert.equal(storage.values.get(STORAGE_KEY), raw);
    assert.equal(storage.writes, 0);
  }
});

test("storage read and write failures fail closed", () => {
  const readFailure = new MemoryStorage();
  readFailure.failReads = true;
  assert.deepEqual(loadOnboardingState(readFailure, STORAGE_KEY), {
    status: "blocked",
    reason: "unavailable",
  });
  assert.deepEqual(completeOnboarding(readFailure, STORAGE_KEY), {
    status: "blocked",
    reason: "unavailable",
  });
  assert.equal(readFailure.writes, 0);

  const writeFailure = new MemoryStorage();
  writeFailure.failWrites = true;
  assert.deepEqual(completeOnboarding(writeFailure, STORAGE_KEY), {
    status: "blocked",
    reason: "unavailable",
  });
  assert.equal(writeFailure.values.has(STORAGE_KEY), false);
});

test("standard and Live empty states render the same three real actions", () => {
  for (const variant of ["standard", "live"] as const) {
    const markup = renderToStaticMarkup(
      createElement(OnboardingEmptyState, {
        variant,
        copy,
        onSearch: () => {},
        onOpenAssistant: () => {},
        onImportShareLink: () => {},
        onDismiss: () => {},
      }),
    );

    assert.match(
      markup,
      new RegExp(`data-onboarding-empty-state="${variant}"`),
    );
    for (const action of ["search", "assistant", "import", "dismiss"]) {
      assert.match(markup, new RegExp(`data-onboarding-action="${action}"`));
    }
    for (const [action, returnFocusKey] of [
      ["search", DIALOG_RETURN_KEYS.onboardingSearch],
      ["assistant", DIALOG_RETURN_KEYS.onboardingAssistant],
      ["import", DIALOG_RETURN_KEYS.onboardingImport],
    ] as const) {
      assert.match(
        markup,
        new RegExp(
          `data-onboarding-action="${action}"[^>]*data-dialog-return-key="${returnFocusKey}"`,
        ),
      );
    }
    assert.equal((markup.match(/<button/g) ?? []).length, 4);
  }
});

test("all four catalogs expose an isomorphic onboarding copy surface", () => {
  const requiredKeys = [
    "onboarding.searchTitle",
    "onboarding.assistantTitle",
    "onboarding.importTitle",
    "onboarding.standard.title",
    "onboarding.standard.description",
    "onboarding.standard.searchDescription",
    "onboarding.standard.assistantDescription",
    "onboarding.standard.importDescription",
    "onboarding.live.title",
    "onboarding.live.description",
    "onboarding.live.searchDescription",
    "onboarding.live.assistantDescription",
    "onboarding.live.importDescription",
    "onboarding.dismiss",
    "onboarding.reopen",
    "onboarding.importPrompt",
  ] as const;
  const englishKeys = Object.keys(messages.en).sort();

  for (const catalog of Object.values(messages)) {
    assert.deepEqual(Object.keys(catalog).sort(), englishKeys);
    for (const key of requiredKeys) {
      assert.equal(typeof catalog[key], "string");
      assert.notEqual(catalog[key].trim(), "");
    }
  }
});

test("client wiring preserves parser reuse, focus return, and first-pick dismissal", () => {
  const repositoryRoot = process.cwd();
  const clientSource = readFileSync(
    resolve(repositoryRoot, "src/components/PickExperienceClient.tsx"),
    "utf8",
  );
  const configSource = readFileSync(
    resolve(repositoryRoot, "src/config/project.ts"),
    "utf8",
  );
  const controlsSource = readFileSync(
    resolve(repositoryRoot, "src/components/Controls.tsx"),
    "utf8",
  );

  assert.match(configSource, /onboarding: `\$\{storagePrefix\}_onboarding_v1`/);
  assert.match(
    clientSource,
    /onboardingVariant = isStandard \? "standard" : "live"/,
  );
  assert.match(
    clientSource,
    /manualOnboardingOpen\s*\|\|\s*\(\s*selectedPickCount === 0\s*&&\s*onboardingVisibility === "visible"\s*\)/,
  );
  assert.match(
    clientSource,
    /selectedPickCount === 0[\s\S]*?finishOnboarding\(\);/,
  );
  assert.match(clientSource, /onSearch=\{handleOnboardingSearchClick\}/);
  assert.match(
    clientSource,
    /onOpenAssistant=\{handleOnboardingOpenPickAssistant\}/,
  );
  assert.match(
    clientSource,
    /onImportShareLink=\{handleOnboardingImportBoardShareLink\}/,
  );
  assert.match(clientSource, /onDismiss=\{handleDismissOnboarding\}/);
  assert.match(
    clientSource,
    /const \[manualOnboardingOpen, setManualOnboardingOpen\] = useState\(false\);/,
  );
  assert.match(
    clientSource,
    /const handleOpenOnboarding = useCallback\([\s\S]*?onboardingReturnFocusRef\.current = trigger;[\s\S]*?setManualOnboardingOpen\(true\);[\s\S]*?requestAnimationFrame[\s\S]*?data-onboarding-action="search"/,
  );
  assert.match(
    clientSource,
    /const handleDismissOnboarding = useCallback\([\s\S]*?if \(!manualOnboardingOpen\)[\s\S]*?finishOnboarding\(\);[\s\S]*?return;[\s\S]*?setManualOnboardingOpen\(false\);[\s\S]*?returnTarget\.focus\(\)/,
  );
  assert.equal(
    (clientSource.match(/setManualOnboardingOpen\(false\)/g) ?? []).length,
    1,
    "only an explicit manual dismissal may close the reopened guide",
  );
  const firstPickEffects = clientSource.slice(
    clientSource.indexOf("const result = loadOnboardingState"),
    clientSource.indexOf("const oshimenMember"),
  );
  const commitMutation = clientSource.slice(
    clientSource.indexOf("const commitUserMutation"),
    clientSource.indexOf("const applyHistoryAction"),
  );
  assert.doesNotMatch(firstPickEffects, /setManualOnboardingOpen/);
  assert.doesNotMatch(commitMutation, /setManualOnboardingOpen/);
  assert.match(clientSource, /onOpenOnboarding=\{handleOpenOnboarding\}/);
  assert.match(clientSource, /isOnboardingVisible=\{showOnboarding\}/);
  assert.match(
    clientSource,
    /data-onboarding-mode=\{[\s\S]*?manualOnboardingOpen \? "manual" : "first-run"/,
  );
  assert.match(
    controlsSource,
    /onOpenOnboarding: \(trigger: HTMLButtonElement\) => void;/,
  );
  assert.equal(
    (controlsSource.match(/data-onboarding-reopen-entry=/g) ?? []).length,
    2,
    "mobile More and desktop controls must each expose a reopen entry",
  );
  assert.equal(
    (controlsSource.match(/disabled=\{isOnboardingVisible\}/g) ?? []).length,
    2,
  );
  assert.match(
    controlsSource,
    /if \(!isMoreOpen \|\| isOnboardingManuallyOpen\) return;/,
  );
  assert.match(
    clientSource,
    /const handleOnboardingImportBoardShareLink = \(\) => \{[\s\S]*?returnFocusKey: DIALOG_RETURN_KEYS\.onboardingImport/,
  );
  assert.match(
    clientSource,
    /returnFocusKey=\{boardShareReturnFocusKeyRef\.current\}/,
  );
  assert.match(
    clientSource,
    /returnFocusKey=\{pickAssistantReturnFocusKeyRef\.current\}/,
  );
  assert.match(
    clientSource,
    /returnFocusKey=\{searchPresentation\.returnFocusKey\}[\s\S]*?returnFocusFallbackKey=\{DIALOG_RETURN_KEYS\.globalSearch\}/,
  );
  assert.match(
    clientSource,
    /returnFocusKey=\{pickAssistantReturnFocusKeyRef\.current\}[\s\S]*?returnFocusFallbackKey=\{DIALOG_RETURN_KEYS\.pickAssistant\}/,
  );
  assert.equal(
    (clientSource.match(/prepareBoardShareImport\(\{/g) ?? []).length,
    2,
    "automatic hash imports and onboarding imports must share one parser path",
  );
});
