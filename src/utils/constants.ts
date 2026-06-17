import { PROJECT_CONFIG } from "../config/project";

export const SITE_URL = PROJECT_CONFIG.siteUrl;
export const SITE_DOMAIN = new URL(SITE_URL).hostname;
