import type {
  ExperiencePickSlot,
  LivePerformance,
  PickExperience,
  SongEligibilityScope,
} from "../schema/pick-experience";
import { COMBINED_CONTEXT_ID } from "../schema/project";

export { COMBINED_CONTEXT_ID as COMBINED_EXPERIENCE_CONTEXT_ID } from "../schema/project";

export function getAssistantEligibleSongIds({
  experience,
  catalogSongIds,
  contextId,
}: {
  experience: PickExperience;
  catalogSongIds: readonly string[];
  contextId?: string;
}) {
  const catalogIds = uniqueIds(catalogSongIds);
  const catalogIdSet = new Set(catalogIds);
  const scopedSlots = experience.slots
    .filter((slot) => slot.eligibility !== "catalog")
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (scopedSlots.length === 0) {
    return contextId === undefined ? catalogIds : [];
  }

  const selectedPerformanceIds = getStrictContextPerformanceIds(
    experience,
    contextId,
  );
  if (!selectedPerformanceIds) return [];

  const performancesById = new Map(
    (experience.performances ?? []).map((performance) => [
      performance.id,
      performance,
    ]),
  );
  const eligibleSongIds: string[] = [];
  const seenSongIds = new Set<string>();

  for (const slot of scopedSlots) {
    const performanceIds = getPerformanceIdsForScope(
      slot,
      selectedPerformanceIds,
      experience.performances ?? [],
    );
    for (const performanceId of performanceIds) {
      const performance = performancesById.get(performanceId);
      if (!performance) return [];
      for (const entry of performance.setlist
        .slice()
        .sort((left, right) => left.order - right.order)) {
        if (!catalogIdSet.has(entry.songId) || seenSongIds.has(entry.songId)) {
          continue;
        }
        seenSongIds.add(entry.songId);
        eligibleSongIds.push(entry.songId);
      }
    }
  }

  return eligibleSongIds;
}

/**
 * How many places a tournament has to settle before the board can be filled.
 *
 * Stopping at the number of slots is only safe when every slot would accept
 * every candidate. A Live board whose slots draw on different setlists can need
 * a song from further down the order to fill a later slot, so ranking has to
 * keep going for those.
 */
export function getAssistantTargetCount({
  slotIds,
  candidateIds,
  isEligible,
}: {
  slotIds: readonly string[];
  candidateIds: readonly string[];
  isEligible: (songId: string, slotId: string) => boolean;
}) {
  const everySlotTakesEverySong = slotIds.every((slotId) =>
    candidateIds.every((songId) => isEligible(songId, slotId)),
  );
  return everySlotTakesEverySong
    ? slotIds.length
    : Math.max(slotIds.length, candidateIds.length);
}

export function getStrictContextPerformanceIds(
  experience: PickExperience,
  contextId?: string,
) {
  const performances = experience.performances ?? [];
  if (!contextId || performances.length === 0) return null;

  if (performances.some((performance) => performance.id === contextId)) {
    return [contextId];
  }

  if (
    contextId === COMBINED_CONTEXT_ID &&
    experience.includeCombinedPerformance &&
    performances.length > 1
  ) {
    return performances.map((performance) => performance.id);
  }

  return null;
}

function getPerformanceIdsForScope(
  slot: ExperiencePickSlot,
  selectedPerformanceIds: readonly string[],
  performances: readonly LivePerformance[],
) {
  const scope: SongEligibilityScope = slot.eligibility;
  return scope === "event-union"
    ? performances.map((performance) => performance.id)
    : selectedPerformanceIds;
}

function uniqueIds(ids: readonly string[]) {
  const seenIds = new Set<string>();
  return ids.filter((id) => {
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
}
