import type { MetadataRoute } from "next";
import { PROJECT_CONFIG } from "../config/project";
import { localizeProjectCopy } from "../i18n/content";
import { THEME_COLORS } from "../utils/themePreference";

export const dynamic = "force-static";

const projectCopy = localizeProjectCopy(PROJECT_CONFIG.id, "en");

function installIconPath(size: 180 | 192 | 512) {
  return `/icons/install/${PROJECT_CONFIG.id}-${size}.png`;
}

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PROJECT_CONFIG.appName,
    short_name: PROJECT_CONFIG.groupName,
    description: projectCopy.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.light,
    theme_color: PROJECT_CONFIG.themeColor,
    icons: [192, 512].map((size) => ({
      src: installIconPath(size as 192 | 512),
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
  };
}
