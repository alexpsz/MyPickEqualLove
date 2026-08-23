import assert from "node:assert/strict";
import test from "node:test";

import type {
  LocalizedString,
  Song,
  StoredPicks,
} from "../../src/schema/music";
import {
  BOARD_INSIGHTS_TARGET_COUNT,
  deriveBoardInsights,
  resolveBoardInsightsSelection,
} from "../../src/utils/boardInsights";
import {
  getConfirmedSongCredit,
  getConfirmedSongCredits,
} from "../../src/utils/songCredits";

// Credit identity comes from the shared creator registry, so these fixtures
// have to be real registry entries rather than invented names.
const WRITER_A: LocalizedString = {
  ja: "指原莉乃",
  romaji: "Sashihara Rino",
};
const WRITER_B: LocalizedString = {
  ja: "中村歩",
  romaji: "Nakamura Ayumu",
};
const COMPOSER_A: LocalizedString = {
  ja: "本多友紀",
  romaji: "honda yuki",
};
const ARRANGER_A: LocalizedString = {
  ja: "めんま",
  romaji: "menma",
};

function makeSong(id: string, overrides: Partial<Song> = {}): Song {
  return {
    id,
    title: { ja: id, romaji: id },
    artist: { ja: "=LOVE", romaji: "Equal Love" },
    releaseDate: "2024-01-01",
    releaseType: "single",
    trackType: "title",
    coverUrl: `/covers/${id}.jpg`,
    sourceStatus: "released",
    credits: {
      lyricist: WRITER_A,
      composer: COMPOSER_A,
      arranger: ARRANGER_A,
    },
    ...overrides,
  };
}

function makeTopTen(overrides: Partial<Song>[] = []): Song[] {
  return Array.from({ length: 10 }, (_, index) =>
    makeSong(`song-${index + 1}`, overrides[index]),
  );
}

const TOP_TEN_SLOT_IDS = Array.from(
  { length: BOARD_INSIGHTS_TARGET_COUNT },
  (_, index) => `pick-${index + 1}`,
);

function resolveSelection(
  songs: readonly Song[],
  selectedCount: number,
  storedPicks: StoredPicks = Object.fromEntries(
    TOP_TEN_SLOT_IDS.slice(0, selectedCount).map((slotId, index) => [
      slotId,
      songs[index]?.id,
    ]),
  ),
  experienceKind: "standard" | "live-afterglow" = "standard",
) {
  return resolveBoardInsightsSelection({
    experienceKind,
    slotIds: TOP_TEN_SLOT_IDS,
    storedPicks,
    songsById: Object.fromEntries(songs.map((song) => [song.id, song])),
  });
}

test("normal insights separate 0/1/5/9/10 panel visibility from the complete-board export gate", () => {
  const songs = makeTopTen();

  for (const selectedCount of [0, 1, 5, 9, 10]) {
    const selection = resolveSelection(songs, selectedCount);
    if (selectedCount === 0) {
      assert.equal(selection, null, "an empty board must not show a panel");
      continue;
    }

    assert.ok(selection, `${selectedCount}/10 should show one insights panel`);
    assert.equal(selection.selectedCount, selectedCount);
    assert.equal(selection.targetCount, 10);
    assert.equal(selection.canExport, selectedCount === 10);
    assert.equal(
      deriveBoardInsights(selection.songs).releaseYears.coverage.total,
      selectedCount,
      "statistics must use only the current non-empty selections",
    );
  }
});

test("duplicate, invalid, foreign-slot, non-Top-10, and Live states fail closed", () => {
  const songs = makeTopTen();
  const twoPicks = {
    "pick-1": songs[0].id,
    "pick-2": songs[1].id,
  };

  assert.equal(
    resolveSelection(songs, 2, { ...twoPicks, "pick-2": songs[0].id }),
    null,
  );
  assert.equal(resolveSelection(songs, 1, { "pick-1": "unknown-song" }), null);
  assert.equal(
    resolveSelection(songs, 1, {
      "pick-1": songs[0].id,
      "foreign-slot": songs[1].id,
    }),
    null,
  );
  assert.equal(resolveSelection(songs, 1, twoPicks, "live-afterglow"), null);
  assert.equal(
    resolveBoardInsightsSelection({
      experienceKind: "standard",
      slotIds: TOP_TEN_SLOT_IDS.slice(0, 9),
      storedPicks: { "pick-1": songs[0].id },
      songsById: Object.fromEntries(songs.map((song) => [song.id, song])),
    }),
    null,
  );
});

test("insights export admission rejects raw extras before experience filtering", () => {
  const songs = [...makeTopTen(), makeSong("song-11")];
  const completePicks = Object.fromEntries(
    TOP_TEN_SLOT_IDS.map((slotId, index) => [slotId, songs[index]!.id]),
  );

  assert.equal(
    resolveSelection(songs, 10, completePicks)?.canExport,
    true,
    "a normal complete unique Top 10 remains exportable",
  );
  assert.equal(
    resolveSelection(songs, 10, {
      ...completePicks,
      "foreign-slot": songs[10]!.id,
    }),
    null,
    "a known song in a foreign extra slot must not be silently discarded",
  );
  assert.equal(
    resolveSelection(songs, 10, {
      ...completePicks,
      "foreign-slot": "unknown-song",
    }),
    null,
    "an unknown song in a foreign extra slot must not be silently discarded",
  );
});

test("oshimen solo count follows the current one-to-ten selection", () => {
  const songs = makeTopTen(
    Array.from({ length: 10 }, () => ({
      trackType: "solo" as const,
      memberIds: ["member-a"],
    })),
  );

  for (const selectedCount of [1, 5, 9, 10]) {
    const selection = resolveSelection(songs, selectedCount);
    assert.ok(selection);
    assert.equal(
      deriveBoardInsights(selection.songs, {
        oshimenMemberId: "member-a",
      }).oshimenSoloSongs?.count,
      selectedCount,
    );
  }
});

test("each add, delete, replace, undo, import, or sync snapshot is resolved from current picks", () => {
  const songs = makeTopTen();
  const snapshots: Array<[StoredPicks, readonly string[]]> = [
    [{ "pick-1": songs[0].id }, [songs[0].id]],
    [{ "pick-1": songs[1].id }, [songs[1].id]],
    [
      { "pick-1": songs[1].id, "pick-2": songs[2].id },
      [songs[1].id, songs[2].id],
    ],
    [{ "pick-2": songs[2].id }, [songs[2].id]],
    [
      { "pick-1": songs[1].id, "pick-2": songs[2].id },
      [songs[1].id, songs[2].id],
    ],
  ];

  for (const [storedPicks, expectedSongIds] of snapshots) {
    const selection = resolveSelection(
      songs,
      expectedSongIds.length,
      storedPicks,
    );
    assert.ok(selection);
    assert.deepEqual(
      selection.songs.map((song) => song.id),
      expectedSongIds,
    );
  }
});

test("derives the four factual distributions with ten-song coverage", () => {
  const songs = makeTopTen([
    { releaseDate: "2024-01-01", releaseType: "single", trackType: "title" },
    { releaseDate: "2024-02-01", releaseType: "single", trackType: "title" },
    { releaseDate: "2023-01-01", releaseType: "album", trackType: "coupling" },
    { releaseDate: "2023-02-01", releaseType: "album", trackType: "coupling" },
    {
      releaseDate: "2022-01-01",
      releaseType: "digital",
      trackType: "coupling",
    },
    {
      releaseDate: "2022-02-01",
      releaseType: "digital",
      trackType: "coupling",
    },
    { releaseDate: "2021-01-01", releaseType: "other", trackType: "solo" },
    { releaseDate: "2021-02-01", releaseType: "other", trackType: "solo" },
    { releaseDate: "2020-01-01", releaseType: "single", trackType: "title" },
    { releaseDate: "2019-01-01", releaseType: "single", trackType: "title" },
  ]);
  const insights = deriveBoardInsights(songs);

  assert.deepEqual(insights.releaseYears.coverage, {
    covered: 10,
    total: 10,
    percent: 100,
  });
  assert.deepEqual(
    insights.releaseYears.entries.map(({ year, count }) => [year, count]),
    [
      ["2024", 2],
      ["2023", 2],
      ["2022", 2],
      ["2021", 2],
      ["2020", 1],
      ["2019", 1],
    ],
  );
  assert.deepEqual(
    insights.releaseTypes.entries.map(({ value, count }) => [value, count]),
    [
      ["single", 4],
      ["album", 2],
      ["digital", 2],
      ["other", 2],
    ],
  );
  assert.deepEqual(
    insights.trackTypes.entries.map(({ value, count }) => [value, count]),
    [
      ["coupling", 4],
      ["title", 4],
      ["solo", 2],
    ],
  );
  assert.deepEqual(insights.credits.lyricist.coverage, {
    covered: 10,
    total: 10,
    percent: 100,
  });
});

test("missing and invalid metadata reduces coverage without adding a zero bucket", () => {
  const songs = makeTopTen([
    { releaseDate: undefined, releaseType: undefined, trackType: undefined },
    {
      releaseDate: "2024-02-30",
      releaseType: "unknown" as Song["releaseType"],
      trackType: "unknown" as Song["trackType"],
    },
  ]);
  const insights = deriveBoardInsights(songs);

  assert.deepEqual(insights.releaseYears.coverage, {
    covered: 8,
    total: 10,
    percent: 80,
  });
  assert.deepEqual(insights.releaseTypes.coverage, {
    covered: 8,
    total: 10,
    percent: 80,
  });
  assert.deepEqual(insights.trackTypes.coverage, {
    covered: 8,
    total: 10,
    percent: 80,
  });
  assert.equal(
    insights.releaseYears.entries.some((entry) => entry.year === "0"),
    false,
  );
});

test("only calendar-valid YYYY-MM-DD values contribute a release year", () => {
  const songs = makeTopTen([
    { releaseDate: "2024-02-29" },
    { releaseDate: "2023-02-29" },
    { releaseDate: "2024/02/29" },
    { releaseDate: "2024-2-29" },
    { releaseDate: "0000-01-01" },
    { releaseDate: undefined },
  ]);
  const insights = deriveBoardInsights(songs);

  assert.equal(insights.releaseYears.coverage.covered, 5);
  assert.deepEqual(
    insights.releaseYears.entries.map((entry) => entry.year),
    ["2024"],
  );
});

test("credit roles are confirmed independently while the legacy all-role guard stays all-or-nothing", () => {
  const songs = makeTopTen([
    {
      credits: { lyricist: WRITER_A },
    },
    {
      credits: { composer: COMPOSER_A },
    },
    {
      credits: { arranger: ARRANGER_A },
    },
    {
      credits: {
        lyricist: WRITER_B,
        composer: COMPOSER_A,
      },
    },
    {
      credits: {
        lyricist: WRITER_A,
        composer: COMPOSER_A,
        arranger: ARRANGER_A,
      },
      sourceStatus: "unverified",
    },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
  ]);
  const insights = deriveBoardInsights(songs);

  assert.equal(insights.credits.lyricist.coverage.covered, 2);
  assert.equal(insights.credits.composer.coverage.covered, 2);
  assert.equal(insights.credits.arranger.coverage.covered, 1);
  assert.equal(getConfirmedSongCredit(songs[0], "lyricist"), WRITER_A);
  assert.equal(getConfirmedSongCredit(songs[0], "composer"), null);
  assert.equal(getConfirmedSongCredits(songs[0]), null);
  assert.equal(getConfirmedSongCredit(songs[4], "lyricist"), null);
});

test("a joint credit counts every contributor and ignores the order they are written in", () => {
  const songs = makeTopTen([
    {
      credits: {
        composer: {
          ja: "中村歩・菊池博人",
          romaji: "Nakamura Ayumu ・ Kikuchi Hiroto",
        },
      },
    },
    {
      credits: {
        composer: {
          ja: "菊池博人・中村歩",
          romaji: "Kikuchi Hiroto ・ Nakamura Ayumu",
        },
      },
    },
    { credits: { composer: { ja: "中村歩", romaji: "Nakamura Ayumu" } } },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
  ]);
  const composers = deriveBoardInsights(songs).credits.composer;

  assert.deepEqual(composers.coverage, { covered: 3, total: 10, percent: 30 });
  assert.deepEqual(
    composers.entries.map((entry) => [entry.key, entry.count]),
    [
      ["nakamura-ayumu", 3],
      ["kikuchi-hiroto", 2],
    ],
  );
});

test("a legacy written name resolves to the same creator as the canonical one", () => {
  const songs = makeTopTen([
    { credits: { composer: { ja: "YUU for YUU", romaji: "YUU for YUU" } } },
    { credits: { composer: { ja: "YUU for YOU", romaji: "YUU for YOU" } } },
    { credits: { composer: { ja: "HaggyRock", romaji: "HaggyRock" } } },
    { credits: { composer: { ja: "Haggy Rock", romaji: "Haggy Rock" } } },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
  ]);
  const composers = deriveBoardInsights(songs).credits.composer;

  assert.deepEqual(
    composers.entries.map((entry) => [entry.key, entry.value, entry.count]),
    [
      ["haggy-rock", { ja: "Haggy Rock", romaji: "Haggy Rock" }, 2],
      ["yuu-for-you", { ja: "YUU for YOU", romaji: "YUU for YOU" }, 2],
    ],
  );
});

test("an unregistered credit name is not counted instead of inventing a creator", () => {
  const songs = makeTopTen([
    {
      credits: {
        composer: { ja: "未登録の人", romaji: "Mitouroku no Hito" },
      },
    },
    {
      credits: {
        composer: {
          ja: "中村歩・未登録の人",
          romaji: "Nakamura Ayumu ・ Mitouroku no Hito",
        },
      },
    },
    { credits: { composer: { ja: "中村歩", romaji: "Nakamura Ayumu" } } },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
  ]);
  const composers = deriveBoardInsights(songs).credits.composer;

  assert.deepEqual(composers.coverage, { covered: 1, total: 10, percent: 10 });
  assert.deepEqual(
    composers.entries.map((entry) => [entry.key, entry.count]),
    [["nakamura-ayumu", 1]],
  );
});

test("the summary states the leading year, title-track share, span, and lyricist", () => {
  const songs = makeTopTen([
    { releaseDate: "2026-01-01", trackType: "title" },
    { releaseDate: "2026-02-01", trackType: "title" },
    { releaseDate: "2026-03-01", trackType: "title" },
    { releaseDate: "2026-04-01", trackType: "title" },
    { releaseDate: "2025-01-01", trackType: "coupling" },
    { releaseDate: "2025-02-01", trackType: "coupling" },
    { releaseDate: "2024-01-01", trackType: "coupling" },
    { releaseDate: "2024-02-01", trackType: "album" },
    { releaseDate: "2024-03-01", trackType: "album" },
    { releaseDate: "2022-01-01", trackType: "title" },
  ]);
  const { summary } = deriveBoardInsights(songs);

  assert.deepEqual(
    summary.topYears.map((entry) => [entry.year, entry.count]),
    [["2026", 4]],
  );
  assert.deepEqual(summary.yearSpan, { from: "2022", to: "2026" });
  assert.deepEqual(summary.titleTracks, { count: 5, total: 10 });
  assert.deepEqual(
    summary.topLyricists.map((entry) => [entry.key, entry.count]),
    [["sashihara-rino", 10]],
  );
});

test("a tie names everyone that ties instead of picking one", () => {
  const songs = makeTopTen(
    Array.from({ length: 10 }, (_, index) => ({
      releaseDate: index < 5 ? "2026-01-01" : "2025-01-01",
      credits: { lyricist: index < 5 ? WRITER_A : WRITER_B },
    })),
  );
  const { summary } = deriveBoardInsights(songs);

  assert.deepEqual(
    summary.topYears.map((entry) => entry.year),
    ["2026", "2025"],
  );
  assert.deepEqual(
    summary.topLyricists.map((entry) => entry.key),
    ["nakamura-ayumu", "sashihara-rino"],
  );
});

test("a leader with one song is not a fact worth stating", () => {
  const songs = makeTopTen(
    Array.from({ length: 10 }, (_, index) => ({
      releaseDate: `20${16 + index}-01-01`,
      credits: {
        lyricist: index % 2 === 0 ? WRITER_A : WRITER_B,
      },
    })),
  );
  const { summary } = deriveBoardInsights(songs);

  assert.deepEqual(summary.topYears, []);
  assert.deepEqual(summary.yearSpan, { from: "2016", to: "2025" });
  assert.deepEqual(
    summary.topLyricists.map((entry) => entry.count),
    [5, 5],
  );
});

test("the summary drops the parts an incomplete board cannot support", () => {
  const songs = makeTopTen(
    Array.from({ length: 10 }, () => ({
      releaseDate: undefined,
      trackType: undefined,
      credits: {},
    })),
  );
  const { summary } = deriveBoardInsights(songs);

  assert.deepEqual(summary, {
    topYears: [],
    yearSpan: null,
    titleTracks: null,
    topLyricists: [],
  });
});

test("a single covered year has a leader but no span", () => {
  const songs = makeTopTen(
    Array.from({ length: 10 }, () => ({ releaseDate: "2026-01-01" })),
  );
  const { summary } = deriveBoardInsights(songs);

  assert.deepEqual(
    summary.topYears.map((entry) => [entry.year, entry.count]),
    [["2026", 10]],
  );
  assert.equal(summary.yearSpan, null);
});

test("ties use deterministic keys and member or center fields do not affect output", () => {
  const overrides: Partial<Song>[] = Array.from({ length: 10 }, (_, index) => ({
    releaseDate: index % 2 === 0 ? "2024-01-01" : "2023-01-01",
    releaseType: index < 4 ? "single" : index < 8 ? "album" : "digital",
    credits: {
      lyricist: index % 2 === 0 ? WRITER_A : WRITER_B,
    },
  }));
  const songs = makeTopTen(overrides);
  const withoutMemberFacts = deriveBoardInsights(songs);
  const withMemberFacts = deriveBoardInsights(
    songs.map((song) => ({
      ...song,
      centerMemberIds: ["center-a"],
      memberIds: ["member-a", "member-b"],
    })),
  );

  assert.deepEqual(withMemberFacts, withoutMemberFacts);
  assert.deepEqual(
    withoutMemberFacts.releaseYears.entries
      .slice(0, 2)
      .map((entry) => entry.year),
    ["2024", "2023"],
  );
  assert.deepEqual(
    withoutMemberFacts.releaseTypes.entries
      .slice(0, 2)
      .map((entry) => entry.value),
    ["album", "single"],
  );
  assert.deepEqual(
    withoutMemberFacts.credits.lyricist.entries
      .slice(0, 2)
      .map((entry) => entry.key),
    ["nakamura-ayumu", "sashihara-rino"],
  );
});
