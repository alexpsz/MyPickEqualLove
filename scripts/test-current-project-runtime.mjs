import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importDataOnlyTypeScript } from "./lib/import-data-only-typescript.mjs";

const projectIds = ["equal-love", "nearly-equal-joy", "not-equal-me"];

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [presentationModule, messageModule, projectSchemaModule] =
  await Promise.all([
    importDataOnlyTypeScript("src/i18n/presentation.ts", {
      "../schema/project": "src/schema/project.ts",
    }),
    importDataOnlyTypeScript("src/i18n/messages.ts"),
    importDataOnlyTypeScript("src/schema/project.ts"),
  ]);
const {
  LIVE_EXPERIENCE_PRESENTATION_KEYS,
  localizeLiveExperiencePresentation,
  presentationMessages,
} = presentationModule;
const { messages } = messageModule;
const { COMBINED_CONTEXT_ID, PROJECT_IDS, resolveProjectId } =
  projectSchemaModule;

test("repository-wide live i18n mappings cover authoritative routable data", async () => {
  const expectedExperienceIds = [];
  const authoritativeExperiences = [];

  for (const projectId of projectIds) {
    const experiences = JSON.parse(
      await read(`src/projects/${projectId}/live-experiences.json`),
    );
    for (const experience of experiences.filter(
      (candidate) => candidate.status !== "draft",
    )) {
      expectedExperienceIds.push(experience.id);
      authoritativeExperiences.push(experience);
      const mapping = LIVE_EXPERIENCE_PRESENTATION_KEYS[experience.id];
      assert.ok(
        mapping,
        `missing i18n mapping for ${projectId}/${experience.id}`,
      );
      assert.deepEqual(
        Object.keys(mapping.slots).sort(),
        experience.slots.map((slot) => slot.id).sort(),
        `slot mapping drift for ${projectId}/${experience.id}`,
      );
      const performances = experience.performances ?? [];
      const contextIds = performances.map(({ id }) => id);
      if (experience.includeCombinedPerformance && performances.length > 1) {
        contextIds.push(COMBINED_CONTEXT_ID);
      }
      assert.deepEqual(
        Object.keys(mapping.contexts ?? {}).sort(),
        contextIds.sort(),
        `context mapping drift for ${projectId}/${experience.id}`,
      );
    }
  }

  assert.deepEqual(
    Object.keys(LIVE_EXPERIENCE_PRESENTATION_KEYS).sort(),
    expectedExperienceIds.sort(),
  );

  for (const experience of authoritativeExperiences) {
    const mapping = LIVE_EXPERIENCE_PRESENTATION_KEYS[experience.id];
    for (const locale of ["en", "ja", "zh-CN", "ko"]) {
      const localized = localizeLiveExperiencePresentation(
        experience,
        locale,
        (key) => messages[locale][key],
      );
      assert.equal(localized instanceof Promise, false);
      if (locale === "ja") {
        assert.equal(localized.title, experience.title);
        assert.equal(localized.description, experience.description);
        assert.equal(localized.shareText, experience.share.text);
        assert.deepEqual(localized.slots, experience.slots);
      } else {
        assert.equal(
          localized.title,
          presentationMessages[locale][mapping.title],
        );
        assert.equal(
          localized.description,
          presentationMessages[locale][mapping.description],
        );
        assert.equal(
          localized.shareText,
          presentationMessages[locale][mapping.shareText],
        );
      }
    }
  }
});

test("placeholder tokens stay identical across all four locales", () => {
  // The mapped MessageCatalog type already forces the four catalogs to share a
  // key set, but nothing checks the {tokens} inside the strings. A translation
  // that drops or renames one renders a literal brace to the user.
  const tokens = (value) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

  for (const [catalog, name] of [
    [messages, "common"],
    [presentationMessages, "presentation"],
  ]) {
    const reference = catalog.en;
    for (const locale of ["ja", "zh-CN", "ko"]) {
      const localized = catalog[locale];
      if (!localized) continue;
      for (const key of Object.keys(localized)) {
        if (typeof reference[key] !== "string") continue;
        assert.deepEqual(
          tokens(localized[key]),
          tokens(reference[key]),
          `${name}/${locale} placeholder drift for ${key}`,
        );
      }
    }
  }
});

test("project id resolution defaults, accepts exact ids, and fails loudly", () => {
  assert.equal(resolveProjectId(undefined), "equal-love");
  assert.equal(resolveProjectId(""), "equal-love");
  for (const projectId of PROJECT_IDS) {
    assert.equal(resolveProjectId(projectId), projectId);
  }

  assert.throws(
    () => resolveProjectId("equal_love"),
    (error) =>
      error instanceof Error &&
      error.message.includes("Unsupported NEXT_PUBLIC_PROJECT_ID") &&
      error.message.includes('"equal_love"') &&
      PROJECT_IDS.every((projectId) => error.message.includes(projectId)),
  );
  // A leading space is not a formatting nicety; it is a different id.
  assert.throws(() => resolveProjectId(" equal-love"));
});
