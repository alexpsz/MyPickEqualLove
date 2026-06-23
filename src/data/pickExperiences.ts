import {
  DEFAULT_PICK_SLOTS,
  getExperienceExportCanvasId,
  getExperienceStorageKeys,
  PROJECT_CONFIG,
  PROJECT_ID,
} from "../config/project";
import { CURRENT_PROJECT, PROJECTS } from "../projects/registry";
import type {
  ExperiencePickSlot,
  LivePerformance,
  PickExperience,
  SongEligibilityScope,
} from "../schema/pick-experience";
import type { PickSlotId, Song, StoredPicks } from "../schema/music";
import { SONGS, SONGS_BY_ID } from "./songs";

export interface ExperienceContext {
  id: string;
  label: string;
  dateLabel: string;
  shortDateLabel?: string;
  exportLabel: string;
  performanceIds: string[];
}

export interface ReplacementSlotState {
  slotId: PickSlotId;
  disabledReason?: string;
}

const STANDARD_EXPERIENCE_ID = "standard";
const COMBINED_CONTEXT_ID = "both";
export const EMPTY_LIVE_EXPERIENCE_SLUG = "__empty-live__";

export const STANDARD_PICK_EXPERIENCE: PickExperience = {
  id: STANDARD_EXPERIENCE_ID,
  projectId: PROJECT_ID,
  slug: "",
  kind: "standard",
  status: "published",
  title: PROJECT_CONFIG.displayName,
  subtitle: PROJECT_CONFIG.subtitle,
  description: PROJECT_CONFIG.description,
  canonicalPath: "/",
  slots: DEFAULT_PICK_SLOTS.map((slot) => ({
    ...slot,
    eligibility: "catalog",
  })),
  export: {
    title: PROJECT_CONFIG.displayName,
    subtitle: PROJECT_CONFIG.exportSubtitle,
    imageFileName: PROJECT_CONFIG.imageFileName,
    layout: "top10-grid",
  },
  share: {
    text: PROJECT_CONFIG.shareText,
    hashtags: PROJECT_CONFIG.shareHashtags,
  },
};

export const LIVE_EXPERIENCES = CURRENT_PROJECT.liveExperiences;
export const PICK_EXPERIENCES = [STANDARD_PICK_EXPERIENCE, ...LIVE_EXPERIENCES];
export const ROUTABLE_LIVE_EXPERIENCES = LIVE_EXPERIENCES.filter(
  (experience) =>
    experience.status === "published" || experience.status === "archived",
);
export const GLOBAL_LIVE_EXPERIENCE_SLUGS = Array.from(
  new Set(
    Object.values(PROJECTS).flatMap((project) =>
      project.liveExperiences
        .filter(
          (experience) =>
            experience.status === "published" ||
            experience.status === "archived",
        )
        .map((experience) => experience.slug),
    ),
  ),
);
export const PUBLISHED_LIVE_EXPERIENCES = LIVE_EXPERIENCES.filter(
  (experience) => experience.status === "published",
);

export function findLiveExperienceBySlug(slug: string) {
  return ROUTABLE_LIVE_EXPERIENCES.find(
    (experience) => experience.slug === slug,
  );
}

export function getLiveExperienceStaticParams() {
  const slugs = new Set([
    ...GLOBAL_LIVE_EXPERIENCE_SLUGS,
    ...ROUTABLE_LIVE_EXPERIENCES.map((experience) => experience.slug),
  ]);
  const params = Array.from(slugs).map((eventSlug) => ({ eventSlug }));

  if (params.length > 0) {
    return params;
  }

  return [{ eventSlug: EMPTY_LIVE_EXPERIENCE_SLUG }];
}

export function getExperiencePageUrl(experience: PickExperience) {
  return new URL(experience.canonicalPath, PROJECT_CONFIG.siteUrl).toString();
}

export function getExperienceExportCanvasIdFor(experience: PickExperience) {
  return getExperienceExportCanvasId(experience.id);
}

export function getStorageKeysForExperience(
  experience: PickExperience,
  contextId?: string,
) {
  return getExperienceStorageKeys(experience.id, contextId);
}

export function getExperienceContexts(
  experience: PickExperience,
): ExperienceContext[] {
  const performances = experience.performances ?? [];
  if (performances.length === 0) {
    return [];
  }

  const contexts: ExperienceContext[] = performances.map((performance) => ({
    id: performance.id,
    label: performance.label,
    dateLabel: formatFullDate(performance.date),
    shortDateLabel: formatShortDate(performance.date),
    exportLabel: `${performance.label} · ${formatFullDate(performance.date)}`,
    performanceIds: [performance.id],
  }));

  if (experience.includeCombinedPerformance && performances.length > 1) {
    contexts.push({
      id: COMBINED_CONTEXT_ID,
      label: "2 DAYS",
      dateLabel: formatCombinedDateLabel(performances),
      shortDateLabel: formatCombinedShortDateLabel(performances),
      exportLabel: `2 DAYS · ${formatCombinedDateLabel(performances)}`,
      performanceIds: performances.map((performance) => performance.id),
    });
  }

  return contexts;
}

export function getDefaultExperienceContextId(experience: PickExperience) {
  const contexts = getExperienceContexts(experience);
  if (contexts.length === 0) {
    return undefined;
  }

  if (
    experience.defaultContextId &&
    contexts.some((context) => context.id === experience.defaultContextId)
  ) {
    return experience.defaultContextId;
  }

  return contexts[0]?.id;
}

export function getExperienceContext(
  experience: PickExperience,
  contextId?: string,
) {
  const contexts = getExperienceContexts(experience);
  if (contexts.length === 0) {
    return undefined;
  }

  const defaultContextId = getDefaultExperienceContextId(experience);
  return (
    contexts.find((context) => context.id === contextId) ??
    contexts.find((context) => context.id === defaultContextId) ??
    contexts[0]
  );
}

export function getSortedExperienceSlots(experience: PickExperience) {
  return experience.slots.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEligibleSongsForSlot(
  experience: PickExperience,
  slot: ExperiencePickSlot,
  contextId?: string,
): Song[] {
  if (slot.eligibility === "catalog") {
    return SONGS;
  }

  return getSongIdsForScope(experience, slot.eligibility, contextId)
    .map((songId) => SONGS_BY_ID[songId])
    .filter(Boolean);
}

export function getEligibleSongsForExperience(
  experience: PickExperience,
  contextId?: string,
) {
  const slots = getSortedExperienceSlots(experience);
  if (slots.some((slot) => slot.eligibility === "catalog")) {
    return SONGS;
  }

  const seenSongIds = new Set<string>();
  const songs: Song[] = [];

  for (const slot of slots) {
    for (const song of getEligibleSongsForSlot(experience, slot, contextId)) {
      if (seenSongIds.has(song.id)) continue;
      seenSongIds.add(song.id);
      songs.push(song);
    }
  }

  return songs;
}

export function isSongEligibleForSlot({
  experience,
  slot,
  songId,
  contextId,
}: {
  experience: PickExperience;
  slot: ExperiencePickSlot;
  songId: string;
  contextId?: string;
}) {
  if (slot.eligibility === "catalog") {
    return Boolean(SONGS_BY_ID[songId]);
  }

  return getSongIdsForScope(experience, slot.eligibility, contextId).includes(
    songId,
  );
}

export function findFirstEligibleEmptySlot({
  experience,
  storedPicks,
  songId,
  contextId,
}: {
  experience: PickExperience;
  storedPicks: StoredPicks;
  songId: string;
  contextId?: string;
}) {
  return (
    getSortedExperienceSlots(experience).find(
      (slot) =>
        !storedPicks[slot.id] &&
        isSongEligibleForSlot({ experience, slot, songId, contextId }),
    )?.id ?? null
  );
}

export function getReplacementSlotStates({
  experience,
  songId,
  contextId,
}: {
  experience: PickExperience;
  songId: string;
  contextId?: string;
}): ReplacementSlotState[] {
  return getSortedExperienceSlots(experience).map((slot) => {
    if (isSongEligibleForSlot({ experience, slot, songId, contextId })) {
      return { slotId: slot.id };
    }

    return {
      slotId: slot.id,
      disabledReason: "This song cannot be placed in this slot.",
    };
  });
}

export function filterStoredPicksForExperience({
  experience,
  storedPicks,
  contextId,
}: {
  experience: PickExperience;
  storedPicks: StoredPicks;
  contextId?: string;
}): StoredPicks {
  const slots = getSortedExperienceSlots(experience);
  const slotIds = new Set(slots.map((slot) => slot.id));
  const slotsById = Object.fromEntries(slots.map((slot) => [slot.id, slot]));
  const nextPicks: StoredPicks = {};

  for (const [slotId, songId] of Object.entries(storedPicks)) {
    const slot = slotsById[slotId];
    if (!slotIds.has(slotId) || !slot || !SONGS_BY_ID[songId]) {
      continue;
    }

    if (isSongEligibleForSlot({ experience, slot, songId, contextId })) {
      nextPicks[slotId] = songId;
    }
  }

  return nextPicks;
}

export function parseStoredPicksForExperience({
  experience,
  serialized,
  contextId,
}: {
  experience: PickExperience;
  serialized: string;
  contextId?: string;
}) {
  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return filterStoredPicksForExperience({
    experience,
    storedPicks: parsed as StoredPicks,
    contextId,
  });
}

export function getSongBadgesBySongId(experience: PickExperience) {
  const performances = experience.performances ?? [];
  const hasStrictSlot = experience.slots.some(
    (slot) => slot.eligibility !== "catalog",
  );
  const hasCatalogSlot = experience.slots.some(
    (slot) => slot.eligibility === "catalog",
  );

  if (performances.length === 0 && !hasStrictSlot) {
    return {};
  }

  const badgesBySongId: Record<string, string[]> = {};
  const eventSongIds = new Set<string>();

  for (const performance of performances) {
    const performanceSongIds = new Set(
      performance.setlist.map((entry) => entry.songId),
    );

    for (const songId of performanceSongIds) {
      eventSongIds.add(songId);
      badgesBySongId[songId] = [
        ...(badgesBySongId[songId] ?? []),
        performance.label,
      ];
    }
  }

  if (hasStrictSlot && hasCatalogSlot) {
    for (const song of SONGS) {
      if (!eventSongIds.has(song.id)) {
        badgesBySongId[song.id] = ["帰り道枠のみ"];
      }
    }
  }

  return badgesBySongId;
}

export function getExperienceImageFileName(
  experience: PickExperience,
  context?: ExperienceContext,
) {
  if (!context) {
    return experience.export.imageFileName;
  }

  return experience.export.imageFileName.replace(
    /\.png$/i,
    `_${context.id.replace(/-/g, "_").toUpperCase()}.png`,
  );
}

export function getExperiencePreviewLabel(
  experience: PickExperience,
  context?: ExperienceContext,
) {
  if (experience.kind === "standard") {
    return `${PROJECT_CONFIG.groupName} Top Picks export`;
  }

  return [experience.export.title, context?.exportLabel]
    .filter(Boolean)
    .join(" · ");
}

function getSongIdsForScope(
  experience: PickExperience,
  scope: SongEligibilityScope,
  contextId?: string,
) {
  if (scope === "catalog") {
    return SONGS.map((song) => song.id);
  }

  const performances = getPerformancesForScope(experience, scope, contextId);
  const seenSongIds = new Set<string>();
  const songIds: string[] = [];

  for (const performance of performances) {
    for (const entry of performance.setlist
      .slice()
      .sort((a, b) => a.order - b.order)) {
      if (seenSongIds.has(entry.songId)) continue;
      seenSongIds.add(entry.songId);
      songIds.push(entry.songId);
    }
  }

  return songIds;
}

function getPerformancesForScope(
  experience: PickExperience,
  scope: SongEligibilityScope,
  contextId?: string,
): LivePerformance[] {
  const performances = experience.performances ?? [];
  if (scope === "event-union") {
    return performances;
  }

  const context = getExperienceContext(experience, contextId);
  if (!context) {
    return [];
  }

  return context.performanceIds
    .map((performanceId) =>
      performances.find((performance) => performance.id === performanceId),
    )
    .filter((performance): performance is LivePerformance =>
      Boolean(performance),
    );
}

function formatFullDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatCombinedDateLabel(performances: LivePerformance[]) {
  const sortedDates = performances
    .map((performance) => performance.date)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  if (!first || !last) {
    return "";
  }

  const [firstYear, firstMonth, firstDay] = first.split("-");
  const [lastYear, lastMonth, lastDay] = last.split("-");

  if (firstYear === lastYear && firstMonth === lastMonth) {
    return `${firstYear}.${firstMonth}.${firstDay}-${lastDay}`;
  }

  return `${formatFullDate(first)}-${formatFullDate(last)}`;
}

function formatCombinedShortDateLabel(performances: LivePerformance[]) {
  const sortedDates = performances
    .map((performance) => performance.date)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  if (!first || !last) {
    return undefined;
  }

  const [, firstMonth, firstDay] = first.split("-");
  const [, lastMonth, lastDay] = last.split("-");
  if (firstMonth === lastMonth) {
    return `${Number(firstMonth)}/${Number(firstDay)}-${Number(lastDay)}`;
  }

  return `${formatShortDate(first)}-${formatShortDate(last)}`;
}
