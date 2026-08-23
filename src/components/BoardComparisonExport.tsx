import React from "react";
import { PROJECT_CONFIG, PROJECT_THEME_COLOR } from "../config/project";
import {
  resolveExportComposition,
  type ExportComposition,
} from "../config/exportPresets";
import { SONGS_BY_ID } from "../data/songs";
import type { ExperienceContext } from "../data/pickExperiences";
import type { AppLocale } from "../i18n/locales";
import { translate } from "../i18n/translate";
import type {
  ExportCoverTonePalette,
  ExportSizePresetId,
  ExportTemplateId,
} from "../schema/export";
import type { PickExperience } from "../schema/pick-experience";
import type { BoardAffinity } from "../utils/boardAffinity";
import type { AvailableBoardComparison } from "../utils/boardComparison";
import ExportQrCode from "./ExportQrCode";

interface BoardComparisonExportProps {
  exportCanvasId: string;
  experience: PickExperience;
  context?: ExperienceContext;
  comparison: AvailableBoardComparison;
  affinity: BoardAffinity;
  locale: AppLocale;
  showTitles: boolean;
  showQrCode: boolean;
  templateId: ExportTemplateId;
  sizePresetId: ExportSizePresetId;
  coverTonePalette?: ExportCoverTonePalette;
  selectedBy?: string;
  pageUrl: string;
}

const EXPORT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif';

export default function BoardComparisonExport({
  exportCanvasId,
  experience,
  context,
  comparison,
  affinity,
  locale,
  showTitles,
  showQrCode,
  templateId,
  sizePresetId,
  coverTonePalette,
  selectedBy = "",
  pageUrl,
}: BoardComparisonExportProps) {
  const composition = resolveExportComposition(
    templateId,
    sizePresetId,
    "top10-grid",
    PROJECT_THEME_COLOR,
    coverTonePalette,
  );
  const { canvas, size, visual } = composition;
  const compact = sizePresetId === "square";
  const spacious = sizePresetId === "story";
  const selectedByLabel = selectedBy.trim();
  const subtitle = [experience.export.subtitle, context?.exportLabel]
    .filter(Boolean)
    .join(" · ");
  const sharedGridRows = Math.max(1, Math.ceil(comparison.shared.length / 2));
  const pageLabel = formatPageLabel(pageUrl);

  return (
    <div
      id={exportCanvasId}
      lang={locale}
      data-export-content-kind="comparison"
      data-board-affinity-formula={affinity.formulaId}
      data-board-affinity-points={affinity.points}
      data-board-affinity-shared={affinity.sharedSongCount}
      data-board-affinity-distance={affinity.totalRankDistance}
      className="relative overflow-hidden"
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: `${canvas.gap}px`,
        overflow: "hidden",
        padding: canvas.padding,
        border: visual.rootBorder,
        background: visual.canvasBackground,
        color: visual.songTitleColor,
        fontFamily: EXPORT_FONT_FAMILY,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: visual.textureBackground,
          pointerEvents: "none",
        }}
      />

      <header
        data-export-boundary="comparison-header"
        style={{
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
          overflow: "hidden",
          border: visual.headerBorder,
          borderRadius: visual.headerRadius,
          background: visual.headerBackground,
          padding: compact ? "18px 24px" : spacious ? "30px 36px" : "24px 30px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            color: visual.headerTitleColor,
            fontSize: compact ? "30px" : spacious ? "44px" : "38px",
            fontWeight: 900,
            letterSpacing: "0.14em",
            lineHeight: 1,
            textIndent: "0.14em",
          }}
        >
          {translate(locale, "boardComparison.exportTitle")}
        </p>
        <p
          style={{
            margin: compact ? "10px 0 0" : "12px 0 0",
            overflow: "hidden",
            color: visual.mutedTextColor,
            fontSize: compact ? "15px" : "17px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            lineHeight: 1.2,
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitle}
        </p>
        {selectedByLabel ? (
          <p
            style={{
              margin: "8px 0 0",
              overflow: "hidden",
              color: visual.mutedTextColor,
              fontSize: compact ? "13px" : "15px",
              fontWeight: 700,
              lineHeight: 1.2,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {translate(locale, "boardComparison.exportSelectedBy", {
              name: selectedByLabel,
            })}
          </p>
        ) : null}
      </header>

      <section
        data-export-boundary="comparison-affinity"
        style={{
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
          overflow: "hidden",
          border: visual.cardBorder,
          borderRadius: visual.cardRadius,
          background: visual.cardBackground,
          padding: compact ? "18px 24px" : spacious ? "28px 34px" : "22px 30px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "0.75fr 1.25fr" : "0.82fr 1.18fr",
            alignItems: "center",
            gap: compact ? "20px" : "28px",
          }}
        >
          <div style={{ minWidth: 0, textAlign: "center" }}>
            <p
              style={{
                margin: 0,
                color: visual.slotLabelColor,
                fontSize: compact ? "13px" : "15px",
                fontWeight: 900,
                letterSpacing: "0.12em",
                lineHeight: 1.2,
                textTransform: "uppercase",
              }}
            >
              {translate(locale, "boardComparison.affinityLabel")}
            </p>
            <p
              style={{
                margin: compact ? "4px 0 0" : "6px 0 0",
                color: visual.headerTitleColor,
                fontSize: compact ? "66px" : spacious ? "96px" : "82px",
                fontWeight: 900,
                letterSpacing: "-0.05em",
                lineHeight: 0.95,
              }}
            >
              {affinity.points}
            </p>
            <p
              style={{
                margin: "5px 0 0",
                color: visual.mutedTextColor,
                fontSize: compact ? "13px" : "15px",
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {translate(locale, "boardComparison.affinityUnit")}
            </p>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "10px",
              }}
            >
              <Metric
                composition={composition}
                label={translate(locale, "boardComparison.affinityShared")}
                value={`${affinity.sharedSongCount} / ${affinity.boardSize}`}
                compact={compact}
              />
              <Metric
                composition={composition}
                label={translate(locale, "boardComparison.affinityDistance")}
                value={String(affinity.totalRankDistance)}
                compact={compact}
              />
            </div>
            <p
              style={{
                margin: compact ? "11px 0 0" : "14px 0 0",
                color: visual.songTitleColor,
                fontSize: compact ? "13px" : "15px",
                fontWeight: 800,
                lineHeight: 1.35,
              }}
            >
              {translate(locale, "boardComparison.formulaBase")}
            </p>
            <p
              data-board-affinity-equation="true"
              style={{
                margin: "5px 0 0",
                color: visual.mutedTextColor,
                fontSize: compact ? "13px" : "15px",
                fontWeight: 800,
                lineHeight: 1.3,
              }}
            >
              {translate(locale, "boardComparison.formulaRank", {
                shared: affinity.sharedSongCount,
                boardSize: affinity.boardSize,
                distance: affinity.totalRankDistance,
                score: affinity.points,
              })}
            </p>
          </div>
        </div>
      </section>

      <section
        data-export-boundary="comparison-shared-songs"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          minHeight: 0,
          flex: "1 1 0",
          flexDirection: "column",
          overflow: "hidden",
          border: visual.cardBorder,
          borderRadius: visual.cardRadius,
          background: visual.cardBackground,
          padding: compact ? "14px 18px 16px" : "18px 22px 20px",
        }}
      >
        <p
          style={{
            margin: 0,
            flexShrink: 0,
            color: visual.slotLabelColor,
            fontSize: compact ? "13px" : "15px",
            fontWeight: 900,
            letterSpacing: "0.08em",
            lineHeight: 1.2,
            textTransform: "uppercase",
          }}
        >
          {translate(locale, "boardComparison.sharedHeading")}
        </p>

        {comparison.shared.length === 0 ? (
          <p
            style={{
              display: "flex",
              minHeight: 0,
              flex: "1 1 0",
              alignItems: "center",
              justifyContent: "center",
              margin: 0,
              color: visual.mutedTextColor,
              fontSize: compact ? "18px" : "22px",
              fontWeight: 800,
            }}
          >
            {translate(locale, "boardComparison.none")}
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              minHeight: 0,
              flex: "1 1 0",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gridTemplateRows: `repeat(${sharedGridRows}, minmax(0, 1fr))`,
              gap: compact ? "8px" : "10px",
              marginTop: compact ? "10px" : "12px",
              overflow: "hidden",
            }}
          >
            {comparison.shared.map((song) => (
              <div
                key={song.songId}
                data-comparison-shared-song={song.songId}
                style={{
                  display: "flex",
                  minWidth: 0,
                  minHeight: 0,
                  alignItems: "center",
                  gap: compact ? "10px" : "12px",
                  overflow: "hidden",
                  border: visual.cardBorder,
                  borderRadius: visual.cardRadius,
                  background: visual.emptyBackground,
                  padding: compact ? "7px 10px" : "9px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: compact ? "64px" : "72px",
                    flexShrink: 0,
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: visual.slotLabelColor,
                    fontSize: compact ? "12px" : "13px",
                    fontWeight: 900,
                    lineHeight: 1.25,
                  }}
                >
                  <span>#{song.currentRank}</span>
                  <span aria-hidden="true">↕</span>
                  <span>#{song.sharedRank}</span>
                </div>
                {showTitles ? (
                  <p
                    lang="ja"
                    style={{
                      display: "-webkit-box",
                      minWidth: 0,
                      margin: 0,
                      overflow: "hidden",
                      color: visual.songTitleColor,
                      fontSize: compact ? "15px" : "18px",
                      fontWeight: 800,
                      lineHeight: 1.25,
                      overflowWrap: "anywhere",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: compact ? 1 : 2,
                    }}
                  >
                    {SONGS_BY_ID[song.songId]?.title.ja ?? song.songId}
                  </p>
                ) : (
                  <p
                    style={{
                      minWidth: 0,
                      margin: 0,
                      color: visual.mutedTextColor,
                      fontSize: compact ? "13px" : "15px",
                      fontWeight: 800,
                      lineHeight: 1.3,
                    }}
                  >
                    {translate(locale, "boardComparison.rankDifference", {
                      difference: song.rankDifference,
                    })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        data-export-boundary="comparison-exclusive-counts"
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          flexShrink: 0,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: compact ? "10px" : "12px",
          overflow: "hidden",
        }}
      >
        <CountCard
          composition={composition}
          label={translate(locale, "boardComparison.onlyCurrentHeading")}
          count={comparison.onlyCurrent.length}
          compact={compact}
        />
        <CountCard
          composition={composition}
          label={translate(locale, "boardComparison.onlySharedHeading")}
          count={comparison.onlyShared.length}
          compact={compact}
        />
      </section>

      <footer
        data-export-boundary="comparison-footer"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexShrink: 0,
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "18px",
          overflow: "hidden",
          borderTop: visual.footerBorder,
          paddingTop: `${canvas.footerPaddingTop}px`,
          color: visual.footerColor,
          fontSize: `${canvas.footerFontSize}px`,
          fontWeight: 900,
          letterSpacing: "0.12em",
          lineHeight: 1.25,
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            display: "flex",
            minWidth: 0,
            flexDirection: "column",
            gap: "6px",
            overflow: "hidden",
          }}
        >
          <span>{PROJECT_CONFIG.appName}</span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pageLabel}
          </span>
        </div>
        {showQrCode ? <ExportQrCode pageUrl={pageUrl} /> : null}
      </footer>
    </div>
  );
}

function Metric({
  composition,
  label,
  value,
  compact,
}: {
  composition: ExportComposition;
  label: string;
  value: string;
  compact: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        overflow: "hidden",
        border: composition.visual.cardBorder,
        borderRadius: composition.visual.cardRadius,
        background: composition.visual.emptyBackground,
        padding: compact ? "9px 10px" : "11px 12px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: 0,
          overflow: "hidden",
          color: composition.visual.mutedTextColor,
          fontSize: compact ? "11px" : "12px",
          fontWeight: 800,
          lineHeight: 1.2,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          color: composition.visual.songTitleColor,
          fontSize: compact ? "22px" : "26px",
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function CountCard({
  composition,
  label,
  count,
  compact,
}: {
  composition: ExportComposition;
  label: string;
  count: number;
  compact: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        minWidth: 0,
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        overflow: "hidden",
        border: composition.visual.cardBorder,
        borderRadius: composition.visual.cardRadius,
        background: composition.visual.cardBackground,
        padding: compact ? "11px 14px" : "14px 18px",
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          color: composition.visual.mutedTextColor,
          fontSize: compact ? "12px" : "14px",
          fontWeight: 800,
          lineHeight: 1.2,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          flexShrink: 0,
          color: composition.visual.songTitleColor,
          fontSize: compact ? "24px" : "28px",
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function formatPageLabel(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return pageUrl;
  }
}
