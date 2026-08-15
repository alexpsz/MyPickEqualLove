import {
  ARCHETYPE_TRAIT_IDS,
  type AdventureAffinityCatalog,
  type AdventureAffinityResult,
  type AdventureAffinityWinner,
  type ApprovedSongAffinity,
  type RoleAffinityProfile,
  type TraitId,
  type UserTraitVector,
} from "../schema/archetype";

export const ARCHETYPE_TOP_TEN_SIZE = 10;

export type ArchetypeAffinityErrorCode =
  | "INVALID_TOP_TEN_COUNT"
  | "DUPLICATE_SONG_ID"
  | "SONG_AFFINITY_NOT_FOUND"
  | "INVALID_SONG_AFFINITY"
  | "DUPLICATE_CATALOG_SONG_ID"
  | "NO_ROLE_PROFILES"
  | "DUPLICATE_ROLE_ID"
  | "INVALID_ROLE_PROFILE";

export class ArchetypeAffinityError extends Error {
  constructor(
    public readonly code: ArchetypeAffinityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArchetypeAffinityError";
  }
}

interface ScoredRole {
  profile: RoleAffinityProfile;
  adjustedScore: number;
}

/**
 * Creates a matcher over a defensive snapshot of build-time/static data.
 * Reusing the returned function cannot observe later caller mutations.
 */
export function createAdventureAffinityMatcher(
  catalog: AdventureAffinityCatalog,
): (songIds: readonly string[]) => AdventureAffinityResult {
  const snapshot = cloneAndValidateCatalog(catalog);
  return (songIds) => deriveAdventureAffinity(songIds, snapshot);
}

/**
 * Matches exactly ten unique songs against static role profiles.
 * Song order never affects the aggregate or winner; it is only the specified
 * tie-break for equally contributing songs in the explanation.
 */
export function deriveAdventureAffinity(
  songIds: readonly string[],
  catalog: AdventureAffinityCatalog,
): AdventureAffinityResult {
  assertTopTen(songIds);
  const validatedCatalog = cloneAndValidateCatalog(catalog);
  const songById = new Map(
    validatedCatalog.songAffinities.map((affinity) => [
      affinity.songId,
      affinity,
    ]),
  );
  const selectedAffinities = songIds.map((songId) => {
    const affinity = songById.get(songId);
    if (!affinity) {
      throw new ArchetypeAffinityError(
        "SONG_AFFINITY_NOT_FOUND",
        `No approved archetype affinity data exists for song ID: ${songId}`,
      );
    }
    return affinity;
  });

  const totals = aggregateTraitTotals(selectedAffinities);
  const userVector = mapTraits(
    (traitId) => totals[traitId] / ARCHETYPE_TOP_TEN_SIZE,
  );
  const catalogTotals = aggregateTraitTotals(validatedCatalog.songAffinities);
  const scoredRoles = validatedCatalog.roleProfiles.map((profile) => {
    const selectedRawScore = ARCHETYPE_TRAIT_IDS.reduce(
      (sum, traitId) =>
        sum + totals[traitId] * (profile.affinities[traitId] ?? 0),
      0,
    );
    const catalogRawScore = ARCHETYPE_TRAIT_IDS.reduce(
      (sum, traitId) =>
        sum + catalogTotals[traitId] * (profile.affinities[traitId] ?? 0),
      0,
    );
    return {
      profile,
      adjustedScore:
        validatedCatalog.songAffinities.length * selectedRawScore -
        ARCHETYPE_TOP_TEN_SIZE * catalogRawScore,
    };
  });

  const winners = findExactWinners(scoredRoles)
    .sort((left, right) =>
      compareStableIds(left.profile.roleId, right.profile.roleId),
    )
    .map((scoredRole) =>
      buildWinner(scoredRole, userVector, selectedAffinities),
    );

  return {
    userVector,
    winners,
    isTie: winners.length > 1,
  };
}

/** Validates the canonical eight-dimensional 2 + 2 + 1 fingerprint. */
export function assertValidSongAffinity(affinity: ApprovedSongAffinity): void {
  if (
    !isNonEmptyString(affinity.songId) ||
    affinity.rubricVersion !== "gemini-video-v1" ||
    affinity.status !== "approved" ||
    (affinity.confidence !== "low" &&
      affinity.confidence !== "medium" &&
      affinity.confidence !== "high")
  ) {
    throw invalidSongAffinity(
      affinity.songId,
      "expected an approved gemini-video-v1 record with low, medium, or high confidence",
    );
  }

  const scoreKeys = Object.keys(affinity.scores ?? {});
  if (
    scoreKeys.length !== ARCHETYPE_TRAIT_IDS.length ||
    scoreKeys.some((key) => !isTraitId(key))
  ) {
    throw invalidSongAffinity(
      affinity.songId,
      "scores must contain exactly the eight canonical traits",
    );
  }

  const values = ARCHETYPE_TRAIT_IDS.map(
    (traitId) => affinity.scores[traitId] as unknown,
  );
  if (values.some((value) => value !== 0 && value !== 1 && value !== 2)) {
    throw invalidSongAffinity(
      affinity.songId,
      "every trait score must be 0, 1, or 2",
    );
  }
  if (
    values.filter((value) => value === 2).length !== 2 ||
    values.filter((value) => value === 1).length !== 1 ||
    values.filter((value) => value === 0).length !== 5
  ) {
    throw invalidSongAffinity(
      affinity.songId,
      "fingerprint must contain exactly two dominant scores of 2, one accent score of 1, and five scores of 0",
    );
  }
}

export function assertValidRoleProfile(profile: RoleAffinityProfile): void {
  if (!isNonEmptyString(profile.roleId) || profile.profileVersion !== "v1") {
    throw invalidRoleProfile(
      profile.roleId,
      "expected a non-empty role ID and profileVersion v1",
    );
  }
  const entries = Object.entries(profile.affinities ?? {});
  const values = ARCHETYPE_TRAIT_IDS.map(
    (traitId) => profile.affinities[traitId] ?? 0,
  );
  if (
    entries.some(
      ([traitId, affinity]) =>
        !isTraitId(traitId) ||
        (affinity !== 0 && affinity !== 1 && affinity !== 2),
    ) ||
    values.filter((value) => value === 2).length !== 2 ||
    values.filter((value) => value === 1).length !== 1 ||
    values.filter((value) => value === 0).length !== 5
  ) {
    throw invalidRoleProfile(
      profile.roleId,
      "fingerprint must contain exactly two dominant affinities of 2, one accent affinity of 1, and five omitted or explicit zeroes",
    );
  }
}

function cloneAndValidateCatalog(
  catalog: AdventureAffinityCatalog,
): AdventureAffinityCatalog {
  const seenSongs = new Set<string>();
  const songAffinities = catalog.songAffinities.map((affinity) => {
    assertValidSongAffinity(affinity);
    if (seenSongs.has(affinity.songId)) {
      throw new ArchetypeAffinityError(
        "DUPLICATE_CATALOG_SONG_ID",
        `Static archetype catalog contains duplicate song ID: ${affinity.songId}`,
      );
    }
    seenSongs.add(affinity.songId);
    return { ...affinity, scores: { ...affinity.scores } };
  });

  if (catalog.roleProfiles.length === 0) {
    throw new ArchetypeAffinityError(
      "NO_ROLE_PROFILES",
      "Static archetype catalog must contain at least one role profile",
    );
  }
  const seenRoles = new Set<string>();
  const roleProfiles = catalog.roleProfiles.map((profile) => {
    assertValidRoleProfile(profile);
    if (seenRoles.has(profile.roleId)) {
      throw new ArchetypeAffinityError(
        "DUPLICATE_ROLE_ID",
        `Static archetype catalog contains duplicate role ID: ${profile.roleId}`,
      );
    }
    seenRoles.add(profile.roleId);
    return { ...profile, affinities: { ...profile.affinities } };
  });

  return { songAffinities, roleProfiles };
}

function assertTopTen(songIds: readonly string[]) {
  if (songIds.length !== ARCHETYPE_TOP_TEN_SIZE) {
    throw new ArchetypeAffinityError(
      "INVALID_TOP_TEN_COUNT",
      `Archetype affinity requires exactly ${ARCHETYPE_TOP_TEN_SIZE} song IDs; received ${songIds.length}`,
    );
  }
  const seen = new Set<string>();
  for (const songId of songIds) {
    if (!isNonEmptyString(songId)) {
      throw new ArchetypeAffinityError(
        "SONG_AFFINITY_NOT_FOUND",
        "Top 10 contains an empty song ID",
      );
    }
    if (seen.has(songId)) {
      throw new ArchetypeAffinityError(
        "DUPLICATE_SONG_ID",
        `Top 10 contains duplicate song ID: ${songId}`,
      );
    }
    seen.add(songId);
  }
}

function aggregateTraitTotals(
  affinities: readonly ApprovedSongAffinity[],
): Record<TraitId, number> {
  return mapTraits((traitId) =>
    affinities.reduce((sum, affinity) => sum + affinity.scores[traitId], 0),
  );
}

function findExactWinners(scoredRoles: readonly ScoredRole[]): ScoredRole[] {
  let winners: ScoredRole[] = [];
  for (const candidate of scoredRoles) {
    if (winners.length === 0) {
      winners = [candidate];
      continue;
    }
    const comparison = compareAdjustedScores(candidate, winners[0]);
    if (comparison > 0) winners = [candidate];
    else if (comparison === 0) winners.push(candidate);
  }
  return winners;
}

function compareAdjustedScores(left: ScoredRole, right: ScoredRole): number {
  // Every validated role has the same 2 + 2 + 1 norm. Comparing these signed
  // integers therefore preserves the cosine order after subtracting the full
  // catalog's expected Top 10 score. Do not square: adjusted scores may be
  // negative.
  if (left.adjustedScore === right.adjustedScore) return 0;
  return left.adjustedScore > right.adjustedScore ? 1 : -1;
}

function buildWinner(
  scoredRole: ScoredRole,
  userVector: UserTraitVector,
  songs: readonly ApprovedSongAffinity[],
): AdventureAffinityWinner {
  const overlapTraits = ARCHETYPE_TRAIT_IDS.map((traitId, index) => ({
    traitId,
    contribution:
      userVector[traitId] * (scoredRole.profile.affinities[traitId] ?? 0),
    index,
  }))
    .filter(({ contribution }) => contribution > 0)
    .sort(
      (left, right) =>
        right.contribution - left.contribution || left.index - right.index,
    )
    .slice(0, 2)
    .map(({ traitId, contribution }) => ({ traitId, contribution }));

  const contributingSongs = songs
    .map((song, index) => ({
      songId: song.songId,
      contribution: ARCHETYPE_TRAIT_IDS.reduce(
        (sum, traitId) =>
          sum +
          song.scores[traitId] * (scoredRole.profile.affinities[traitId] ?? 0),
        0,
      ),
      index,
    }))
    .sort(
      (left, right) =>
        right.contribution - left.contribution || left.index - right.index,
    )
    .slice(0, 2)
    .map(({ songId, contribution }) => ({ songId, contribution }));

  return {
    roleId: scoredRole.profile.roleId,
    adjustedScore: scoredRole.adjustedScore,
    overlapTraits,
    contributingSongs,
  };
}

function mapTraits<T>(mapper: (traitId: TraitId) => T): Record<TraitId, T> {
  return Object.fromEntries(
    ARCHETYPE_TRAIT_IDS.map((traitId) => [traitId, mapper(traitId)]),
  ) as Record<TraitId, T>;
}

function isTraitId(value: string): value is TraitId {
  return (ARCHETYPE_TRAIT_IDS as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareStableIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalidSongAffinity(songId: unknown, detail: string) {
  return new ArchetypeAffinityError(
    "INVALID_SONG_AFFINITY",
    `Invalid archetype affinity for song ID ${String(songId)}: ${detail}`,
  );
}

function invalidRoleProfile(roleId: unknown, detail: string) {
  return new ArchetypeAffinityError(
    "INVALID_ROLE_PROFILE",
    `Invalid archetype role profile ${String(roleId)}: ${detail}`,
  );
}
