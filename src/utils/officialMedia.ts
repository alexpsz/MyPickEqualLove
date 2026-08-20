import type { MessageKey } from "../i18n/messages";
import { PROJECT_ID } from "../config/project";
import pilot from "../projects/equal-love/official-media-pilot.json";

export const OFFICIAL_MEDIA_SOURCE_MODES = [
  "official-mv",
  "official-art-track",
  "official-dance",
  "official-live",
] as const;

export type OfficialMediaSourceMode =
  (typeof OFFICIAL_MEDIA_SOURCE_MODES)[number];

export interface OfficialMediaLink {
  songId: string;
  sourceMode: OfficialMediaSourceMode;
  sourceUrl: string;
}

export const OFFICIAL_MEDIA_MESSAGE_KEYS: Record<
  OfficialMediaSourceMode,
  MessageKey
> = {
  "official-mv": "songDetail.officialMedia.mv",
  "official-art-track": "songDetail.officialMedia.artTrack",
  "official-dance": "songDetail.officialMedia.dance",
  "official-live": "songDetail.officialMedia.live",
};

const PILOT_BY_SONG_ID = new Map<string, OfficialMediaLink>(
  pilot.entries.map((entry) => [
    entry.songId,
    {
      songId: entry.songId,
      sourceMode: entry.sourceMode as OfficialMediaSourceMode,
      sourceUrl: entry.sourceUrl,
    },
  ]),
);

export function getOfficialMediaLinks(
  songId: string,
): readonly OfficialMediaLink[] {
  if (PROJECT_ID !== "equal-love") {
    return [];
  }

  const link = PILOT_BY_SONG_ID.get(songId);
  return link ? [link] : [];
}
