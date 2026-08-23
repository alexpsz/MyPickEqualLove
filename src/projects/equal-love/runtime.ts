import type { Member, Song } from "../../schema/music";
import type { PickExperience } from "../../schema/pick-experience";
import type {
  CurrentProjectRuntime,
  OfficialMediaRuntimeEntry,
  PreviewMediaRuntimeEntry,
} from "../runtimeTypes";
import liveExperiences from "./live-experiences.json";
import members from "./members.json";
import officialMedia from "./official-media.json";
import previewMedia from "./preview-media.json";
import songs from "./songs.json";

export const CURRENT_PROJECT_RUNTIME = {
  projectId: "equal-love",
  members: members as Member[],
  songs: songs as Song[],
  liveExperiences: liveExperiences as PickExperience[],
  officialMedia: officialMedia as OfficialMediaRuntimeEntry[],
  previewMedia: previewMedia as PreviewMediaRuntimeEntry[],
} as const satisfies CurrentProjectRuntime;
