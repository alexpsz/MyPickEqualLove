import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const sourceUrl = new URL("../src/utils/songSearch.ts", import.meta.url);
const storageSourceUrl = new URL(
  "../src/utils/songDiscoveryStorage.ts",
  import.meta.url,
);
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
  filterSongsForSearch,
  getFirstSearchResultForEnter,
  isGraduatedMemberVisibilityFilterActive,
  normalizeSongSearchText,
  rankSongsByQuery,
  shouldShowGraduatedMemberFeaturesByDefault,
} = await import(moduleUrl);
const storageSource = await readFile(storageSourceUrl, "utf8");
const storageCompiled = ts.transpileModule(storageSource, {
  compilerOptions,
  fileName: storageSourceUrl.pathname,
}).outputText;
const storageModuleUrl = `data:text/javascript;base64,${Buffer.from(storageCompiled).toString("base64")}`;
const {
  readSongDiscoveryStorage,
  recordRecentSongId,
  saveSongDiscoveryState,
  updateStoredSongDiscoveryState,
} = await import(storageModuleUrl);
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

const graduatedFeatureSongs = [
  createSong("regular", "通常曲", "Regular", {
    releaseType: "single",
    releaseDate: "2026-01-01",
    trackType: "title",
    memberIds: ["active"],
  }),
  createSong("ordinary-graduate", "卒業生参加の通常曲", "Ordinary Graduate", {
    releaseType: "single",
    releaseDate: "2025-01-01",
    trackType: "coupling",
    memberIds: ["graduated"],
  }),
  createSong("graduated-member", "卒業企画曲", "Graduated Member", {
    releaseType: "single",
    releaseDate: "2024-01-01",
    trackType: "coupling",
    memberIds: ["graduated"],
    tags: ["graduated_member"],
  }),
  createSong("graduation-solo", "卒業ソロ", "Graduation Solo", {
    releaseType: "digital",
    releaseDate: "2023-01-01",
    trackType: "digital",
    memberIds: ["graduated"],
    tags: ["graduation_solo"],
  }),
  createSong("graduation-unit", "卒業ユニット", "Graduation Unit", {
    releaseType: "album",
    releaseDate: "2022-01-01",
    trackType: "album",
    centerMemberIds: ["graduated"],
    tags: ["graduation_unit"],
  }),
];

const defaultSongFilters = {
  normalizedQuery: "",
  releaseTypeFilter: "all",
  trackTypeFilter: "all",
  yearFilter: "all",
  memberFilters: [],
  showGraduatedMembers: false,
  hideSelected: false,
  selectedRanksBySongId: {},
};

function getFilteredSongIds(overrides = {}) {
  return filterSongsForSearch(graduatedFeatureSongs, {
    ...defaultSongFilters,
    ...overrides,
  }).map((song) => song.id);
}

function getRankedFilteredSongIds(sourceSongs, queryValue, overrides = {}) {
  const normalizedQuery = normalizeSongSearchText(queryValue);
  const filteredSongs = filterSongsForSearch(sourceSongs, {
    ...defaultSongFilters,
    ...overrides,
    normalizedQuery,
  });

  return rankSongsByQuery(filteredSongs, normalizedQuery, membersById).map(
    ({ song }) => song.id,
  );
}

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

test("only the dedicated Assistant search shows the complete graduated-member feature set by default", () => {
  assert.equal(shouldShowGraduatedMemberFeaturesByDefault("board"), false);
  assert.equal(
    shouldShowGraduatedMemberFeaturesByDefault("assistant-shortlist"),
    true,
  );
  assert.equal(isGraduatedMemberVisibilityFilterActive("board", false), false);
  assert.equal(
    isGraduatedMemberVisibilityFilterActive("assistant-shortlist", true),
    false,
  );
  assert.equal(
    isGraduatedMemberVisibilityFilterActive("assistant-shortlist", false),
    true,
  );
  assert.equal(isGraduatedMemberVisibilityFilterActive("board", true), true);
});

test("board defaults hide only explicitly tagged graduated-member features", () => {
  assert.deepEqual(getFilteredSongIds(), ["regular", "ordinary-graduate"]);
});

test("a query restores matching graduated-member features", () => {
  assert.deepEqual(
    getRankedFilteredSongIds(graduatedFeatureSongs, "Graduation Solo"),
    ["graduation-solo"],
  );
});

test("board and Assistant defaults expose different graduated-member sets", () => {
  assert.deepEqual(
    getFilteredSongIds({
      showGraduatedMembers: shouldShowGraduatedMemberFeaturesByDefault("board"),
    }),
    ["regular", "ordinary-graduate"],
  );
  assert.deepEqual(
    getFilteredSongIds({
      showGraduatedMembers: shouldShowGraduatedMemberFeaturesByDefault(
        "assistant-shortlist",
      ),
    }),
    graduatedFeatureSongs.map((song) => song.id),
  );
});

test("release, track, year, and member filters compose without changing OR member semantics", () => {
  assert.deepEqual(
    getFilteredSongIds({
      showGraduatedMembers: true,
      releaseTypeFilter: "single",
    }),
    ["regular", "ordinary-graduate", "graduated-member"],
  );
  assert.deepEqual(
    getFilteredSongIds({
      showGraduatedMembers: true,
      trackTypeFilter: "coupling",
      yearFilter: "2024",
      memberFilters: ["graduated"],
    }),
    ["graduated-member"],
  );
  assert.deepEqual(
    getFilteredSongIds({
      showGraduatedMembers: true,
      memberFilters: ["graduated"],
    }),
    [
      "ordinary-graduate",
      "graduated-member",
      "graduation-solo",
      "graduation-unit",
    ],
  );
  assert.deepEqual(
    getFilteredSongIds({
      showGraduatedMembers: true,
      memberFilters: ["missing", "active"],
    }),
    ["regular"],
  );
});

test("hide selected excludes every song with a recorded rank", () => {
  assert.deepEqual(
    getFilteredSongIds({
      showGraduatedMembers: true,
      hideSelected: true,
      selectedRanksBySongId: { regular: 1, "graduation-unit": 0 },
    }),
    ["ordinary-graduate", "graduated-member", "graduation-solo"],
  );
});

test("filtering before ranking preserves the existing relevance and source-order contract", () => {
  assert.deepEqual(
    getRankedFilteredSongIds(songs, "love", {
      hideSelected: true,
      selectedRanksBySongId: { contains: 2 },
    }),
    ["exact", "prefix", "secondary"],
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

test("classifies and preserves every blocked discovery document", async (t) => {
  const fixtures = [
    {
      name: "old",
      serialized: JSON.stringify({
        version: 0,
        favoriteSongIds: ["song-a"],
        recentSongIds: [],
      }),
      kind: "unsupported-version",
      version: 0,
    },
    {
      name: "future",
      serialized: JSON.stringify({
        version: 2,
        favoriteSongIds: ["song-a"],
        recentSongIds: [],
      }),
      kind: "unsupported-version",
      version: 2,
    },
    {
      name: "missingVersion",
      serialized: JSON.stringify({
        favoriteSongIds: ["song-a"],
        recentSongIds: [],
      }),
      kind: "invalid",
    },
    { name: "badJson", serialized: "{", kind: "corrupt" },
    { name: "nullRoot", serialized: "null", kind: "invalid" },
    { name: "arrayRoot", serialized: "[]", kind: "invalid" },
    { name: "stringRoot", serialized: '"text"', kind: "invalid" },
    {
      name: "badV1",
      serialized: JSON.stringify({
        version: 1,
        favoriteSongIds: ["song-a", 7],
        recentSongIds: [],
      }),
      kind: "invalid",
    },
    {
      name: "badV1Field",
      serialized: JSON.stringify({
        version: 1,
        favoriteSongIds: ["song-a"],
        recentSongIds: "song-b",
      }),
      kind: "invalid",
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      withLocalStorage(fixture.serialized, ({ storage }) => {
        const readResult = readSongDiscoveryStorage(
          "discovery",
          new Set(["song-a", "song-b"]),
        );
        assert.equal(readResult.kind, fixture.kind);
        if (readResult.kind === "unsupported-version") {
          assert.equal(readResult.version, fixture.version);
        }

        const updateResult = updateStoredSongDiscoveryState(
          "discovery",
          new Set(["song-a", "song-b"]),
          (current) => recordRecentSongId(current, "song-b", 4),
        );
        assert.equal(updateResult.ok, false);
        if (!updateResult.ok) {
          assert.equal(updateResult.reason, fixture.kind);
          if (updateResult.reason === "unsupported-version") {
            assert.equal(updateResult.version, fixture.version);
          }
        }
        assert.equal(
          saveSongDiscoveryState("discovery", {
            version: 1,
            favoriteSongIds: ["song-a"],
            recentSongIds: ["song-b"],
          }),
          false,
        );
        assert.equal(storage.setCalls, 0);
        assert.equal(storage.peekItem("discovery"), fixture.serialized);
      });
    });
  }
});

test("allows an absent discovery key to be written for the first time", () => {
  withLocalStorage(undefined, ({ storage }) => {
    assert.deepEqual(
      readSongDiscoveryStorage("discovery", new Set(["song-a"])),
      {
        kind: "absent",
        state: { version: 1, favoriteSongIds: [], recentSongIds: [] },
      },
    );

    const result = updateStoredSongDiscoveryState(
      "discovery",
      new Set(["song-a"]),
      (current) => recordRecentSongId(current, "song-a", 4),
    );
    assert.deepEqual(result, {
      ok: true,
      state: {
        version: 1,
        favoriteSongIds: [],
        recentSongIds: ["song-a"],
      },
    });
    assert.equal(storage.setCalls, 1);
    assert.deepEqual(JSON.parse(storage.peekItem("discovery")), result.state);
  });
});

test("updates valid v1 from one read while preserving legacy favorites", () => {
  const original = JSON.stringify({
    version: 1,
    favoriteSongIds: ["song-a", "missing", "song-a"],
    recentSongIds: ["missing", "song-b", "song-b"],
  });

  withLocalStorage(original, ({ storage }) => {
    const result = updateStoredSongDiscoveryState(
      "discovery",
      new Set(["song-a", "song-b", "song-c"]),
      (current) => recordRecentSongId(current, "song-c", 3),
    );
    assert.deepEqual(result, {
      ok: true,
      state: {
        version: 1,
        favoriteSongIds: ["song-a"],
        recentSongIds: ["song-c", "song-b"],
      },
    });
    assert.equal(storage.getCalls, 1);
    assert.equal(storage.setCalls, 1);
    assert.deepEqual(JSON.parse(storage.peekItem("discovery")), result.state);
  });
});

test("keeps recent song IDs newest-first, unique, and within the limit", () => {
  const initial = {
    version: 1,
    favoriteSongIds: [],
    recentSongIds: ["song-b", "song-a", "song-c"],
  };

  assert.deepEqual(recordRecentSongId(initial, "song-a", 2).recentSongIds, [
    "song-a",
    "song-b",
  ]);
  assert.deepEqual(recordRecentSongId(initial, "song-d", 3).recentSongIds, [
    "song-d",
    "song-b",
    "song-a",
  ]);
});

test("reports storage read and write failures without optimistic success", () => {
  withLocalStorage(
    undefined,
    ({ storage }) => {
      assert.deepEqual(
        updateStoredSongDiscoveryState(
          "discovery",
          new Set(["song-a"]),
          (current) => recordRecentSongId(current, "song-a", 4),
        ),
        { ok: false, reason: "read-failed" },
      );
      assert.equal(storage.setCalls, 0);
    },
    { throwOnGet: true },
  );

  withLocalStorage(
    undefined,
    ({ storage }) => {
      assert.deepEqual(
        updateStoredSongDiscoveryState(
          "discovery",
          new Set(["song-a"]),
          (current) => recordRecentSongId(current, "song-a", 4),
        ),
        { ok: false, reason: "write-failed" },
      );
      assert.equal(storage.getCalls, 1);
      assert.equal(storage.setCalls, 1);
      assert.equal(storage.peekItem("discovery"), null);
    },
    { throwOnSet: true },
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

function withLocalStorage(serialized, callback, options = {}) {
  const originalWindow = globalThis.window;
  const values = new Map();
  if (serialized !== undefined) values.set("discovery", serialized);
  const storage = {
    getCalls: 0,
    setCalls: 0,
    getItem(key) {
      this.getCalls += 1;
      if (options.throwOnGet) throw new Error("storage unavailable");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      this.setCalls += 1;
      if (options.throwOnSet) throw new Error("quota exceeded");
      values.set(key, value);
    },
    peekItem(key) {
      return values.get(key) ?? null;
    },
  };
  globalThis.window = { localStorage: storage };

  try {
    return callback({ storage });
  } finally {
    restoreWindow(originalWindow);
  }
}

function restoreWindow(originalWindow) {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
}
