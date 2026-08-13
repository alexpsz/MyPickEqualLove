export type ExportTemplateId = "classic" | "spotlight";

export type ExportSizePresetId = "portrait" | "square" | "story";

export type ExportExperienceLayout = "top10-grid" | "five-memory-list";

export interface ExportOptions {
  showTitles: boolean;
  transparentBg: boolean;
  showQrCode: boolean;
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
