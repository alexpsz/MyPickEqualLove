import type { Member, Song } from "../schema/music";
import { getConfirmedSongCredits } from "./songCredits";

export interface SearchKeyInput {
  key: string;
  isComposing?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface RankedSong {
  song: Song;
  rank: number;
  originalIndex: number;
}

export type SearchSelectionMode = "board" | "assistant-shortlist";

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;
const MAX_TYPO_DISTANCE = 1;
const MIN_TYPO_QUERY_LENGTH = 5;
const LATIN_QUERY_PATTERN = /^[a-z0-9]+$/;

export function shouldShowGraduatedMemberFeaturesByDefault(
  selectionMode: SearchSelectionMode,
) {
  return selectionMode === "assistant-shortlist";
}

export function isGraduatedMemberVisibilityFilterActive(
  selectionMode: SearchSelectionMode,
  showGraduatedMembers: boolean,
) {
  return (
    showGraduatedMembers !==
    shouldShowGraduatedMemberFeaturesByDefault(selectionMode)
  );
}

export function normalizeSongSearchText(value: string | undefined): string {
  if (!value) return "";

  return Array.from(value.normalize("NFKC").toLocaleLowerCase("und"))
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (
        codePoint !== undefined &&
        codePoint >= KATAKANA_START &&
        codePoint <= KATAKANA_END
      ) {
        return String.fromCodePoint(codePoint - KATAKANA_TO_HIRAGANA_OFFSET);
      }
      return character;
    })
    .join("")
    .replace(/[^\p{L}\p{N}\p{M}=]/gu, "");
}

export function rankSongsByQuery(
  songs: Song[],
  queryValue: string,
  membersById: Record<string, Member>,
): RankedSong[] {
  const query = normalizeSongSearchText(queryValue);

  return songs
    .map((song, originalIndex) => ({
      song,
      originalIndex,
      rank: getSongMatchRank(song, query, membersById),
    }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort(
      (left, right) =>
        left.rank - right.rank || left.originalIndex - right.originalIndex,
    );
}

export function getFirstSearchResultForEnter<T>(
  results: readonly T[],
  input: SearchKeyInput,
): T | undefined {
  if (
    input.key !== "Enter" ||
    input.isComposing ||
    input.altKey ||
    input.ctrlKey ||
    input.metaKey ||
    input.shiftKey
  ) {
    return undefined;
  }

  return results[0];
}

function getSongMatchRank(
  song: Song,
  query: string,
  membersById: Record<string, Member>,
) {
  if (!query) return 0;

  const searchableParts = getSearchableParts(song, membersById);
  const normalizedTitles = searchableParts.titles.map(normalizeSongSearchText);
  const normalizedSecondary = searchableParts.secondary.map(
    normalizeSongSearchText,
  );

  if (normalizedTitles.some((part) => part === query)) return 0;
  if (normalizedTitles.some((part) => part.startsWith(query))) return 1;
  if (normalizedTitles.some((part) => part.includes(query))) return 2;
  if (normalizedSecondary.some((part) => part === query)) return 3;
  if (normalizedSecondary.some((part) => part.startsWith(query))) return 4;
  if (normalizedSecondary.some((part) => part.includes(query))) return 5;
  if (
    isConservativeTitleTypo(query) &&
    normalizedTitles.some(
      (part) =>
        LATIN_QUERY_PATTERN.test(part) &&
        Math.abs(part.length - query.length) <= MAX_TYPO_DISTANCE &&
        isWithinOneEdit(part, query),
    )
  ) {
    return 6;
  }
  return Number.POSITIVE_INFINITY;
}

function getSearchableParts(song: Song, membersById: Record<string, Member>) {
  const credits = getConfirmedSongCredits(song);
  const creditParts = credits
    ? [
        credits.lyricist.ja,
        credits.lyricist.romaji,
        credits.composer.ja,
        credits.composer.romaji,
        credits.arranger.ja,
        credits.arranger.romaji,
      ]
    : [];
  const memberParts = [
    ...(song.memberIds ?? []),
    ...(song.centerMemberIds ?? []),
  ]
    .map((memberId) => membersById[memberId])
    .filter((member): member is Member => Boolean(member))
    .flatMap((member) => [
      member.name.ja,
      member.name.romaji,
      member.name.en ?? "",
    ]);

  return {
    titles: [song.title.ja, song.title.romaji, song.title.en],
    secondary: [
      song.artist.ja,
      song.artist.romaji,
      song.artist.en,
      ...creditParts,
      ...memberParts,
    ],
  };
}

function isConservativeTitleTypo(query: string) {
  return (
    query.length >= MIN_TYPO_QUERY_LENGTH && LATIN_QUERY_PATTERN.test(query)
  );
}

function isWithinOneEdit(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > MAX_TYPO_DISTANCE) return false;

  if (left.length === right.length) {
    const differences: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
    }
    if (differences.length <= MAX_TYPO_DISTANCE) return true;
    return (
      differences.length === 2 &&
      differences[1] === differences[0] + 1 &&
      left[differences[0]] === right[differences[1]] &&
      left[differences[1]] === right[differences[0]]
    );
  }

  const [shorter, longer] =
    left.length < right.length ? [left, right] : [right, left];
  let shorterIndex = 0;
  let longerIndex = 0;
  let skipped = false;

  while (shorterIndex < shorter.length && longerIndex < longer.length) {
    if (shorter[shorterIndex] === longer[longerIndex]) {
      shorterIndex += 1;
      longerIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longerIndex += 1;
  }

  return true;
}
