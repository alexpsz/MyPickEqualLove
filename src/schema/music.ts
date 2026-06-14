export interface LocalizedString {
  ja: string;
  romaji: string;
  en?: string;
}

export interface Member {
  id: string;
  name: LocalizedString;
  color?: string;
  profileUrl?: string;
  active: boolean;
  sortOrder: number;
}

export type ReleaseType = "single" | "album" | "digital" | "dvd_bd" | "other";

export interface Release {
  id: string;
  title: LocalizedString;
  type: ReleaseType;
  releaseDate?: string;
  edition?: string;
  catalogNo?: string;
  coverUrl?: string;
  officialUrl?: string;
}

export type TrackType =
  | "title"
  | "coupling"
  | "album"
  | "solo"
  | "unit"
  | "live"
  | "other";

export interface SongCredit {
  lyricist?: LocalizedString;
  composer?: LocalizedString;
  arranger?: LocalizedString;
}

export interface Song {
  id: string;
  title: LocalizedString;
  artist: LocalizedString;
  releaseId?: string;
  releaseTitle?: LocalizedString;
  releaseType?: ReleaseType;
  releaseDate?: string;
  trackNo?: number;
  trackType?: TrackType;
  coverUrl: string;
  centerMemberIds?: string[];
  memberIds?: string[];
  tags?: string[];
  credits?: SongCredit;
  officialUrl?: string;
  creditSourceUrl?: string;
}

export type PickSlotId = string;

export interface PickSlot {
  id: PickSlotId;
  label: string;
  subtitle?: string;
  sortOrder: number;
}

export type StoredPicks = Record<PickSlotId, string>;
export type Picks = Record<PickSlotId, Song>;
