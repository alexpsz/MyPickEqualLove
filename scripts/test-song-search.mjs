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
const searchModalSourceUrl = new URL(
  "../src/components/SearchModal.tsx",
  import.meta.url,
);
const songDetailModalSourceUrl = new URL(
  "../src/components/SongDetailModal.tsx",
  import.meta.url,
);
const pickExperienceClientSourceUrl = new URL(
  "../src/components/PickExperienceClient.tsx",
  import.meta.url,
);
const messagesSourceUrl = new URL("../src/i18n/messages.ts", import.meta.url);
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
const storageSource = await readFile(storageSourceUrl, "utf8");
const storageCompiled = ts.transpileModule(storageSource, {
  compilerOptions,
  fileName: storageSourceUrl.pathname,
}).outputText;
const storageModuleUrl = `data:text/javascript;base64,${Buffer.from(storageCompiled).toString("base64")}`;
const {
  createEmptySongDiscoveryState,
  loadSongDiscoveryState,
  recordRecentSongId,
  saveSongDiscoveryState,
  updateStoredSongDiscoveryState,
} = await import(storageModuleUrl);
const [
  searchModalSource,
  songDetailModalSource,
  pickExperienceClientSource,
  messagesSource,
] = await Promise.all([
  readFile(searchModalSourceUrl, "utf8"),
  readFile(songDetailModalSourceUrl, "utf8"),
  readFile(pickExperienceClientSourceUrl, "utf8"),
  readFile(messagesSourceUrl, "utf8"),
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

test("ordinary search and song details omit orphan favorites but keep real Assistant actions", () => {
  assert.doesNotMatch(
    searchModalSource,
    /favoriteSongIds|onToggleFavorite|name="star"/,
  );
  assert.doesNotMatch(
    songDetailModalSource,
    /isFavorite|onToggleFavorite|name="star"/,
  );
  assert.doesNotMatch(
    pickExperienceClientSource,
    /handleToggleFavorite|toggleFavoriteSongId|onToggleFavorite=/,
  );
  assert.doesNotMatch(
    messagesSource,
    /"search\.candidate"|"songDetail\.(?:add|remove)Candidate"/,
  );
  assert.match(
    searchModalSource,
    /isAssistantShortlistMode\s*\?\s*onToggleCandidate\?\.\(song\)\s*:\s*onSelect\(song\)/s,
    "assistant mode must toggle the shortlist from the whole result row while board mode still selects",
  );
  assert.match(
    searchModalSource,
    /!isAssistantShortlistMode\s*\?\s*\(\s*<button[\s\S]*?onClick=\{\(\) => onToggleCandidate\?\.\(song\)\}[\s\S]*?aria-pressed=\{isCandidate\}[\s\S]*?<AppIcon[\s\S]*?name=\{isCandidate \? "check" : "music"\}/,
    "board-mode results must expose a real Pick Assistant add/remove action",
  );
  assert.match(
    songDetailModalSource,
    /onToggleCandidate: \(song: Song\) => void;[\s\S]*?onClick=\{\(\) => onToggleCandidate\(song\)\}[\s\S]*?aria-pressed=\{isCandidate\}[\s\S]*?assistant\.removeCandidateAria[\s\S]*?assistant\.addCandidateAria/,
    "song details must expose the real Pick Assistant add/remove action",
  );
  assert.match(
    pickExperienceClientSource,
    /<SongDetailModal[\s\S]*?onToggleCandidate=\{handleToggleCandidate\}/,
    "the detail action must be wired to the persisted Assistant mutation",
  );
  assert.match(
    songDetailModalSource,
    /!isAssistantShortlistMode\s*\?\s*\([\s\S]*?onClick=\{\(\) => onSelect\(song\)\}[\s\S]*?songDetail\.selectSong/,
    "only ordinary song details may select a song onto the board",
  );
  const candidateDisabledExpression = searchModalSource.match(
    /const candidateDisabled =([\s\S]*?)!onToggleCandidate;/,
  )?.[1];
  assert.ok(candidateDisabledExpression);
  assert.doesNotMatch(
    candidateDisabledExpression,
    /\bselected\b/,
    "songs already on the board must remain eligible for the Assistant shortlist",
  );
  assert.match(
    pickExperienceClientSource,
    /selectionMode=\{searchPresentation\.selectionMode\}/,
  );
  assert.match(messagesSource, /"assistant\.addCandidate": "加入选曲助手"/);
  assert.match(messagesSource, /"assistant\.candidate": "已加入选曲助手"/);
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

test("loads only the current v1 discovery schema and filters song IDs", () => {
  withLocalStorage(
    JSON.stringify({
      version: 1,
      favoriteSongIds: ["song-a", "missing", "song-a", 17],
      recentSongIds: ["song-b", "song-a", "song-b", null],
    }),
    ({ storage }) => {
      assert.deepEqual(
        loadSongDiscoveryState("discovery", new Set(["song-a", "song-b"])),
        {
          version: 1,
          favoriteSongIds: ["song-a"],
          recentSongIds: ["song-b", "song-a"],
        },
      );
      assert.equal(storage.setCalls, 0);
      saveSongDiscoveryState("discovery", {
        version: 1,
        favoriteSongIds: ["song-b"],
        recentSongIds: ["song-a"],
      });
      assert.deepEqual(JSON.parse(storage.getItem("discovery")), {
        version: 1,
        favoriteSongIds: ["song-b"],
        recentSongIds: ["song-a"],
      });
      assert.equal(storage.setCalls, 1);
    },
  );
});

test("fails closed for unknown versions without overwriting their payload", () => {
  const original = JSON.stringify({
    version: 999,
    favoriteSongIds: ["future-song"],
    futureField: true,
  });

  withLocalStorage(original, ({ storage }) => {
    assert.deepEqual(
      loadSongDiscoveryState("discovery", new Set(["future-song"])),
      createEmptySongDiscoveryState(),
    );
    saveSongDiscoveryState("discovery", {
      version: 1,
      favoriteSongIds: ["song-a"],
      recentSongIds: [],
    });
    assert.equal(storage.getItem("discovery"), original);
    assert.equal(storage.setCalls, 0);
  });
});

test("fails closed for bad JSON, non-object roots, and missing versions", () => {
  for (const serialized of [
    "{",
    "null",
    "[]",
    '"text"',
    "42",
    JSON.stringify({ favoriteSongIds: ["song-a"] }),
  ]) {
    withLocalStorage(serialized, () => {
      assert.deepEqual(
        loadSongDiscoveryState("discovery", new Set(["song-a"])),
        createEmptySongDiscoveryState(),
      );
    });
  }
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

test("storage access failures fall back without throwing", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {
        throw new Error("storage unavailable");
      },
    },
  };

  try {
    assert.deepEqual(
      loadSongDiscoveryState("discovery", new Set(["song-a"])),
      createEmptySongDiscoveryState(),
    );
    assert.equal(
      saveSongDiscoveryState("discovery", createEmptySongDiscoveryState()),
      false,
    );
  } finally {
    restoreWindow(originalWindow);
  }
});

test("discovery updates re-read storage and report persistence failures", () => {
  withLocalStorage(
    JSON.stringify({
      version: 1,
      favoriteSongIds: ["song-a"],
      recentSongIds: [],
    }),
    ({ storage }) => {
      const result = updateStoredSongDiscoveryState(
        "discovery",
        new Set(["song-a", "song-b"]),
        (current) => recordRecentSongId(current, "song-b", 4),
      );
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.state.favoriteSongIds, ["song-a"]);
        assert.deepEqual(result.state.recentSongIds, ["song-b"]);
      }
      assert.deepEqual(JSON.parse(storage.getItem("discovery")), {
        version: 1,
        favoriteSongIds: ["song-a"],
        recentSongIds: ["song-b"],
      });
    },
  );

  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("quota exceeded");
      },
    },
  };
  try {
    assert.deepEqual(
      updateStoredSongDiscoveryState(
        "discovery",
        new Set(["song-a"]),
        (current) => recordRecentSongId(current, "song-a", 4),
      ),
      { ok: false },
    );
  } finally {
    restoreWindow(originalWindow);
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

function withLocalStorage(serialized, callback) {
  const originalWindow = globalThis.window;
  const values = new Map();
  if (serialized !== undefined) values.set("discovery", serialized);
  const storage = {
    setCalls: 0,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      this.setCalls += 1;
      values.set(key, value);
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
