import type { ProjectId } from "../schema/project";

export const MY_PICK_SITE_URLS = {
  "equal-love": "https://mypick.kozueginko.com",
  "nearly-equal-joy": "https://mypick-nearly-equal-joy.kozueginko.com",
  "not-equal-me": "https://mypick-not-equal-me.kozueginko.com",
} as const satisfies Readonly<Record<ProjectId, string>>;
