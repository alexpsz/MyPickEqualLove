import { resolveProjectId } from "../schema/project";
import type { ProjectId } from "../schema/project";
import { MY_PICK_SITE_URLS } from "./product-family-sites";

export {
  DEFAULT_PROJECT_ID,
  PROJECT_IDS,
  resolveProjectId,
} from "../schema/project";
export type { ProjectId } from "../schema/project";

export interface ProjectConfig {
  id: ProjectId;
  appName: string;
  displayName: string;
  groupName: string;
  subtitle: string;
  description: string;
  siteUrl: string;
  repoUrl: string;
  themeColor: string;
  logoAccentColor: string;
  storagePrefix: string;
  shareText: string;
  shareHashtags: string[];
  imageFileName: string;
  exportSubtitle: string;
  iconPath: string;
  keywords: string[];
}

export interface ProjectDefinition {
  config: ProjectConfig;
}

export const PROJECTS: Record<ProjectId, ProjectDefinition> = {
  "equal-love": {
    config: {
      id: "equal-love",
      appName: "MyPickEqualLove",
      displayName: "MY PICK =LOVE",
      groupName: "=LOVE",
      subtitle: "＝LOVEのお気に入り楽曲を選ぼう！",
      description:
        "＝LOVEのお気に入り楽曲を選び、オリジナルのピック画像を作成して共有できるファンツールです。",
      siteUrl: MY_PICK_SITE_URLS["equal-love"],
      repoUrl: "https://github.com/alexpsz/MyPickEqualLove",
      themeColor: "#ea6c81",
      logoAccentColor: "#00d9f3",
      storagePrefix: "equal_love",
      shareText:
        "＝LOVEのお気に入り楽曲マイピックを作成しました！\n（※ダウンロードした画像を添付してください）",
      shareHashtags: ["#MyPickイコラブ", "#イコラブ"],
      imageFileName: "EqualLove_MyPicks.png",
      exportSubtitle: "＝LOVE お気に入り楽曲選",
      iconPath: "/icons/equal-love.svg",
      keywords: [
        "＝LOVE",
        "イコラブ",
        "Equal Love",
        "My Pick",
        "お気に入り楽曲",
        "アイドル",
        "ファンツール",
      ],
    },
  },
  "nearly-equal-joy": {
    config: {
      id: "nearly-equal-joy",
      appName: "MyPickNearlyEqualJoy",
      displayName: "MY PICK ≒JOY",
      groupName: "≒JOY",
      subtitle: "≒JOYのお気に入り楽曲を選ぼう！",
      description:
        "≒JOYのお気に入り楽曲を選び、オリジナルのピック画像を作成して共有できるファンツールです。",
      siteUrl: MY_PICK_SITE_URLS["nearly-equal-joy"],
      repoUrl: "https://github.com/alexpsz/MyPickEqualLove",
      themeColor: "#f2c94c",
      logoAccentColor: "#00a7c8",
      storagePrefix: "nearly_equal_joy",
      shareText:
        "≒JOYのお気に入り楽曲マイピックを作成しました！\n（※ダウンロードした画像を添付してください）",
      shareHashtags: ["#MyPickニアジョイ", "#ニアジョイ"],
      imageFileName: "NearlyEqualJoy_MyPicks.png",
      exportSubtitle: "≒JOY お気に入り楽曲選",
      iconPath: "/icons/nearly-equal-joy.svg",
      keywords: [
        "≒JOY",
        "ニアジョイ",
        "Nearly Equal Joy",
        "My Pick",
        "お気に入り楽曲",
        "アイドル",
        "ファンツール",
      ],
    },
  },
  "not-equal-me": {
    config: {
      id: "not-equal-me",
      appName: "MyPickNotEqualMe",
      displayName: "MY PICK ≠ME",
      groupName: "≠ME",
      subtitle: "≠MEのお気に入り楽曲を選ぼう！",
      description:
        "≠MEのお気に入り楽曲を選び、オリジナルのピック画像を作成して共有できるファンツールです。",
      siteUrl: MY_PICK_SITE_URLS["not-equal-me"],
      repoUrl: "https://github.com/alexpsz/MyPickEqualLove",
      themeColor: "#3bb8e8",
      logoAccentColor: "#ea6c81",
      storagePrefix: "not_equal_me",
      shareText:
        "≠MEのお気に入り楽曲マイピックを作成しました！\n（※ダウンロードした画像を添付してください）",
      shareHashtags: ["#MyPickノイミー", "#ノイミー"],
      imageFileName: "NotEqualMe_MyPicks.png",
      exportSubtitle: "≠ME お気に入り楽曲選",
      iconPath: "/icons/not-equal-me.svg",
      keywords: [
        "≠ME",
        "ノイミー",
        "Not Equal Me",
        "My Pick",
        "お気に入り楽曲",
        "アイドル",
        "ファンツール",
      ],
    },
  },
};

export const CURRENT_PROJECT_ID = resolveProjectId(
  process.env.NEXT_PUBLIC_PROJECT_ID,
);

export const CURRENT_PROJECT = PROJECTS[CURRENT_PROJECT_ID];
