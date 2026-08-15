import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHETYPE_TRAIT_IDS,
  type AdventureAffinityCatalog,
  type ApprovedSongAffinity,
  type RoleAffinityProfile,
  type SongTraitScores,
} from "../src/schema/archetype";
import {
  ArchetypeAffinityError,
  assertValidSongAffinity,
  createAdventureAffinityMatcher,
  deriveAdventureAffinity,
} from "../src/utils/archetypeAffinity";

const fingerprints: readonly SongTraitScores[] = [
  scores("drive", "growth", "rhythm"),
  scores("drive", "rhythm", "uplift"),
  scores("care", "growth", "drama"),
  scores("rhythm", "uplift", "cuteness"),
  scores("drama", "ingenuity", "care"),
  scores("drive", "drama", "growth"),
  scores("care", "uplift", "cuteness"),
  scores("growth", "ingenuity", "drive"),
  scores("rhythm", "cuteness", "uplift"),
  scores("drama", "uplift", "care"),
];

const songs = fingerprints.map((fingerprint, index) =>
  song(`song-${index + 1}`, fingerprint),
);
const topTen = songs.map(({ songId }) => songId);

test("the schema exposes the fixed eight-dimensional rubric", () => {
  assert.deepEqual(ARCHETYPE_TRAIT_IDS, [
    "drive",
    "care",
    "rhythm",
    "growth",
    "drama",
    "ingenuity",
    "uplift",
    "cuteness",
  ]);
});

test("strict validation accepts only an exact 2 + 2 + 1 fingerprint", () => {
  assert.doesNotThrow(() => assertValidSongAffinity(songs[0]));

  for (const [label, invalidScores] of [
    ["third dominant", { ...fingerprints[0], care: 2 }],
    ["second accent", { ...fingerprints[0], care: 1 }],
    ["missing accent", { ...fingerprints[0], rhythm: 0 }],
  ] as const) {
    assert.throws(
      () =>
        assertValidSongAffinity(
          song(`invalid-${label}`, invalidScores as SongTraitScores),
        ),
      (error) =>
        error instanceof ArchetypeAffinityError &&
        error.code === "INVALID_SONG_AFFINITY" &&
        /exactly two dominant scores of 2/.test(error.message),
    );
  }
});

test("Top 10 aggregation is an equal arithmetic mean without per-song normalization", () => {
  const catalog = createCatalog(songs, [
    role("drive-role", { drive: 2, growth: 1 }),
  ]);
  const result = deriveAdventureAffinity(topTen, catalog);
  for (const traitId of ARCHETYPE_TRAIT_IDS) {
    const expected =
      songs.reduce((sum, affinity) => sum + affinity.scores[traitId], 0) / 10;
    assert.equal(result.userVector[traitId], expected);
  }
  assert.equal(result.userVector.drive, 0.7);
});

test("cosine matching is deterministic and Top 10 order cannot change winners", () => {
  const catalog = createCatalog(songs, [
    role("care-role", { care: 2, cuteness: 1 }),
    role("drive-role", { drive: 2, growth: 1 }),
    role("drama-role", { drama: 2, ingenuity: 1 }),
  ]);
  const forward = deriveAdventureAffinity(topTen, catalog);
  const reverse = deriveAdventureAffinity(topTen.toReversed(), catalog);
  assert.deepEqual(
    forward.winners.map(({ roleId }) => roleId),
    reverse.winners.map(({ roleId }) => roleId),
  );
  assert.deepEqual(forward.userVector, reverse.userVector);
});

test("mathematically equal role scores return every co-winner regardless of role array order", () => {
  const tiedRoles = [
    role("role-z", { drive: 2, care: 2 }),
    role("role-a", { drive: 2, care: 2 }),
    role("different", { ingenuity: 2, cuteness: 1 }),
  ];
  const first = deriveAdventureAffinity(
    topTen,
    createCatalog(songs, tiedRoles),
  );
  const second = deriveAdventureAffinity(
    topTen,
    createCatalog(songs, tiedRoles.toReversed()),
  );
  assert.equal(first.isTie, true);
  assert.deepEqual(
    first.winners.map(({ roleId }) => roleId),
    ["role-a", "role-z"],
  );
  assert.deepEqual(
    second.winners.map(({ roleId }) => roleId),
    ["role-a", "role-z"],
  );
});

test("similar but mathematically unequal roles are not treated as tied", () => {
  const identical = Array.from({ length: 10 }, (_, index) =>
    song(`focused-${index + 1}`, scores("drive", "care", "rhythm")),
  );
  const result = deriveAdventureAffinity(
    identical.map(({ songId }) => songId),
    createCatalog(identical, [
      role("exact", { drive: 2, care: 2, rhythm: 1 }),
      role("extra-dimension", {
        drive: 2,
        care: 2,
        rhythm: 1,
        growth: 1,
      }),
    ]),
  );
  assert.equal(result.isTie, false);
  assert.deepEqual(
    result.winners.map(({ roleId }) => roleId),
    ["exact"],
  );
});

test("the explanation returns the top two overlap traits", () => {
  const result = deriveAdventureAffinity(
    topTen,
    createCatalog(songs, [
      role("wide-role", { drive: 2, drama: 2, uplift: 1, care: 1 }),
    ]),
  );
  assert.deepEqual(
    result.winners[0].overlapTraits.map(({ traitId }) => traitId),
    ["drive", "drama"],
  );
});

test("equally contributing songs use the user's Top 10 order as the only tie-break", () => {
  const identical = Array.from({ length: 10 }, (_, index) =>
    song(`equal-${index + 1}`, scores("drive", "care", "rhythm")),
  );
  const orderedIds = identical.map(({ songId }) => songId);
  const catalog = createCatalog(identical, [
    role("role", { drive: 2, care: 1 }),
  ]);
  const forward = deriveAdventureAffinity(orderedIds, catalog);
  const swapped = deriveAdventureAffinity(
    [
      orderedIds[5],
      orderedIds[8],
      ...orderedIds.filter((_, i) => i !== 5 && i !== 8),
    ],
    catalog,
  );
  assert.deepEqual(
    forward.winners[0].contributingSongs.map(({ songId }) => songId),
    ["equal-1", "equal-2"],
  );
  assert.deepEqual(
    swapped.winners[0].contributingSongs.map(({ songId }) => songId),
    ["equal-6", "equal-9"],
  );
  assert.equal(forward.winners[0].roleId, swapped.winners[0].roleId);
});

test("editorial confidence is validated but never enters the algorithm", () => {
  const mediumSongs = songs.map((affinity) => ({
    ...affinity,
    confidence: "medium" as const,
  }));
  const highSongs = songs.map((affinity) => ({
    ...affinity,
    confidence: "high" as const,
  }));
  const roles = [
    role("role-1", { drive: 2, growth: 1 }),
    role("role-2", { drama: 2, uplift: 1 }),
  ];
  assert.deepEqual(
    deriveAdventureAffinity(topTen, createCatalog(mediumSongs, roles)),
    deriveAdventureAffinity(topTen, createCatalog(highSongs, roles)),
  );
});

test("missing and duplicate Top 10 songs fail with explicit error codes and IDs", () => {
  const catalog = createCatalog(songs, [role("role", { drive: 2, care: 1 })]);
  assertAffinityError(
    () =>
      deriveAdventureAffinity(
        [topTen[0], topTen[0], ...topTen.slice(2)],
        catalog,
      ),
    "DUPLICATE_SONG_ID",
    topTen[0],
  );
  assertAffinityError(
    () =>
      deriveAdventureAffinity(
        [...topTen.slice(0, 9), "not-in-static-data"],
        catalog,
      ),
    "SONG_AFFINITY_NOT_FOUND",
    "not-in-static-data",
  );
  assertAffinityError(
    () => deriveAdventureAffinity(topTen.slice(0, 9), catalog),
    "INVALID_TOP_TEN_COUNT",
    "received 9",
  );
});

test("duplicate role and catalog song IDs fail closed", () => {
  assertAffinityError(
    () =>
      deriveAdventureAffinity(
        topTen,
        createCatalog(
          [...songs, songs[0]],
          [role("role", { drive: 2, care: 1 })],
        ),
      ),
    "DUPLICATE_CATALOG_SONG_ID",
    songs[0].songId,
  );
  assertAffinityError(
    () =>
      deriveAdventureAffinity(
        topTen,
        createCatalog(songs, [
          role("same", { drive: 2, care: 1 }),
          role("same", { drama: 2, growth: 1 }),
        ]),
      ),
    "DUPLICATE_ROLE_ID",
    "same",
  );
});

test("the static matcher snapshots data and stays deterministic after caller mutation", () => {
  const mutableSongs = songs.map((affinity) => ({
    ...affinity,
    scores: { ...affinity.scores },
  }));
  const mutableRoles = [role("role", { drive: 2, care: 1 })];
  const matcher = createAdventureAffinityMatcher(
    createCatalog(mutableSongs, mutableRoles),
  );
  const before = matcher(topTen);
  mutableSongs[0].scores.drive = 0;
  mutableRoles[0].affinities.drive = 1;
  assert.deepEqual(matcher(topTen), before);
});

function scores(
  dominantA: keyof SongTraitScores,
  dominantB: keyof SongTraitScores,
  accent: keyof SongTraitScores,
): SongTraitScores {
  const result = Object.fromEntries(
    ARCHETYPE_TRAIT_IDS.map((traitId) => [traitId, 0]),
  ) as SongTraitScores;
  result[dominantA] = 2;
  result[dominantB] = 2;
  result[accent] = 1;
  return result;
}

function song(
  songId: string,
  songScores: SongTraitScores,
): ApprovedSongAffinity {
  return {
    songId,
    rubricVersion: "v1",
    status: "approved",
    scores: songScores,
    confidence: "high",
  };
}

function role(
  roleId: string,
  affinities: RoleAffinityProfile["affinities"],
): RoleAffinityProfile {
  return { roleId, profileVersion: "v1", affinities };
}

function createCatalog(
  songAffinities: readonly ApprovedSongAffinity[],
  roleProfiles: readonly RoleAffinityProfile[],
): AdventureAffinityCatalog {
  return { songAffinities, roleProfiles };
}

function assertAffinityError(
  callback: () => unknown,
  code: ArchetypeAffinityError["code"],
  messageFragment: string,
) {
  assert.throws(
    callback,
    (error) =>
      error instanceof ArchetypeAffinityError &&
      error.code === code &&
      error.message.includes(messageFragment),
  );
}
