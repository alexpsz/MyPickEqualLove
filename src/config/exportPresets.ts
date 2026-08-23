import type {
  ExportContentKind,
  ExportExperienceLayout,
  ExportCoverTonePalette,
  ExportOptions,
  ExportSizePreset,
  ExportSizePresetId,
  ExportTemplateId,
  ExportTemplatePreset,
} from "../schema/export";
import type { OshimenPosterAccent } from "../utils/oshimenPreference";

export const EXPORT_OPTIONS_VERSION = 2 as const;
export const DEFAULT_EXPORT_TEMPLATE_ID: ExportTemplateId = "classic";
export const DEFAULT_EXPORT_SIZE_PRESET_ID: ExportSizePresetId = "portrait";

export const EXPORT_TEMPLATES = {
  classic: {
    id: "classic",
    fileNameSuffix: "",
  },
  spotlight: {
    id: "spotlight",
    fileNameSuffix: "SPOTLIGHT",
  },
  midnight: {
    id: "midnight",
    fileNameSuffix: "MIDNIGHT",
  },
  "cover-tone": {
    id: "cover-tone",
    fileNameSuffix: "COVER-TONE",
  },
} as const satisfies Record<ExportTemplateId, ExportTemplatePreset>;

export const EXPORT_SIZE_PRESETS = {
  portrait: {
    id: "portrait",
    width: 1080,
    height: 1350,
    ratioLabel: "4:5",
    fileNameSuffix: "",
    captureViewportHeight: 1000,
  },
  square: {
    id: "square",
    width: 1080,
    height: 1080,
    ratioLabel: "1:1",
    fileNameSuffix: "SQUARE",
    captureViewportHeight: 1200,
  },
  story: {
    id: "story",
    width: 1080,
    height: 1920,
    ratioLabel: "9:16",
    fileNameSuffix: "STORY",
    captureViewportHeight: 2100,
  },
} as const satisfies Record<ExportSizePresetId, ExportSizePreset>;

export const EXPORT_TEMPLATE_ORDER: readonly ExportTemplateId[] = [
  "classic",
  "spotlight",
  "midnight",
  "cover-tone",
];

export const EXPORT_SIZE_PRESET_ORDER: readonly ExportSizePresetId[] = [
  "portrait",
  "square",
  "story",
];

export const EXPORT_CONTENT_SIZE_PRESET_IDS = {
  picks: EXPORT_SIZE_PRESET_ORDER,
  archetype: EXPORT_SIZE_PRESET_ORDER,
  insights: ["portrait", "square"],
  comparison: ["portrait", "square"],
} as const satisfies Record<ExportContentKind, readonly ExportSizePresetId[]>;

export const DEFAULT_EXPORT_OPTIONS: Readonly<ExportOptions> = {
  showTitles: true,
  transparentBg: false,
  showQrCode: true,
  templateId: DEFAULT_EXPORT_TEMPLATE_ID,
  sizePresetId: DEFAULT_EXPORT_SIZE_PRESET_ID,
};

export const EXPORT_BACKGROUND = "#ffffff";
export const EXPORT_SCALE = 2;

export interface ExportVisualTokens {
  canvasBackground: string;
  rootBorder: string;
  textureBackground: string;
  headerBackground: string;
  headerBorder: string;
  headerRadius: string;
  headerTextAlign: "center" | "left";
  headerTitleColor: string;
  memberStripJustify: "center" | "flex-start";
  cardBorder: string;
  cardRadius: string;
  emptyBackground: string;
  cardBackground: string;
  cardDivider: string;
  footerBorder: string;
  footerColor: string;
  mutedTextColor: string;
  songTitleColor: string;
  emptyTextColor: string;
  slotLabelColor: string;
  yearTagBorder: string;
  yearTagBackground: string;
  yearTagColor: string;
}

export interface ExportCanvasMetrics {
  padding: string;
  gap: number;
  headerPadding: string;
  headerTitleSize: number;
  selectedBySize: number;
  subtitleSize: number;
  memberStripMarginTop: number;
  footerPaddingTop: number;
  footerFontSize: number;
}

export interface ExportContentMetrics {
  mode: "grid" | "list";
  columns: number;
  rows?: number;
  gap: number;
  fixedCardSize?: number;
  fillHeight: boolean;
  compact: boolean;
  dense: boolean;
  titleFontSize: number;
  cardPadding: string;
  tagMarginTop: number;
}

export interface ExportComposition {
  templateId: ExportTemplateId;
  size: ExportSizePreset;
  visual: ExportVisualTokens;
  canvas: ExportCanvasMetrics;
  content: ExportContentMetrics;
}

const CANVAS_METRICS: Record<ExportSizePresetId, ExportCanvasMetrics> = {
  portrait: {
    padding: "44px 54px 34px",
    gap: 20,
    headerPadding: "30px 34px 24px",
    headerTitleSize: 40,
    selectedBySize: 20,
    subtitleSize: 14,
    memberStripMarginTop: 14,
    footerPaddingTop: 14,
    footerFontSize: 15,
  },
  square: {
    padding: "28px 40px 24px",
    gap: 14,
    headerPadding: "18px 24px 16px",
    headerTitleSize: 34,
    selectedBySize: 17,
    subtitleSize: 12,
    memberStripMarginTop: 10,
    footerPaddingTop: 10,
    footerFontSize: 13,
  },
  story: {
    padding: "54px 64px 42px",
    gap: 24,
    headerPadding: "36px 38px 30px",
    headerTitleSize: 44,
    selectedBySize: 22,
    subtitleSize: 16,
    memberStripMarginTop: 18,
    footerPaddingTop: 16,
    footerFontSize: 16,
  },
};

const CONTENT_METRICS: Record<
  ExportExperienceLayout,
  Record<ExportSizePresetId, ExportContentMetrics>
> = {
  "top10-grid": {
    portrait: {
      mode: "grid",
      columns: 2,
      rows: 5,
      gap: 14,
      fillHeight: true,
      compact: true,
      dense: false,
      titleFontSize: 24,
      cardPadding: "18px 18px 14px",
      tagMarginTop: 12,
    },
    square: {
      mode: "grid",
      columns: 2,
      rows: 5,
      gap: 10,
      fillHeight: true,
      compact: true,
      dense: true,
      titleFontSize: 18,
      cardPadding: "9px 14px 8px",
      tagMarginTop: 7,
    },
    story: {
      mode: "grid",
      columns: 2,
      rows: 5,
      gap: 18,
      fillHeight: true,
      compact: true,
      dense: false,
      titleFontSize: 28,
      cardPadding: "24px 22px 18px",
      tagMarginTop: 14,
    },
  },
  "five-memory-list": {
    portrait: {
      mode: "list",
      columns: 1,
      gap: 10,
      fixedCardSize: 154,
      fillHeight: false,
      compact: false,
      dense: true,
      titleFontSize: 25,
      cardPadding: "14px 20px 12px",
      tagMarginTop: 12,
    },
    square: {
      mode: "grid",
      columns: 2,
      rows: 3,
      gap: 12,
      fillHeight: true,
      compact: false,
      dense: true,
      titleFontSize: 19,
      cardPadding: "12px 14px 10px",
      tagMarginTop: 8,
    },
    story: {
      mode: "list",
      columns: 1,
      gap: 18,
      fixedCardSize: 230,
      fillHeight: false,
      compact: false,
      dense: false,
      titleFontSize: 30,
      cardPadding: "24px 28px 20px",
      tagMarginTop: 14,
    },
  },
};

export function isExportTemplateId(value: unknown): value is ExportTemplateId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(EXPORT_TEMPLATES, value)
  );
}

export function isExportSizePresetId(
  value: unknown,
): value is ExportSizePresetId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(EXPORT_SIZE_PRESETS, value)
  );
}

export function isExportSizePresetAvailableForContent(
  kind: ExportContentKind,
  sizePresetId: ExportSizePresetId,
) {
  return EXPORT_CONTENT_SIZE_PRESET_IDS[kind].some(
    (candidate) => candidate === sizePresetId,
  );
}

export function isTransparentBackgroundAvailableForContent(
  kind: ExportContentKind,
  templateId: ExportTemplateId,
) {
  return (
    kind === "archetype" ||
    (kind === "picks" &&
      templateId !== "midnight" &&
      templateId !== "cover-tone")
  );
}

export function getExportSizePreset(id: ExportSizePresetId) {
  if (!isExportSizePresetId(id)) {
    throw new Error(`Unknown export size preset: ${String(id)}`);
  }

  return EXPORT_SIZE_PRESETS[id];
}

export function resolveExportComposition(
  templateId: ExportTemplateId,
  sizePresetId: ExportSizePresetId,
  layout: ExportExperienceLayout,
  themeColor: string,
  coverTonePalette?: ExportCoverTonePalette,
  posterAccent?: OshimenPosterAccent,
): ExportComposition {
  return {
    templateId,
    size: EXPORT_SIZE_PRESETS[sizePresetId],
    visual: getVisualTokens(
      templateId,
      themeColor,
      coverTonePalette,
      posterAccent,
    ),
    canvas: CANVAS_METRICS[sizePresetId],
    content: CONTENT_METRICS[layout][sizePresetId],
  };
}

function getVisualTokens(
  templateId: ExportTemplateId,
  themeColor: string,
  coverTonePalette?: ExportCoverTonePalette,
  posterAccent?: OshimenPosterAccent,
): ExportVisualTokens {
  if (templateId === "cover-tone") {
    if (!coverTonePalette) {
      throw new Error("Cover-tone export requires an approved cover palette");
    }

    return {
      canvasBackground: coverTonePalette.background,
      rootBorder: `2px solid ${coverTonePalette.border}`,
      textureBackground: "none",
      headerBackground: coverTonePalette.surface,
      headerBorder: `1px solid ${coverTonePalette.border}`,
      headerRadius: "0",
      headerTextAlign: "center",
      headerTitleColor: coverTonePalette.text,
      memberStripJustify: "center",
      cardBorder: `1px solid ${coverTonePalette.border}`,
      cardRadius: "0",
      emptyBackground: coverTonePalette.surface,
      cardBackground: coverTonePalette.surface,
      cardDivider: `1px solid ${coverTonePalette.border}`,
      footerBorder: `1px solid ${coverTonePalette.border}`,
      footerColor: coverTonePalette.mutedText,
      mutedTextColor: coverTonePalette.mutedText,
      songTitleColor: coverTonePalette.text,
      emptyTextColor: coverTonePalette.mutedText,
      slotLabelColor: coverTonePalette.text,
      yearTagBorder: `1px solid ${coverTonePalette.yearBorder}`,
      yearTagBackground: coverTonePalette.yearBackground,
      yearTagColor: coverTonePalette.yearText,
    };
  }

  if (templateId === "midnight") {
    return {
      canvasBackground: "#08111f",
      rootBorder: "2px solid #98c7ff",
      textureBackground:
        "repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 10px)",
      headerBackground: "#0d1b2c",
      headerBorder: "1px solid rgba(152,199,255,0.56)",
      headerRadius: "0",
      headerTextAlign: "center",
      headerTitleColor: "#e8f4ff",
      memberStripJustify: "center",
      cardBorder: "1px solid rgba(152,199,255,0.56)",
      cardRadius: "0",
      emptyBackground: "#101f32",
      cardBackground: "#0d1b2c",
      cardDivider: "1px solid rgba(152,199,255,0.56)",
      footerBorder: "1px solid rgba(152,199,255,0.56)",
      footerColor: "#d9efff",
      mutedTextColor: "#a9c8e8",
      songTitleColor: "#f7fbff",
      emptyTextColor: "#b9d2eb",
      slotLabelColor: "#bfe0ff",
      yearTagBorder: "1px solid rgba(152,199,255,0.56)",
      yearTagBackground: "#142a43",
      yearTagColor: "#e8f4ff",
    };
  }

  if (templateId === "spotlight") {
    const accentColor = posterAccent?.visibleColor ?? themeColor;
    return {
      canvasBackground: "#ffffff",
      rootBorder: `6px solid ${accentColor}`,
      textureBackground:
        "repeating-linear-gradient(135deg, rgba(0,0,0,0.018) 0, rgba(0,0,0,0.018) 2px, transparent 2px, transparent 14px)",
      headerBackground: "#ffffff",
      headerBorder: `2px solid ${accentColor}`,
      headerRadius: "22px",
      headerTextAlign: "left",
      headerTitleColor: accentColor,
      memberStripJustify: "flex-start",
      cardBorder: `2px solid ${accentColor}`,
      cardRadius: "18px",
      emptyBackground: "#ffffff",
      cardBackground: "#ffffff",
      cardDivider: `2px solid ${accentColor}`,
      footerBorder: `2px solid ${accentColor}`,
      footerColor: accentColor,
      mutedTextColor: "#6f8199",
      songTitleColor: "#000",
      emptyTextColor: "#777",
      slotLabelColor: accentColor,
      yearTagBorder: `1px solid ${accentColor}`,
      yearTagBackground: "#fff",
      yearTagColor: accentColor,
    };
  }

  const accentColor = posterAccent?.visibleColor;
  return {
    canvasBackground: "#ffffff",
    rootBorder: accentColor ? `2px solid ${accentColor}` : "2px solid #000",
    textureBackground:
      "repeating-linear-gradient(135deg, rgba(0,0,0,0.035) 0, rgba(0,0,0,0.035) 1px, transparent 1px, transparent 9px)",
    headerBackground: "#ffffff",
    headerBorder: "none",
    headerRadius: "0",
    headerTextAlign: "center",
    headerTitleColor: accentColor ?? "#07182a",
    memberStripJustify: "center",
    cardBorder: accentColor ? `2px solid ${accentColor}` : "2px solid #000",
    cardRadius: "0",
    emptyBackground: "#f8f8f8",
    cardBackground: "#ffffff",
    cardDivider: accentColor ? `2px solid ${accentColor}` : "2px solid #000",
    footerBorder: accentColor ? `2px solid ${accentColor}` : "2px solid #000",
    footerColor: accentColor ?? "#000000",
    mutedTextColor: "#6f8199",
    songTitleColor: "#000",
    emptyTextColor: "#777",
    slotLabelColor: accentColor ?? themeColor,
    yearTagBorder: `1px solid ${accentColor ?? themeColor}`,
    yearTagBackground: "#fff",
    yearTagColor: accentColor ?? themeColor,
  };
}
