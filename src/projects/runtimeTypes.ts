import type { Member, Song } from "../schema/music";
import type { PickExperience } from "../schema/pick-experience";
import type { ProjectId } from "../schema/project";

export interface CurrentProjectRuntime {
  readonly projectId: ProjectId;
  readonly members: Member[];
  readonly songs: Song[];
  readonly liveExperiences: PickExperience[];
}
