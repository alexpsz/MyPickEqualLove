import type { ReleaseType, TrackType } from "./music";

export interface InsightCoverage {
  known: number;
  total: number;
  coverage: number | null;
  unknown: number;
  complete: boolean;
}

export interface InsightDistribution<T extends string> {
  coverage: InsightCoverage;
  values: Array<{ key: T; count: number }>;
}

export interface InsightRanking<T extends string> {
  coverage: InsightCoverage;
  eligible: boolean;
  leaders: T[];
  leaderCount: number | null;
}

export interface PickInsights {
  selectedCount: number;
  decades: InsightDistribution<string>;
  releaseYears: InsightDistribution<string>;
  releaseTypes: InsightDistribution<ReleaseType>;
  trackTypes: InsightDistribution<TrackType>;
  members: InsightRanking<string>;
  credits: {
    coverage: InsightCoverage;
    lyricists: InsightRanking<string>;
    composers: InsightRanking<string>;
    arrangers: InsightRanking<string>;
  };
  centers: InsightRanking<string>;
}
