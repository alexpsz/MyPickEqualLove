import type { PickSlot } from "../schema/music";
import { CURRENT_PROJECT, CURRENT_PROJECT_ID } from "../projects/registry";

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
