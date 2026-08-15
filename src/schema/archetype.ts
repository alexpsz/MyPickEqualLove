export const ARCHETYPE_TRAIT_IDS = [
  "drive",
  "care",
  "rhythm",
  "growth",
  "drama",
  "ingenuity",
  "uplift",
  "cuteness",
] as const;

export type TraitId = (typeof ARCHETYPE_TRAIT_IDS)[number];

export type SongTraitScore = 0 | 1 | 2;

export type SongTraitScores = Record<TraitId, SongTraitScore>;

export type UserTraitVector = Record<TraitId, number>;

export type RoleTraitAffinity = 1 | 2;

export interface ApprovedSongAffinity {
  songId: string;
  rubricVersion: "v1";
  status: "approved";
  scores: SongTraitScores;
  /** Editorial confidence is retained for provenance and never enters matching. */
  confidence: "medium" | "high";
}

export interface RoleAffinityProfile {
  roleId: string;
  profileVersion: "v1";
  affinities: Partial<Record<TraitId, RoleTraitAffinity>>;
}

export interface AdventureAffinityCatalog {
  songAffinities: readonly ApprovedSongAffinity[];
  roleProfiles: readonly RoleAffinityProfile[];
}

export interface TraitOverlap {
  traitId: TraitId;
  contribution: number;
}

export interface SongContribution {
  songId: string;
  contribution: number;
}

export interface AdventureAffinityWinner {
  roleId: string;
  /** Raw cosine similarity. Consumers must not present it as a percentage. */
  similarity: number;
  overlapTraits: readonly TraitOverlap[];
  contributingSongs: readonly SongContribution[];
}

export interface AdventureAffinityResult {
  userVector: UserTraitVector;
  winners: readonly AdventureAffinityWinner[];
  isTie: boolean;
}
