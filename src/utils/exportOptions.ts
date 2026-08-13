import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_OPTIONS_VERSION,
  isExportSizePresetId,
  isExportTemplateId,
} from "../config/exportPresets";
import type { ExportOptions, StoredExportOptionsV2 } from "../schema/export";

export type ParsedCurrentExportOptions =
  | { status: "canonical"; options: ExportOptions }
  | { status: "intermediate"; options: ExportOptions }
  | { status: "invalid" | "unsupported" };

export function parseStoredExportOptions(
  currentSerialized: string | null,
  legacySerialized: string | null,
): ExportOptions {
  if (currentSerialized !== null) {
    return parseCurrentOptions(currentSerialized);
  }

  return parseLegacyOptions(legacySerialized);
}

export function parseCurrentExportOptions(
  serialized: string,
): ParsedCurrentExportOptions {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return { status: "invalid" };
  }
  if (!isRecord(value)) return { status: "invalid" };

  if (Object.prototype.hasOwnProperty.call(value, "version")) {
    if (value.version !== EXPORT_OPTIONS_VERSION) {
      return { status: "unsupported" };
    }
    if (
      typeof value.showTitles !== "boolean" ||
      typeof value.transparentBg !== "boolean" ||
      !isExportTemplateId(value.templateId) ||
      !isExportSizePresetId(value.sizePresetId)
    ) {
      return { status: "invalid" };
    }
    const baseOptions = {
      showTitles: value.showTitles,
      transparentBg: value.transparentBg,
      templateId: value.templateId,
      sizePresetId: value.sizePresetId,
    };
    const qrCode = parseOptionalQrCode(value);
    if (!qrCode.ok) {
      return { status: "invalid" };
    }
    if (!qrCode.explicit) {
      return {
        status: "intermediate",
        options: { ...baseOptions, showQrCode: qrCode.value },
      };
    }
    return {
      status: "canonical",
      options: { ...baseOptions, showQrCode: qrCode.value },
    };
  }

  if (Object.prototype.hasOwnProperty.call(value, "schemaVersion")) {
    if (value.schemaVersion !== EXPORT_OPTIONS_VERSION) {
      return { status: "unsupported" };
    }
    if (
      typeof value.showTitles !== "boolean" ||
      typeof value.transparentBg !== "boolean"
    ) {
      return { status: "invalid" };
    }
    const qrCode = parseOptionalQrCode(value);
    if (!qrCode.ok) {
      return { status: "invalid" };
    }
    return {
      status: "intermediate",
      options: {
        ...DEFAULT_EXPORT_OPTIONS,
        showTitles: value.showTitles,
        transparentBg: value.transparentBg,
        showQrCode: qrCode.value,
      },
    };
  }

  return { status: "invalid" };
}

export function parseLegacyExportOptions(
  serialized: string,
): ExportOptions | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !isRecord(value) ||
      typeof value.showTitles !== "boolean" ||
      typeof value.transparentBg !== "boolean"
    ) {
      return null;
    }
    const qrCode = parseOptionalQrCode(value);
    if (!qrCode.ok) {
      return null;
    }
    return {
      ...DEFAULT_EXPORT_OPTIONS,
      showTitles: value.showTitles,
      transparentBg: value.transparentBg,
      showQrCode: qrCode.value,
    };
  } catch {
    return null;
  }
}

export function serializeExportOptions(options: ExportOptions) {
  const stored: StoredExportOptionsV2 = {
    version: EXPORT_OPTIONS_VERSION,
    showTitles: options.showTitles,
    transparentBg: options.transparentBg,
    showQrCode: options.showQrCode,
    templateId: options.templateId,
    sizePresetId: options.sizePresetId,
  };

  return JSON.stringify(stored);
}

function parseCurrentOptions(serialized: string): ExportOptions {
  const result = parseCurrentExportOptions(serialized);
  return "options" in result ? result.options : { ...DEFAULT_EXPORT_OPTIONS };
}

function parseLegacyOptions(serialized: string | null): ExportOptions {
  if (serialized === null) {
    return { ...DEFAULT_EXPORT_OPTIONS };
  }
  return parseLegacyExportOptions(serialized) ?? { ...DEFAULT_EXPORT_OPTIONS };
}

function parseOptionalQrCode(value: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(value, "showQrCode")) {
    return {
      ok: true as const,
      explicit: false as const,
      value: DEFAULT_EXPORT_OPTIONS.showQrCode,
    };
  }
  if (typeof value.showQrCode !== "boolean") {
    return { ok: false as const };
  }
  return {
    ok: true as const,
    explicit: true as const,
    value: value.showQrCode,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
