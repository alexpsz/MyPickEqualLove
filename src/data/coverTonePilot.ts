import { CURRENT_PROJECT_RUNTIME } from "@current-project/runtime";

import type { Picks, PickSlot } from "../schema/music";
import type {
  ExportCoverTonePalette,
  ExportTemplateId,
} from "../schema/export";
import type { ProjectId } from "../schema/project";
import type { CoverTonePilotRuntimeEntry } from "../projects/runtimeTypes";

export const COVER_TONE_ALGORITHM_VERSION = 1 as const;

export type CoverTonePilotEntry = CoverTonePilotRuntimeEntry;

export interface CoverToneAvailability {
  isSupported: boolean;
  selectedSongId?: string;
  palette?: ExportCoverTonePalette;
}

const coverTonePilot = CURRENT_PROJECT_RUNTIME.coverTonePilot;

const PILOT_BY_PROJECT_AND_SONG = new Map(
  coverTonePilot.map((entry) => [
    getPilotKey(entry.projectId, entry.songId),
    entry,
  ]),
);

export const COVER_TONE_PILOT_ENTRIES = coverTonePilot;

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
