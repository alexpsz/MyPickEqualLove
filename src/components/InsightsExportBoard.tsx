import React from "react";
import { PROJECT_CONFIG, PROJECT_THEME_COLOR } from "../config/project";
import { MEMBERS_BY_ID } from "../data/songs";
import type { ExportSizePresetId } from "../schema/export";
import type { PickInsights } from "../schema/pick-insights";
import type { Picks } from "../schema/music";
import {
  derivePickInsights,
  limitInsightExportValues,
} from "../utils/pickInsights";
import { getInsightsExportLayoutMetrics } from "../utils/insightsExportLayout";

interface InsightsExportBoardProps {
  exportCanvasId: string;
  picks: Picks;
  selectedBy?: string;
  pageUrl: string;
  sizePresetId: ExportSizePresetId;
}

const EXPORT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif';
const EXPORT_TITLE_FONT_FAMILY =
  '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export default function InsightsExportBoard({
  exportCanvasId,
  picks,
  selectedBy = "",
  pageUrl,
  sizePresetId,
}: InsightsExportBoardProps) {
  const insights = derivePickInsights(picks, MEMBERS_BY_ID);
  const selectedByLabel = selectedBy.trim();
  const layout = getInsightsExportLayoutMetrics(sizePresetId);

  return (
    <div
      id={exportCanvasId}
      data-insights-export-board="true"
      lang="ja"
      className="relative overflow-hidden"
      style={{
        width: `${layout.canvasWidth}px`,
        height: `${layout.canvasHeight}px`,
        boxSizing: "border-box",
        padding: "44px 54px 34px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        border: "2px solid #000",
        background: "#ffffff",
        color: "#07182a",
        fontFamily: EXPORT_FONT_FAMILY,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(135deg, rgba(0,0,0,0.035) 0, rgba(0,0,0,0.035) 1px, transparent 1px, transparent 9px)",
          pointerEvents: "none",
        }}
      />
      <header
        data-export-boundary="insights-header"
        style={{
          ...exportHeaderStyle,
          height: `${layout.headerHeight}px`,
        }}
      >
        <div style={exportEyebrowStyle}>MY PICK INSIGHTS</div>
        <div style={exportGroupStyle}>{PROJECT_CONFIG.groupName}</div>
        {selectedByLabel ? (
          <div style={exportSelectedByStyle}>Selected by {selectedByLabel}</div>
        ) : null}
        <div style={exportSummaryStyle}>
          {insights.selectedCount} PICKS ANALYZED
        </div>
      </header>
      <main
        data-export-boundary="insights-content"
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gridTemplateRows: layout.gridTemplateRows,
          gap: "14px",
          flex: "1 1 0",
          minHeight: 0,
        }}
      >
        <ExportDistribution
          label="DECADES"
          values={insights.decades.values}
          maxVisible={layout.maxDistributionValues}
        />
        <ExportDistribution
          label="TRACK TYPES"
          values={insights.trackTypes.values.map(({ key, count }) => ({
            key: formatTrackType(key),
            count,
          }))}
          maxVisible={layout.maxDistributionValues}
        />
        <ExportDistribution
          label="RELEASE TYPES"
          values={insights.releaseTypes.values.map(({ key, count }) => ({
            key: formatReleaseType(key),
            count,
          }))}
          maxVisible={layout.maxDistributionValues}
        />
        <ExportRanking
          label="MEMBERS"
          ranking={insights.members}
          resolveName={(memberId) =>
            MEMBERS_BY_ID[memberId]?.name.ja ?? memberId
          }
          maxVisible={layout.maxRankingLeaders}
          nameSize={layout.rankingNameSize}
        />
        <ExportRanking
          label="CENTERS"
          ranking={insights.centers}
          resolveName={(memberId) =>
            MEMBERS_BY_ID[memberId]?.name.ja ?? memberId
          }
          maxVisible={layout.maxRankingLeaders}
          nameSize={layout.rankingNameSize}
        />
        <ExportRanking
          label="LYRIC CREDIT NOTATION"
          ranking={insights.credits.lyricists}
          maxVisible={layout.maxRankingLeaders}
          nameSize={layout.rankingNameSize}
        />
        <ExportRanking
          label="COMPOSER CREDIT NOTATION"
          ranking={insights.credits.composers}
          maxVisible={layout.maxRankingLeaders}
          nameSize={layout.rankingNameSize}
        />
        <ExportRanking
          label="ARRANGER CREDIT NOTATION"
          ranking={insights.credits.arrangers}
          maxVisible={layout.maxRankingLeaders}
          nameSize={layout.rankingNameSize}
        />
      </main>
      <footer
        data-export-boundary="insights-footer"
        style={{ ...exportFooterStyle, height: `${layout.footerHeight}px` }}
      >
        <div style={exportCreditNoticeStyle}>
          CREDIT RANKINGS USE CONFIRMED SOURCE NOTATION / COMBINATIONS, NOT
          INDIVIDUAL ATTRIBUTION
        </div>
        <div style={exportFooterMetaStyle}>
          <span>{PROJECT_CONFIG.appName}</span>
          <span style={exportPageLabelStyle}>{formatPageLabel(pageUrl)}</span>
        </div>
      </footer>
    </div>
  );
}

function ExportDistribution({
  label,
  values,
  maxVisible,
}: {
  label: string;
  values: Array<{ key: string; count: number }>;
  maxVisible: number;
}) {
  const { visible: visibleValues, hiddenCount: hiddenValueCount } =
    limitInsightExportValues(values, maxVisible);

  return (
    <section data-export-boundary={`metric-${label}`} style={exportMetricStyle}>
      <div style={exportMetricLabelStyle}>{label}</div>
      {values.length > 0 ? (
        <div style={exportValueListStyle}>
          {visibleValues.map(({ key, count }) => (
            <div key={key} style={exportValueStyle}>
              <span>{key}</span>
              <strong>{count}</strong>
            </div>
          ))}
          {hiddenValueCount > 0 ? (
            <div style={exportOverflowStyle}>+{hiddenValueCount} MORE</div>
          ) : null}
        </div>
      ) : (
        <div style={exportInsufficientStyle}>DATA NOT AVAILABLE</div>
      )}
    </section>
  );
}

function ExportRanking({
  label,
  ranking,
  resolveName = (value: string) => value,
  maxVisible,
  nameSize,
}: {
  label: string;
  ranking: PickInsights["members"];
  resolveName?: (value: string) => string;
  maxVisible: number;
  nameSize: number;
}) {
  const { visible: visibleLeaders, hiddenCount: hiddenLeaderCount } =
    limitInsightExportValues(ranking.leaders, maxVisible);

  return (
    <section data-export-boundary={`metric-${label}`} style={exportMetricStyle}>
      <div style={exportMetricLabelStyle}>{label}</div>
      {ranking.eligible && visibleLeaders.length > 0 ? (
        <div style={exportRankingValueStyle}>
          <div style={{ ...exportNameStyle, fontSize: `${nameSize}px` }}>
            {visibleLeaders.map(resolveName).join(" · ")}
          </div>
          <div style={exportRankingCountStyle}>
            TOP PICK · {ranking.leaderCount}
          </div>
          {hiddenLeaderCount > 0 ? (
            <div style={exportOverflowStyle}>+{hiddenLeaderCount} TIED</div>
          ) : null}
        </div>
      ) : (
        <div style={exportInsufficientStyle}>
          DATA INSUFFICIENT · {ranking.coverage.known}/{ranking.coverage.total}
        </div>
      )}
    </section>
  );
}

function formatTrackType(value: string) {
  return value.replace(/_/g, " ").toUpperCase();
}

function formatReleaseType(value: string) {
  return value.replace("dvd_bd", "DVD/BD").toUpperCase();
}

function formatPageLabel(pageUrl: string) {
  const url = new URL(pageUrl);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.hostname}${path}`.toUpperCase();
}

const exportHeaderStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  boxSizing: "border-box",
  background: "#ffffff",
  padding: "30px 34px 24px",
  textAlign: "center",
};

const exportEyebrowStyle: React.CSSProperties = {
  color: PROJECT_THEME_COLOR,
  fontSize: "16px",
  fontWeight: 900,
  letterSpacing: "0.2em",
  textIndent: "0.2em",
};

const exportGroupStyle: React.CSSProperties = {
  marginTop: "10px",
  color: "#07182a",
  fontSize: "42px",
  fontWeight: 900,
  fontFamily: EXPORT_TITLE_FONT_FAMILY,
  letterSpacing: "0.05em",
  lineHeight: 1,
};

const exportSelectedByStyle: React.CSSProperties = {
  marginTop: "12px",
  color: "#6f8199",
  fontSize: "18px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  overflowWrap: "anywhere",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const exportSummaryStyle: React.CSSProperties = {
  marginTop: "12px",
  color: "#6f8199",
  fontSize: "13px",
  fontWeight: 900,
  letterSpacing: "0.17em",
};

const exportMetricStyle: React.CSSProperties = {
  minWidth: 0,
  border: "2px solid #000",
  background: "#ffffff",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "12px",
};

const exportMetricLabelStyle: React.CSSProperties = {
  color: PROJECT_THEME_COLOR,
  fontSize: "13px",
  fontWeight: 900,
  letterSpacing: "0.16em",
};

const exportValueListStyle: React.CSSProperties = {
  display: "grid",
  gap: "5px",
  fontSize: "15px",
  fontWeight: 800,
};

const exportValueStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  borderBottom: "1px solid #d4d4d4",
  paddingBottom: "4px",
};

const exportRankingValueStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const exportNameStyle: React.CSSProperties = {
  color: "#000",
  fontFamily: EXPORT_TITLE_FONT_FAMILY,
  fontWeight: 900,
  lineHeight: 1.25,
  wordBreak: "break-word",
};

const exportRankingCountStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.12em",
};

const exportInsufficientStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.1em",
  lineHeight: 1.5,
};

const exportOverflowStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.1em",
};

const exportFooterStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  borderTop: "2px solid #000",
  paddingTop: "8px",
  display: "grid",
  alignContent: "space-between",
  gap: "4px",
  color: "#000",
  fontSize: "15px",
  fontWeight: 900,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  boxSizing: "border-box",
};

const exportCreditNoticeStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "8px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  lineHeight: 1.2,
  textAlign: "center",
};

const exportFooterMetaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  minWidth: 0,
};

const exportPageLabelStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "right",
};
