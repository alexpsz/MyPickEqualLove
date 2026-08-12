import type {
  ExportExperienceLayout,
  ExportOptions,
  ExportSizePreset,
  ExportSizePresetId,
  ExportTemplateId,
  ExportTemplatePreset,
} from "../schema/export";

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
];

export const EXPORT_SIZE_PRESET_ORDER: readonly ExportSizePresetId[] = [
  "portrait",
  "square",
  "story",
];

export const DEFAULT_EXPORT_OPTIONS: Readonly<ExportOptions> = {
  showTitles: true,
  transparentBg: false,
  showQrCode: false,
  templateId: DEFAULT_EXPORT_TEMPLATE_ID,
  sizePresetId: DEFAULT_EXPORT_SIZE_PRESET_ID,
};

export const EXPORT_BACKGROUND = "#ffffff";
export const EXPORT_SCALE = 2;

export interface ExportVisualTokens {
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
): ExportComposition {
  return {
    templateId,
    size: EXPORT_SIZE_PRESETS[sizePresetId],
    visual: getVisualTokens(templateId, themeColor),
    canvas: CANVAS_METRICS[sizePresetId],
    content: CONTENT_METRICS[layout][sizePresetId],
  };
}

function getVisualTokens(
  templateId: ExportTemplateId,
  themeColor: string,
): ExportVisualTokens {
  if (templateId === "spotlight") {
    return {
      rootBorder: `6px solid ${themeColor}`,
      textureBackground:
        "repeating-linear-gradient(135deg, rgba(0,0,0,0.018) 0, rgba(0,0,0,0.018) 2px, transparent 2px, transparent 14px)",
      headerBackground: "#ffffff",
      headerBorder: `2px solid ${themeColor}`,
      headerRadius: "22px",
      headerTextAlign: "left",
      headerTitleColor: themeColor,
      memberStripJustify: "flex-start",
      cardBorder: `2px solid ${themeColor}`,
      cardRadius: "18px",
      emptyBackground: "#ffffff",
      cardBackground: "#ffffff",
      cardDivider: `2px solid ${themeColor}`,
      footerBorder: `2px solid ${themeColor}`,
      footerColor: themeColor,
    };
  }

  return {
    rootBorder: "2px solid #000",
    textureBackground:
      "repeating-linear-gradient(135deg, rgba(0,0,0,0.035) 0, rgba(0,0,0,0.035) 1px, transparent 1px, transparent 9px)",
    headerBackground: "#ffffff",
    headerBorder: "none",
    headerRadius: "0",
    headerTextAlign: "center",
    headerTitleColor: "#07182a",
    memberStripJustify: "center",
    cardBorder: "2px solid #000",
    cardRadius: "0",
    emptyBackground: "#f8f8f8",
    cardBackground: "#ffffff",
    cardDivider: "2px solid #000",
    footerBorder: "2px solid #000",
    footerColor: "#000000",
  };
}
