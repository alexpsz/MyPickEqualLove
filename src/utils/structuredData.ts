import creditRegistry from "../data/credit-registry.json";
import type { CreditCreator } from "../data/creditRegistry";
import type { Song } from "../schema/music";
import {
  getConfirmedSongCreditCreators,
  type SongCreditRole,
} from "./songCredits";

const SCHEMA_CONTEXT = "https://schema.org" as const;
const CREDIT_ROLES: readonly SongCreditRole[] = [
  "lyricist",
  "composer",
  "arranger",
];

interface CreditRegistryEntry {
  ja: string;
  romaji: string;
  needsReview?: boolean;
}

interface CreditRegistryManifest {
  creators: Record<string, CreditRegistryEntry>;
}

const creditRegistryManifest = creditRegistry as CreditRegistryManifest;

export interface WebSiteStructuredData {
  readonly "@context": typeof SCHEMA_CONTEXT;
  readonly "@type": "WebSite";
  readonly name: string;
  readonly url: string;
}

export interface MusicRecordingStructuredData {
  readonly "@context": typeof SCHEMA_CONTEXT;
  readonly "@type": "MusicRecording";
  readonly name: string;
  readonly byArtist: {
    readonly "@type": "MusicGroup";
    readonly name: string;
  };
  readonly inAlbum: {
    readonly "@type": "MusicAlbum";
    readonly name: string;
  };
  readonly datePublished: string;
  readonly creator: ReadonlyArray<{
    readonly name: string;
  }>;
}

export type StructuredData =
  | WebSiteStructuredData
  | MusicRecordingStructuredData;

export function createWebSiteStructuredData({
  name,
  siteUrl,
}: {
  name: string;
  siteUrl: string;
}): WebSiteStructuredData | null {
  const verifiedName = nonEmpty(name);
  const verifiedUrl = normalizeSiteUrl(siteUrl);
  if (!verifiedName || !verifiedUrl) return null;

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "WebSite",
    name: verifiedName,
    url: verifiedUrl,
  };
}

export function createMusicRecordingStructuredData({
  song,
  groupName,
}: {
  song: Song;
  groupName: string;
}): MusicRecordingStructuredData | null {
  const name = nonEmpty(song.title?.ja);
  const verifiedGroupName = nonEmpty(groupName);
  const releaseName = nonEmpty(song.releaseTitle?.ja);
  const datePublished = normalizeIsoDate(song.releaseDate);
  const creators = getPublishableCreators(song);

  if (
    !name ||
    !verifiedGroupName ||
    !releaseName ||
    !datePublished ||
    !creators
  ) {
    return null;
  }

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "MusicRecording",
    name,
    byArtist: {
      "@type": "MusicGroup",
      name: verifiedGroupName,
    },
    inAlbum: {
      "@type": "MusicAlbum",
      name: releaseName,
    },
    datePublished,
    creator: creators.map((creator) => ({ name: creator.ja })),
  };
}

export function serializeStructuredData(value: StructuredData): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) => SCRIPT_SAFE_JSON_ESCAPES[character] ?? character,
  );
}

const SCRIPT_SAFE_JSON_ESCAPES: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

function getPublishableCreators(song: Song): CreditCreator[] | null {
  const creators: CreditCreator[] = [];
  const seenCreatorIds = new Set<string>();

  for (const role of CREDIT_ROLES) {
    const roleCreators = getConfirmedSongCreditCreators(song, role);
    if (!roleCreators?.length) return null;

    for (const creator of roleCreators) {
      if (!isPublishableCreator(creator)) return null;
      if (seenCreatorIds.has(creator.id)) continue;
      seenCreatorIds.add(creator.id);
      creators.push(creator);
    }
  }

  return creators.length > 0 ? creators : null;
}

function isPublishableCreator(creator: CreditCreator): boolean {
  const entry = creditRegistryManifest.creators[creator.id];
  if (!entry) return false;
  if (Object.hasOwn(entry, "needsReview") && entry.needsReview !== false) {
    return false;
  }

  return (
    nonEmpty(entry.ja) === creator.ja &&
    nonEmpty(entry.romaji) === creator.romaji
  );
}

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeIsoDate(value: string | undefined): string | null {
  const normalized = nonEmpty(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const parsed = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function normalizeSiteUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return `${url.origin}/`;
  } catch {
    return null;
  }
}
