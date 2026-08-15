import {
  getExportSizePreset,
  isExportSizePresetId,
  isExportTemplateId,
} from "../config/exportPresets";
import type {
  ExportContentKind,
  ExportSizePresetId,
  ExportTemplateId,
} from "../schema/export";
import type { StoredPicks } from "../schema/music";
import { isExportQrTarget } from "./exportQr";

export const EXPORT_CAPTURE_PROTOCOL_VERSION = 4 as const;
export const EXPORT_REALM_HASH = "#__mypick_export_realm_v4";
export const EXPORT_REALM_READY_TYPE = "mypick-export:ready";
export const EXPORT_REALM_RENDER_TYPE = "mypick-export:render";
export const EXPORT_REALM_RESULT_TYPE = "mypick-export:result";

const EXPORT_CAPTURE_TIMEOUT_MS = 45_000;

export interface ExportRealmReady {
  type: typeof EXPORT_REALM_READY_TYPE;
  version: typeof EXPORT_CAPTURE_PROTOCOL_VERSION;
}

export interface ExportRenderRequest {
  type: typeof EXPORT_REALM_RENDER_TYPE;
  version: typeof EXPORT_CAPTURE_PROTOCOL_VERSION;
  requestId: string;
  kind: ExportContentKind;
  experienceId: string;
  contextId?: string;
  picks: StoredPicks;
  showTitles: boolean;
  transparentBg: boolean;
  showQrCode: boolean;
  templateId: ExportTemplateId;
  sizePresetId: ExportSizePresetId;
  selectedBy: string;
  pageUrl: string;
}

export interface ExportRenderResult {
  type: typeof EXPORT_REALM_RESULT_TYPE;
  version: typeof EXPORT_CAPTURE_PROTOCOL_VERSION;
  requestId: string;
  dataUrl?: string;
  error?: string;
}

export type ExportRenderPayload = Omit<
  ExportRenderRequest,
  "type" | "version" | "requestId"
>;

export interface ExportCaptureOptions {
  signal?: AbortSignal;
}

export function isExportRealmHash(hash: string) {
  return hash === EXPORT_REALM_HASH;
}

export function buildExportRealmUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  url.hash = EXPORT_REALM_HASH.slice(1);
  return url.toString();
}

export function isExportRealmReady(value: unknown): value is ExportRealmReady {
  return (
    isRecord(value) &&
    value.type === EXPORT_REALM_READY_TYPE &&
    value.version === EXPORT_CAPTURE_PROTOCOL_VERSION
  );
}

export function isExportRenderRequest(
  value: unknown,
  expectedPageUrl?: string,
): value is ExportRenderRequest {
  return (
    isRecord(value) &&
    value.type === EXPORT_REALM_RENDER_TYPE &&
    value.version === EXPORT_CAPTURE_PROTOCOL_VERSION &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    (value.kind === "picks" || value.kind === "archetype") &&
    typeof value.experienceId === "string" &&
    value.experienceId.length > 0 &&
    (value.contextId === undefined || typeof value.contextId === "string") &&
    isStoredPicks(value.picks) &&
    typeof value.showTitles === "boolean" &&
    typeof value.transparentBg === "boolean" &&
    typeof value.showQrCode === "boolean" &&
    isExportTemplateId(value.templateId) &&
    isExportSizePresetId(value.sizePresetId) &&
    typeof value.selectedBy === "string" &&
    isExportQrTarget(value.pageUrl) &&
    (expectedPageUrl === undefined || value.pageUrl === expectedPageUrl)
  );
}

export function isExportRenderResult(
  value: unknown,
): value is ExportRenderResult {
  return (
    isRecord(value) &&
    value.type === EXPORT_REALM_RESULT_TYPE &&
    value.version === EXPORT_CAPTURE_PROTOCOL_VERSION &&
    typeof value.requestId === "string" &&
    (value.dataUrl === undefined || typeof value.dataUrl === "string") &&
    (value.error === undefined || typeof value.error === "string")
  );
}

export function captureExportImageInFrame(
  payload: ExportRenderPayload,
  { signal }: ExportCaptureOptions = {},
): Promise<string> {
  const request: ExportRenderRequest = {
    ...payload,
    type: EXPORT_REALM_RENDER_TYPE,
    version: EXPORT_CAPTURE_PROTOCOL_VERSION,
    requestId: createRequestId(),
  };
  const frame = document.createElement("iframe");
  const expectedOrigin = window.location.origin;
  const sizePreset = getExportSizePreset(payload.sizePresetId);

  frame.src = buildExportRealmUrl(window.location.href);
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    left: "-12000px",
    top: "0",
    width: "1440px",
    height: `${sizePreset.captureViewportHeight}px`,
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let requestSent = false;
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
      frame.removeEventListener("error", handleFrameError);
      signal?.removeEventListener("abort", handleAbort);
      frame.remove();
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const handleFrameError = () => {
      finish(() => reject(new Error("Export frame failed to load")));
    };

    const handleAbort = () => {
      finish(() => reject(createAbortError()));
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== expectedOrigin ||
        event.source !== frame.contentWindow
      ) {
        return;
      }

      if (isExportRealmReady(event.data)) {
        if (!requestSent) {
          requestSent = true;
          frame.contentWindow?.postMessage(request, expectedOrigin);
        }
        return;
      }

      if (
        !isExportRenderResult(event.data) ||
        event.data.requestId !== request.requestId
      ) {
        return;
      }

      const result = event.data;
      const dataUrl = result.dataUrl;
      if (dataUrl) {
        finish(() => resolve(dataUrl));
        return;
      }

      finish(() =>
        reject(
          new Error(result.error || "Export frame did not return an image"),
        ),
      );
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("Export frame timed out")));
    }, EXPORT_CAPTURE_TIMEOUT_MS);

    window.addEventListener("message", handleMessage);
    frame.addEventListener("error", handleFrameError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      document.body.appendChild(frame);
    } catch (error) {
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error("Export frame could not be mounted"),
        ),
      );
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStoredPicks(value: unknown): value is StoredPicks {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([slotId, songId]) => slotId.length > 0 && typeof songId === "string",
    )
  );
}

function createRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomValues = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now()}-${randomValues[0]}-${randomValues[1]}`;
}

function createAbortError() {
  return new DOMException("Export capture aborted", "AbortError");
}
