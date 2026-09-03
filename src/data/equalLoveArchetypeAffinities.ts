import type { ApprovedSongAffinity } from "../schema/archetype";
import { assertValidSongAffinity } from "../utils/archetypeAffinity";

const CAMPAIGN_ID = "equal-love-archetype-21";
const EXPECTED_APPROVED_SONG_COUNT = 87;

export interface EqualLoveArchetypeAffinityDocument {
  schemaVersion: 1;
  campaignId: typeof CAMPAIGN_ID;
  projectId: "equal-love";
  rubricVersion: "gemini-video-v1";
  songAffinities: readonly ApprovedSongAffinity[];
}

/**
 * Typed integration boundary for the separately reviewed 87-song static file.
 * This module deliberately contains no fallback rows or fabricated results.
 */
export function parseEqualLoveArchetypeAffinityDocument(
  value: unknown,
): readonly ApprovedSongAffinity[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Archetype affinity document is unavailable");
  }
  const document = value as Record<string, unknown>;
  if (
    document.schemaVersion !== 1 ||
    document.campaignId !== CAMPAIGN_ID ||
    document.projectId !== "equal-love" ||
    document.rubricVersion !== "gemini-video-v1" ||
    !Array.isArray(document.songAffinities) ||
    document.songAffinities.length !== EXPECTED_APPROVED_SONG_COUNT
  ) {
    throw new Error("Invalid archetype affinity document envelope");
  }

  const seenSongIds = new Set<string>();
  return document.songAffinities.map((candidate) => {
    assertValidSongAffinity(candidate as ApprovedSongAffinity);
    const affinity = candidate as ApprovedSongAffinity;
    if (seenSongIds.has(affinity.songId)) {
      throw new Error(`Duplicate approved affinity: ${affinity.songId}`);
    }
    seenSongIds.add(affinity.songId);
    return { ...affinity, scores: { ...affinity.scores } };
  });
}
