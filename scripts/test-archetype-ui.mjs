import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Data contracts for the MyPick Archetype static documents.
 *
 * Scope: the JSON that ships with the feature. Nothing here reads component
 * source — how the client wires these documents is a refactoring detail, while
 * the documents themselves span four locales, ten characters and 85 songs and
 * cannot be checked by eye.
 */

const read = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

const [
  uiSource,
  approvedAffinitiesSource,
  sourceMapSource,
  songsSource,
  membersSource,
  charactersEnSource,
  charactersZhCnSource,
  charactersJaSource,
  charactersKoSource,
] = await Promise.all([
  read("../src/projects/equal-love/archetype-21/ui.json"),
  read("../src/projects/equal-love/archetype-21/song-affinities.json"),
  read("./archetype/source-map.json"),
  read("../src/projects/equal-love/songs.json"),
  read("../src/projects/equal-love/members.json"),
  read("../src/projects/equal-love/archetype-21/characters.en.json"),
  read("../src/projects/equal-love/archetype-21/characters.zh-CN.json"),
  read("../src/projects/equal-love/archetype-21/characters.ja.json"),
  read("../src/projects/equal-love/archetype-21/characters.ko.json"),
]);

const LOCALES = ["en", "zh-CN", "ja", "ko"];

function countSentences(value, locale) {
  const punctuation = locale === "en" ? /[.!?]+/g : /[。！？.!?]+/g;
  return value.match(punctuation)?.length ?? 0;
}

function placeholders(value) {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
}

test("the approved affinity document closes over the shipped song catalog", () => {
  const document = JSON.parse(approvedAffinitiesSource);
  const sourceMap = JSON.parse(sourceMapSource);
  const catalog = JSON.parse(songsSource);

  assert.equal(document.schemaVersion, 1);
  assert.equal(document.campaignId, "equal-love-archetype-21");
  assert.equal(document.projectId, "equal-love");
  assert.equal(document.rubricVersion, "gemini-video-v1");
  assert.equal(document.songAffinities.length, 85);

  // The three files must agree exactly, in order: a song added to the catalog
  // without a reviewed fingerprint would silently skew every match.
  const songIds = document.songAffinities.map(({ songId }) => songId);
  assert.deepEqual(
    songIds,
    sourceMap.songs.map(({ songId }) => songId),
    "affinity document and source map disagree",
  );
  assert.deepEqual(
    songIds,
    catalog.map(({ id }) => id),
    "affinity document and songs.json disagree",
  );
});

test("every song fingerprint is approved and uses the canonical 2 + 1 + 5 shape", () => {
  const { songAffinities } = JSON.parse(approvedAffinitiesSource);

  for (const affinity of songAffinities) {
    assert.equal(affinity.status, "approved", affinity.songId);
    assert.equal(affinity.rubricVersion, "gemini-video-v1", affinity.songId);

    const scores = Object.values(affinity.scores);
    assert.equal(scores.length, 8, `${affinity.songId} trait count`);
    assert.equal(
      scores.filter((score) => score === 2).length,
      2,
      `${affinity.songId} dominant traits`,
    );
    assert.equal(
      scores.filter((score) => score === 1).length,
      1,
      `${affinity.songId} accent trait`,
    );
    assert.equal(
      scores.filter((score) => score === 0).length,
      5,
      `${affinity.songId} zero traits`,
    );
  }
});

test("character catalogs cover the same ten roles in every locale", () => {
  const memberIds = new Set(JSON.parse(membersSource).map(({ id }) => id));
  const catalogs = {
    en: JSON.parse(charactersEnSource),
    "zh-CN": JSON.parse(charactersZhCnSource),
    ja: JSON.parse(charactersJaSource),
    ko: JSON.parse(charactersKoSource),
  };

  const englishCharacters = catalogs.en.characters;
  assert.equal(englishCharacters.length, 10);

  const roleIds = englishCharacters.map(({ roleId }) => roleId);
  assert.equal(new Set(roleIds).size, 10, "role ids must be unique");

  for (const character of englishCharacters) {
    assert.ok(
      memberIds.has(character.memberId),
      `${character.roleId}: memberId ${character.memberId} is not in members.json`,
    );
  }

  for (const locale of ["zh-CN", "ja", "ko"]) {
    assert.deepEqual(
      Object.keys(catalogs[locale].characters),
      roleIds,
      `${locale} role closure`,
    );
  }
});

test("export summaries stay within the poster's length budget", () => {
  // The dossier reserves a fixed block for this text; overflow clips in the
  // exported PNG, which no reviewer sees until after a share.
  const catalogs = {
    en: JSON.parse(charactersEnSource).characters,
    "zh-CN": Object.values(JSON.parse(charactersZhCnSource).characters),
    ja: Object.values(JSON.parse(charactersJaSource).characters),
    ko: Object.values(JSON.parse(charactersKoSource).characters),
  };
  const bounds = { en: [55, 175], other: [35, 95] };

  for (const [locale, characters] of Object.entries(catalogs)) {
    const [min, max] = locale === "en" ? bounds.en : bounds.other;
    for (const character of characters) {
      const summary = character.exportSummary;
      assert.ok(
        summary.length >= min && summary.length <= max,
        `${locale}: exportSummary length ${summary.length} outside ${min}..${max}`,
      );
      const sentences = countSentences(summary, locale);
      assert.ok(
        sentences >= 1 && sentences <= 2,
        `${locale}: exportSummary has ${sentences} sentences, expected 1 or 2`,
      );
    }
  }
});

test("ui.json carries every locale and required entry key", () => {
  const ui = JSON.parse(uiSource);
  assert.deepEqual(Object.keys(ui.locales).sort(), [...LOCALES].sort());

  const requiredEntryKeys = [
    "campaignLabel",
    "emptyTitle",
    "emptyDescription",
    "incompleteTitle",
    "readyTitle",
    "startCta",
    "continueCta",
    "readyCta",
  ];

  for (const [locale, copy] of Object.entries(ui.locales)) {
    for (const key of requiredEntryKeys) {
      assert.equal(typeof copy.entry[key], "string", `${locale}.entry.${key}`);
      assert.ok(
        copy.entry[key].trim().length > 0,
        `${locale}.entry.${key} is blank`,
      );
    }
    for (const key of ["title", "metadata", "result", "export"]) {
      assert.ok(copy[key], `${locale}.${key} is missing`);
    }
  }
});

test("ui.json placeholders match what the renderer supplies", () => {
  const ui = JSON.parse(uiSource);

  for (const [locale, copy] of Object.entries(ui.locales)) {
    assert.deepEqual(
      placeholders(copy.entry.incompleteRemaining),
      ["remaining"],
      `${locale}.entry.incompleteRemaining`,
    );
    assert.deepEqual(
      placeholders(copy.result.singleLead),
      ["characterName"],
      `${locale}.result.singleLead`,
    );
    for (const key of ["previewLabel", "shareText"]) {
      assert.deepEqual(
        placeholders(copy.export[key]),
        ["characterNames"],
        `${locale}.export.${key}`,
      );
    }
  }
});

test("result copy cites Top 10 and never exposes the internal correction", () => {
  // architecture.md: the result may only say it derives from the user's Top 10.
  // Adjusted scores are an internal ranking device with no user-facing unit and
  // must not surface as a similarity, percentage, or "corrected" score.
  const ui = JSON.parse(uiSource);

  for (const [locale, copy] of Object.entries(ui.locales)) {
    assert.match(copy.result.singleLead, /Top 10/, `${locale} singleLead`);
    assert.match(copy.result.tieLead, /Top 10/, `${locale} tieLead`);
    assert.doesNotMatch(
      `${copy.title} ${copy.result.singleLead} ${copy.result.tieLead}`,
      /adjust|校正|補正|보정|unadjusted|未经校正|補正前|보정 전/i,
      `${locale} leaks the internal score correction`,
    );
  }
});

test("retired copy keys stay retired", () => {
  // These were removed when the result stopped claiming a similarity score.
  // Reintroducing them would bring the claim back with them.
  const ui = JSON.parse(uiSource);

  for (const [locale, copy] of Object.entries(ui.locales)) {
    assert.equal(
      "singleKicker" in copy.result,
      false,
      `${locale} singleKicker`,
    );
    assert.equal("tieKicker" in copy.result, false, `${locale} tieKicker`);
    assert.equal("title" in copy.labels, false, `${locale} labels.title`);
  }
});
