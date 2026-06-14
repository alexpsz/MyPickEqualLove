"use client";

import React from "react";
import { APP_BRAND } from "../config/equalLove";
import { SITE_URL } from "../utils/constants";

interface PreviewModalProps {
  previewUrl: string;
  onClose: () => void;
  showTitles: boolean;
  onToggleShowTitles: (show: boolean) => void;
  transparentBg: boolean;
  onToggleTransparentBg: (transparent: boolean) => void;
  generating: boolean;
}

export default function PreviewModal({
  previewUrl,
  onClose,
  showTitles,
  onToggleShowTitles,
  transparentBg,
  onToggleTransparentBg,
  generating,
}: PreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/45 backdrop-blur-sm"
        aria-label="Close image preview"
      />

      <div className="official-panel relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden bg-white">
        <div className="flex flex-col justify-between gap-4 border-b border-black bg-white p-4 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-lg font-bold uppercase tracking-[0.22em] text-black">
              Image Preview
            </h3>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--equal-love-primary)]">
              =LOVE Top Picks export
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <ToggleOption
              checked={showTitles}
              disabled={generating}
              onChange={onToggleShowTitles}
              label="Show Song Titles"
            />
            <ToggleOption
              checked={transparentBg}
              disabled={generating}
              onChange={onToggleTransparentBg}
              label="Transparent Background"
            />
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center border border-black bg-white text-black transition-colors hover:bg-black hover:text-white"
              aria-label="Close image preview"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="no-scrollbar official-stripe relative flex max-h-[60vh] flex-1 justify-center overflow-y-auto p-6">
          <img
            src={previewUrl}
            alt="=LOVE Picks Preview"
            className={`max-h-[52vh] max-w-full border border-black bg-white object-contain transition-opacity duration-200 ${
              generating ? "opacity-50 blur-[2px]" : "opacity-100"
            }`}
          />
          {generating && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-full bg-slate-900/80 px-4 py-2 text-xs font-bold text-white shadow-lg">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                Updating Preview...
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3.5 border-t border-black bg-white p-5">
          <button
            type="button"
            onClick={onClose}
            className="official-button"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              void downloadImage(previewUrl);
            }}
            className="official-button official-button-primary"
          >
            <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M13 8V2H7v6H2l8 8 8-8h-5zM2 18h16v2H2v-2z" />
            </svg>
            Download Image
          </button>
          <button
            type="button"
            onClick={() => {
              const shareText = `${APP_BRAND.shareText}\n${APP_BRAND.shareHashtags.join(" ")}`;
              const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(
                shareText,
              )}&url=${encodeURIComponent(SITE_URL)}`;
              window.open(xUrl, "_blank", "noopener,noreferrer");
            }}
            className="official-button bg-black text-white hover:bg-[var(--equal-love-primary)]"
          >
            <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share to X
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleOption({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center justify-center gap-2 border border-black bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-black transition-colors hover:bg-[var(--paper-soft)]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-rose-500 transition focus:ring-rose-400 disabled:opacity-50"
      />
      {label}
    </label>
  );
}

async function downloadImage(previewUrl: string) {
  try {
    const fileName = APP_BRAND.imageFileName;
    const browser = getBrowserProfile();
    const blobResult = toImageBlob(previewUrl);
    const blob = blobResult instanceof Blob ? blobResult : await blobResult;
    const shareResult = shareImage(blob, fileName, browser);

    if (shareResult instanceof Promise ? await shareResult : shareResult) {
      return;
    }

    const legacyNavigator = navigator as NavigatorWithLegacySave;
    if (typeof legacyNavigator.msSaveOrOpenBlob === "function") {
      legacyNavigator.msSaveOrOpenBlob(blob, fileName);
      return;
    }
    if (typeof legacyNavigator.msSaveBlob === "function") {
      legacyNavigator.msSaveBlob(blob, fileName);
      return;
    }

    if (!browser.prefersOpenImageFallback && supportsAnchorDownload()) {
      triggerAnchorDownload(blob, fileName);
      return;
    }

    openImageFallback(blob);
  } catch (error) {
    console.error("Failed to download image", error);
    window.alert(
      "This browser could not start the download. Please long-press or right-click the preview image to save it.",
    );
  }
}

function toImageBlob(previewUrl: string): Blob | Promise<Blob> {
  if (previewUrl.startsWith("data:")) {
    return dataUrlToBlob(previewUrl);
  }

  return fetch(previewUrl).then((response) => response.blob());
}

function dataUrlToBlob(dataUrl: string) {
  const [header, data = ""] = dataUrl.split(",");
  const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/png";
  const byteString = header.includes(";base64")
    ? atob(data)
    : decodeURIComponent(data);
  const bytes = new Uint8Array(byteString.length);

  for (let index = 0; index < byteString.length; index += 1) {
    bytes[index] = byteString.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function shareImage(
  blob: Blob,
  fileName: string,
  browser: BrowserProfile,
): boolean | Promise<boolean> {
  if (
    !browser.prefersShareFallback ||
    typeof navigator.share !== "function"
  ) {
    return false;
  }

  try {
    const file = new File([blob], fileName, {
      type: blob.type || "image/png",
    });
    const shareData: ShareData = {
      files: [file],
      title: APP_BRAND.displayName,
    };

    if (
      typeof navigator.canShare === "function" &&
      !navigator.canShare(shareData)
    ) {
      return false;
    }

    return navigator.share(shareData).then(
      () => true,
      () => false,
    );
  } catch {
    return false;
  }
}

function triggerAnchorDownload(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 30_000);
}

function openImageFallback(blob: Blob) {
  const blobUrl = URL.createObjectURL(blob);
  const openedWindow = window.open(blobUrl, "_blank");

  if (!openedWindow) {
    window.alert(
      "This browser blocked the automatic download. Please long-press or right-click the preview image to save it.",
    );
    URL.revokeObjectURL(blobUrl);
    return;
  }

  try {
    openedWindow.opener = null;
  } catch {
    // Some mobile browsers expose a restricted WindowProxy here.
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60_000);
}

function supportsAnchorDownload() {
  return (
    typeof HTMLAnchorElement !== "undefined" &&
    "download" in HTMLAnchorElement.prototype
  );
}

function getBrowserProfile(): BrowserProfile {
  const userAgent = navigator.userAgent;
  const lowerUserAgent = userAgent.toLowerCase();
  const isIOS = /iP(hone|ad|od)/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const hasUnreliableAndroidDownload =
    UNRELIABLE_ANDROID_DOWNLOAD_AGENTS.some((agent) =>
      lowerUserAgent.includes(agent),
    ) || /; wv\)/i.test(userAgent);
  const prefersFallback =
    isIOS || (isAndroid && hasUnreliableAndroidDownload);

  return {
    prefersOpenImageFallback: prefersFallback,
    prefersShareFallback: prefersFallback,
  };
}

const UNRELIABLE_ANDROID_DOWNLOAD_AGENTS = [
  "vivobrowser",
  "heytapbrowser",
  "oppobrowser",
  "realmebrowser",
  "miuibrowser",
  "huaweibrowser",
  "honorbrowser",
  "arkweb",
  "quark",
  "ucbrowser",
  "mqqbrowser",
  "qqbrowser",
  "baidubrowser",
  "baiduhd",
  "sogoumobilebrowser",
  "aphonebrowser",
  "360 aphone browser",
  "2345explorer",
  "liebaofast",
  "mb2345browser",
  "micromessenger",
  "weibo",
  "dingtalk",
  "alipayclient",
  "lark",
  "feishu",
  "bytedancewebview",
] as const;

interface BrowserProfile {
  prefersOpenImageFallback: boolean;
  prefersShareFallback: boolean;
}

interface NavigatorWithLegacySave extends Navigator {
  msSaveBlob?: (blob: Blob, defaultName?: string) => boolean;
  msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
}
