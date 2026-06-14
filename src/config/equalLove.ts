import type { PickSlot } from "../schema/music";

export const APP_BRAND = {
  appName: "MyPickEqualLove",
  displayName: "MY PICK =LOVE",
  subtitle: "＝LOVEのお気に入り楽曲を選ぼう！",
  tagline: "Produced by Fans, For Fans",
  shareText:
    "＝LOVEのお気に入り楽曲マイピックを作成しました！\n（※ダウンロードした画像を添付してください）",
  shareHashtags: ["#MyPickイコラブ", "#イコラブ"],
  imageFileName: "EqualLove_MyPicks.png",
  repoUrl: "https://github.com/alexpsz/MyPickEqualLove",
};

export const STORAGE_KEYS = {
  picks: "equal_love_mypicks_v1",
  options: "equal_love_options_v1",
};

export const EXPORT_CONFIG = {
  width: 1080,
  height: 1350,
  background: "#ffffff",
  scale: 2,
};

export const DEFAULT_PICK_SLOTS: PickSlot[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `slot-${index + 1}`,
    label: `#${index + 1}`,
    sortOrder: index + 1,
  }),
);

export const THEME_STRIP_COLORS = [
  "#ea6c81",
  "#f19bc2",
  "#6ce0b6",
  "#986ad6",
  "#0089ff",
  "#66c0e2",
  "#fdbf0f",
  "#ff7c7c",
  "#777777",
  "#00d9f3",
];

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
