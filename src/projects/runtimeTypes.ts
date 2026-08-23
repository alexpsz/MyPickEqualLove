import type { Member, Song } from "../schema/music";
import type { PickExperience } from "../schema/pick-experience";
import type { ProjectId } from "../schema/project";

export const OFFICIAL_MEDIA_SOURCE_MODES = [
  "official-mv",
  "official-art-track",
  "official-dance",
  "official-live",
] as const;

export type OfficialMediaSourceMode =
  (typeof OFFICIAL_MEDIA_SOURCE_MODES)[number];

export interface OfficialMediaRuntimeEntry {
  readonly songId: string;
  readonly sourceMode: OfficialMediaSourceMode;
  readonly sourceUrl: string;
}

export interface PreviewMediaRuntimeEntry {
  readonly songId: string;
  readonly previewUrl: string;
  readonly trackViewUrl: string;
}

export interface CurrentProjectRuntime {
  readonly projectId: ProjectId;
  readonly members: Member[];
  readonly songs: Song[];
  readonly liveExperiences: PickExperience[];
  readonly officialMedia: OfficialMediaRuntimeEntry[];
  readonly previewMedia: PreviewMediaRuntimeEntry[];
}
