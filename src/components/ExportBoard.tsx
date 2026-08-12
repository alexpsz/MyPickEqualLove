import React from "react";
import { PROJECT_CONFIG, PROJECT_THEME_COLOR } from "../config/project";
import {
  EXPORT_BACKGROUND,
  resolveExportComposition,
  type ExportComposition,
} from "../config/exportPresets";
import { EXPORT_QR_CONFIG } from "../config/exportQr";
import { MEMBERS } from "../data/songs";
import type { ExperienceContext } from "../data/pickExperiences";
import type { ExportSizePresetId, ExportTemplateId } from "../schema/export";
import type { PickExperience } from "../schema/pick-experience";
import type { PickSlot, Picks } from "../schema/music";
import { getColorBackground, getMemberColors } from "../utils/memberColors";
import ExportQrCode from "./ExportQrCode";

interface ExportBoardProps {
  experience: PickExperience;
  context?: ExperienceContext;
  exportCanvasId: string;
  slots: PickSlot[];
  picks: Picks;
  showTitles?: boolean;
  transparentBg?: boolean;
  showQrCode?: boolean;
  templateId: ExportTemplateId;
  sizePresetId: ExportSizePresetId;
  selectedBy?: string;
  pageUrl: string;
}

const EXPORT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif';
const EXPORT_TITLE_FONT_FAMILY =
  '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const MEMBER_COLOR_STRIP = MEMBERS.slice()
  .filter((member) => member.active !== false)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((member) => ({
    id: member.id,
    label: member.name.ja,
    colors: getMemberColors(member, PROJECT_THEME_COLOR),
  }));
const MEMBER_COLOR_STRIP_GAP = MEMBER_COLOR_STRIP.length > 10 ? 6 : 8;
const MEMBER_COLOR_STRIP_WIDTH = MEMBER_COLOR_STRIP.length > 10 ? 18 : 22;

export default function ExportBoard({
  experience,
  context,
  exportCanvasId,
  slots,
  picks,
  showTitles = true,
  transparentBg = false,
  showQrCode = false,
  templateId,
  sizePresetId,
  selectedBy = "",
  pageUrl,
}: ExportBoardProps) {
  const sortedSlots = slots.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const selectedByLabel = selectedBy.trim();
  const pageLabel = formatPageLabel(pageUrl);
  const subtitle = [experience.export.subtitle, context?.exportLabel]
    .filter(Boolean)
    .join(" · ");
  const baseComposition = resolveExportComposition(
    templateId,
    sizePresetId,
    experience.export.layout,
    PROJECT_THEME_COLOR,
  );
  const composition =
    showQrCode &&
    experience.export.layout === "five-memory-list" &&
    sizePresetId !== "square"
      ? {
          ...baseComposition,
          content: {
            ...baseComposition.content,
            ...EXPORT_QR_CONFIG.fiveMemory[sizePresetId],
          },
        }
      : baseComposition;
  const { canvas, size, visual } = composition;

  return (
    <div
      id={exportCanvasId}
      lang="ja"
      className="relative overflow-hidden font-sans"
      style={{
        backgroundColor: transparentBg ? "transparent" : EXPORT_BACKGROUND,
        width: `${size.width}px`,
        height: `${size.height}px`,
        boxSizing: "border-box",
        padding: canvas.padding,
        display: "flex",
        flexDirection: "column",
        gap: `${canvas.gap}px`,
        border: visual.rootBorder,
        fontFamily: EXPORT_FONT_FAMILY,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: visual.textureBackground,
          pointerEvents: "none",
        }}
      />

      <header
        data-export-header="hasunosora-style"
        data-export-boundary="header"
        style={{
          position: "relative",
          zIndex: 1,
          background: visual.headerBackground,
          padding: canvas.headerPadding,
          textAlign: visual.headerTextAlign,
          border: visual.headerBorder,
          borderRadius: visual.headerRadius,
        }}
      >
        <div
          style={{
            color: visual.headerTitleColor,
            fontFamily: EXPORT_FONT_FAMILY,
            fontSize: `${canvas.headerTitleSize}px`,
            fontWeight: 700,
            letterSpacing: "0.18em",
            lineHeight: 1,
            textIndent: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {experience.export.title}
        </div>
        {selectedByLabel && (
          <div
            data-export-selected-by="true"
            style={{
              margin: "14px auto 0",
              maxWidth: "860px",
              color: "#6f8199",
              fontSize: `${canvas.selectedBySize}px`,
              fontWeight: 900,
              letterSpacing: "0.08em",
              lineHeight: 1.25,
              overflowWrap: "anywhere",
            }}
          >
            Selected by {selectedByLabel}
          </div>
        )}
        <div
          style={{
            marginTop: selectedByLabel ? "10px" : "12px",
            color: "#6f8199",
            fontSize: `${canvas.subtitleSize}px`,
            fontWeight: 900,
            letterSpacing: "0.2em",
            textIndent: "0.2em",
          }}
        >
          {subtitle}
        </div>
        <div
          data-member-color-strip="true"
          style={{
            marginTop: `${canvas.memberStripMarginTop}px`,
            display: "flex",
            justifyContent: visual.memberStripJustify,
            gap: `${MEMBER_COLOR_STRIP_GAP}px`,
          }}
        >
          {MEMBER_COLOR_STRIP.map((member) => (
            <span
              key={member.id}
              title={member.label}
              data-member-color={member.colors.join(" / ")}
              style={{
                width: `${MEMBER_COLOR_STRIP_WIDTH}px`,
                height: "8px",
                borderRadius: "999px",
                border: "1px solid #d4d4d4",
                boxSizing: "border-box",
                background: getColorBackground(
                  member.colors,
                  PROJECT_THEME_COLOR,
                ),
              }}
            />
          ))}
        </div>
      </header>

      <ExportContent
        composition={composition}
        showSlotTitle={experience.export.layout === "five-memory-list"}
        slots={sortedSlots}
        picks={picks}
        showTitles={showTitles}
      />

      <footer
        data-export-boundary="footer"
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: visual.footerBorder,
          paddingTop: `${canvas.footerPaddingTop}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: visual.footerColor,
          fontSize: `${canvas.footerFontSize}px`,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {showQrCode ? (
          <>
            <div
              style={{
                display: "flex",
                minWidth: 0,
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <span>{PROJECT_CONFIG.appName}</span>
              <span style={{ overflowWrap: "anywhere" }}>{pageLabel}</span>
            </div>
            <ExportQrCode pageUrl={pageUrl} />
          </>
        ) : (
          <>
            <span>{PROJECT_CONFIG.appName}</span>
            <span>{pageLabel}</span>
          </>
        )}
      </footer>
    </div>
  );
}

function ExportContent({
  composition,
  showSlotTitle,
  slots,
  picks,
  showTitles,
}: {
  composition: ExportComposition;
  showSlotTitle: boolean;
  slots: PickSlot[];
  picks: Picks;
  showTitles: boolean;
}) {
  const { content } = composition;
  const isGrid = content.mode === "grid";

  return (
    <main
      data-export-boundary="content"
      style={{
        position: "relative",
        zIndex: 1,
        display: isGrid ? "grid" : "flex",
        gridTemplateColumns: isGrid
          ? `repeat(${content.columns}, 1fr)`
          : undefined,
        gridTemplateRows:
          isGrid && content.rows
            ? `repeat(${content.rows}, minmax(0, 1fr))`
            : undefined,
        flexDirection: isGrid ? undefined : "column",
        gap: `${content.gap}px`,
        flex: isGrid ? "1 1 0" : "0 0 auto",
        minHeight: isGrid ? 0 : undefined,
      }}
    >
      {slots.map((slot) => (
        <ExportPickCard
          key={slot.id}
          composition={composition}
          slot={slot}
          song={picks[slot.id]}
          showTitles={showTitles}
          showSlotTitle={showSlotTitle}
        />
      ))}
    </main>
  );
}

function ExportPickCard({
  composition,
  slot,
  song,
  showTitles,
  showSlotTitle,
}: {
  composition: ExportComposition;
  slot: PickSlot;
  song: Picks[string] | undefined;
  showTitles: boolean;
  showSlotTitle: boolean;
}) {
  const { content, visual } = composition;
  const cardSize = content.fixedCardSize;

  return (
    <div
      style={{
        height: content.fillHeight ? "100%" : `${cardSize}px`,
        overflow: "hidden",
        border: visual.cardBorder,
        borderRadius: visual.cardRadius,
        background: song ? visual.cardBackground : visual.emptyBackground,
        display: "flex",
        position: "relative",
      }}
    >
      {song ? (
        <>
          <img
            src={song.coverUrl}
            alt={`${song.title.ja} cover`}
            style={{
              width: content.fillHeight ? "auto" : `${cardSize}px`,
              height: content.fillHeight ? "100%" : `${cardSize}px`,
              aspectRatio: content.fillHeight ? "1 / 1" : undefined,
              objectFit: "cover",
              flexShrink: 0,
              display: "block",
            }}
          />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: content.cardPadding,
              display: "flex",
              flexDirection: "column",
              alignItems: showSlotTitle ? "stretch" : "center",
              justifyContent: showSlotTitle ? "space-between" : "center",
              textAlign: showSlotTitle ? "left" : "center",
              background: visual.cardBackground,
              borderLeft: visual.cardDivider,
            }}
          >
            {showSlotTitle ? (
              <div>
                <div style={exportSlotLabelStyle}>{slot.label}</div>
                {slot.subtitle ? (
                  <div style={exportSlotSubtitleStyle}>{slot.subtitle}</div>
                ) : null}
              </div>
            ) : null}
            <div>
              {showTitles && (
                <div
                  style={{
                    fontSize: `${content.titleFontSize}px`,
                    lineHeight: 1.16,
                    fontWeight: 900,
                    fontFamily: EXPORT_TITLE_FONT_FAMILY,
                    color: "#000",
                    wordBreak: "break-word",
                  }}
                >
                  {song.title.ja}
                </div>
              )}
              <div
                style={{
                  marginTop: showTitles ? `${content.tagMarginTop}px` : 0,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: showSlotTitle ? "flex-start" : "center",
                  gap: "8px",
                }}
              >
                <span data-export-year-tag style={exportTagStyle}>
                  <span style={exportTagTextStyle}>
                    {song.releaseDate?.slice(0, 4) ?? "TBD"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            color: "#777",
            fontSize: "16px",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          {showSlotTitle ? (
            <span style={{ color: "#000", fontSize: "22px", letterSpacing: 0 }}>
              {slot.label}
            </span>
          ) : null}
          <span>No Pick</span>
        </div>
      )}
    </div>
  );
}

const exportTagStyle: React.CSSProperties = {
  display: "inline-block",
  minWidth: "44px",
  height: "24px",
  boxSizing: "border-box",
  border: `1px solid ${PROJECT_THEME_COLOR}`,
  background: "#fff",
  color: PROJECT_THEME_COLOR,
  padding: "0 8px",
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  lineHeight: "22px",
  textAlign: "center",
  textTransform: "uppercase",
};

const exportTagTextStyle: React.CSSProperties = {
  display: "inline-block",
  lineHeight: 1,
  transform: "translateY(-5px)",
};

const exportSlotLabelStyle: React.CSSProperties = {
  color: PROJECT_THEME_COLOR,
  fontSize: "19px",
  fontWeight: 900,
  letterSpacing: 0,
  lineHeight: 1.2,
  fontFamily: EXPORT_TITLE_FONT_FAMILY,
};

const exportSlotSubtitleStyle: React.CSSProperties = {
  marginTop: "5px",
  color: "#6f8199",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.04em",
  lineHeight: 1.35,
};

function formatPageLabel(pageUrl: string) {
  const url = new URL(pageUrl);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.hostname}${path}`.toUpperCase();
}
