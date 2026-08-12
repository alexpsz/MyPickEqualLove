import type { MessageKey } from "../i18n/messages";
import type { ReleaseType, SongSourceStatus, TrackType } from "../schema/music";

export const RELEASE_TYPE_MESSAGE_KEYS: Record<ReleaseType, MessageKey> = {
  single: "search.releaseType.single",
  album: "search.releaseType.album",
  digital: "search.releaseType.digital",
  dvd_bd: "search.releaseType.dvdBd",
  other: "search.releaseType.other",
};

export const TRACK_TYPE_MESSAGE_KEYS: Record<TrackType, MessageKey> = {
  title: "search.trackType.title",
  coupling: "search.trackType.coupling",
  album: "search.trackType.album",
  solo: "search.trackType.solo",
  unit: "search.trackType.unit",
  live: "search.trackType.live",
  other: "search.trackType.other",
};

export const SOURCE_STATUS_MESSAGE_KEYS: Record<SongSourceStatus, MessageKey> =
  {
    announced: "songDetail.sourceStatus.announced",
    credits_pending: "songDetail.sourceStatus.creditsPending",
    released: "songDetail.sourceStatus.released",
    digital: "songDetail.sourceStatus.digital",
    limited_cd: "songDetail.sourceStatus.limitedCd",
    youtube_public: "songDetail.sourceStatus.youtubePublic",
    cm_pv: "songDetail.sourceStatus.cmPv",
    live_only: "songDetail.sourceStatus.liveOnly",
    unverified: "songDetail.sourceStatus.unverified",
  };
