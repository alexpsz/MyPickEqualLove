import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importDataOnlyTypeScript } from "./lib/import-data-only-typescript.mjs";

const projectIds = ["equal-love", "nearly-equal-joy", "not-equal-me"];

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Next selects one fail-closed current-project runtime for both bundlers", async () => {
  const [nextConfigSource, projectSchemaSource] = await Promise.all([
    read("next.config.ts"),
    read("src/schema/project.ts"),
  ]);

  assert.match(
    nextConfigSource,
    /resolveProjectId\(process\.env\.NEXT_PUBLIC_PROJECT_ID\)/u,
  );
  assert.equal(
    nextConfigSource.match(/"@current-project\/runtime"/gu)?.length,
    2,
    "the same virtual module must be configured once for Turbopack and once for webpack",
  );
  assert.match(nextConfigSource, /turbopack:\s*\{[\s\S]*resolveAlias:/u);
  assert.match(nextConfigSource, /webpack\(config\)/u);
  assert.match(nextConfigSource, /output:\s*"export"/u);
  assert.match(nextConfigSource, /trailingSlash:\s*true/u);
  assert.match(nextConfigSource, /unoptimized:\s*true/u);

  assert.match(
    projectSchemaSource,
    /if \(projectId === undefined \|\| projectId === ""\) \{\s*return DEFAULT_PROJECT_ID;/u,
  );
  assert.match(projectSchemaSource, /if \(isProjectId\(projectId\)\)/u);
  assert.match(
    projectSchemaSource,
    /throw new Error\([\s\S]*Unsupported NEXT_PUBLIC_PROJECT_ID/u,
  );
});

test("metadata and i18n modules do not import project payload JSON", async () => {
  for (const relativePath of [
    "src/projects/registry.ts",
    "src/i18n/content.ts",
  ]) {
    const source = await read(relativePath);
    assert.doesNotMatch(source, /(?:songs|members|live-experiences)\.json/u);
  }

  const registrySource = await read("src/projects/registry.ts");
  assert.doesNotMatch(
    registrySource,
    /\b(?:songs|members|liveExperiences)\s*:/u,
  );

  for (const projectId of projectIds) {
    const source = await read(`src/projects/${projectId}/runtime.ts`);
    assert.match(source, new RegExp(`projectId:\\s*"${projectId}"`, "u"));
    assert.equal(source.match(/\.json"/gu)?.length, 3);
    assert.doesNotMatch(
      source,
      new RegExp(
        projectIds.filter((candidate) => candidate !== projectId).join("|"),
        "u",
      ),
    );
  }
});

test("the share-validation manifest closes over authoritative data", async () => {
  const actual = JSON.parse(
    await read("src/projects/share-validation-manifest.json"),
  );
  const projects = {};
  for (const projectId of projectIds) {
    const [songs, liveExperiences] = await Promise.all([
      read(`src/projects/${projectId}/songs.json`).then(JSON.parse),
      read(`src/projects/${projectId}/live-experiences.json`).then(JSON.parse),
    ]);
    projects[projectId] = {
      songIds: songs.map((song) => song.id),
      experiences: Object.fromEntries(
        liveExperiences
          .filter(
            (experience) =>
              experience.status === "published" ||
              experience.status === "archived",
          )
          .map((experience) => [
            experience.id,
            {
              title: experience.title,
              canonicalPath: experience.canonicalPath,
              slots: experience.slots.map((slot) => ({
                id: slot.id,
                eligibility: slot.eligibility,
              })),
              performances: (experience.performances ?? []).map(
                (performance) => ({
                  id: performance.id,
                  songIds: [
                    ...new Set(
                      performance.setlist
                        .slice()
                        .sort((left, right) => left.order - right.order)
                        .map((entry) => entry.songId),
                    ),
                  ],
                }),
              ),
              includeCombinedPerformance: Boolean(
                experience.includeCombinedPerformance,
              ),
            },
          ]),
      ),
    };
  }
  assert.deepEqual(actual, { schemaVersion: 1, projects });
});

test("repository-wide live i18n mappings cover authoritative routable data", async () => {
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
  const { COMBINED_CONTEXT_ID } = projectSchemaModule;
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
