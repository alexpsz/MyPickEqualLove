import { getExportSizePreset } from "../config/exportPresets";
import { PICK_INSIGHTS_CONFIG } from "../config/pickInsights";
import type { ExportSizePresetId } from "../schema/export";

const INSIGHTS_GRID_ROWS = 4;
const INSIGHTS_GRID_GAP = 14;
const INSIGHTS_CANVAS_BORDER = 4;
const INSIGHTS_CANVAS_VERTICAL_PADDING = 78;
const INSIGHTS_SECTION_GAPS = 40;
const INSIGHTS_HEADER_HEIGHT = 190;
const INSIGHTS_FOOTER_HEIGHT = 55;
const MIN_INSIGHTS_CANVAS_WIDTH = 900;
const MIN_INSIGHTS_METRIC_HEIGHT = 160;

export function getInsightsExportLayoutMetrics(
  sizePresetId: ExportSizePresetId,
) {
  const sizePreset = getExportSizePreset(sizePresetId);
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
    INSIGHTS_HEADER_HEIGHT -
    INSIGHTS_FOOTER_HEIGHT -
    INSIGHTS_GRID_GAP * (INSIGHTS_GRID_ROWS - 1);
  const metricHeight = Math.floor(availableMetricHeight / INSIGHTS_GRID_ROWS);

  if (metricHeight < MIN_INSIGHTS_METRIC_HEIGHT) {
    throw new Error(
      `Insights export canvas is too short for four metric rows: ${sizePreset.width}x${sizePreset.height}`,
    );
  }

  const limits = PICK_INSIGHTS_CONFIG.exportLimits[sizePresetId];
  return {
    canvasWidth: sizePreset.width,
    canvasHeight: sizePreset.height,
    gridTemplateRows: `repeat(${INSIGHTS_GRID_ROWS}, minmax(${metricHeight}px, 1fr))`,
    metricHeight,
    headerHeight: INSIGHTS_HEADER_HEIGHT,
    footerHeight: INSIGHTS_FOOTER_HEIGHT,
    maxDistributionValues: limits.distributionValues,
    maxRankingLeaders: limits.rankingLeaders,
    rankingNameSize: sizePresetId === "square" ? 18 : 22,
  };
}
