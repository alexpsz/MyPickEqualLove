import React from "react";
import {
  PROJECT_CONFIG,
  PROJECT_ID,
  PROJECT_THEME_COLOR,
} from "../config/project";
import {
  EXPORT_BACKGROUND,
  resolveExportComposition,
  type ExportComposition,
} from "../config/exportPresets";
import { EXPORT_QR_CONFIG } from "../config/exportQr";
import {
  resolveEqualLoveArchetype,
  type EqualLoveArchetypeCharacterResult,
  type EqualLoveArchetypeResult,
} from "../data/equalLoveArchetype";
import { MEMBERS, MEMBERS_BY_ID } from "../data/songs";
import type { ExperienceContext } from "../data/pickExperiences";
import equalLoveArchetypeAffinitiesData from "../projects/equal-love/archetype-21/song-affinities.json";
import type { AppLocale } from "../i18n/locales";
import type {
  ExportHeaderPresentation,
  ExportSizePresetId,
  ExportTemplateId,
} from "../schema/export";
import type { PickExperience } from "../schema/pick-experience";
import type { PickSlot, Picks } from "../schema/music";
import { getArchetypeAccentContrast } from "../utils/archetypeAccent";
import {
  getCoverToneAvailability,
  resolveAvailableExportTemplateId,
} from "../data/coverTonePilot";
import { getColorBackground, getMemberColors } from "../utils/memberColors";
import ArchetypeRadarChart from "./ArchetypeRadarChart";
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
  headerPresentation?: ExportHeaderPresentation;
}

const EXPORT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif';
const EXPORT_TITLE_FONT_FAMILY =
  '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const ARCHETYPE_FOOTER_BRAND_TEXT_STYLE = {
  fontFamily: EXPORT_FONT_FAMILY,
  fontSize: "25px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  lineHeight: 1.05,
} as const;

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
  headerPresentation,
}: ExportBoardProps) {
  const sortedSlots = slots.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const archetypeDossier = renderArchetypeDossierIfRequested({
    exportCanvasId,
    headerPresentation,
    slots: sortedSlots,
    picks,
    showTitles,
    transparentBg,
    showQrCode,
    selectedBy,
    pageUrl,
  });
  if (archetypeDossier) return archetypeDossier;
  const coverToneAvailability = getCoverToneAvailability({
    projectId: PROJECT_ID,
    slots: sortedSlots,
    picks,
  });
  const resolvedTemplateId = resolveAvailableExportTemplateId(
    templateId,
    coverToneAvailability,
  );
  const effectiveTransparentBg =
    transparentBg &&
    resolvedTemplateId !== "midnight" &&
    resolvedTemplateId !== "cover-tone";
  const selectedByLabel = selectedBy.trim();
  const pageLabel = formatPageLabel(pageUrl);
  const subtitle =
    headerPresentation?.subtitle ??
    [experience.export.subtitle, context?.exportLabel]
      .filter(Boolean)
      .join(" · ");
  const baseComposition = resolveExportComposition(
    resolvedTemplateId,
    sizePresetId,
    experience.export.layout,
    PROJECT_THEME_COLOR,
    coverToneAvailability.palette,
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
        backgroundColor: effectiveTransparentBg
          ? "transparent"
          : visual.canvasBackground,
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
        data-export-content-kind={headerPresentation ? "archetype" : "picks"}
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
          {headerPresentation?.title ?? experience.export.title}
        </div>
        {selectedByLabel && (
          <div
            data-export-selected-by="true"
            style={{
              margin: "14px auto 0",
              maxWidth: "860px",
              color: visual.mutedTextColor,
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
            color: visual.mutedTextColor,
            fontSize: `${canvas.subtitleSize}px`,
            fontWeight: 900,
            letterSpacing: "0.2em",
            textIndent: "0.2em",
          }}
        >
          {subtitle}
        </div>
        {headerPresentation ? (
          <div
            data-archetype-highlights="true"
            style={{
              marginTop: `${canvas.memberStripMarginTop}px`,
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            {headerPresentation.highlights.map((highlight) => (
              <span
                key={highlight}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                  minHeight: `${Math.max(32, canvas.subtitleSize + 14)}px`,
                  border: `2px solid ${PROJECT_THEME_COLOR}`,
                  borderRadius: "999px",
                  padding: "0 14px",
                  color: PROJECT_THEME_COLOR,
                  background: "#ffffff",
                  fontSize: `${Math.max(14, canvas.subtitleSize - 2)}px`,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  lineHeight: 1,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  data-archetype-highlight-text="true"
                  style={{
                    display: "inline-block",
                    lineHeight: 1,
                    transform: "translateY(-5px)",
                  }}
                >
                  {highlight}
                </span>
              </span>
            ))}
          </div>
        ) : (
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
                  border:
                    resolvedTemplateId === "cover-tone"
                      ? visual.cardBorder
                      : "1px solid #d4d4d4",
                  boxSizing: "border-box",
                  background:
                    resolvedTemplateId === "cover-tone"
                      ? visual.slotLabelColor
                      : getColorBackground(member.colors, PROJECT_THEME_COLOR),
                }}
              />
            ))}
          </div>
        )}
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
              <span>
                {headerPresentation?.footerLabel ?? PROJECT_CONFIG.appName}
              </span>
              <span style={{ overflowWrap: "anywhere" }}>{pageLabel}</span>
            </div>
            <ExportQrCode pageUrl={pageUrl} />
          </>
        ) : (
          <>
            <span>
              {headerPresentation?.footerLabel ?? PROJECT_CONFIG.appName}
            </span>
            <span>{pageLabel}</span>
          </>
        )}
      </footer>
    </div>
  );
}

function renderArchetypeDossierIfRequested({
  exportCanvasId,
  headerPresentation,
  slots,
  picks,
  showTitles,
  transparentBg,
  showQrCode,
  selectedBy,
  pageUrl,
}: {
  exportCanvasId: string;
  headerPresentation: ExportHeaderPresentation | undefined;
  slots: PickSlot[];
  picks: Picks;
  showTitles: boolean;
  transparentBg: boolean;
  showQrCode: boolean;
  selectedBy: string;
  pageUrl: string;
}) {
  if (!headerPresentation) return null;
  const songIds = slots.map((slot) => picks[slot.id]?.id);
  const result = songIds.every((songId): songId is string => Boolean(songId))
    ? resolveEqualLoveArchetype(
        songIds,
        resolveArchetypeExportLocale(),
        equalLoveArchetypeAffinitiesData,
      )
    : null;
  if (!result) throw new Error("Archetype dossier data is unavailable");
  return (
    <ArchetypeDossierPoster
      exportCanvasId={exportCanvasId}
      result={result}
      slots={slots}
      picks={picks}
      showTitles={showTitles}
      transparentBg={transparentBg}
      showQrCode={showQrCode}
      selectedBy={selectedBy}
      pageUrl={pageUrl}
      footerLabel={headerPresentation.footerLabel}
    />
  );
}

export function ArchetypeDossierPoster({
  exportCanvasId,
  result,
  slots,
  picks,
  showTitles,
  transparentBg,
  showQrCode,
  selectedBy,
  pageUrl,
  footerLabel,
}: {
  exportCanvasId: string;
  result: EqualLoveArchetypeResult;
  slots: PickSlot[];
  picks: Picks;
  showTitles: boolean;
  transparentBg: boolean;
  showQrCode: boolean;
  selectedBy: string;
  pageUrl: string;
  footerLabel: string;
}) {
  const mode =
    result.characters.length === 1
      ? "single"
      : result.characters.length === 2
        ? "dual"
        : "squad";
  const songAccents = getContributingSongAccents(result.characters);
  const pageLabel = formatPageLabel(pageUrl);
  const selectedByLabel = selectedBy.trim();
  const primaryAccent = resolveArchetypeAccent(result.characters[0]);
  const primaryAccentContrast = getArchetypeAccentContrast(primaryAccent);

  return (
    <div
      id={exportCanvasId}
      lang={result.characters[0]?.contentLocale ?? "en"}
      data-export-content-kind="archetype"
      data-archetype-tie-mode={mode}
      style={{
        position: "relative",
        width: "1080px",
        height: "1350px",
        boxSizing: "border-box",
        overflow: "hidden",
        border: "2px solid #111827",
        backgroundColor: transparentBg ? "transparent" : EXPORT_BACKGROUND,
        color: "#111827",
        fontFamily: EXPORT_FONT_FAMILY,
      }}
    >
      <section
        data-export-boundary="archetype-dossier"
        style={{
          height: "596px",
          boxSizing: "border-box",
          padding: "28px 48px 24px",
          borderBottom: "1px solid #9ca3af",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            height: "24px",
            color: primaryAccent,
            textShadow: primaryAccentContrast.textShadow,
            fontSize: "18px",
            fontWeight: 900,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          <span>
            {mode === "squad" ? "MY ADVENTURE SQUAD" : "MY ADVENTURE PARTNER"}
          </span>
          <span
            aria-hidden="true"
            style={{
              height: "2px",
              flex: 1,
              background: "currentColor",
              boxShadow: primaryAccentContrast.outlineShadow,
            }}
          />
          <span aria-hidden="true">＋</span>
        </div>
        {mode === "single" ? (
          <SingleDossier character={result.characters[0]} result={result} />
        ) : mode === "dual" ? (
          <div
            data-archetype-dual-dossier="true"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "24px",
            }}
          >
            {result.characters.map((character) => (
              <DualDossierCard
                key={character.roleId}
                character={character}
                result={result}
              />
            ))}
          </div>
        ) : (
          <SquadDossier characters={result.characters} result={result} />
        )}
      </section>

      <section
        data-export-boundary="archetype-top-ten"
        style={{
          height: "615px",
          boxSizing: "border-box",
          padding: "18px 48px 16px",
          borderBottom: "1px solid #9ca3af",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            height: "32px",
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 900,
              letterSpacing: "0.14em",
            }}
          >
            TOP 10
          </span>
          <span
            style={{
              color: "#6b7280",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Two leading songs are outlined
          </span>
        </div>
        <div
          style={{
            marginTop: "10px",
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gridTemplateRows: "repeat(2, 250px)",
            columnGap: "16px",
            rowGap: "18px",
          }}
        >
          {slots.map((slot, index) => {
            const song = picks[slot.id];
            const contributionAccent = song
              ? songAccents.get(song.id)
              : undefined;
            const contributionAccentContrast = contributionAccent
              ? getArchetypeAccentContrast(contributionAccent)
              : undefined;
            return (
              <div
                key={slot.id}
                data-archetype-song-rank={index + 1}
                data-archetype-contributing-song={
                  contributionAccent ? "true" : undefined
                }
                style={{ minWidth: 0, height: "250px" }}
              >
                <div
                  style={{
                    height: "22px",
                    color: contributionAccent ?? "#4b5563",
                    textShadow: contributionAccentContrast?.textShadow,
                    fontSize: "16px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  {String(index + 1).padStart(2, "0")}
                </div>
                {song ? (
                  <>
                    <div
                      style={{
                        width: "164px",
                        height: "164px",
                        margin: "0 auto",
                        boxSizing: "border-box",
                        border: contributionAccent
                          ? `3px solid ${contributionAccent}`
                          : "1px solid #d1d5db",
                        boxShadow: contributionAccentContrast?.outlineShadow,
                        padding: contributionAccent ? "3px" : 0,
                        background: "#ffffff",
                      }}
                    >
                      {/* A native image is required for deterministic html2canvas export. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={song.coverUrl}
                        alt=""
                        style={{
                          display: "block",
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                    {showTitles ? (
                      <div
                        data-archetype-song-title="true"
                        style={{
                          marginTop: "8px",
                          height: "42px",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                          color: "#111827",
                          fontFamily: EXPORT_TITLE_FONT_FAMILY,
                          fontSize: "14px",
                          fontWeight: contributionAccent ? 900 : 800,
                          lineHeight: 1.42,
                          textAlign: "center",
                          wordBreak: "break-word",
                        }}
                      >
                        {song.title.ja}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div
                    style={{
                      width: "164px",
                      height: "164px",
                      border: "1px solid #d1d5db",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#9ca3af",
                      fontSize: "13px",
                      fontWeight: 900,
                    }}
                  >
                    NO PICK
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <footer
        data-export-boundary="archetype-footer"
        style={{
          height: "135px",
          boxSizing: "border-box",
          padding: "14px 48px 15px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "28px",
          }}
        >
          <div
            data-archetype-footer-brand="true"
            style={{
              flex: "0 0 auto",
              borderLeft: `5px solid ${primaryAccent}`,
              boxShadow: primaryAccentContrast.outlineColor
                ? `-1px 0 0 ${primaryAccentContrast.outlineColor}`
                : undefined,
              paddingLeft: "18px",
              ...ARCHETYPE_FOOTER_BRAND_TEXT_STYLE,
              whiteSpace: "pre-line",
            }}
          >
            {footerLabel.replace(" ", "\n")}
          </div>
          <div
            data-archetype-footer-page="true"
            style={{
              minWidth: 0,
              height: "52.5px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            {selectedByLabel ? (
              <div
                style={{
                  marginBottom: "6px",
                  fontSize: "13px",
                  fontWeight: 900,
                  overflowWrap: "anywhere",
                }}
              >
                Selected by {selectedByLabel}
              </div>
            ) : null}
            <div
              style={{
                color: "#111827",
                ...ARCHETYPE_FOOTER_BRAND_TEXT_STYLE,
                overflowWrap: "anywhere",
                whiteSpace: "nowrap",
              }}
            >
              {pageLabel}
            </div>
          </div>
        </div>
        {showQrCode ? <ExportQrCode pageUrl={pageUrl} /> : null}
      </footer>
    </div>
  );
}

function SingleDossier({
  character,
  result,
}: {
  character: EqualLoveArchetypeCharacterResult;
  result: EqualLoveArchetypeResult;
}) {
  const accent = resolveArchetypeAccent(character);
  return (
    <div
      data-archetype-single-dossier="true"
      style={{
        height: "516px",
        display: "grid",
        gridTemplateColumns: "48% 52%",
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0, paddingRight: "24px" }}>
        <h1
          style={{
            margin: 0,
            color: "#050505",
            fontSize: "102px",
            fontWeight: 950,
            letterSpacing: "-0.055em",
            lineHeight: 0.84,
          }}
        >
          {character.displayName}
        </h1>
        <div
          style={{
            marginTop: "24px",
            fontSize: "25px",
            fontWeight: 900,
            lineHeight: 1.15,
          }}
        >
          {character.title}
        </div>
        <DossierFacts character={character} accent={accent} compact={false} />
        <p
          style={{
            margin: "18px 0 0",
            fontSize: "17px",
            fontWeight: 650,
            lineHeight: 1.5,
          }}
        >
          {character.exportSummary}
        </p>
        <TraitPills character={character} result={result} accent={accent} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <ArchetypeRadarChart
          stats={character.stats}
          labels={character.statLabels}
          accentColor={accent}
          ariaLabel={buildRadarAriaLabel(character)}
          size={430}
          maxValue={1200}
        />
      </div>
    </div>
  );
}

function DualDossierCard({
  character,
  result,
}: {
  character: EqualLoveArchetypeCharacterResult;
  result: EqualLoveArchetypeResult;
}) {
  const accent = resolveArchetypeAccent(character);
  const accentContrast = getArchetypeAccentContrast(accent);
  return (
    <article
      data-archetype-dual-character={character.roleId}
      style={{
        height: "516px",
        minWidth: 0,
        boxSizing: "border-box",
        padding: "18px 20px 12px",
        borderTop: `4px solid ${accent}`,
        boxShadow: accentContrast.outlineColor
          ? `inset 0 1px 0 ${accentContrast.outlineColor}`
          : undefined,
        background: "rgba(255, 255, 255, 0.72)",
      }}
    >
      <div style={{ display: "flex", minWidth: 0, gap: "8px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              margin: 0,
              fontSize: "48px",
              fontWeight: 950,
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
            }}
          >
            {character.displayName}
          </h2>
          <div
            style={{
              marginTop: "12px",
              minHeight: "44px",
              fontSize: "18px",
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            {character.title}
          </div>
          <DossierFacts character={character} accent={accent} compact />
        </div>
        <ArchetypeRadarChart
          stats={character.stats}
          labels={character.statLabels}
          accentColor={accent}
          ariaLabel={buildRadarAriaLabel(character)}
          size={230}
          maxValue={1200}
          showScale={false}
        />
      </div>
      <p
        style={{
          margin: "12px 0 0",
          height: "67px",
          overflow: "hidden",
          fontSize: "14px",
          fontWeight: 650,
          lineHeight: 1.55,
        }}
      >
        {character.exportSummary}
      </p>
      <TraitPills
        character={character}
        result={result}
        accent={accent}
        compact
      />
    </article>
  );
}

function SquadDossier({
  characters,
  result,
}: {
  characters: readonly EqualLoveArchetypeCharacterResult[];
  result: EqualLoveArchetypeResult;
}) {
  const columns =
    characters.length <= 4 ? characters.length : characters.length <= 6 ? 3 : 5;
  const radarSize =
    characters.length <= 4 ? 142 : characters.length <= 6 ? 116 : 92;
  return (
    <div
      data-archetype-squad-dossier="true"
      data-archetype-squad-size={characters.length}
      style={{
        height: "516px",
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        alignContent: "center",
        gap: characters.length <= 6 ? "16px" : "10px",
      }}
    >
      {characters.map((character) => {
        const accent = resolveArchetypeAccent(character);
        const accentContrast = getArchetypeAccentContrast(accent);
        return (
          <article
            key={character.roleId}
            data-archetype-squad-character={character.roleId}
            style={{
              minWidth: 0,
              minHeight: characters.length <= 6 ? "220px" : "196px",
              boxSizing: "border-box",
              borderTop: `4px solid ${accent}`,
              boxShadow: accentContrast.outlineColor
                ? `inset 0 1px 0 ${accentContrast.outlineColor}`
                : undefined,
              padding: "10px 8px 8px",
              textAlign: "center",
              background: "rgba(255, 255, 255, 0.72)",
            }}
          >
            <div
              style={{
                fontSize: characters.length <= 6 ? "27px" : "22px",
                fontWeight: 950,
                letterSpacing: "-0.035em",
                lineHeight: 1,
              }}
            >
              {character.displayName}
            </div>
            <div
              style={{
                marginTop: "6px",
                height: "30px",
                overflow: "hidden",
                fontSize: characters.length <= 6 ? "12px" : "10px",
                fontWeight: 850,
                lineHeight: 1.35,
              }}
            >
              {character.title}
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ArchetypeRadarChart
                stats={character.stats}
                labels={character.statLabels}
                accentColor={accent}
                ariaLabel={buildRadarAriaLabel(character)}
                size={radarSize}
                maxValue={1200}
                showScale={false}
                showLabels={false}
              />
            </div>
            <div
              style={{
                color: accent,
                textShadow: accentContrast.textShadow,
                fontSize: characters.length <= 6 ? "10px" : "9px",
                fontWeight: 900,
                lineHeight: 1.3,
              }}
            >
              {character.overlapTraitIds
                .map((traitId) => result.ui.traits[traitId])
                .join(" · ")}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DossierFacts({
  character,
  accent,
  compact,
}: {
  character: EqualLoveArchetypeCharacterResult;
  accent: string;
  compact: boolean;
}) {
  const accentContrast = getArchetypeAccentContrast(accent);
  return (
    <div
      style={{
        marginTop: compact ? "10px" : "20px",
        borderTop: "1px solid #d1d5db",
        borderBottom: "1px solid #d1d5db",
      }}
    >
      {[
        ["CLASS", character.className],
        ["WEAPON", character.weaponName],
      ].map(([label, value], index) => (
        <div
          key={label}
          style={{
            minHeight: compact ? "30px" : "42px",
            display: "grid",
            gridTemplateColumns: compact ? "62px 1fr" : "92px 1fr",
            alignItems: "center",
            borderTop: index === 0 ? undefined : "1px solid #e5e7eb",
            fontSize: compact ? "11px" : "15px",
          }}
        >
          <span
            style={{
              color: accent,
              textShadow: accentContrast.textShadow,
              fontWeight: 900,
              letterSpacing: "0.12em",
            }}
          >
            {label}
          </span>
          <span style={{ fontWeight: 800, lineHeight: 1.25 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function TraitPills({
  character,
  result,
  accent,
  compact = false,
}: {
  character: EqualLoveArchetypeCharacterResult;
  result: EqualLoveArchetypeResult;
  accent: string;
  compact?: boolean;
}) {
  const accentContrast = getArchetypeAccentContrast(accent);
  return (
    <div
      data-archetype-traits="true"
      style={{
        marginTop: compact ? "10px" : "18px",
        display: "flex",
        flexWrap: "wrap",
        gap: compact ? "6px" : "8px",
      }}
    >
      {character.overlapTraitIds.map((traitId) => (
        <span
          key={traitId}
          data-archetype-trait-pill="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            height: compact ? "22px" : "28px",
            border: `1px solid ${accent}`,
            boxShadow: accentContrast.outlineShadow,
            padding: compact ? "0 8px" : "0 11px",
            color: accent,
            textShadow: accentContrast.textShadow,
            fontSize: compact ? "10px" : "12px",
            fontWeight: 900,
            letterSpacing: "0.04em",
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          <span
            data-archetype-trait-label="true"
            style={{
              display: "block",
              lineHeight: 1.2,
              textAlign: "center",
              transform: "translateY(1px)",
            }}
          >
            ＋ {result.ui.traits[traitId]}
          </span>
        </span>
      ))}
    </div>
  );
}

function resolveArchetypeAccent(
  character: EqualLoveArchetypeCharacterResult | undefined,
) {
  const fallback = isHexColor(PROJECT_THEME_COLOR)
    ? PROJECT_THEME_COLOR
    : "#6b7280";
  if (!character) return fallback;
  const member = MEMBERS_BY_ID[character.memberId];
  if (!member) return fallback;
  return getMemberColors(member, fallback).find(isHexColor) ?? fallback;
}

function isHexColor(value: string) {
  return /^#[\da-f]{6}$/i.test(value);
}

function getContributingSongAccents(
  characters: readonly EqualLoveArchetypeCharacterResult[],
) {
  const accents = new Map<string, string>();
  for (let rank = 0; rank < 2 && accents.size < 2; rank += 1) {
    for (const character of characters) {
      const songId = character.contributingSongIds[rank];
      if (songId && !accents.has(songId)) {
        accents.set(songId, resolveArchetypeAccent(character));
        if (accents.size === 2) break;
      }
    }
  }
  return accents;
}

function buildRadarAriaLabel(character: EqualLoveArchetypeCharacterResult) {
  return `${character.displayName} stats. ${Object.entries(character.statLabels)
    .map(
      ([statId, label]) =>
        `${label}: ${character.stats[statId as keyof typeof character.stats]}`,
    )
    .join(", ")}. Maximum 1200.`;
}

function resolveArchetypeExportLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  try {
    const sourceDocument =
      window.parent === window ? document : window.parent.document;
    const locale = sourceDocument.documentElement.lang;
    if (
      locale === "en" ||
      locale === "zh-CN" ||
      locale === "ja" ||
      locale === "ko"
    ) {
      return locale;
    }
  } catch {
    // The export realm is same-origin by contract; English remains the safe fallback.
  }
  return "en";
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
  const isCoverPriority = Boolean(song) && !showTitles && !showSlotTitle;
  const coverImage = song ? (
    <img
      src={song.coverUrl}
      alt={`${song.title.ja} cover`}
      style={
        isCoverPriority
          ? {
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "center",
              display: "block",
            }
          : {
              width: content.fillHeight ? "auto" : `${cardSize}px`,
              height: content.fillHeight ? "100%" : `${cardSize}px`,
              aspectRatio: content.fillHeight ? "1 / 1" : undefined,
              objectFit: "cover",
              flexShrink: 0,
              display: "block",
            }
      }
    />
  ) : null;

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
          {isCoverPriority ? (
            <div
              data-export-cover-box="square"
              style={{
                height: "100%",
                aspectRatio: "1 / 1",
                margin: "0 auto",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {coverImage}
            </div>
          ) : (
            coverImage
          )}
          {!isCoverPriority ? (
            <div
              style={{
                flex: 1,
                minWidth: 0,
                padding: content.cardPadding,
                display: "flex",
                flexDirection: "column",
                alignItems: showSlotTitle ? "stretch" : "center",
                justifyContent: showSlotTitle
                  ? !showTitles
                    ? "center"
                    : "space-between"
                  : "center",
                textAlign: showSlotTitle ? "left" : "center",
                background: visual.cardBackground,
                borderLeft: visual.cardDivider,
              }}
            >
              {showSlotTitle ? (
                <div>
                  <div style={getExportSlotLabelStyle(visual)}>
                    {slot.label}
                  </div>
                  {slot.subtitle ? (
                    <div style={getExportSlotSubtitleStyle(visual)}>
                      {slot.subtitle}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showTitles ? (
                <div data-export-song-metadata="true">
                  <div
                    style={{
                      fontSize: `${content.titleFontSize}px`,
                      lineHeight: 1.16,
                      fontWeight: 900,
                      fontFamily: EXPORT_TITLE_FONT_FAMILY,
                      color: visual.songTitleColor,
                      wordBreak: "break-word",
                    }}
                  >
                    {song.title.ja}
                  </div>
                  <div
                    style={{
                      marginTop: `${content.tagMarginTop}px`,
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: showSlotTitle ? "flex-start" : "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      data-export-year-tag
                      style={getExportTagStyle(visual)}
                    >
                      <span style={exportTagTextStyle}>
                        {song.releaseDate?.slice(0, 4) ?? "TBD"}
                      </span>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
            color: visual.emptyTextColor,
            fontSize: "16px",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          {showSlotTitle ? (
            <span
              style={{
                color: visual.songTitleColor,
                fontSize: "22px",
                letterSpacing: 0,
              }}
            >
              {slot.label}
            </span>
          ) : null}
          <span>No Pick</span>
        </div>
      )}
    </div>
  );
}

function getExportTagStyle(
  visual: ExportComposition["visual"],
): React.CSSProperties {
  return {
    display: "inline-block",
    minWidth: "44px",
    height: "24px",
    boxSizing: "border-box",
    border: visual.yearTagBorder,
    background: visual.yearTagBackground,
    color: visual.yearTagColor,
    padding: "0 8px",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    lineHeight: "22px",
    textAlign: "center",
    textTransform: "uppercase",
  };
}

const exportTagTextStyle: React.CSSProperties = {
  display: "inline-block",
  lineHeight: 1,
  transform: "translateY(-5px)",
};

function getExportSlotLabelStyle(
  visual: ExportComposition["visual"],
): React.CSSProperties {
  return {
    color: visual.slotLabelColor,
    fontSize: "19px",
    fontWeight: 900,
    letterSpacing: 0,
    lineHeight: 1.2,
    fontFamily: EXPORT_TITLE_FONT_FAMILY,
  };
}

function getExportSlotSubtitleStyle(
  visual: ExportComposition["visual"],
): React.CSSProperties {
  return {
    marginTop: "5px",
    color: visual.mutedTextColor,
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.04em",
    lineHeight: 1.35,
  };
}

function formatPageLabel(pageUrl: string) {
  const url = new URL(pageUrl);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.hostname}${path}`.toUpperCase();
}
