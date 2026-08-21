import type { PickSlot } from "../schema/music";
import {
  CURRENT_PROJECT,
  CURRENT_PROJECT_ID,
  PROJECTS,
} from "../projects/registry";
import type { ProjectId } from "../schema/project";
import {
  EXPORT_BACKGROUND,
  EXPORT_SCALE,
  EXPORT_SIZE_PRESETS,
} from "./exportPresets";

export const PROJECT_CONFIG = CURRENT_PROJECT.config;
export const PROJECT_ID = CURRENT_PROJECT_ID;

export const STORAGE_KEYS = {
  picks: `${PROJECT_CONFIG.storagePrefix}_mypicks_v1`,
  options: `${PROJECT_CONFIG.storagePrefix}_options_v1`,
  theme: `${PROJECT_CONFIG.storagePrefix}_theme_preference_v1`,
  picksV2: `${PROJECT_CONFIG.storagePrefix}_mypicks_v2`,
  optionsV2: `${PROJECT_CONFIG.storagePrefix}_options_v2`,
  boardLibrary: `${PROJECT_CONFIG.storagePrefix}_board_library_v1`,
  songDiscovery: `${PROJECT_CONFIG.storagePrefix}_song_discovery_v1`,
  songDiscoveryV2: `${PROJECT_CONFIG.storagePrefix}_song_discovery_v2`,
  assistant: `${PROJECT_CONFIG.storagePrefix}_standard_pick_assistant_v2`,
  assistantLegacy: `${PROJECT_CONFIG.storagePrefix}_standard_pick_assistant_v1`,
};

export const SONG_DISCOVERY_CONFIG = {
  recentLimit: 20,
} as const;

export const PICK_ASSISTANT_CONFIG = {
  schemaVersion: 2,
  legacySchemaVersion: 1,
  minimumCandidates: 3,
  /**
   * Above this many candidates the Assistant states the worst-case comparison
   * count before anyone starts. There is no hard cap beyond what the
   * experience makes eligible: the honest limit is the reader's patience, so
   * the cost is shown rather than the choice taken away.
   */
  longSessionCandidates: 30,
  expiresAfterMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export interface ExperienceStorageKeys {
  picks: string;
  options: string;
  picksV2: string;
  optionsV2: string;
  boardLibrary: string;
  assistant: string;
  assistantLegacy: string;
  context?: string;
}

export const STANDARD_EXPERIENCE_ID = "standard";

function toStorageSegment(value: string) {
  return value.replace(/-/g, "_");
}

export function getExperienceStorageKeys(
  experienceId: string,
  contextId?: string,
): ExperienceStorageKeys {
  if (experienceId === STANDARD_EXPERIENCE_ID) {
    return STORAGE_KEYS;
  }

  const experienceSegment = toStorageSegment(experienceId);
  const contextSegment = contextId ? `_${toStorageSegment(contextId)}` : "";

  return {
    picks: `${PROJECT_CONFIG.storagePrefix}_live_${experienceSegment}${contextSegment}_picks_v1`,
    options: `${PROJECT_CONFIG.storagePrefix}_live_${experienceSegment}_options_v1`,
    picksV2: `${PROJECT_CONFIG.storagePrefix}_live_${experienceSegment}${contextSegment}_picks_v2`,
    optionsV2: `${PROJECT_CONFIG.storagePrefix}_live_${experienceSegment}_options_v2`,
    boardLibrary: STORAGE_KEYS.boardLibrary,
    assistant: `${PROJECT_CONFIG.storagePrefix}_live_${experienceSegment}${contextSegment}_pick_assistant_v2`,
    assistantLegacy: `${PROJECT_CONFIG.storagePrefix}_live_${experienceSegment}${contextSegment}_pick_assistant_v1`,
    context: `${PROJECT_CONFIG.storagePrefix}_live_${experienceSegment}_context_v1`,
  };
}

const DEFAULT_EXPORT_SIZE = EXPORT_SIZE_PRESETS.portrait;

export const EXPORT_CONFIG = {
  width: DEFAULT_EXPORT_SIZE.width,
  height: DEFAULT_EXPORT_SIZE.height,
  background: EXPORT_BACKGROUND,
  scale: EXPORT_SCALE,
};

export const EXPORT_CANVAS_ID = `mypick-${PROJECT_ID}-export-canvas`;

export function getExperienceExportCanvasId(experienceId: string) {
  if (experienceId === STANDARD_EXPERIENCE_ID) {
    return EXPORT_CANVAS_ID;
  }

  return `mypick-${PROJECT_ID}-${experienceId.replace(/_/g, "-")}-export-canvas`;
}

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
  groupNameLanguage?: "ja";
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
    groupNameLanguage: "ja",
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
    groupNameLanguage: "ja",
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
    groupNameLanguage: "ja",
    siteUrl: "https://mypick.rurino.dev/",
  },
  {
    id: "ikizulive",
    displayName: "My Pick IKIZULIVE!",
    groupName: "いきづらい部！",
    groupNameLanguage: "ja",
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
