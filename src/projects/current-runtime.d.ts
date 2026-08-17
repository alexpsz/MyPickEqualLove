declare module "@current-project/runtime" {
  export const CURRENT_PROJECT_RUNTIME: {
    projectId: import("../schema/project").ProjectId;
    members: import("../schema/music").Member[];
    songs: import("../schema/music").Song[];
    liveExperiences: import("../schema/pick-experience").PickExperience[];
  };
}
