import type { LocalizedString, Song } from "../schema/music";

export interface ConfirmedSongCredits {
  lyricist: LocalizedString;
  composer: LocalizedString;
  arranger: LocalizedString;
}

export function getConfirmedSongCredits(
  song: Song,
): ConfirmedSongCredits | null {
  const credits = song.credits;

  if (
    song.sourceStatus === "unverified" ||
    !credits?.lyricist ||
    !credits.composer ||
    !credits.arranger
  ) {
    return null;
  }

  const values = [credits.lyricist, credits.composer, credits.arranger];
  return values.every((credit) => credit.ja.trim() && credit.romaji.trim())
    ? {
        lyricist: credits.lyricist,
        composer: credits.composer,
        arranger: credits.arranger,
      }
    : null;
}
