const PNG_MIME_TYPE = "image/png";

export interface PreviewImageSource {
  dataUrl: string;
  fileName: string;
}

export interface PreviewImageArtifact {
  dataUrl: string;
  fileName: string;
  blob: Blob;
  file?: File;
}

export type ImageActionOutcome =
  | "success"
  | "unavailable"
  | "cancelled"
  | "denied"
  | "failed";

export interface ImageActionResult {
  outcome: ImageActionOutcome;
  error?: unknown;
}

interface ShareNavigator {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    write: (items: ClipboardItem[]) => Promise<void>;
    writeText?: (text: string) => Promise<void>;
  };
}

interface ClipboardItemConstructor {
  new (items: Record<string, Blob>): ClipboardItem;
}

export interface ImageActionCapabilities {
  navigator?: ShareNavigator;
  ClipboardItem?: ClipboardItemConstructor;
  isSecureContext?: boolean;
}

export async function preparePreviewImageArtifact(
  source: PreviewImageSource,
): Promise<PreviewImageArtifact> {
  if (!isPngDataUrl(source.dataUrl)) {
    throw new TypeError("Expected a PNG data URL.");
  }

  const response = await fetch(source.dataUrl);
  if (!response.ok) {
    throw new Error("Could not prepare the preview image.");
  }

  const blob = await response.blob();
  if (blob.type.toLowerCase() !== PNG_MIME_TYPE || blob.size === 0) {
    throw new TypeError("Expected a non-empty PNG preview.");
  }

  return {
    dataUrl: source.dataUrl,
    fileName: source.fileName,
    blob,
    file:
      typeof File === "undefined"
        ? undefined
        : new File([blob], source.fileName, { type: PNG_MIME_TYPE }),
  };
}

export async function sharePreviewImage(
  artifact: PreviewImageArtifact,
  title: string,
  capabilities: ImageActionCapabilities = getImageActionCapabilities(),
): Promise<ImageActionResult> {
  const browser = capabilities.navigator;
  if (
    !isSecureImageActionContext(capabilities) ||
    !browser ||
    typeof browser.share !== "function" ||
    typeof browser.canShare !== "function" ||
    !artifact.file
  ) {
    return { outcome: "unavailable" };
  }

  try {
    const files = [artifact.file];
    if (!browser.canShare({ files })) {
      return { outcome: "unavailable" };
    }

    await browser.share({ files, title });
    return { outcome: "success" };
  } catch (error) {
    return toImageActionFailure(error);
  }
}

export async function copyPreviewImage(
  artifact: PreviewImageArtifact,
  capabilities: ImageActionCapabilities = getImageActionCapabilities(),
): Promise<ImageActionResult> {
  const browser = capabilities.navigator;
  if (
    !isSecureImageActionContext(capabilities) ||
    !browser?.clipboard ||
    typeof browser.clipboard.write !== "function" ||
    !capabilities.ClipboardItem
  ) {
    return { outcome: "unavailable" };
  }

  try {
    const item = new capabilities.ClipboardItem({
      [PNG_MIME_TYPE]: artifact.blob,
    });
    await browser.clipboard.write([item]);
    return { outcome: "success" };
  } catch (error) {
    return toImageActionFailure(error);
  }
}

export async function copyPreviewPageLink(
  pageUrl: string,
  capabilities: ImageActionCapabilities = getImageActionCapabilities(),
): Promise<ImageActionResult> {
  const clipboard = capabilities.navigator?.clipboard;
  if (
    !isSecureImageActionContext(capabilities) ||
    !clipboard ||
    typeof clipboard.writeText !== "function"
  ) {
    return { outcome: "unavailable" };
  }

  try {
    await clipboard.writeText(pageUrl);
    return { outcome: "success" };
  } catch (error) {
    return toImageActionFailure(error);
  }
}

function toImageActionFailure(error: unknown): ImageActionResult {
  if (getErrorName(error) === "AbortError") {
    return { outcome: "cancelled" };
  }
  if (getErrorName(error) === "NotAllowedError") {
    return { outcome: "denied", error };
  }
  return { outcome: "failed", error };
}

function getErrorName(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : undefined;
}

function isPngDataUrl(value: string) {
  return /^data:image\/png(?:;[^,]*)?,/i.test(value);
}

function isSecureImageActionContext(capabilities: ImageActionCapabilities) {
  return capabilities.isSecureContext === true;
}

function getImageActionCapabilities(): ImageActionCapabilities {
  return {
    navigator: typeof navigator === "undefined" ? undefined : navigator,
    ClipboardItem:
      typeof ClipboardItem === "undefined" ? undefined : ClipboardItem,
    isSecureContext:
      typeof window !== "undefined" && window.isSecureContext === true,
  };
}
