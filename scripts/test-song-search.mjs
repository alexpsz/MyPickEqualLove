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
const creditRegistrySourceUrl = new URL(
  "../src/data/creditRegistry.ts",
  import.meta.url,
);
const creditRegistryJsonUrl = new URL(
  "../src/data/credit-registry.json",
  import.meta.url,
);
const pickExperienceClientSourceUrl = new URL(
  "../src/components/PickExperienceClient.tsx",
  import.meta.url,
);
const searchModalSourceUrl = new URL(
  "../src/components/SearchModal.tsx",
  import.meta.url,
);
const projectSourceUrl = new URL("../src/config/project.ts", import.meta.url);
const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
};

const source = await readFile(sourceUrl, "utf8");
const creditRegistryJson = await readFile(creditRegistryJsonUrl, "utf8");
const creditRegistryJsonModuleUrl = `data:text/javascript;base64,${Buffer.from(
  `export default ${creditRegistryJson}`,
).toString("base64")}`;
const creditRegistrySource = await readFile(creditRegistrySourceUrl, "utf8");
const creditRegistryCompiled = ts
  .transpileModule(creditRegistrySource, {
    compilerOptions,
    fileName: creditRegistrySourceUrl.pathname,
  })
  .outputText.replace(
    '"./credit-registry.json"',
    JSON.stringify(creditRegistryJsonModuleUrl),
  );
const creditRegistryModuleUrl = `data:text/javascript;base64,${Buffer.from(creditRegistryCompiled).toString("base64")}`;
const creditsSource = await readFile(creditsSourceUrl, "utf8");
const creditsCompiled = ts
  .transpileModule(creditsSource, {
    compilerOptions,
    fileName: creditsSourceUrl.pathname,
  })
  .outputText.replace(
    '"../data/creditRegistry"',
    JSON.stringify(creditRegistryModuleUrl),
  );
const creditsModuleUrl = `data:text/javascript;base64,${Buffer.from(creditsCompiled).toString("base64")}`;
const compiled = ts
  .transpileModule(source, {
    compilerOptions,
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
  getNewSongIds,
  loadSongDiscoveryState,
  markSongDiscoverySongsSeen,
  recordRecentSongId,
  updateStoredSongDiscoveryState,
} = await import(storageModuleUrl);
const [pickExperienceClientSource, searchModalSource, projectSource] =
  await Promise.all([
    readFile(pickExperienceClientSourceUrl, "utf8"),
    readFile(searchModalSourceUrl, "utf8"),
    readFile(projectSourceUrl, "utf8"),
  ]);

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

const DISCOVERY_V1_KEY = "discovery-v1";
const DISCOVERY_V2_KEY = "discovery-v2";
const CATALOG_SONG_IDS = ["song-a", "song-b", "song-c"];

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

test("credited creators are searchable by canonical and legacy spellings alike", () => {
  const credited = [
    createSong("credited", "クレジット曲", "kurejitto kyoku", {
      credits: {
        lyricist: { ja: "指原莉乃", romaji: "Sashihara Rino" },
        composer: {
          ja: "中村歩・菊池博人",
          romaji: "Nakamura Ayumu ・ Kikuchi Hiroto",
        },
        arranger: { ja: "YUU for YOU", romaji: "YUU for YOU" },
      },
    }),
  ];

  for (const query of [
    "Sashihara Rino",
    "sasuhara rino",
    "指原莉乃",
    "Nakamura Ayumu",
    "nakamura ho",
    "Kikuchi Hiroto",
    "kikuchi hirohito",
    "YUU for YOU",
    "YUU for YUU",
  ]) {
    assert.deepEqual(
      rankSongsByQuery(credited, query, membersById).map(({ song }) => song.id),
      ["credited"],
      query,
    );
  }
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

test("seeds an absent v2 and absent v1 catalog without announcing existing songs", () => {
  withDiscoveryStorage({}, ({ storage }) => {
    const result = loadSongDiscoveryState(
      DISCOVERY_V2_KEY,
      DISCOVERY_V1_KEY,
      CATALOG_SONG_IDS,
    );

    assert.deepEqual(result, {
      ok: true,
      state: createV2State({ seenSongIds: CATALOG_SONG_IDS }),
      newSongIds: [],
    });
    assert.equal(storage.setCalls, 1);
    assert.deepEqual(
      JSON.parse(storage.peekItem(DISCOVERY_V2_KEY)),
      createV2State({ seenSongIds: CATALOG_SONG_IDS }),
    );
    assert.equal(storage.peekItem(DISCOVERY_V1_KEY), null);
  });
});

test("migrates a legal v1 document into a seeded v2 document without changing v1", () => {
  const legacy = JSON.stringify({
    version: 1,
    favoriteSongIds: ["song-b", "unknown", "song-b"],
    recentSongIds: ["unknown", "song-a", "song-a"],
  });

  withDiscoveryStorage({ [DISCOVERY_V1_KEY]: legacy }, ({ storage }) => {
    const result = loadSongDiscoveryState(
      DISCOVERY_V2_KEY,
      DISCOVERY_V1_KEY,
      CATALOG_SONG_IDS,
    );

    assert.deepEqual(result, {
      ok: true,
      state: createV2State({
        favoriteSongIds: ["song-b"],
        recentSongIds: ["song-a"],
        seenSongIds: CATALOG_SONG_IDS,
      }),
      newSongIds: [],
    });
    assert.equal(storage.peekItem(DISCOVERY_V1_KEY), legacy);
    assert.deepEqual(
      JSON.parse(storage.peekItem(DISCOVERY_V2_KEY)),
      result.state,
    );
  });
});

test("fails closed instead of migrating unsupported, damaged, or unreadable v1", async (t) => {
  const fixtures = [
    {
      name: "future",
      value: JSON.stringify({
        version: 2,
        favoriteSongIds: [],
        recentSongIds: [],
      }),
      reason: "unsupported-version",
    },
    { name: "corrupt", value: "{", reason: "corrupt" },
    {
      name: "invalid",
      value: JSON.stringify({
        version: 1,
        favoriteSongIds: [],
        recentSongIds: [],
        unexpected: true,
      }),
      reason: "invalid",
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      withDiscoveryStorage(
        { [DISCOVERY_V1_KEY]: fixture.value },
        ({ storage }) => {
          const result = loadSongDiscoveryState(
            DISCOVERY_V2_KEY,
            DISCOVERY_V1_KEY,
            CATALOG_SONG_IDS,
          );
          assert.equal(result.ok, false);
          if (!result.ok) {
            assert.equal(result.reason, fixture.reason);
            assert.deepEqual(result.newSongIds, []);
          }
          assert.equal(storage.setCalls, 0);
          assert.equal(storage.peekItem(DISCOVERY_V2_KEY), null);
          assert.equal(storage.peekItem(DISCOVERY_V1_KEY), fixture.value);
        },
      );
    });
  }

  await t.test("read-failed", () => {
    withDiscoveryStorage(
      {},
      ({ storage }) => {
        const result = loadSongDiscoveryState(
          DISCOVERY_V2_KEY,
          DISCOVERY_V1_KEY,
          CATALOG_SONG_IDS,
        );
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "read-failed");
        assert.equal(storage.setCalls, 0);
        assert.equal(storage.peekItem(DISCOVERY_V2_KEY), null);
      },
      { throwOnGetCall: 2 },
    );
  });
});

test("derives NEW only from an old valid v2 seen snapshot in current catalog order", () => {
  const v2 = JSON.stringify(
    createV2State({ seenSongIds: ["song-a", "unknown", "song-a"] }),
  );
  const currentCatalog = ["song-c", "song-a", "song-b"];

  withDiscoveryStorage(
    {
      [DISCOVERY_V2_KEY]: v2,
      [DISCOVERY_V1_KEY]: JSON.stringify({
        version: 1,
        favoriteSongIds: ["song-b"],
        recentSongIds: [],
      }),
    },
    ({ storage }) => {
      const result = loadSongDiscoveryState(
        DISCOVERY_V2_KEY,
        DISCOVERY_V1_KEY,
        currentCatalog,
      );
      assert.deepEqual(result, {
        ok: true,
        state: createV2State({ seenSongIds: ["song-a"] }),
        newSongIds: ["song-c", "song-b"],
      });
      assert.equal(storage.setCalls, 0);
      assert.equal(storage.peekItem(DISCOVERY_V2_KEY), v2);
    },
  );
});

test("fails closed for bad v2 without falling back to or overwriting v1", async (t) => {
  const legacy = JSON.stringify({
    version: 1,
    favoriteSongIds: ["song-a"],
    recentSongIds: ["song-b"],
  });
  const fixtures = [
    {
      name: "future",
      value: JSON.stringify({
        version: 3,
        favoriteSongIds: [],
        recentSongIds: [],
        seenSongIds: [],
      }),
      reason: "unsupported-version",
    },
    { name: "corrupt", value: "{", reason: "corrupt" },
    {
      name: "invalid",
      value: JSON.stringify({
        version: 2,
        favoriteSongIds: [],
        recentSongIds: [],
      }),
      reason: "invalid",
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      withDiscoveryStorage(
        { [DISCOVERY_V2_KEY]: fixture.value, [DISCOVERY_V1_KEY]: legacy },
        ({ storage }) => {
          const result = loadSongDiscoveryState(
            DISCOVERY_V2_KEY,
            DISCOVERY_V1_KEY,
            CATALOG_SONG_IDS,
          );
          assert.equal(result.ok, false);
          if (!result.ok) {
            assert.equal(result.reason, fixture.reason);
            assert.deepEqual(result.newSongIds, []);
          }
          assert.equal(storage.setCalls, 0);
          assert.equal(storage.peekItem(DISCOVERY_V2_KEY), fixture.value);
          assert.equal(storage.peekItem(DISCOVERY_V1_KEY), legacy);
        },
      );
    });
  }

  await t.test("read-failed", () => {
    withDiscoveryStorage(
      { [DISCOVERY_V1_KEY]: legacy },
      ({ storage }) => {
        const result = loadSongDiscoveryState(
          DISCOVERY_V2_KEY,
          DISCOVERY_V1_KEY,
          CATALOG_SONG_IDS,
        );
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.reason, "read-failed");
        assert.equal(storage.setCalls, 0);
        assert.equal(storage.peekItem(DISCOVERY_V2_KEY), null);
        assert.equal(storage.peekItem(DISCOVERY_V1_KEY), legacy);
      },
      { throwOnGetCall: 1 },
    );
  });
});

test("does not publish a NEW state when v2 initialization or migration cannot write", async (t) => {
  const legacy = JSON.stringify({
    version: 1,
    favoriteSongIds: ["song-a"],
    recentSongIds: ["song-b"],
  });
  const fixtures = [
    { name: "initialization", initial: {} },
    { name: "migration", initial: { [DISCOVERY_V1_KEY]: legacy } },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      withDiscoveryStorage(
        fixture.initial,
        ({ storage }) => {
          const result = loadSongDiscoveryState(
            DISCOVERY_V2_KEY,
            DISCOVERY_V1_KEY,
            CATALOG_SONG_IDS,
          );
          assert.equal(result.ok, false);
          if (!result.ok) {
            assert.equal(result.reason, "write-failed");
            assert.deepEqual(result.newSongIds, []);
          }
          assert.equal(storage.setCalls, 1);
          assert.equal(storage.peekItem(DISCOVERY_V2_KEY), null);
          assert.equal(
            storage.peekItem(DISCOVERY_V1_KEY),
            fixture.initial[DISCOVERY_V1_KEY] ?? null,
          );
        },
        { throwOnSet: true },
      );
    });
  }
});

test("recording a recent song preserves the v2 seen snapshot and NEW batch", () => {
  const current = createV2State({
    favoriteSongIds: ["song-a"],
    recentSongIds: ["song-b"],
    seenSongIds: ["song-a"],
  });

  withDiscoveryStorage(
    { [DISCOVERY_V2_KEY]: JSON.stringify(current) },
    ({ storage }) => {
      const result = updateStoredSongDiscoveryState(
        DISCOVERY_V2_KEY,
        CATALOG_SONG_IDS,
        (state) => recordRecentSongId(state, "song-c", 20),
      );
      assert.deepEqual(result, {
        ok: true,
        state: createV2State({
          favoriteSongIds: ["song-a"],
          recentSongIds: ["song-c", "song-b"],
          seenSongIds: ["song-a"],
        }),
      });
      assert.equal(storage.getCalls, 1);
      assert.deepEqual(getNewSongIds(result.state, CATALOG_SONG_IDS), [
        "song-b",
        "song-c",
      ]);
    },
  );
});

test("explicitly marking seen acknowledges every current song and clears NEW", () => {
  const current = createV2State({
    favoriteSongIds: ["song-b"],
    recentSongIds: ["song-a"],
    seenSongIds: ["song-a"],
  });

  withDiscoveryStorage(
    { [DISCOVERY_V2_KEY]: JSON.stringify(current) },
    ({ storage }) => {
      const result = markSongDiscoverySongsSeen(
        DISCOVERY_V2_KEY,
        CATALOG_SONG_IDS,
        current,
      );
      assert.deepEqual(result, {
        ok: true,
        state: createV2State({
          favoriteSongIds: ["song-b"],
          recentSongIds: ["song-a"],
          seenSongIds: CATALOG_SONG_IDS,
        }),
      });
      assert.deepEqual(getNewSongIds(result.state, CATALOG_SONG_IDS), []);
      assert.deepEqual(
        JSON.parse(storage.peekItem(DISCOVERY_V2_KEY)),
        result.state,
      );
    },
  );
});

test("mark-seen write failures and freshness conflicts leave the caller state unchanged", async (t) => {
  const memoryState = createV2State({ seenSongIds: ["song-a"] });
  const memorySnapshot = JSON.stringify(memoryState);

  await t.test("write-failed", () => {
    const serialized = JSON.stringify(memoryState);
    withDiscoveryStorage(
      { [DISCOVERY_V2_KEY]: serialized },
      ({ storage }) => {
        const result = markSongDiscoverySongsSeen(
          DISCOVERY_V2_KEY,
          CATALOG_SONG_IDS,
          memoryState,
        );
        assert.deepEqual(result, { ok: false, reason: "write-failed" });
        assert.equal(JSON.stringify(memoryState), memorySnapshot);
        assert.equal(storage.peekItem(DISCOVERY_V2_KEY), serialized);
      },
      { throwOnSet: true },
    );
  });

  await t.test("freshness-conflict", () => {
    const stored = createV2State({
      favoriteSongIds: ["song-b"],
      seenSongIds: ["song-a"],
    });
    const serialized = JSON.stringify(stored);
    withDiscoveryStorage({ [DISCOVERY_V2_KEY]: serialized }, ({ storage }) => {
      const result = markSongDiscoverySongsSeen(
        DISCOVERY_V2_KEY,
        CATALOG_SONG_IDS,
        memoryState,
      );
      assert.deepEqual(result, { ok: false, reason: "conflict" });
      assert.equal(JSON.stringify(memoryState), memorySnapshot);
      assert.equal(storage.setCalls, 0);
      assert.equal(storage.peekItem(DISCOVERY_V2_KEY), serialized);
    });
  });
});

test("new song UI remains a standard-mode search affordance with one explicit acknowledgement", () => {
  assert.match(
    projectSource,
    /songDiscoveryV2:\s+`\$\{storagePrefix\}_song_discovery_v2`/,
  );
  assert.match(pickExperienceClientSource, /<NewSongsBanner/);
  assert.match(
    pickExperienceClientSource,
    /onViewNewSongs=\{handleGlobalSearchClick\}/,
  );
  assert.match(
    pickExperienceClientSource,
    /onMarkSeen=\{handleMarkSongDiscoverySongsSeen\}/,
  );
  assert.match(
    pickExperienceClientSource,
    /const isStandardTopTen = isStandard && slots\.length === 10;/,
  );
  assert.match(
    pickExperienceClientSource,
    /const showNewSongsBanner =\s*hydrated &&\s*!isExportRealm &&\s*isStandardTopTen &&\s*songDiscoveryNewSongIds\.length > 0;/,
  );
  assert.match(
    pickExperienceClientSource,
    /newSongIds=\{isStandardTopTen \? newSongIdSet : undefined\}/,
  );
  assert.match(
    pickExperienceClientSource,
    /watchedKey: STORAGE_KEYS\.songDiscoveryV2/,
  );
  assert.match(searchModalSource, /newSongIds\?: ReadonlySet<string>/);
  assert.match(searchModalSource, /songDiscovery\.newBadge/);
  assert.match(
    getSourceSection(
      pickExperienceClientSource,
      "const handleMarkSongDiscoverySongsSeen",
      "const handleOpenSongDetail",
    ),
    /if \(!result\.ok\) \{\s*setBoardStatusMessage\(t\("songDiscovery\.error\.storage"\)\);\s*return;\s*\}\s*setSongDiscoveryState\(result\.state\)/,
  );

  for (const [start, end] of [
    ["const handleGlobalSearchClick", "const handleArchetypeEntryClick"],
    ["const handleOpenSongDetail", "const commitPickAssistantUpdate"],
    ["const handleSelectSong =", "const handleSelectSongFromDetail"],
  ]) {
    assert.doesNotMatch(
      getSourceSection(pickExperienceClientSource, start, end),
      /markSongDiscoverySongsSeen/,
    );
  }
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

function createV2State(overrides = {}) {
  return {
    version: 2,
    favoriteSongIds: [],
    recentSongIds: [],
    seenSongIds: [],
    ...overrides,
  };
}

function getSourceSection(sourceText, startMarker, endMarker) {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return sourceText.slice(start, end);
}

function withDiscoveryStorage(initialValues, callback, options = {}) {
  const originalWindow = globalThis.window;
  const values = new Map(Object.entries(initialValues));
  const storage = {
    getCalls: 0,
    setCalls: 0,
    getItem(key) {
      this.getCalls += 1;
      if (options.throwOnGet || options.throwOnGetCall === this.getCalls) {
        throw new Error("storage unavailable");
      }
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
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}
