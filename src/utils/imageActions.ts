const PNG_MIME_TYPE = "image/png";

export function downloadTextFile(
  text: string,
  fileName: string,
  mimeType = "text/plain;charset=utf-8",
) {
  const blob = new Blob([text], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

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

export type PageShareOutcome = ImageActionOutcome | "copied";

export interface PageShareResult {
  outcome: PageShareOutcome;
  error?: unknown;
}

export interface PreviewPageShareSnapshot {
  pageUrl: string;
  shareTitle: string;
  shareText: string;
  shareHashtags: readonly string[];
}

interface ShareNavigator {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
}

export interface ImageActionCapabilities {
  navigator?: ShareNavigator;
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

export function sharePreviewPage(
  snapshot: PreviewPageShareSnapshot,
  capabilities: ImageActionCapabilities = getImageActionCapabilities(),
): Promise<PageShareResult> {
  const browser = capabilities.navigator;
  if (
    isSecureImageActionContext(capabilities) &&
    typeof browser?.share === "function"
  ) {
    try {
      const sharePromise = browser.share({
        title: snapshot.shareTitle,
        text: buildPageShareText(snapshot),
        url: snapshot.pageUrl,
      });
      return sharePromise.then(
        (): PageShareResult => ({ outcome: "success" }),
        (error: unknown) => toImageActionFailure(error),
      );
    } catch (error) {
      return Promise.resolve(toImageActionFailure(error));
    }
  }

  const clipboard = browser?.clipboard;
  const writeText = clipboard?.writeText;
  if (typeof writeText !== "function") {
    return Promise.resolve({ outcome: "unavailable" });
  }

  try {
    const copyPromise = writeText.call(clipboard, snapshot.pageUrl);
    return copyPromise.then(
      (): PageShareResult => ({ outcome: "copied" }),
      (error: unknown) => toImageActionFailure(error),
    );
  } catch (error) {
    return Promise.resolve(toImageActionFailure(error));
  }
}

function buildPageShareText(snapshot: PreviewPageShareSnapshot) {
  return [snapshot.shareText, snapshot.shareHashtags.join(" ")]
    .filter(Boolean)
    .join("\n");
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
    isSecureContext:
      typeof window !== "undefined" && window.isSecureContext === true,
  };
}
