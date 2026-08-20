import type { MetadataRoute } from "next";
import { ROUTABLE_LIVE_EXPERIENCES } from "../data/pickExperiences";
import { SONGS } from "../data/songs";
import { SITE_URL } from "../utils/constants";
import { getSongPagePath, SONG_CATALOG_PATH } from "../utils/songRoutes";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
    },
    {
      url: `${SITE_URL}${SONG_CATALOG_PATH}`,
    },
    ...SONGS.map((song) => ({
      url: `${SITE_URL}${getSongPagePath(song.id)}`,
    })),
    ...ROUTABLE_LIVE_EXPERIENCES.map((experience) => ({
      url: `${SITE_URL}${experience.canonicalPath}`,
    })),
  ];
}
