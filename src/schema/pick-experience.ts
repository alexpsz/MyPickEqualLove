import type { ExportExperienceLayout } from "./export";
import type { PickSlot } from "./music";
import type { ProjectId } from "./project";

export type PickExperienceKind =
  | "standard"
  | "live-afterglow"
  | "live-wishlist";

export type ExperienceStatus = "draft" | "published" | "archived";

export type SongEligibilityScope =
  | "catalog"
  | "selected-performance"
  | "event-union";

export type PickExperienceLayout = ExportExperienceLayout;

export interface ExperiencePickSlot extends PickSlot {
  eligibility: SongEligibilityScope;
}

export interface LiveSetlistEntry {
  order: number;
  songId: string;
  section?: "main" | "encore" | "double-encore";
  versionNote?: string;
}

export type LiveEvidenceGrade = "A" | "B" | "C" | "D" | "E";

export interface LiveSetlistSource {
  url: string;
  publisher: string;
  publishedAt: string;
  evidenceGrade: LiveEvidenceGrade;
}

export interface LiveSupportingSource {
  url: string;
  publisher: string;
  publishedAt?: string;
  verifiedAt?: string;
  evidenceGrade: "B" | "C" | "D";
  role: "official-playlist" | "cross-check-report";
}

export interface LiveExcludedSetlistEntry {
  sourceUrl: string;
  sourceOrder?: number;
  beforeSourceOrder?: number;
  label: string;
  reason: "non-catalog-intro" | "non-song" | "not-in-project-catalog";
}

export interface LivePerformanceProvenance {
  schemaVersion: 1;
  primarySource: LiveSetlistSource;
  supportingSources: LiveSupportingSource[];
  reviewedAt: string;
  confirmedAt: string;
  excludedEntries: LiveExcludedSetlistEntry[];
  repeatedSongIds: string[];
  crossCheck: {
    status: "matched" | "matched-with-documented-differences";
    sourceUrls: string[];
    note: string;
  };
}

export interface LivePerformance {
  id: string;
  label: string;
  date: string;
  startAt?: string;
  setlist: LiveSetlistEntry[];
  sourceUrls: string[];
  sourceNote?: string;
  verificationStatus: "unverified" | "partial" | "verified";
  provenance?: LivePerformanceProvenance;
}

export interface LiveEventEvidence {
  dates: string[];
  sourceUrls: string[];
  sourceNote: string;
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
  eventEvidence?: LiveEventEvidence;
  performances?: LivePerformance[];
  provenanceSchemaVersion?: 1;
  includeCombinedPerformance?: boolean;
  combinedPerformanceLabel?: string;
  defaultContextId?: string;
  slots: ExperiencePickSlot[];
  export: PickExperienceExportConfig;
  share: PickExperienceShareConfig;
}
