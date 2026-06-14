import React from "react";
import {
  APP_BRAND,
  EQUAL_LOVE_TEAM_COLOR,
  EXPORT_CONFIG,
} from "../config/equalLove";
import { MEMBERS } from "../data/songs";
import type { PickSlot, Picks } from "../schema/music";
import { SITE_DOMAIN } from "../utils/constants";

interface ExportBoardProps {
  slots: PickSlot[];
  picks: Picks;
  showTitles?: boolean;
  transparentBg?: boolean;
}

const EXPORT_FONT_FAMILY = '"Comfortaa", "Work Sans", "Noto Sans JP", sans-serif';

const MEMBER_COLOR_STRIP = MEMBERS.slice()
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .slice(0, 10)
  .map((member) => ({
    id: member.id,
    label: member.name.ja,
    color: member.color ?? EQUAL_LOVE_TEAM_COLOR,
  }));

export default function ExportBoard({
  slots,
  picks,
  showTitles = true,
  transparentBg = false,
}: ExportBoardProps) {
  const sortedSlots = slots.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div
      id="mypick-equal-love-export-canvas"
      className="relative overflow-hidden font-sans"
      style={{
        backgroundColor: transparentBg ? "transparent" : EXPORT_CONFIG.background,
        width: `${EXPORT_CONFIG.width}px`,
        height: `${EXPORT_CONFIG.height}px`,
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
          border: "3px solid #d8dadd",
          borderRadius: "56px 56px 0 0",
          background: "#ffffff",
          padding: "30px 34px 24px",
          textAlign: "center",
          boxShadow: "0 14px 28px rgba(10, 21, 32, 0.1)",
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
          {APP_BRAND.displayName}
        </div>
        <div
          style={{
            marginTop: "12px",
            color: "#6f8199",
            fontSize: "14px",
            fontWeight: 900,
            letterSpacing: "0.2em",
            textIndent: "0.2em",
          }}
        >
          ＝LOVE お気に入り楽曲選
        </div>
        <div
          data-member-color-strip="true"
          style={{
            marginTop: "14px",
            display: "flex",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          {MEMBER_COLOR_STRIP.map((member) => (
            <span
              key={member.id}
              title={member.label}
              data-member-color={member.color}
              style={{
                width: "22px",
                height: "8px",
                borderRadius: "999px",
                backgroundColor: member.color,
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
          flex: 1,
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
              <div
                style={{
                  position: "absolute",
                  left: "0",
                  top: "0",
                  zIndex: 4,
                  minWidth: "58px",
                  height: "34px",
                  background: EQUAL_LOVE_TEAM_COLOR,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: "16px",
                  borderRight: "2px solid #000",
                  borderBottom: "2px solid #000",
                }}
              >
                {slot.label}
              </div>

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
                      background:
                        "#fff",
                      borderLeft: "2px solid #000",
                    }}
                  >
                    {showTitles && (
                      <div
                        style={{
                          fontSize: "24px",
                          lineHeight: 1.18,
                          fontWeight: 900,
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
                        {song.releaseDate?.slice(0, 4) ?? "TBD"}
                      </span>
                      {song.trackType && <span style={exportTagStyle}>{song.trackType}</span>}
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
        <span>{APP_BRAND.appName}</span>
        <span>{SITE_DOMAIN}</span>
      </footer>
    </div>
  );
}

const exportTagStyle: React.CSSProperties = {
  border: `1px solid ${EQUAL_LOVE_TEAM_COLOR}`,
  background: "#fff",
  color: EQUAL_LOVE_TEAM_COLOR,
  padding: "4px 8px",
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};
