import React from "react";
import { EXPORT_QR_CONFIG } from "../config/exportQr";
import { PROJECT_CONFIG, PROJECT_THEME_COLOR } from "../config/project";
import { MEMBERS_BY_ID } from "../data/songs";
import type { ExportSizePresetId } from "../schema/export";
import type { PickInsights } from "../schema/pick-insights";
import type { Picks, Song } from "../schema/music";
import {
  derivePickInsights,
  getUniquePickedSongs,
  limitInsightExportValues,
} from "../utils/pickInsights";
import { getInsightsExportLayoutMetrics } from "../utils/insightsExportLayout";
import ExportQrCode from "./ExportQrCode";

interface InsightsExportBoardProps {
  exportCanvasId: string;
  picks: Picks;
  selectedBy?: string;
  pageUrl: string;
  sizePresetId: ExportSizePresetId;
  showQrCode?: boolean;
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
  showQrCode = false,
}: InsightsExportBoardProps) {
  const songs = getUniquePickedSongs(picks);
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
          ...(showQrCode
            ? { paddingRight: "172px", textAlign: "left" as const }
            : {}),
        }}
      >
        <div style={exportEyebrowStyle}>YOUR SELECTED SONG PROFILE</div>
        <div style={exportGroupStyle}>{PROJECT_CONFIG.groupName}</div>
        {selectedByLabel ? (
          <div style={exportSelectedByStyle}>Selected by {selectedByLabel}</div>
        ) : null}
        <div style={exportSummaryStyle}>
          {getSelectionSummary(insights.selectedCount)}
        </div>
        <SelectedCoverStrip
          songs={songs}
          maxVisible={layout.maxCoverThumbnails}
          coverSize={layout.coverSize}
        />
        {showQrCode ? (
          <div
            style={{
              position: "absolute",
              top: `${Math.max(
                0,
                (layout.headerHeight - EXPORT_QR_CONFIG.size) / 2,
              )}px`,
              right: "34px",
            }}
          >
            <ExportQrCode pageUrl={pageUrl} />
          </div>
        ) : null}
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
        <section
          data-export-boundary="profile-song-facts"
          style={{ ...exportPanelStyle, gridColumn: "1 / -1" }}
        >
          <PanelHeading
            title="WHAT THESE SONGS HAVE IN COMMON"
            detail="Release era, year, song type and release format"
          />
          <div style={exportFactsGridStyle}>
            <ExportDistributionFact
              label="Release era"
              values={insights.decades.values}
              coverage={insights.decades.coverage}
              maxVisible={layout.maxDistributionValues}
            />
            <ExportDistributionFact
              label="Release years"
              values={insights.releaseYears.values}
              coverage={insights.releaseYears.coverage}
              maxVisible={layout.maxDistributionValues}
            />
            <ExportDistributionFact
              label="Song types"
              values={insights.trackTypes.values.map(({ key, count }) => ({
                key: formatTrackType(key),
                count,
              }))}
              coverage={insights.trackTypes.coverage}
              maxVisible={layout.maxDistributionValues}
            />
            <ExportDistributionFact
              label="Release formats"
              values={insights.releaseTypes.values.map(({ key, count }) => ({
                key: formatReleaseType(key),
                count,
              }))}
              coverage={insights.releaseTypes.coverage}
              maxVisible={layout.maxDistributionValues}
            />
          </div>
        </section>
        <section data-export-boundary="profile-people" style={exportPanelStyle}>
          <PanelHeading
            title="PEOPLE IN THESE PICKS"
            detail="Member and center data from the selected songs"
          />
          <div style={exportStackStyle}>
            <ExportRankingFact
              label="Member pattern"
              ranking={insights.members}
              resolveName={(memberId) =>
                MEMBERS_BY_ID[memberId]?.name.ja ?? memberId
              }
              maxVisible={layout.maxRankingLeaders}
              nameSize={layout.rankingNameSize}
            />
            <ExportRankingFact
              label="Center data"
              ranking={insights.centers}
              resolveName={(memberId) =>
                MEMBERS_BY_ID[memberId]?.name.ja ?? memberId
              }
              maxVisible={layout.maxRankingLeaders}
              nameSize={layout.rankingNameSize}
              noDataLabel="No confirmed center data in these songs"
            />
          </div>
        </section>
        <section
          data-export-boundary="profile-credits"
          style={exportPanelStyle}
        >
          <PanelHeading
            title="CREDITS ACROSS THESE SONGS"
            detail="Repeated published credit notation, never individual attribution"
          />
          <div style={exportStackStyle}>
            <ExportRankingFact
              label="Lyric credit"
              ranking={insights.credits.lyricists}
              maxVisible={layout.maxRankingLeaders}
              nameSize={layout.rankingNameSize}
            />
            <ExportRankingFact
              label="Music credit"
              ranking={insights.credits.composers}
              maxVisible={layout.maxRankingLeaders}
              nameSize={layout.rankingNameSize}
            />
            <ExportRankingFact
              label="Arrangement credit"
              ranking={insights.credits.arrangers}
              maxVisible={layout.maxRankingLeaders}
              nameSize={layout.rankingNameSize}
            />
          </div>
        </section>
      </main>
      <footer
        data-export-boundary="insights-footer"
        style={{ ...exportFooterStyle, height: `${layout.footerHeight}px` }}
      >
        <div style={exportCreditNoticeStyle}>
          EACH CREDIT IS SHOWN AS ITS PUBLISHED COMBINATION; NO INDIVIDUAL
          CONTRIBUTION IS INFERRED
        </div>
        <div style={exportFooterMetaStyle}>
          <span>{PROJECT_CONFIG.appName}</span>
          <span style={exportPageLabelStyle}>{formatPageLabel(pageUrl)}</span>
        </div>
      </footer>
    </div>
  );
}

function SelectedCoverStrip({
  songs,
  maxVisible,
  coverSize,
}: {
  songs: Song[];
  maxVisible: number;
  coverSize: number;
}) {
  const { visible, hiddenCount } = limitInsightExportValues(songs, maxVisible);

  return (
    <div
      data-export-boundary="selected-song-covers"
      style={exportCoverAreaStyle}
    >
      <div style={exportCoverLabelStyle}>COVERS FROM YOUR SELECTED SONGS</div>
      <div style={exportCoverStripStyle}>
        {visible.map((song) => (
          <img
            key={song.id}
            src={song.coverUrl}
            alt=""
            style={{
              width: `${coverSize}px`,
              height: `${coverSize}px`,
              border: "1px solid #07182a",
              objectFit: "cover",
              display: "block",
            }}
          />
        ))}
        {hiddenCount > 0 ? (
          <div
            style={{
              ...exportCoverOverflowStyle,
              width: `${coverSize}px`,
              height: `${coverSize}px`,
            }}
          >
            +{hiddenCount}
            <br />
            SONGS
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PanelHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <div style={exportPanelTitleStyle}>{title}</div>
      <div style={exportPanelDetailStyle}>{detail}</div>
    </div>
  );
}

function ExportDistributionFact({
  label,
  values,
  coverage,
  maxVisible,
}: {
  label: string;
  values: Array<{ key: string; count: number }>;
  coverage: PickInsights["decades"]["coverage"];
  maxVisible: number;
}) {
  const { visible, hiddenCount } = limitInsightExportValues(values, maxVisible);
  return (
    <div data-export-boundary={`distribution-${label}`} style={exportFactStyle}>
      <div style={exportFactLabelStyle}>{label}</div>
      {visible.length > 0 ? (
        <div style={exportFactValuesStyle}>
          {visible.map(({ key, count }) => (
            <span key={key}>
              {key} <strong>{count}</strong>
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span style={exportOverflowStyle}>+{hiddenCount} MORE</span>
          ) : null}
        </div>
      ) : (
        <div style={exportInsufficientStyle}>No confirmed data</div>
      )}
      <div style={exportCoverageStyle}>
        {formatCoverage(coverage, "confirmed")}
      </div>
    </div>
  );
}

function ExportRankingFact({
  label,
  ranking,
  resolveName = (value: string) => value,
  maxVisible,
  nameSize,
  noDataLabel,
}: {
  label: string;
  ranking: PickInsights["members"];
  resolveName?: (value: string) => string;
  maxVisible: number;
  nameSize: number;
  noDataLabel?: string;
}) {
  const { visible, hiddenCount } = limitInsightExportValues(
    ranking.leaders,
    maxVisible,
  );
  const hasKnownData = ranking.coverage.known > 0;

  return (
    <div
      data-export-boundary={`ranking-${label}`}
      style={exportRankingFactStyle}
    >
      <div style={exportFactLabelStyle}>{label}</div>
      {ranking.eligible &&
      visible.length > 0 &&
      ranking.leaderCount !== null ? (
        <>
          <div style={{ ...exportRankingNameStyle, fontSize: `${nameSize}px` }}>
            Most repeated: {visible.map(resolveName).join(" · ")}
          </div>
          <div style={exportCoverageStyle}>
            {ranking.leaderCount} of {ranking.coverage.total} selected songs
            {hiddenCount > 0 ? ` · +${hiddenCount} TIED` : ""}
          </div>
        </>
      ) : (
        <>
          <div style={exportInsufficientStyle}>
            {!hasKnownData && noDataLabel
              ? noDataLabel
              : getRankingStatus(
                  ranking.coverage.known,
                  ranking.coverage.total,
                )}
          </div>
          <div style={exportCoverageStyle}>
            {formatCoverage(ranking.coverage, "confirmed")}
          </div>
        </>
      )}
    </div>
  );
}

function getSelectionSummary(selectedCount: number) {
  const noun = selectedCount === 1 ? "SONG" : "SONGS";
  const sample =
    selectedCount < 4
      ? " · EARLY SNAPSHOT — REPEAT PATTERNS STAY WITHHELD"
      : " · YOUR PICK PROFILE";
  return `${selectedCount} SELECTED ${noun}${sample}`;
}

function getRankingStatus(known: number, total: number) {
  if (total < 2) return "Pick at least 2 songs to show a repeat pattern";
  if (known < total) return "Incomplete data — no pattern is shown";
  return "No repeated pattern in these songs";
}

function formatCoverage(
  coverage: PickInsights["decades"]["coverage"],
  suffix: string,
) {
  return `${coverage.known}/${coverage.total} ${suffix}`;
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
  padding: "22px 34px 18px",
  textAlign: "center",
  overflow: "hidden",
};

const exportEyebrowStyle: React.CSSProperties = {
  color: PROJECT_THEME_COLOR,
  fontSize: "14px",
  fontWeight: 900,
  letterSpacing: "0.16em",
  textIndent: "0.16em",
};

const exportGroupStyle: React.CSSProperties = {
  marginTop: "8px",
  color: "#07182a",
  fontSize: "38px",
  fontWeight: 900,
  fontFamily: EXPORT_TITLE_FONT_FAMILY,
  letterSpacing: "0.05em",
  lineHeight: 1,
};

const exportSelectedByStyle: React.CSSProperties = {
  marginTop: "9px",
  color: "#6f8199",
  fontSize: "16px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  overflowWrap: "anywhere",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const exportSummaryStyle: React.CSSProperties = {
  marginTop: "8px",
  color: "#6f8199",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.15em",
};

const exportCoverAreaStyle: React.CSSProperties = {
  marginTop: "10px",
  display: "grid",
  justifyItems: "center",
  gap: "6px",
};

const exportCoverLabelStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "9px",
  fontWeight: 900,
  letterSpacing: "0.12em",
};

const exportCoverStripStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "8px",
  minWidth: 0,
};

const exportCoverOverflowStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
  border: "1px solid #07182a",
  background: "#f2f5f8",
  color: "#07182a",
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.08em",
  lineHeight: 1.2,
  textAlign: "center",
};

const exportPanelStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  border: "2px solid #000",
  background: "#f9fbfc",
  padding: "18px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const exportPanelTitleStyle: React.CSSProperties = {
  color: PROJECT_THEME_COLOR,
  fontSize: "14px",
  fontWeight: 900,
  letterSpacing: "0.13em",
};

const exportPanelDetailStyle: React.CSSProperties = {
  marginTop: "4px",
  color: "#6f8199",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.03em",
  lineHeight: 1.3,
};

const exportFactsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gridTemplateRows: "repeat(2, minmax(0, 1fr))",
  gap: "12px 20px",
  flex: "1 1 0",
  minHeight: 0,
};

const exportStackStyle: React.CSSProperties = {
  display: "grid",
  gridAutoRows: "minmax(0, 1fr)",
  gap: "12px",
  flex: "1 1 0",
  minHeight: 0,
};

const exportFactStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  borderLeft: `3px solid ${PROJECT_THEME_COLOR}`,
  padding: "6px 0 6px 11px",
  display: "grid",
  alignContent: "center",
  gap: "6px",
};

const exportRankingFactStyle: React.CSSProperties = {
  ...exportFactStyle,
  flex: "1 1 0",
};

const exportFactLabelStyle: React.CSSProperties = {
  color: "#07182a",
  fontSize: "13px",
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const exportFactValuesStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "5px 10px",
  color: "#07182a",
  fontSize: "16px",
  fontWeight: 800,
  lineHeight: 1.25,
};

const exportRankingNameStyle: React.CSSProperties = {
  color: "#000",
  fontFamily: EXPORT_TITLE_FONT_FAMILY,
  fontWeight: 900,
  lineHeight: 1.32,
  wordBreak: "break-word",
};

const exportCoverageStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.07em",
  lineHeight: 1.25,
};

const exportInsufficientStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "13px",
  fontWeight: 900,
  letterSpacing: "0.03em",
  lineHeight: 1.35,
};

const exportOverflowStyle: React.CSSProperties = {
  color: "#6f8199",
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.08em",
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
  overflow: "hidden",
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
