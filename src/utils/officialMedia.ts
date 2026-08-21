import type { MessageKey } from "../i18n/messages";
import { CURRENT_PROJECT_RUNTIME } from "@current-project/runtime";
import {
  OFFICIAL_MEDIA_SOURCE_MODES,
  type OfficialMediaRuntimeEntry,
  type OfficialMediaSourceMode,
} from "../projects/runtimeTypes";

export { OFFICIAL_MEDIA_SOURCE_MODES };
export type { OfficialMediaSourceMode };
export type OfficialMediaLink = OfficialMediaRuntimeEntry;

export const OFFICIAL_MEDIA_MESSAGE_KEYS: Record<
  OfficialMediaSourceMode,
  MessageKey
> = {
  "official-mv": "songDetail.officialMedia.mv",
  "official-art-track": "songDetail.officialMedia.artTrack",
  "official-dance": "songDetail.officialMedia.dance",
  "official-live": "songDetail.officialMedia.live",
};

const OFFICIAL_MEDIA_BY_SONG_ID = new Map<string, OfficialMediaLink>(
  CURRENT_PROJECT_RUNTIME.officialMedia.flatMap((entry) => {
    if (
      !isOfficialMediaSourceMode(entry.sourceMode) ||
      !isExactYouTubeWatchUrl(entry.sourceUrl)
    ) {
      return [];
    }

    return [[entry.songId, entry] as const];
  }),
);

export function getOfficialMediaLinks(
  songId: string,
): readonly OfficialMediaLink[] {
  const link = OFFICIAL_MEDIA_BY_SONG_ID.get(songId);
  return link ? [link] : [];
}

export function getPrimaryOfficialMediaLink(
  songId: string,
): OfficialMediaLink | undefined {
  return getOfficialMediaLinks(songId)[0];
}

function isOfficialMediaSourceMode(
  value: string,
): value is OfficialMediaSourceMode {
  return OFFICIAL_MEDIA_SOURCE_MODES.some((mode) => mode === value);
}

function isExactYouTubeWatchUrl(value: string): boolean {
  return /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(
    value,
  );
}
