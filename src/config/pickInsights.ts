export const PICK_INSIGHTS_CONFIG = {
  rankingMinimumSelections: 2,
  rankingCoverageThreshold: 1,
  exportLimits: {
    portrait: {
      distributionValues: 5,
      rankingLeaders: 2,
      coverThumbnails: 5,
    },
    square: {
      distributionValues: 3,
      rankingLeaders: 1,
      coverThumbnails: 4,
    },
    story: {
      distributionValues: 5,
      rankingLeaders: 3,
      coverThumbnails: 6,
    },
  },
} as const;
