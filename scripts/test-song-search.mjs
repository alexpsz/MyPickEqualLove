import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const sourceUrl = new URL("../src/utils/songSearch.ts", import.meta.url);
const creditsSourceUrl = new URL(
  "../src/utils/songCredits.ts",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");
const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
};
const creditsSource = await readFile(creditsSourceUrl, "utf8");
const creditsCompiled = ts.transpileModule(creditsSource, {
  compilerOptions,
  fileName: creditsSourceUrl.pathname,
}).outputText;
const creditsModuleUrl = `data:text/javascript;base64,${Buffer.from(creditsCompiled).toString("base64")}`;
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      ...compilerOptions,
    },
    fileName: sourceUrl.pathname,
  })
  .outputText.replace('"./songCredits"', JSON.stringify(creditsModuleUrl));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const {
  getFirstSearchResultForEnter,
  normalizeSongSearchText,
  rankSongsByQuery,
} = await import(moduleUrl);

const membersById = {
  member: {
    id: "member",
    name: { ja: "大谷 映美里", romaji: "Otani Emiri" },
    active: true,
    sortOrder: 1,
  },
};

const songs = [
  createSong("secondary", "別の曲", "Betsu no Kyoku", {
    artist: { ja: "＝LOVE", romaji: "Equal Love" },
    memberIds: ["member"],
  }),
  createSong("contains", "クリエイトラブ", "Create Love"),
  createSong("prefix", "ラブソング", "Love Song"),
  createSong("exact", "ラブ", "Love"),
  createSong("stable-a", "同じ曲 A", "Stable Song A"),
  createSong("stable-b", "同じ曲 B", "Stable Song B"),
];

test("normalizes NFKC, kana, case, whitespace, and symbols", () => {
  assert.equal(normalizeSongSearchText(" ＬＯＶＥ！ "), "love");
  assert.equal(normalizeSongSearchText("ラブ・ソング"), "らぶそんぐ");
  assert.equal(normalizeSongSearchText("らぶソング"), "らぶそんぐ");
  assert.equal(normalizeSongSearchText("＝LOVE"), "=love");
});

test("orders title relevance before secondary matches and preserves source order", () => {
  assert.deepEqual(
    rankSongsByQuery(songs, "love", membersById).map(({ song }) => song.id),
    ["exact", "prefix", "contains", "secondary"],
  );
  assert.deepEqual(
    rankSongsByQuery(songs, "stable song", membersById).map(
      ({ song }) => song.id,
    ),
    ["stable-a", "stable-b"],
  );
});

test("adds only conservative one-edit Latin title tolerance", () => {
  assert.equal(
    rankSongsByQuery(songs, "lovr", membersById).length,
    0,
    "short queries must not fuzzy-match",
  );
  assert.deepEqual(
    rankSongsByQuery(songs, "stablr song a", membersById).map(
      ({ song }) => song.id,
    ),
    ["stable-a"],
  );
  assert.deepEqual(
    rankSongsByQuery(songs, "stabel song a", membersById).map(
      ({ song }) => song.id,
    ),
    ["stable-a"],
  );
  assert.equal(rankSongsByQuery(songs, "unrelated", membersById).length, 0);
});

test("Enter selects the first ranked result but not during IME or modifiers", () => {
  const ranked = rankSongsByQuery(songs, "love", membersById).map(
    ({ song }) => song,
  );
  assert.equal(
    getFirstSearchResultForEnter(ranked, { key: "Enter" })?.id,
    "exact",
  );
  assert.equal(
    getFirstSearchResultForEnter(ranked, {
      key: "Enter",
      isComposing: true,
    }),
    undefined,
  );
  assert.equal(
    getFirstSearchResultForEnter(ranked, { key: "Enter", shiftKey: true }),
    undefined,
  );
  assert.equal(getFirstSearchResultForEnter([], { key: "Enter" }), undefined);
  assert.equal(
    getFirstSearchResultForEnter(ranked, { key: "Escape" }),
    undefined,
  );
});

function createSong(id, ja, romaji, overrides = {}) {
  return {
    id,
    title: { ja, romaji },
    artist: { ja: "テスト", romaji: "Test" },
    coverUrl: `/covers/${id}.jpg`,
    credits: {
      lyricist: { ja: "作詞者", romaji: "Lyricist" },
      composer: { ja: "作曲者", romaji: "Composer" },
      arranger: { ja: "編曲者", romaji: "Arranger" },
    },
    ...overrides,
  };
}
