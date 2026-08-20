import type { Metadata } from "next";
import { SongCatalogIndex } from "../../components/SongCatalogPages";
import { PROJECT_CONFIG } from "../../config/project";
import { SONGS } from "../../data/songs";
import { SONG_CATALOG_PATH } from "../../utils/songRoutes";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Song catalog | ${PROJECT_CONFIG.displayName}`,
  description: `Browse ${PROJECT_CONFIG.groupName} songs with release information and confirmed credits.`,
  alternates: {
    canonical: SONG_CATALOG_PATH,
  },
};

const CATALOG_SONGS = SONGS.map(({ id, title, coverUrl, releaseDate }) => ({
  id,
  title,
  coverUrl,
  releaseDate,
}));

export default function SongsPage() {
  return <SongCatalogIndex songs={CATALOG_SONGS} />;
}
