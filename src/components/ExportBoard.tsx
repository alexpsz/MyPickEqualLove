import React from "react";
import { APP_BRAND, EXPORT_CONFIG, THEME_STRIP_COLORS } from "../config/equalLove";
import type { PickSlot, Picks } from "../schema/music";
import { SITE_DOMAIN } from "../utils/constants";

interface ExportBoardProps {
  slots: PickSlot[];
  picks: Picks;
  showTitles?: boolean;
  transparentBg?: boolean;
}

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
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          gap: "20px",
          borderBottom: "2px solid #000",
          paddingBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: "18px" }}>
          <div
            style={{
              fontSize: "54px",
              lineHeight: 0.95,
              fontWeight: 300,
              letterSpacing: "0",
              color: "#000",
              textTransform: "uppercase",
            }}
          >
            MY PICK
            <span
              style={{
                display: "block",
                color: "#00d9f3",
                fontWeight: 700,
              }}
            >
              =LOVE
            </span>
          </div>
          <div
            style={{
              border: "2px solid #000",
              background: "#ea6c81",
              color: "#fff",
              padding: "8px 12px",
              fontSize: "14px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Favorite Songs
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", border: "2px solid #000" }}>
          {THEME_STRIP_COLORS.map((color, index) => (
            <span
              key={`${color}-${index}`}
              style={{
                width: "52px",
                height: "24px",
                backgroundColor: color,
                borderRight:
                  index === THEME_STRIP_COLORS.length - 1 ? "none" : "2px solid #000",
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
                  background: THEME_STRIP_COLORS[(slot.sortOrder - 1) % THEME_STRIP_COLORS.length],
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
                      <>
                        <div
                          style={{
                            fontSize: "22px",
                            lineHeight: 1.15,
                            fontWeight: 900,
                            color: "#000",
                            wordBreak: "break-word",
                          }}
                        >
                          {song.title.ja}
                        </div>
                        <div
                          style={{
                            marginTop: "6px",
                            fontSize: "11px",
                            lineHeight: 1.3,
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            color: "#777",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {song.title.romaji}
                        </div>
                      </>
                    )}
                    <div
                      style={{
                        marginTop: showTitles ? "12px" : 0,
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
  border: "1px solid #ea6c81",
  background: "#fff",
  color: "#ea6c81",
  padding: "4px 8px",
  fontSize: "10px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};
