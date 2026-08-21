import type { LocalizedString, Song } from "../schema/music";
import {
  CREDIT_SIGNATURE_SEPARATOR,
  findCreditCreatorByJa,
  getCreditCreatorSearchTerms,
  type CreditCreator,
} from "../data/creditRegistry";

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

/**
 * Resolves an authored credit line into the creators it names, keeping the
 * order the source wrote them in. The whole line is looked up before it is
 * split, so a single creator whose name contains the separator stays intact.
 * An unregistered name resolves to null rather than inventing an identity.
 */
export function resolveCreditSignature(ja: string): CreditCreator[] | null {
  const whole = findCreditCreatorByJa(ja);
  if (whole) return [whole];

  const creators: CreditCreator[] = [];
  for (const part of ja.split(CREDIT_SIGNATURE_SEPARATOR.ja)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const creator = findCreditCreatorByJa(trimmed);
    if (!creator) return null;
    creators.push(creator);
  }

  return creators.length > 0 ? creators : null;
}

export function getConfirmedSongCreditCreators(
  song: Song,
  role: SongCreditRole,
): CreditCreator[] | null {
  const credit = getConfirmedSongCredit(song, role);
  return credit ? resolveCreditSignature(credit.ja) : null;
}

/**
 * Every written form that should match this credit line in search, including
 * the legacy spellings the catalog no longer stores. An unregistered name
 * still matches on what the song itself records.
 */
export function getCreditSignatureSearchTerms(
  credit: LocalizedString,
): string[] {
  const creators = resolveCreditSignature(credit.ja);
  return creators
    ? creators.flatMap((creator) => getCreditCreatorSearchTerms(creator.id))
    : [credit.ja, credit.romaji];
}
