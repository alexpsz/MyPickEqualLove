import type { Member, ReleaseType, Song, TrackType } from "../schema/music";
import membersJson from "./equal-love-members.json";
import songsJson from "./equal-love-songs.json";

export const MEMBERS: Member[] = membersJson as Member[];

export const SONGS: Song[] = (songsJson as Song[]).sort((a, b) => {
  const dateA = a.releaseDate ?? "";
  const dateB = b.releaseDate ?? "";
  return dateB.localeCompare(dateA) || a.title.romaji.localeCompare(b.title.romaji);
});

export const SONGS_BY_ID: Record<string, Song> = Object.fromEntries(
  SONGS.map((song) => [song.id, song]),
);

export const MEMBERS_BY_ID: Record<string, Member> = Object.fromEntries(
  MEMBERS.map((member) => [member.id, member]),
);

export const RELEASE_TYPES: ReleaseType[] = Array.from(
  new Set(SONGS.map((song) => song.releaseType).filter(Boolean) as ReleaseType[]),
);

export const TRACK_TYPES: TrackType[] = Array.from(
  new Set(SONGS.map((song) => song.trackType).filter(Boolean) as TrackType[]),
);

export const RELEASE_YEARS = Array.from(
  new Set(
    SONGS.map((song) => song.releaseDate?.slice(0, 4)).filter(Boolean) as string[],
  ),
).sort((a, b) => b.localeCompare(a));

export const TAGS = Array.from(
  new Set(SONGS.flatMap((song) => song.tags ?? [])),
).sort((a, b) => a.localeCompare(b));
