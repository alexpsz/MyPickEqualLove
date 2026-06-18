import type { PickSlot } from "../schema/music";
import {
  CURRENT_PROJECT,
  CURRENT_PROJECT_ID,
  PROJECTS,
} from "../projects/registry";
import type { ProjectId } from "../projects/registry";

export const PROJECT_CONFIG = CURRENT_PROJECT.config;
export const PROJECT_ID = CURRENT_PROJECT_ID;

export const STORAGE_KEYS = {
  picks: `${PROJECT_CONFIG.storagePrefix}_mypicks_v1`,
  options: `${PROJECT_CONFIG.storagePrefix}_options_v1`,
};

export const EXPORT_CONFIG = {
  width: 1080,
  height: 1350,
  background: "#ffffff",
  scale: 2,
};

export const EXPORT_CANVAS_ID = `mypick-${PROJECT_ID}-export-canvas`;

export interface SisterProjectLink {
  id: ProjectId;
  displayName: string;
  groupName: string;
  siteUrl: string;
  themeColor: string;
}

export interface ExternalMyPickLink {
  id: string;
  displayName: string;
  groupName: string;
  siteUrl: string;
}

const SISTER_PROJECT_ORDER: Record<ProjectId, ProjectId[]> = {
  "equal-love": ["not-equal-me", "nearly-equal-joy"],
  "nearly-equal-joy": ["equal-love", "not-equal-me"],
  "not-equal-me": ["equal-love", "nearly-equal-joy"],
};

export const SISTER_PROJECT_LINKS: SisterProjectLink[] = SISTER_PROJECT_ORDER[
  PROJECT_ID
].map((projectId) => {
  const { config } = PROJECTS[projectId];
  return {
    id: config.id,
    displayName: config.displayName,
    groupName: config.groupName,
    siteUrl: config.siteUrl,
    themeColor: config.themeColor,
  };
});

export const EXTERNAL_MY_PICK_LINKS: ExternalMyPickLink[] = [
  {
    id: "llernote",
    displayName: "My Pick LLerNote",
    groupName: "ラブライブ！シリーズ",
    siteUrl: "https://hamproductions.github.io/llernote/mypick/",
  },
  {
    id: "aqours",
    displayName: "My Pick Aqours",
    groupName: "Aqours",
    siteUrl: "https://aqours-mypick.ccwu.cc/",
  },
  {
    id: "nijigasaki",
    displayName: "My Pick Nijigasaki",
    groupName: "虹ヶ咲学園スクールアイドル同好会",
    siteUrl: "https://mypick-nijigaku.naufalalfa.com/",
  },
  {
    id: "liella",
    displayName: "My Pick Liella!",
    groupName: "Liella!",
    siteUrl: "https://mypick-liella.kotoha.moe/",
  },
  {
    id: "hasunosora",
    displayName: "My Pick Hasunosora",
    groupName: "蓮ノ空女学院スクールアイドルクラブ",
    siteUrl: "https://mypick.rurino.dev/",
  },
  {
    id: "ikizulive",
    displayName: "My Pick IKIZULIVE!",
    groupName: "いきづらい部！",
    siteUrl: "https://mypick-ikizulive.kotoha.moe/",
  },
];

export const DEFAULT_PICK_SLOTS: PickSlot[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `slot-${index + 1}`,
    label: `#${index + 1}`,
    sortOrder: index + 1,
  }),
);

export const PROJECT_THEME_COLOR = PROJECT_CONFIG.themeColor;
export const PROJECT_ACCENT_COLOR = PROJECT_CONFIG.logoAccentColor;

export const THEME_STRIP_COLORS = Array.from(
  { length: 10 },
  () => PROJECT_THEME_COLOR,
);

export const RELEASE_TYPE_LABELS: Record<string, string> = {
  all: "All",
  single: "Single",
  album: "Album",
  digital: "Digital",
  dvd_bd: "DVD/BD",
  other: "Other",
};

export const TRACK_TYPE_LABELS: Record<string, string> = {
  all: "All Tracks",
  title: "Title Song",
  coupling: "Coupling",
  album: "Album Track",
  solo: "Solo",
  unit: "Unit",
  live: "Live",
  other: "Other",
};
