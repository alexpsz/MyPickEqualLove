import type { SongEligibilityScope } from "../schema/pick-experience";
import type { ProjectId } from "../schema/project";
import manifestJson from "./share-validation-manifest.json";

export interface ShareValidationExperience {
  title: string;
  canonicalPath: string;
  slots: Array<{
    id: string;
    eligibility: SongEligibilityScope;
  }>;
  performances: Array<{
    id: string;
    songIds: string[];
  }>;
  includeCombinedPerformance: boolean;
}

interface ShareValidationProject {
  memberIds: string[];
  songIds: string[];
  experiences: Record<string, ShareValidationExperience>;
}

interface ShareValidationManifest {
  schemaVersion: 1;
  projects: Record<ProjectId, ShareValidationProject>;
}

const manifest = manifestJson as ShareValidationManifest;

if (manifest.schemaVersion !== 1) {
  throw new Error(
    `Unsupported share validation manifest version: ${String(manifest.schemaVersion)}`,
  );
}

export function getShareValidationProject(projectId: ProjectId) {
  return manifest.projects[projectId];
}
