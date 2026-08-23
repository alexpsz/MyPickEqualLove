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

test("client wiring reuses existing handlers and hides after the first pick", () => {
  const repositoryRoot = process.cwd();
  const clientSource = readFileSync(
    resolve(repositoryRoot, "src/components/PickExperienceClient.tsx"),
    "utf8",
  );
  const configSource = readFileSync(
    resolve(repositoryRoot, "src/config/project.ts"),
    "utf8",
  );

  assert.match(
    configSource,
    /onboarding: `\$\{PROJECT_CONFIG\.storagePrefix\}_onboarding_v1`/,
  );
  assert.match(
    clientSource,
    /onboardingVariant = isStandard \? "standard" : "live"/,
  );
  assert.match(
    clientSource,
    /selectedPickCount === 0\s*&&\s*onboardingVisibility === "visible"/,
  );
  assert.match(
    clientSource,
    /selectedPickCount === 0[\s\S]*?finishOnboarding\(\);/,
  );
  assert.match(clientSource, /onSearch=\{handleGlobalSearchClick\}/);
  assert.match(clientSource, /onOpenAssistant=\{handleOpenPickAssistant\}/);
  assert.match(
    clientSource,
    /onImportShareLink=\{handleImportBoardShareLink\}/,
  );
  assert.match(clientSource, /onDismiss=\{finishOnboarding\}/);
  assert.match(
    clientSource,
    /const handleImportBoardShareLink = \(\) => \{[\s\S]*?prepareBoardShareImport\(\{ originalUrl, originalHash \}\);/,
  );
  assert.equal(
    (clientSource.match(/prepareBoardShareImport\(\{/g) ?? []).length,
    2,
    "automatic hash imports and onboarding imports must share one parser path",
  );
});
