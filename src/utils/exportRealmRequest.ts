import type { ExportRenderRequest } from "./exportCapture";

/**
 * Admission rules for a render request arriving in the export realm.
 *
 * The realm must never render a request that belongs to a different route,
 * page, or context, and it must never run two captures at once. Those checks
 * are pure, so they live here instead of inside the message listener.
 */

export type ExportRealmVerdict =
  /** Render it; `contextId` is the resolved context to use. */
  | { status: "accept"; contextId?: string }
  /** A capture for this exact request is already running: stay silent. */
  | { status: "ignore" }
  /** Refuse and report `reason` back to the parent frame. */
  | { status: "reject"; reason: string };

export const EXPORT_REALM_REJECTIONS = {
  busy: "Export frame is already rendering",
  experience: "Export experience does not match the current route",
  pageUrl: "Export page URL does not match the current route",
  context: "Export context does not match the current experience",
} as const;

export interface ExportRealmRequestInput {
  request: ExportRenderRequest;
  /** Request id currently being captured, if any. */
  activeRequestId: string | null;
  experienceId: string;
  pageUrl: string;
  /** Context ids valid for the current experience. */
  contextIds: readonly string[];
  defaultContextId?: string;
}

export function resolveExportRealmRequest({
  request,
  activeRequestId,
  experienceId,
  pageUrl,
  contextIds,
  defaultContextId,
}: ExportRealmRequestInput): ExportRealmVerdict {
  if (activeRequestId) {
    // A duplicate of the in-flight request is a benign retry; anything else is
    // a second capture that would race the first.
    return activeRequestId === request.requestId
      ? { status: "ignore" }
      : { status: "reject", reason: EXPORT_REALM_REJECTIONS.busy };
  }

  if (request.experienceId !== experienceId) {
    return { status: "reject", reason: EXPORT_REALM_REJECTIONS.experience };
  }

  if (request.pageUrl !== pageUrl) {
    return { status: "reject", reason: EXPORT_REALM_REJECTIONS.pageUrl };
  }

  if (
    request.contextId !== undefined &&
    !contextIds.includes(request.contextId)
  ) {
    return { status: "reject", reason: EXPORT_REALM_REJECTIONS.context };
  }

  return {
    status: "accept",
    contextId:
      request.contextId !== undefined ? request.contextId : defaultContextId,
  };
}
