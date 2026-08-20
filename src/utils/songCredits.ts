import type { LocalizedString, Song } from "../schema/music";

export interface ConfirmedSongCredits {
  lyricist: LocalizedString;
  composer: LocalizedString;
  arranger: LocalizedString;
}

export type SongCreditRole = keyof ConfirmedSongCredits;

export function getConfirmedSongCredit(
  song: Song,
  role: SongCreditRole,
): LocalizedString | null {
  const credit = song.credits?.[role];

  if (
    song.sourceStatus === "unverified" ||
    !credit ||
    !credit.ja.trim() ||
    !credit.romaji.trim()
  ) {
    return null;
  }

  return credit;
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
