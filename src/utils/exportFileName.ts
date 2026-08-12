import { EXPORT_SIZE_PRESETS, EXPORT_TEMPLATES } from "../config/exportPresets";
import type {
  ExportCardType,
  ExportSizePresetId,
  ExportTemplateId,
} from "../schema/export";

export function buildExportImageFileName(
  baseFileName: string,
  contextId: string | undefined,
  templateId: ExportTemplateId,
  sizePresetId: ExportSizePresetId,
  cardType: ExportCardType,
) {
  const suffixes = [
    contextId?.replace(/-/g, "_").toUpperCase(),
    cardType === "insights" ? "INSIGHTS" : "",
    EXPORT_TEMPLATES[templateId].fileNameSuffix,
    EXPORT_SIZE_PRESETS[sizePresetId].fileNameSuffix,
  ].filter((suffix): suffix is string => Boolean(suffix));

  if (suffixes.length === 0) {
    return baseFileName;
  }

  return baseFileName.replace(/\.png$/i, `_${suffixes.join("_")}.png`);
}
