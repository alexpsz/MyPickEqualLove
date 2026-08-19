export const PROJECT_IDS = [
  "equal-love",
  "nearly-equal-joy",
  "not-equal-me",
] as const;

export type ProjectId = (typeof PROJECT_IDS)[number];

export const DEFAULT_PROJECT_ID: ProjectId = "equal-love";
export const COMBINED_CONTEXT_ID = "both";

export function isProjectId(projectId: string): projectId is ProjectId {
  return PROJECT_IDS.includes(projectId as ProjectId);
}

export function resolveProjectId(projectId: string | undefined): ProjectId {
  if (projectId === undefined || projectId === "") {
    return DEFAULT_PROJECT_ID;
  }

  if (isProjectId(projectId)) {
    return projectId;
  }

  throw new Error(
    `Unsupported NEXT_PUBLIC_PROJECT_ID "${projectId}". Expected one of: ${PROJECT_IDS.join(
      ", ",
    )}.`,
  );
}
