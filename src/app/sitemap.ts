import type { MetadataRoute } from "next";
import { ROUTABLE_LIVE_EXPERIENCES } from "../data/pickExperiences";
import { SITE_URL } from "../utils/constants";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
    },
    ...ROUTABLE_LIVE_EXPERIENCES.map((experience) => ({
      url: `${SITE_URL}${experience.canonicalPath}`,
    })),
  ];
}
