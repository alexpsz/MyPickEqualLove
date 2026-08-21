import type { Member, Song } from "../../schema/music";
import type { PickExperience } from "../../schema/pick-experience";
import type {
  CurrentProjectRuntime,
  OfficialMediaRuntimeEntry,
} from "../runtimeTypes";
import liveExperiences from "./live-experiences.json";
import members from "./members.json";
import officialMedia from "./official-media.json";
import songs from "./songs.json";

export const CURRENT_PROJECT_RUNTIME = {
  projectId: "not-equal-me",
  members: members as Member[],
  songs: songs as Song[],
  liveExperiences: liveExperiences as PickExperience[],
  officialMedia: officialMedia as OfficialMediaRuntimeEntry[],
} as const satisfies CurrentProjectRuntime;
