import type { Member, Song } from "../../schema/music";
import type { PickExperience } from "../../schema/pick-experience";
import liveExperiences from "./live-experiences.json";
import members from "./members.json";
import songs from "./songs.json";

export const CURRENT_PROJECT_RUNTIME = {
  projectId: "equal-love",
  members: members as Member[],
  songs: songs as Song[],
  liveExperiences: liveExperiences as PickExperience[],
} as const;
