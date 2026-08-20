import type {
  LocalizedString,
  ReleaseType,
  Song,
  TrackType,
} from "../schema/music";
import { getConfirmedSongCredit, type SongCreditRole } from "./songCredits";
import {
  RELEASE_TYPE_MESSAGE_KEYS,
  TRACK_TYPE_MESSAGE_KEYS,
} from "./songMetadata";

export interface BoardInsightCoverage {
  covered: number;
  total: number;
  percent: number;
}

export interface BoardInsightDimension<TEntry> {
  coverage: BoardInsightCoverage;
  entries: readonly TEntry[];
}

export interface BoardInsightYearEntry {
  key: string;
  year: string;
  count: number;
}

export interface BoardInsightReleaseTypeEntry {
  key: ReleaseType;
  value: ReleaseType;
  count: number;
}

export interface BoardInsightTrackTypeEntry {
  key: TrackType;
  value: TrackType;
  count: number;
}

export interface BoardInsightCreditEntry {
  key: string;
  value: LocalizedString;
  count: number;
}

export interface BoardInsights {
  releaseYears: BoardInsightDimension<BoardInsightYearEntry>;
  releaseTypes: BoardInsightDimension<BoardInsightReleaseTypeEntry>;
  trackTypes: BoardInsightDimension<BoardInsightTrackTypeEntry>;
  credits: {
    lyricist: BoardInsightDimension<BoardInsightCreditEntry>;
    composer: BoardInsightDimension<BoardInsightCreditEntry>;
    arranger: BoardInsightDimension<BoardInsightCreditEntry>;
  };
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function compareStableKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function coverageFor(covered: number, total: number): BoardInsightCoverage {
  return {
    covered,
    total,
    percent: total === 0 ? 0 : Math.round((covered / total) * 100),
  };
}

function getValidReleaseYear(releaseDate: string | undefined): string | null {
  const match = releaseDate?.match(ISO_DATE_PATTERN);
  if (!match || match[1] === "0000") return null;

  const [, rawYear, rawMonth, rawDay] = match;
  const parsed = new Date(`${releaseDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.getUTCFullYear() === Number(rawYear) &&
    parsed.getUTCMonth() + 1 === Number(rawMonth) &&
    parsed.getUTCDate() === Number(rawDay)
    ? rawYear
    : null;
}

function isReleaseType(value: unknown): value is ReleaseType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RELEASE_TYPE_MESSAGE_KEYS, value)
  );
}

function isTrackType(value: unknown): value is TrackType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TRACK_TYPE_MESSAGE_KEYS, value)
  );
}

function sortByCountThenKey<TEntry extends { key: string; count: number }>(
  entries: TEntry[],
): TEntry[] {
  return entries.sort(
    (left, right) =>
      right.count - left.count || compareStableKeys(left.key, right.key),
  );
}

function deriveYearInsights(
  songs: readonly Song[],
): BoardInsightDimension<BoardInsightYearEntry> {
  const counts = new Map<string, number>();
  let covered = 0;

  for (const song of songs) {
    const year = getValidReleaseYear(song.releaseDate);
    if (!year) continue;

    covered += 1;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }

  const entries = [...counts.entries()]
    .map(([year, count]) => ({ key: year, year, count }))
    .sort(
      (left, right) =>
        Number(right.year) - Number(left.year) ||
        compareStableKeys(left.key, right.key),
    );

  return { coverage: coverageFor(covered, songs.length), entries };
}

function deriveEnumInsights<
  TValue extends string,
  TEntry extends {
    key: TValue;
    value: TValue;
    count: number;
  },
>(
  songs: readonly Song[],
  getValue: (song: Song) => TValue | null,
  createEntry: (value: TValue, count: number) => TEntry,
): BoardInsightDimension<TEntry> {
  const counts = new Map<TValue, number>();
  let covered = 0;

  for (const song of songs) {
    const value = getValue(song);
    if (!value) continue;

    covered += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const entries = sortByCountThenKey(
    [...counts.entries()].map(([value, count]) => createEntry(value, count)),
  );

  return { coverage: coverageFor(covered, songs.length), entries };
}

function trimLocalizedString(value: LocalizedString): LocalizedString {
  const trimmed: LocalizedString = {
    ja: value.ja.trim(),
    romaji: value.romaji.trim(),
  };
  const english = value.en?.trim();
  if (english) trimmed.en = english;
  return trimmed;
}

function getLocalizedStringKey(value: LocalizedString): string {
  return JSON.stringify([value.ja, value.romaji, value.en ?? ""]);
}

function deriveCreditInsights(
  songs: readonly Song[],
  role: SongCreditRole,
): BoardInsightDimension<BoardInsightCreditEntry> {
  const counts = new Map<string, BoardInsightCreditEntry>();
  let covered = 0;

  for (const song of songs) {
    const confirmedCredit = getConfirmedSongCredit(song, role);
    if (!confirmedCredit) continue;

    covered += 1;
    const value = trimLocalizedString(confirmedCredit);
    const key = getLocalizedStringKey(value);
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { key, value, count: 1 });
    }
  }

  return {
    coverage: coverageFor(covered, songs.length),
    entries: sortByCountThenKey([...counts.values()]),
  };
}

/**
 * Derives factual, rank-order-independent summaries for an already validated
 * board. Callers decide whether a board is complete and eligible to display.
 */
export function deriveBoardInsights(songs: readonly Song[]): BoardInsights {
  return {
    releaseYears: deriveYearInsights(songs),
    releaseTypes: deriveEnumInsights(
      songs,
      (song) => (isReleaseType(song.releaseType) ? song.releaseType : null),
      (value, count) => ({ key: value, value, count }),
    ),
    trackTypes: deriveEnumInsights(
      songs,
      (song) => (isTrackType(song.trackType) ? song.trackType : null),
      (value, count) => ({ key: value, value, count }),
    ),
    credits: {
      lyricist: deriveCreditInsights(songs, "lyricist"),
      composer: deriveCreditInsights(songs, "composer"),
      arranger: deriveCreditInsights(songs, "arranger"),
    },
  };
}
