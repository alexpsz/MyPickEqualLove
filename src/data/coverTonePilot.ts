import pilotManifest from "./cover-tone-pilot.json";

import type { Picks, PickSlot } from "../schema/music";
import type {
  ExportCoverTonePalette,
  ExportTemplateId,
} from "../schema/export";
import type { ProjectId } from "../schema/project";

export const COVER_TONE_ALGORITHM_VERSION = 1 as const;

export interface CoverTonePilotEntry {
  projectId: ProjectId;
  songId: string;
  coverUrl: string;
  sha256: string;
  palette: ExportCoverTonePalette;
}

interface CoverTonePilotManifest {
  algorithmVersion: typeof COVER_TONE_ALGORITHM_VERSION;
  entries: readonly CoverTonePilotEntry[];
}

export interface CoverToneAvailability {
  isSupported: boolean;
  selectedSongId?: string;
  palette?: ExportCoverTonePalette;
}

const coverTonePilot = pilotManifest as CoverTonePilotManifest;

const PILOT_BY_PROJECT_AND_SONG = new Map(
  coverTonePilot.entries.map((entry) => [
    getPilotKey(entry.projectId, entry.songId),
    entry,
  ]),
);

export const COVER_TONE_PILOT_ENTRIES = coverTonePilot.entries;

export function getCoverToneAvailability({
  projectId,
  slots,
  picks,
}: {
  projectId: ProjectId;
  slots: readonly PickSlot[];
  picks: Picks;
}): CoverToneAvailability {
  const lowestRankedSong = getLowestRankedSelectedSong(slots, picks);

  if (!lowestRankedSong) {
    return { isSupported: false };
  }

  const entry = PILOT_BY_PROJECT_AND_SONG.get(
    getPilotKey(projectId, lowestRankedSong.id),
  );

  if (!entry || entry.coverUrl !== lowestRankedSong.coverUrl) {
    return { isSupported: false, selectedSongId: lowestRankedSong.id };
  }

  return {
    isSupported: true,
    selectedSongId: lowestRankedSong.id,
    palette: entry.palette,
  };
}

export function isExportTemplateAvailable(
  templateId: ExportTemplateId,
  coverToneAvailability: CoverToneAvailability,
): boolean {
  return templateId !== "cover-tone" || coverToneAvailability.isSupported;
}

export function resolveAvailableExportTemplateId(
  templateId: ExportTemplateId,
  coverToneAvailability: CoverToneAvailability,
): ExportTemplateId {
  return isExportTemplateAvailable(templateId, coverToneAvailability)
    ? templateId
    : "midnight";
}

function getLowestRankedSelectedSong(slots: readonly PickSlot[], picks: Picks) {
  const lowestRankedSlot = [...slots]
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    )
    .find((slot) => picks[slot.id] !== undefined);

  return lowestRankedSlot ? picks[lowestRankedSlot.id] : undefined;
}

function getPilotKey(projectId: ProjectId, songId: string): string {
  return `${projectId}\u0000${songId}`;
}
