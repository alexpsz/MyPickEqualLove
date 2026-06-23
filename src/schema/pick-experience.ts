import type { ProjectId } from "../projects/registry";
import type { PickSlot } from "./music";

export type PickExperienceKind =
  | "standard"
  | "live-afterglow"
  | "live-wishlist";

export type ExperienceStatus = "draft" | "published" | "archived";

export type SongEligibilityScope =
  | "catalog"
  | "selected-performance"
  | "event-union";

export type PickExperienceLayout = "top10-grid" | "five-memory-list";

export interface ExperiencePickSlot extends PickSlot {
  eligibility: SongEligibilityScope;
}

export interface LiveSetlistEntry {
  order: number;
  songId: string;
  section?: "main" | "encore" | "double-encore";
  versionNote?: string;
}

export interface LivePerformance {
  id: string;
  label: string;
  date: string;
  setlist: LiveSetlistEntry[];
  sourceUrls: string[];
  sourceNote?: string;
  verificationStatus: "unverified" | "partial" | "verified";
}

export interface PickExperienceExportConfig {
  title: string;
  subtitle: string;
  imageFileName: string;
  layout: PickExperienceLayout;
}

export interface PickExperienceShareConfig {
  text: string;
  hashtags: string[];
}

export interface PickExperience {
  id: string;
  projectId: ProjectId;
  slug: string;
  kind: PickExperienceKind;
  status: ExperienceStatus;
  title: string;
  subtitle: string;
  description: string;
  canonicalPath: string;
  eventName?: string;
  venue?: string;
  officialUrl?: string;
  performances?: LivePerformance[];
  includeCombinedPerformance?: boolean;
  defaultContextId?: string;
  slots: ExperiencePickSlot[];
  export: PickExperienceExportConfig;
  share: PickExperienceShareConfig;
}
