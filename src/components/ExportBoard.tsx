import React from "react";
import {
  EXPORT_CANVAS_ID,
  EXPORT_CONFIG,
  PROJECT_CONFIG,
  PROJECT_THEME_COLOR,
} from "../config/project";
import { MEMBERS } from "../data/songs";
import type { PickSlot, Picks } from "../schema/music";
import { SITE_DOMAIN } from "../utils/constants";
import { getColorBackground, getMemberColors } from "../utils/memberColors";

interface ExportBoardProps {
  slots: PickSlot[];
  picks: Picks;
  showTitles?: boolean;
  transparentBg?: boolean;
  selectedBy?: string;
}

const EXPORT_FONT_FAMILY =
  '"Comfortaa", "Work Sans", "Noto Sans JP", sans-serif';
const EXPORT_TITLE_FONT_FAMILY =
  '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
const EXPORT_SITE_LABEL = SITE_DOMAIN.toUpperCase();

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
  slots,
  picks,
  showTitles = true,
  transparentBg = false,
  selectedBy = "",
}: ExportBoardProps) {
  const sortedSlots = slots.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const selectedByLabel = selectedBy.trim();

  return (
    <div
      id={EXPORT_CANVAS_ID}
      className="relative overflow-hidden font-sans"
      style={{
        backgroundColor: transparentBg
          ? "transparent"
          : EXPORT_CONFIG.background,
        width: `${EXPORT_CONFIG.width}px`,
        boxSizing: "border-box",
        padding: "44px 54px 34px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        border: "2px solid #000",
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
        data-export-header="hasunosora-style"
        style={{
          position: "relative",
          zIndex: 1,
          background: "#ffffff",
          padding: "30px 34px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: "#07182a",
            fontFamily: EXPORT_FONT_FAMILY,
            fontSize: "40px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            lineHeight: 1,
            textIndent: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {PROJECT_CONFIG.displayName}
        </div>
        {selectedByLabel && (
          <div
            data-export-selected-by="true"
            style={{
              margin: "14px auto 0",
              maxWidth: "860px",
              color: "#6f8199",
              fontSize: "20px",
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
            fontSize: "14px",
            fontWeight: 900,
            letterSpacing: "0.2em",
            textIndent: "0.2em",
          }}
        >
          {PROJECT_CONFIG.exportSubtitle}
        </div>
        <div
          data-member-color-strip="true"
          style={{
            marginTop: "14px",
            display: "flex",
            justifyContent: "center",
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

      <main
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gridTemplateRows: "repeat(5, 154px)",
          gap: "14px",
          flex: "0 0 auto",
        }}
      >
        {sortedSlots.map((slot) => {
          const song = picks[slot.id];
          return (
            <div
              key={slot.id}
              style={{
                height: "154px",
                overflow: "hidden",
                border: "2px solid #000",
                background: song ? "#ffffff" : "#f8f8f8",
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
                      width: "154px",
                      height: "154px",
                      objectFit: "cover",
                      flexShrink: 0,
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "18px 18px 14px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      background: "#fff",
                      borderLeft: "2px solid #000",
                    }}
                  >
                    {showTitles && (
                      <div
                        style={{
                          fontSize: "24px",
                          lineHeight: 1.18,
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
                        marginTop: showTitles ? "14px" : 0,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      <span style={exportTagStyle}>
                        <span style={exportTagTextStyle}>
                          {song.releaseDate?.slice(0, 4) ?? "TBD"}
                        </span>
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
                    fontSize: "16px",
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  No Pick
                </div>
              )}
            </div>
          );
        })}
      </main>

      <footer
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "2px solid #000",
          paddingTop: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#000",
          fontSize: "15px",
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <span>{PROJECT_CONFIG.appName}</span>
        <span>{EXPORT_SITE_LABEL}</span>
      </footer>
    </div>
  );
}

const exportTagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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
  lineHeight: 1,
  textTransform: "uppercase",
};

const exportTagTextStyle: React.CSSProperties = {
  display: "block",
  lineHeight: 1,
  transform: "translateY(-6px)",
};
