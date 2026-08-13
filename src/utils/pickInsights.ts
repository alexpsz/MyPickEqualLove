import { PICK_INSIGHTS_CONFIG } from "../config/pickInsights";
import type {
  InsightCoverage,
  InsightDistribution,
  InsightRanking,
  PickInsights,
} from "../schema/pick-insights";
import type {
  Member,
  Picks,
  ReleaseType,
  Song,
  TrackType,
} from "../schema/music";
import { getConfirmedSongCredits } from "./songCredits";

export function derivePickInsights(
  picks: Picks,
  membersById: Readonly<Record<string, Member>>,
): PickInsights {
  const songs = getUniquePickedSongs(picks);
  const total = songs.length;
  const decades = new Map<string, number>();
  const releaseYears = new Map<string, number>();
  const releaseTypes = new Map<ReleaseType, number>();
  const trackTypes = new Map<TrackType, number>();
  const members = new Map<string, number>();
  const centers = new Map<string, number>();
  const lyricists = new Map<string, number>();
  const composers = new Map<string, number>();
  const arrangers = new Map<string, number>();
  let knownReleaseYears = 0;
  let knownReleaseTypes = 0;
  let knownTrackTypes = 0;
  let knownMembers = 0;
  let knownCenters = 0;
  let knownCredits = 0;

  for (const song of songs) {
    const year = getReleaseYear(song);
    if (year) {
      knownReleaseYears += 1;
      increment(decades, `${Math.floor(Number(year) / 10) * 10}s`);
      increment(releaseYears, year);
    }
    if (song.releaseType) {
      knownReleaseTypes += 1;
      increment(releaseTypes, song.releaseType);
    }
    if (song.trackType) {
      knownTrackTypes += 1;
      increment(trackTypes, song.trackType);
    }
    if (hasKnownMembers(song.memberIds, membersById)) {
      knownMembers += 1;
      incrementEach(members, song.memberIds!);
    }
    if (hasKnownMembers(song.centerMemberIds, membersById)) {
      knownCenters += 1;
      incrementEach(centers, song.centerMemberIds!);
    }

    const credits = getConfirmedSongCredits(song);
    if (credits) {
      knownCredits += 1;
      increment(lyricists, credits.lyricist.ja);
      increment(composers, credits.composer.ja);
      increment(arrangers, credits.arranger.ja);
    }
  }

  const creditsCoverage = createCoverage(knownCredits, total);
  return {
    selectedCount: total,
    decades: createDistribution(decades, knownReleaseYears, total),
    releaseYears: createDistribution(releaseYears, knownReleaseYears, total),
    releaseTypes: createDistribution(releaseTypes, knownReleaseTypes, total),
    trackTypes: createDistribution(trackTypes, knownTrackTypes, total),
    members: createRanking(members, knownMembers, total),
    credits: {
      coverage: creditsCoverage,
      lyricists: createRanking(lyricists, knownCredits, total),
      composers: createRanking(composers, knownCredits, total),
      arrangers: createRanking(arrangers, knownCredits, total),
    },
    centers: createRanking(centers, knownCenters, total),
  };
}

export function getUniquePickedSongs(picks: Picks): Song[] {
  return Array.from(
    new Map(Object.values(picks).map((song) => [song.id, song])).values(),
  );
}

export function limitInsightExportValues<T>(
  values: readonly T[],
  maxVisible: number,
) {
  const safeMaximum = Math.max(0, Math.floor(maxVisible));
  const visible = values.slice(0, safeMaximum);
  return {
    visible,
    hiddenCount: values.length - visible.length,
  };
}

function getReleaseYear(song: Song) {
  const value = song.releaseDate?.slice(0, 4);
  return value && /^\d{4}$/.test(value) ? value : undefined;
}

function hasKnownMembers(
  memberIds: readonly string[] | undefined,
  membersById: Readonly<Record<string, Member>>,
) {
  return Boolean(
    memberIds &&
    memberIds.length > 0 &&
    memberIds.every((memberId) => Boolean(membersById[memberId])),
  );
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function incrementEach(map: Map<string, number>, values: readonly string[]) {
  for (const value of new Set(values)) {
    increment(map, value);
  }
}

function createCoverage(known: number, total: number): InsightCoverage {
  return {
    known,
    total,
    coverage: total === 0 ? null : known / total,
    unknown: total - known,
    complete: total > 0 && known === total,
  };
}

function createDistribution<T extends string>(
  counts: ReadonlyMap<T, number>,
  known: number,
  total: number,
): InsightDistribution<T> {
  return {
    coverage: createCoverage(known, total),
    values: toSortedValues(counts),
  };
}

function createRanking<T extends string>(
  counts: ReadonlyMap<T, number>,
  known: number,
  total: number,
): InsightRanking<T> {
  const coverage = createCoverage(known, total);
  const eligible =
    total >= PICK_INSIGHTS_CONFIG.rankingMinimumSelections &&
    coverage.coverage !== null &&
    coverage.coverage >= PICK_INSIGHTS_CONFIG.rankingCoverageThreshold;
  const values = toSortedValues(counts);
  const leaderCount = eligible ? (values[0]?.count ?? null) : null;

  return {
    coverage,
    eligible,
    leaders:
      leaderCount === null
        ? []
        : values
            .filter((value) => value.count === leaderCount)
            .map(({ key }) => key),
    leaderCount,
  };
}

function toSortedValues<T extends string>(counts: ReadonlyMap<T, number>) {
  return Array.from(counts, ([key, count]) => ({ key, count })).sort(
    (left, right) =>
      right.count - left.count || compareCodePoints(left.key, right.key),
  );
}

function compareCodePoints(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
