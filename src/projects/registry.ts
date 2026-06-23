import type { Member, Song } from "../schema/music";
import type { PickExperience } from "../schema/pick-experience";
import equalLoveLiveExperiences from "./equal-love/live-experiences.json";
import equalLoveMembers from "./equal-love/members.json";
import equalLoveSongs from "./equal-love/songs.json";
import nearlyEqualJoyLiveExperiences from "./nearly-equal-joy/live-experiences.json";
import nearlyEqualJoyMembers from "./nearly-equal-joy/members.json";
import nearlyEqualJoySongs from "./nearly-equal-joy/songs.json";
import notEqualMeLiveExperiences from "./not-equal-me/live-experiences.json";
import notEqualMeMembers from "./not-equal-me/members.json";
import notEqualMeSongs from "./not-equal-me/songs.json";

export const PROJECT_IDS = [
  "equal-love",
  "nearly-equal-joy",
  "not-equal-me",
] as const;

export type ProjectId = (typeof PROJECT_IDS)[number];

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

interface ProjectDefinition {
  config: ProjectConfig;
  members: Member[];
  songs: Song[];
  liveExperiences: PickExperience[];
}

export const DEFAULT_PROJECT_ID: ProjectId = "equal-love";

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
      siteUrl: "https://mypick.kozueginko.com",
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
    members: equalLoveMembers as Member[],
    songs: equalLoveSongs as Song[],
    liveExperiences: equalLoveLiveExperiences as PickExperience[],
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
      siteUrl: "https://mypick-nearly-equal-joy.kozueginko.com",
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
    members: nearlyEqualJoyMembers as Member[],
    songs: nearlyEqualJoySongs as Song[],
    liveExperiences: nearlyEqualJoyLiveExperiences as PickExperience[],
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
      siteUrl: "https://mypick-not-equal-me.kozueginko.com",
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
    members: notEqualMeMembers as Member[],
    songs: notEqualMeSongs as Song[],
    liveExperiences: notEqualMeLiveExperiences as PickExperience[],
  },
};

export function resolveProjectId(projectId: string | undefined): ProjectId {
  if (PROJECT_IDS.includes(projectId as ProjectId)) {
    return projectId as ProjectId;
  }

  return DEFAULT_PROJECT_ID;
}

export const CURRENT_PROJECT_ID = resolveProjectId(
  process.env.NEXT_PUBLIC_PROJECT_ID,
);

export const CURRENT_PROJECT = PROJECTS[CURRENT_PROJECT_ID];
