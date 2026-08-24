import type { PublicAtlasSiteId } from "./identity.js";

export interface AtlasBaselinePerformanceReceipt {
  readonly eventLocalId: string;
  readonly performanceLocalId: string;
  readonly setlistEntryCount: number;
  readonly setlistOrderRange: {
    readonly first: number;
    readonly last: number;
  };
}

export interface AtlasBaselineSourceReceipt {
  readonly siteId: PublicAtlasSiteId;
  readonly sourcePath: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly eventCount: number;
  readonly eventLocalIds: readonly string[];
  readonly performanceCount: number;
  readonly performanceIds: readonly string[];
  readonly setlistEntryCount: number;
  readonly setlistOrderRanges: readonly AtlasBaselinePerformanceReceipt[];
}

/**
 * Historical receipt for the three unique authoring files at main@60b3012.
 * It records source bytes and identity/count facts only. It is not an E1
 * projection, source-use approval, timezone/lifecycle inference, or GO claim.
 */
export const ATLAS_C0_BASELINE_RECEIPT = {
  sourceCommit: "60b3012d7412c10c1fe189dbbdca3ba1abb17810",
  totals: {
    events: 4,
    performances: 6,
    setlistEntries: 172,
  },
  sources: [
    {
      siteId: "equal-love",
      sourcePath: "src/projects/equal-love/live-experiences.json",
      byteLength: 10513,
      sha256:
        "c272dd0d8b02ddd7001e852a0e830f8d8b0a7bd00bf16a74a59e90ae6e312649",
      eventCount: 2,
      eventLocalIds: ["kokuritsu_2026", "tokyo_dome_2027"],
      performanceCount: 2,
      performanceIds: ["kokuritsu_2026/day1", "kokuritsu_2026/day2"],
      setlistEntryCount: 60,
      setlistOrderRanges: [
        {
          eventLocalId: "kokuritsu_2026",
          performanceLocalId: "day1",
          setlistEntryCount: 30,
          setlistOrderRange: { first: 2, last: 31 },
        },
        {
          eventLocalId: "kokuritsu_2026",
          performanceLocalId: "day2",
          setlistEntryCount: 30,
          setlistOrderRange: { first: 2, last: 31 },
        },
      ],
    },
    {
      siteId: "nearly-equal-joy",
      sourcePath: "src/projects/nearly-equal-joy/live-experiences.json",
      byteLength: 14227,
      sha256:
        "20373a5cefd37b0d64b86ddaf835852fd814af6140bf32bc392b2126df7109cc",
      eventCount: 1,
      eventLocalIds: ["joy_4th_anniversary_2026_afterglow"],
      performanceCount: 2,
      performanceIds: [
        "joy_4th_anniversary_2026_afterglow/day",
        "joy_4th_anniversary_2026_afterglow/night",
      ],
      setlistEntryCount: 57,
      setlistOrderRanges: [
        {
          eventLocalId: "joy_4th_anniversary_2026_afterglow",
          performanceLocalId: "day",
          setlistEntryCount: 28,
          setlistOrderRange: { first: 1, last: 28 },
        },
        {
          eventLocalId: "joy_4th_anniversary_2026_afterglow",
          performanceLocalId: "night",
          setlistEntryCount: 29,
          setlistOrderRange: { first: 1, last: 29 },
        },
      ],
    },
    {
      siteId: "not-equal-me",
      sourcePath: "src/projects/not-equal-me/live-experiences.json",
      byteLength: 12799,
      sha256:
        "81b39e2287d36dc7db57ab543e99179eb6996a84847c049a3e7ea12e7e07465c",
      eventCount: 1,
      eventLocalIds: ["not_equal_me_7th_anniversary_2026_afterglow"],
      performanceCount: 2,
      performanceIds: [
        "not_equal_me_7th_anniversary_2026_afterglow/day",
        "not_equal_me_7th_anniversary_2026_afterglow/night",
      ],
      setlistEntryCount: 55,
      setlistOrderRanges: [
        {
          eventLocalId: "not_equal_me_7th_anniversary_2026_afterglow",
          performanceLocalId: "day",
          setlistEntryCount: 27,
          setlistOrderRange: { first: 2, last: 28 },
        },
        {
          eventLocalId: "not_equal_me_7th_anniversary_2026_afterglow",
          performanceLocalId: "night",
          setlistEntryCount: 28,
          setlistOrderRange: { first: 2, last: 29 },
        },
      ],
    },
  ],
} as const satisfies {
  readonly sourceCommit: string;
  readonly totals: {
    readonly events: number;
    readonly performances: number;
    readonly setlistEntries: number;
  };
  readonly sources: readonly AtlasBaselineSourceReceipt[];
};
