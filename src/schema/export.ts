export type ExportTemplateId = "classic" | "spotlight";

export type ExportSizePresetId = "portrait" | "square" | "story";

export const EXPORT_CARD_TYPES = ["poster", "insights"] as const;

export type ExportCardType = (typeof EXPORT_CARD_TYPES)[number];

export function isExportCardType(value: unknown): value is ExportCardType {
  return (
    typeof value === "string" &&
    (EXPORT_CARD_TYPES as readonly string[]).includes(value)
  );
}

export type ExportExperienceLayout = "top10-grid" | "five-memory-list";

export interface ExportOptions {
  showTitles: boolean;
  transparentBg: boolean;
  templateId: ExportTemplateId;
  sizePresetId: ExportSizePresetId;
}

export interface StoredExportOptionsV2 extends ExportOptions {
  version: 2;
}

export interface ExportTemplatePreset {
  id: ExportTemplateId;
  fileNameSuffix: string;
}

export interface ExportSizePreset {
  id: ExportSizePresetId;
  width: number;
  height: number;
  ratioLabel: "4:5" | "1:1" | "9:16";
  fileNameSuffix: string;
  captureViewportHeight: number;
}
