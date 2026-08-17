import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  const contentSource = await read("src/i18n/content.ts");
  assert.doesNotMatch(
    contentSource,
    /assertLiveExperienceMessageCoverage\(\)/u,
  );

  const mappingObject = extractObjectAfter(
    contentSource,
    "const LIVE_EXPERIENCE_MESSAGE_KEYS",
  );
  const actualExperienceIds = [
    ...mappingObject.matchAll(/^  (?:(?:"([^"]+)")|([A-Za-z0-9_]+)): \{$/gmu),
  ].map((match) => match[1] ?? match[2]);
  const expectedExperienceIds = [];

  assert.equal(new Set(actualExperienceIds).size, actualExperienceIds.length);

  for (const projectId of projectIds) {
    const experiences = JSON.parse(
      await read(`src/projects/${projectId}/live-experiences.json`),
    );
    for (const experience of experiences.filter(
      (candidate) => candidate.status !== "draft",
    )) {
      expectedExperienceIds.push(experience.id);
      const mapping = extractObjectAfter(
        mappingObject,
        mappingKey(experience.id),
      );
      assert.ok(
        mapping,
        `missing i18n mapping for ${projectId}/${experience.id}`,
      );
      const slotMapping = extractObjectAfter(mapping, "slots:");
      for (const slot of experience.slots) {
        assert.match(
          slotMapping,
          new RegExp(`(?:^|\\n)\\s+${escapeKey(slot.id)}: \\{`, "u"),
          `missing i18n slot mapping for ${projectId}/${experience.id}/${slot.id}`,
        );
      }
      const contextIds = (experience.performances ?? []).map(
        (performance) => performance.id,
      );
      if (experience.includeCombinedPerformance && contextIds.length > 1) {
        contextIds.push("both");
      }
      const contextMapping = mapping.includes("contexts:")
        ? extractObjectAfter(mapping, "contexts:")
        : "";
      for (const contextId of contextIds) {
        assert.match(
          contextMapping,
          new RegExp(`(?:^|\\n)\\s+${escapeKey(contextId)}:`, "u"),
          `missing i18n context mapping for ${projectId}/${experience.id}/${contextId}`,
        );
      }
    }
  }

  assert.deepEqual(actualExperienceIds.sort(), expectedExperienceIds.sort());
});

function mappingKey(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)
    ? `${value}:`
    : `${JSON.stringify(value)}:`;
}

function escapeKey(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)
    ? value
    : JSON.stringify(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractObjectAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing source marker: ${marker}`);
  const start = source.indexOf("{", markerIndex + marker.length);
  assert.notEqual(start, -1, `missing object after source marker: ${marker}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`unterminated object after source marker: ${marker}`);
}
