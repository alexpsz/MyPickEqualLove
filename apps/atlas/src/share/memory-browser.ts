import type { MemorySnapshotInputPort } from "../ports/memory-snapshot-input.js";
import type { MemoryMessages } from "../i18n/memory/messages.js";
import {
  createMemoryDrawPlan,
  drawMemoryPlan,
  MEMORY_CANVAS_HEIGHT,
  MEMORY_CANVAS_WIDTH,
  MEMORY_TEMPLATE_ID,
  type MemoryCanvasContext,
  type MemoryDrawPlan,
} from "./memory-draw-plan.js";

export const MEMORY_PNG_MIME_TYPE = "image/png" as const;
export const MEMORY_PNG_FILE_NAME = "atlas-memory.png" as const;

export interface MemoryCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): MemoryCanvasContext | null;
  toBlob(
    callback: (blob: Blob | null) => void,
    type: typeof MEMORY_PNG_MIME_TYPE,
  ): void;
}

export interface MemoryRendererPorts {
  waitForFonts(): Promise<void>;
  createCanvas(): MemoryCanvas;
  createFile(blob: Blob): File;
}

export interface MemoryPngArtifact {
  readonly templateId: typeof MEMORY_TEMPLATE_ID;
  readonly width: typeof MEMORY_CANVAS_WIDTH;
  readonly height: typeof MEMORY_CANVAS_HEIGHT;
  readonly blob: Blob;
  readonly file: File;
}

export type MemoryPngGenerationResult =
  | { readonly status: "ready"; readonly artifact: MemoryPngArtifact }
  | { readonly status: "cancelled"; readonly journeyMutation: "none" }
  | {
      readonly status: "failed";
      readonly stage:
        | "input"
        | "snapshot"
        | "font"
        | "canvas"
        | "draw"
        | "to-blob"
        | "file";
      readonly journeyMutation: "none";
    };

export interface MemorySharePorts {
  canShare(data: { readonly files: readonly File[] }): boolean;
  share(data: { readonly files: readonly File[] }): Promise<void>;
}

export type MemoryShareResult =
  | { readonly status: "shared"; readonly journeyMutation: "none" }
  | { readonly status: "cancelled"; readonly journeyMutation: "none" }
  | { readonly status: "unsupported"; readonly journeyMutation: "none" }
  | { readonly status: "rejected"; readonly journeyMutation: "none" };

export interface MemoryDownloadAnchor {
  href: string;
  download: string;
  rel: string;
  click(): void;
  remove(): void;
}

export interface MemoryDownloadPorts {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createAnchor(): MemoryDownloadAnchor;
  appendAnchor(anchor: MemoryDownloadAnchor): void;
}

export type MemoryDownloadResult =
  | { readonly status: "started"; readonly journeyMutation: "none" }
  | { readonly status: "failed"; readonly journeyMutation: "none" };

export type MemoryPublicationOperation = "generate" | "share";

export interface MemoryPublicationTicket {
  readonly environmentKey: string;
  readonly generationToken: number;
  readonly publicationEpoch: number;
  readonly operation: MemoryPublicationOperation;
  readonly sessionIdentity: symbol;
}

export interface MemoryPublicationGate {
  activate(): void;
  deactivate(): void;
  invalidate(): void;
  issue(
    environmentKey: string,
    operation: MemoryPublicationOperation,
  ): MemoryPublicationTicket | null;
  settle(
    ticket: MemoryPublicationTicket,
    environmentKey: string,
    operation: MemoryPublicationOperation,
  ): boolean;
  ownsArtifact(
    ticket: MemoryPublicationTicket,
    environmentKey: string,
  ): boolean;
}

export function createMemoryPublicationEnvironmentKey(
  locale: string,
  theme: string,
) {
  return JSON.stringify([locale, theme]);
}

/**
 * Synchronous, in-memory publication gate. Tickets never enter a Blob, URL,
 * share payload, log, or storage. Invalidating a session increments both
 * generations before React can expose a late asynchronous result.
 */
export function createMemoryPublicationGate(): MemoryPublicationGate {
  const sessionIdentity = Symbol("atlas-memory-publication");
  const inFlight = new Set<MemoryPublicationOperation>();
  let active = false;
  let generationToken = 0;
  let publicationEpoch = 0;

  const owns = (ticket: MemoryPublicationTicket, environmentKey: string) =>
    active &&
    ticket.sessionIdentity === sessionIdentity &&
    ticket.environmentKey === environmentKey &&
    ticket.publicationEpoch === publicationEpoch;

  return {
    activate() {
      active = true;
    },
    deactivate() {
      active = false;
      generationToken += 1;
      publicationEpoch += 1;
      inFlight.clear();
    },
    invalidate() {
      generationToken += 1;
      publicationEpoch += 1;
      inFlight.clear();
    },
    issue(environmentKey, operation) {
      if (!active || inFlight.has(operation)) return null;
      if (operation === "generate") {
        // Starting a replacement artifact synchronously retires the previous
        // artifact and any share based on it. Keep the generate lock itself so
        // two activations in one tick still collapse to one render.
        publicationEpoch += 1;
        inFlight.clear();
      }
      generationToken += 1;
      inFlight.add(operation);
      return Object.freeze({
        environmentKey,
        generationToken,
        publicationEpoch,
        operation,
        sessionIdentity,
      });
    },
    settle(ticket, environmentKey, operation) {
      const accepted =
        owns(ticket, environmentKey) &&
        ticket.operation === operation &&
        ticket.generationToken === generationToken;
      if (accepted) inFlight.delete(operation);
      return accepted;
    },
    ownsArtifact(ticket, environmentKey) {
      return owns(ticket, environmentKey) && ticket.operation === "generate";
    },
  };
}

const browserRendererPorts: MemoryRendererPorts = {
  async waitForFonts() {
    await document.fonts?.ready;
  },
  createCanvas() {
    return document.createElement("canvas") as unknown as MemoryCanvas;
  },
  createFile(blob) {
    return new File([blob], MEMORY_PNG_FILE_NAME, {
      type: MEMORY_PNG_MIME_TYPE,
      lastModified: 0,
    });
  },
};

const browserSharePorts: MemorySharePorts = {
  canShare(data) {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [...data.files] })
    );
  },
  async share(data) {
    await navigator.share({ files: [...data.files] });
  },
};

const browserDownloadPorts: MemoryDownloadPorts = {
  createObjectUrl(blob) {
    return URL.createObjectURL(blob);
  },
  revokeObjectUrl(url) {
    URL.revokeObjectURL(url);
  },
  createAnchor() {
    return document.createElement("a");
  },
  appendAnchor(anchor) {
    document.body.append(anchor as HTMLAnchorElement);
  },
};

function toPngBlob(canvas: MemoryCanvas) {
  return new Promise<Blob | null>((resolve, reject) => {
    try {
      canvas.toBlob(resolve, MEMORY_PNG_MIME_TYPE);
    } catch (error) {
      reject(error);
    }
  });
}

async function renderMemoryPng(
  plan: MemoryDrawPlan,
  ports: MemoryRendererPorts,
): Promise<MemoryPngGenerationResult> {
  try {
    await ports.waitForFonts();
  } catch {
    return { status: "failed", stage: "font", journeyMutation: "none" };
  }

  let canvas: MemoryCanvas;
  let context: MemoryCanvasContext | null;
  try {
    canvas = ports.createCanvas();
    canvas.width = MEMORY_CANVAS_WIDTH;
    canvas.height = MEMORY_CANVAS_HEIGHT;
    context = canvas.getContext("2d");
  } catch {
    return { status: "failed", stage: "canvas", journeyMutation: "none" };
  }
  if (context === null) {
    return { status: "failed", stage: "canvas", journeyMutation: "none" };
  }

  try {
    drawMemoryPlan(context, plan);
  } catch {
    return { status: "failed", stage: "draw", journeyMutation: "none" };
  }

  let blob: Blob;
  let blobSize: number;
  try {
    const encoded = await toPngBlob(canvas);
    if (encoded === null || encoded.type !== MEMORY_PNG_MIME_TYPE) {
      return { status: "failed", stage: "to-blob", journeyMutation: "none" };
    }
    blobSize = encoded.size;
    if (!Number.isSafeInteger(blobSize) || blobSize < 0) {
      return { status: "failed", stage: "to-blob", journeyMutation: "none" };
    }
    blob = encoded;
  } catch {
    return { status: "failed", stage: "to-blob", journeyMutation: "none" };
  }

  let file: File;
  try {
    file = ports.createFile(blob);
    if (
      file.name !== MEMORY_PNG_FILE_NAME ||
      file.type !== MEMORY_PNG_MIME_TYPE ||
      file.lastModified !== 0 ||
      file.size !== blobSize
    ) {
      return { status: "failed", stage: "file", journeyMutation: "none" };
    }
  } catch {
    return { status: "failed", stage: "file", journeyMutation: "none" };
  }

  return {
    status: "ready",
    artifact: {
      templateId: MEMORY_TEMPLATE_ID,
      width: MEMORY_CANVAS_WIDTH,
      height: MEMORY_CANVAS_HEIGHT,
      blob,
      file,
    },
  };
}

export async function generateMemoryPng(
  input: MemorySnapshotInputPort,
  messages: MemoryMessages,
  ports: MemoryRendererPorts = browserRendererPorts,
): Promise<MemoryPngGenerationResult> {
  let result: Awaited<ReturnType<MemorySnapshotInputPort["request"]>>;
  try {
    result = await input.request();
  } catch {
    return { status: "failed", stage: "input", journeyMutation: "none" };
  }
  if (result.status === "cancelled") {
    return { status: "cancelled", journeyMutation: "none" };
  }
  if (result.status === "failed") {
    return { status: "failed", stage: "input", journeyMutation: "none" };
  }

  const planned = createMemoryDrawPlan(result.snapshot, messages);
  if (!planned.ok) {
    return { status: "failed", stage: "snapshot", journeyMutation: "none" };
  }
  return renderMemoryPng(planned.plan, ports);
}

export function canShareMemoryPng(
  artifact: MemoryPngArtifact,
  ports: MemorySharePorts = browserSharePorts,
) {
  try {
    return ports.canShare({ files: [artifact.file] });
  } catch {
    return false;
  }
}

function isAbortError(error: unknown) {
  try {
    return (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    );
  } catch {
    return false;
  }
}

export async function shareMemoryPng(
  artifact: MemoryPngArtifact,
  ports: MemorySharePorts = browserSharePorts,
): Promise<MemoryShareResult> {
  if (!canShareMemoryPng(artifact, ports)) {
    return { status: "unsupported", journeyMutation: "none" };
  }
  try {
    // No title, text, URL, token, or other metadata is added to the share.
    await ports.share({ files: [artifact.file] });
    return { status: "shared", journeyMutation: "none" };
  } catch (error) {
    return isAbortError(error)
      ? { status: "cancelled", journeyMutation: "none" }
      : { status: "rejected", journeyMutation: "none" };
  }
}

export function downloadMemoryPng(
  artifact: MemoryPngArtifact,
  ports: MemoryDownloadPorts = browserDownloadPorts,
): MemoryDownloadResult {
  let objectUrl: string | null = null;
  let anchor: MemoryDownloadAnchor | null = null;
  try {
    objectUrl = ports.createObjectUrl(artifact.blob);
    anchor = ports.createAnchor();
    anchor.href = objectUrl;
    anchor.download = MEMORY_PNG_FILE_NAME;
    anchor.rel = "noopener";
    ports.appendAnchor(anchor);
    anchor.click();
    return { status: "started", journeyMutation: "none" };
  } catch {
    return { status: "failed", journeyMutation: "none" };
  } finally {
    try {
      anchor?.remove();
    } catch {
      // The browser has already accepted or rejected the click. Cleanup must
      // not create an unreported third outcome.
    }
    if (objectUrl !== null) {
      try {
        ports.revokeObjectUrl(objectUrl);
      } catch {
        // Cleanup failure does not turn an already-started download into a
        // second action or expose any Journey data.
      }
    }
  }
}
