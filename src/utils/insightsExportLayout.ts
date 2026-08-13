import { getExportSizePreset } from "../config/exportPresets";
import { PICK_INSIGHTS_CONFIG } from "../config/pickInsights";
import type { ExportSizePresetId } from "../schema/export";

const INSIGHTS_GRID_ROWS = 2;
const INSIGHTS_GRID_GAP = 14;
const INSIGHTS_CANVAS_BORDER = 4;
const INSIGHTS_CANVAS_VERTICAL_PADDING = 78;
const INSIGHTS_SECTION_GAPS = 40;
const INSIGHTS_FOOTER_HEIGHT = 55;
const MIN_INSIGHTS_CANVAS_WIDTH = 900;
const MIN_INSIGHTS_METRIC_HEIGHT = 200;

const INSIGHTS_HEADER_HEIGHTS: Record<ExportSizePresetId, number> = {
  portrait: 272,
  square: 272,
  story: 306,
};

const INSIGHTS_COVER_SIZES: Record<ExportSizePresetId, number> = {
  portrait: 68,
  square: 46,
  story: 82,
};

const INSIGHTS_RANKING_NAME_SIZES: Record<ExportSizePresetId, number> = {
  portrait: 18,
  square: 14,
  story: 22,
};

export function getInsightsExportLayoutMetrics(
  sizePresetId: ExportSizePresetId,
) {
  const sizePreset = getExportSizePreset(sizePresetId);
  const headerHeight = INSIGHTS_HEADER_HEIGHTS[sizePresetId];
  if (sizePreset.width < MIN_INSIGHTS_CANVAS_WIDTH) {
    throw new Error(
      `Insights export canvas is too narrow: ${sizePreset.width}x${sizePreset.height}`,
    );
  }

  const availableMetricHeight =
    sizePreset.height -
    INSIGHTS_CANVAS_BORDER -
    INSIGHTS_CANVAS_VERTICAL_PADDING -
    INSIGHTS_SECTION_GAPS -
    headerHeight -
    INSIGHTS_FOOTER_HEIGHT -
    INSIGHTS_GRID_GAP * (INSIGHTS_GRID_ROWS - 1);
  const metricHeight = Math.floor(availableMetricHeight / INSIGHTS_GRID_ROWS);

  if (metricHeight < MIN_INSIGHTS_METRIC_HEIGHT) {
    throw new Error(
      `Insights export canvas is too short for the profile sections: ${sizePreset.width}x${sizePreset.height}`,
    );
  }

  const limits = PICK_INSIGHTS_CONFIG.exportLimits[sizePresetId];
  return {
    canvasWidth: sizePreset.width,
    canvasHeight: sizePreset.height,
    gridTemplateRows: `minmax(${Math.floor(metricHeight * 0.82)}px, 0.82fr) minmax(${Math.floor(metricHeight * 1.18)}px, 1.18fr)`,
    metricHeight,
    headerHeight,
    footerHeight: INSIGHTS_FOOTER_HEIGHT,
    maxDistributionValues: limits.distributionValues,
    maxRankingLeaders: limits.rankingLeaders,
    maxCoverThumbnails: limits.coverThumbnails,
    coverSize: INSIGHTS_COVER_SIZES[sizePresetId],
    rankingNameSize: INSIGHTS_RANKING_NAME_SIZES[sizePresetId],
  };
}
