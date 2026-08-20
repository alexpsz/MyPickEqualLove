import assert from "node:assert/strict";
import test from "node:test";

import type { LocalizedString, Song } from "../../src/schema/music";
import { deriveBoardInsights } from "../../src/utils/boardInsights";
import {
  getConfirmedSongCredit,
  getConfirmedSongCredits,
} from "../../src/utils/songCredits";

const WRITER_A: LocalizedString = {
  ja: "作詞者A",
  romaji: "Sakushisha A",
};
const WRITER_B: LocalizedString = {
  ja: "作詞者B",
  romaji: "Sakushisha B",
};
const COMPOSER_A: LocalizedString = {
  ja: "作曲者A",
  romaji: "Sakkyokusha A",
};
const ARRANGER_A: LocalizedString = {
  ja: "編曲者A",
  romaji: "Henkokusha A",
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

test("credit values remain exact trimmed fields rather than split contributor names", () => {
  const preciseCredit: LocalizedString = {
    ja: "  指原莉乃・佐々木舞香 & feat.  ",
    romaji: "  Sashihara Rino & Sasaki Maika feat.  ",
  };
  const songs = makeTopTen([
    { credits: { lyricist: preciseCredit } },
    {
      credits: {
        lyricist: {
          ja: " 指原莉乃・佐々木舞香 & feat. ",
          romaji: " Sashihara Rino & Sasaki Maika feat. ",
        },
      },
    },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
    { credits: {} },
  ]);
  const lyricists = deriveBoardInsights(songs).credits.lyricist;

  assert.equal(lyricists.coverage.covered, 2);
  assert.equal(lyricists.entries.length, 1);
  assert.deepEqual(lyricists.entries[0], {
    key: JSON.stringify([
      "指原莉乃・佐々木舞香 & feat.",
      "Sashihara Rino & Sasaki Maika feat.",
      "",
    ]),
    value: {
      ja: "指原莉乃・佐々木舞香 & feat.",
      romaji: "Sashihara Rino & Sasaki Maika feat.",
    },
    count: 2,
  });
});

test("ties use deterministic keys and member or center fields do not affect output", () => {
  const overrides: Partial<Song>[] = Array.from({ length: 10 }, (_, index) => ({
    releaseDate: index % 2 === 0 ? "2024-01-01" : "2023-01-01",
    releaseType: index < 4 ? "single" : index < 8 ? "album" : "digital",
    credits: {
      lyricist:
        index % 2 === 0 ? { ja: "B", romaji: "B" } : { ja: "A", romaji: "A" },
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
      .map((entry) => entry.value.ja),
    ["A", "B"],
  );
});
