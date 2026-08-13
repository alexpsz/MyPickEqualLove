"use client";

import React, { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import {
  EXPORT_SIZE_PRESET_ORDER,
  EXPORT_SIZE_PRESETS,
  EXPORT_TEMPLATE_ORDER,
} from "../config/exportPresets";
import {
  getExportSizeMessageKey,
  getExportTemplateMessageKey,
} from "../i18n/content";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import type { ExportSizePresetId, ExportTemplateId } from "../schema/export";
import { useDialogA11y } from "../utils/useDialogA11y";
import {
  copyPreviewImage,
  copyPreviewPageLink,
  preparePreviewImageArtifact,
  sharePreviewImage,
  type ImageActionOutcome,
  type ImageActionResult,
  type PreviewImageArtifact,
} from "../utils/imageActions";
import AppIcon from "./AppIcon";
import AnchoredOptionMenu from "./AnchoredOptionMenu";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import type { PresenceState } from "./MotionPresence";

interface PreviewModalProps {
  previewUrl: string;
  onClose: () => void;
  showTitles: boolean;
  onToggleShowTitles: (show: boolean) => void;
  transparentBg: boolean;
  onToggleTransparentBg: (transparent: boolean) => void;
  showQrCode: boolean;
  onToggleShowQrCode: (show: boolean) => void;
  templateId: ExportTemplateId;
  onTemplateChange: (templateId: ExportTemplateId) => void;
  sizePresetId: ExportSizePresetId;
  onSizePresetChange: (sizePresetId: ExportSizePresetId) => void;
  generating: boolean;
  actionsDisabled: boolean;
  pageUrl: string;
  previewLabel: string;
  imageFileName: string;
  shareText: string;
  shareHashtags: string[];
  shareTitle: string;
  presenceState: PresenceState;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusKey: string;
  returnFocusFallbackKey: string;
}

export default function PreviewModal({
  previewUrl,
  onClose,
  showTitles,
  onToggleShowTitles,
  transparentBg,
  onToggleTransparentBg,
  showQrCode,
  onToggleShowQrCode,
  templateId,
  onTemplateChange,
  sizePresetId,
  onSizePresetChange,
  generating,
  actionsDisabled,
  pageUrl,
  previewLabel,
  imageFileName,
  shareText,
  shareHashtags,
  shareTitle,
  presenceState,
  returnFocusRef,
  returnFocusKey,
  returnFocusFallbackKey,
}: PreviewModalProps) {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const footerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const actionRunIdRef = useRef(0);
  const [imageActionStatus, setImageActionStatus] = useState<{
    action: "share" | "copy" | "link";
    outcome: ImageActionOutcome;
  } | null>(null);
  const [imageActionPending, setImageActionPending] = useState(false);
  const [imagePreparationFailed, setImagePreparationFailed] = useState(false);
  const [previewArtifact, setPreviewArtifact] =
    useState<PreviewImageArtifact | null>(null);
  const shareConfig = {
    pageUrl,
    shareText,
    shareHashtags,
  };

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting",
    initialFocusRef: footerCloseButtonRef,
    returnFocusRef,
    returnFocusKey,
    returnFocusFallbackKey,
  });

  useEffect(() => {
    if (generating && presenceState !== "exiting") {
      footerCloseButtonRef.current?.focus({ preventScroll: true });
    }
  }, [generating, presenceState]);

  useEffect(() => {
    actionRunIdRef.current += 1;
    setImageActionPending(false);
    setImageActionStatus(null);
    setImagePreparationFailed(false);
    setPreviewArtifact(null);
    let active = true;

    void preparePreviewImageArtifact({
      dataUrl: previewUrl,
      fileName: imageFileName,
    }).then(
      (artifact) => {
        if (active) setPreviewArtifact(artifact);
      },
      () => {
        if (active) {
          setImagePreparationFailed(true);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [imageFileName, previewUrl]);

  useEffect(
    () => () => {
      actionRunIdRef.current += 1;
    },
    [],
  );

  const actionInert = imageActionPending || presenceState === "exiting";
  const currentPreviewArtifact =
    previewArtifact?.dataUrl === previewUrl &&
    previewArtifact.fileName === imageFileName
      ? previewArtifact
      : null;
  const imageActionsDisabled =
    actionsDisabled || actionInert || !currentPreviewArtifact;
  const linkActionsDisabled = actionInert;
  const imageActionMessage = imagePreparationFailed
    ? t("preview.imageUnavailable")
    : imageActionStatus
      ? getImageActionMessage(
          t,
          imageActionStatus.action,
          imageActionStatus.outcome,
        )
      : null;

  const runImageAction = async (action: "share" | "copy" | "link") => {
    if (actionInert) return;

    const runId = ++actionRunIdRef.current;
    setImageActionPending(true);
    setImageActionStatus(null);
    let result: ImageActionResult;
    if (action === "link") {
      result = await copyPreviewPageLink(pageUrl);
    } else {
      const artifact = currentPreviewArtifact;
      if (actionsDisabled || !artifact) {
        setImageActionPending(false);
        return;
      }
      result =
        action === "share"
          ? await sharePreviewImage(artifact, shareTitle)
          : await copyPreviewImage(artifact);
    }
    if (runId !== actionRunIdRef.current) return;
    setImageActionStatus({ action, outcome: result.outcome });
    setImageActionPending(false);
  };

  return (
    <div
      className="motion-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      data-presence={presenceState}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={presenceState === "exiting"}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        aria-label={t("preview.closeAria")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={APPLE_OPACITY}
      />

      <m.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-hidden={presenceState === "exiting"}
        inert={presenceState === "exiting"}
        aria-busy={generating}
        aria-labelledby="preview-modal-title"
        className="apple-sheet relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none border-x-0 border-b-0 focus:outline-none sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] bg-white p-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h3
              id="preview-modal-title"
              className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--foreground)]"
            >
              {t("preview.title")}
            </h3>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">
              {previewLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AnchoredOptionMenu
              label={t("preview.templateLabel")}
              value={templateId}
              disabled={generating}
              onValueChange={onTemplateChange}
              options={EXPORT_TEMPLATE_ORDER.map((id) => ({
                value: id,
                label: t(getExportTemplateMessageKey(id)),
              }))}
            />
            <ToggleOption
              checked={showQrCode}
              disabled={generating}
              onChange={onToggleShowQrCode}
              label={t("preview.showQrCode")}
            />
            <AnchoredOptionMenu
              label={t("preview.sizeLabel")}
              value={sizePresetId}
              disabled={generating}
              onValueChange={onSizePresetChange}
              options={EXPORT_SIZE_PRESET_ORDER.map((id) => {
                const size = EXPORT_SIZE_PRESETS[id];
                return {
                  value: id,
                  label: t("preview.sizeOption", {
                    name: t(getExportSizeMessageKey(id)),
                    ratio: size.ratioLabel,
                    width: size.width,
                    height: size.height,
                  }),
                };
              })}
            />
            <ToggleOption
              checked={showTitles}
              disabled={generating}
              onChange={onToggleShowTitles}
              label={t("preview.showTitles")}
            />
            <ToggleOption
              checked={transparentBg}
              disabled={generating}
              onChange={onToggleTransparentBg}
              label={t("preview.transparentBackground")}
            />
          </div>
        </div>

        <div className="no-scrollbar relative flex min-h-0 flex-1 justify-center overflow-y-auto bg-[var(--background)] p-4 sm:p-6">
          <img
            src={previewUrl}
            alt={t("preview.imageAlt", { title: shareTitle })}
            className={`block max-h-[58dvh] max-w-full bg-white object-contain shadow-[var(--shadow-panel)] transition-[opacity,filter] duration-150 ${
              generating ? "opacity-50 blur-[2px]" : "opacity-100"
            }`}
          />
          {generating && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                role="status"
                aria-live="polite"
                className="preview-status flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-[13px] font-medium text-white shadow-lg backdrop-blur-md"
              >
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                {t("preview.updating")}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {imageActionMessage ? (
            <p
              role="status"
              aria-live="polite"
              className="basis-full text-right text-[12px] text-[var(--muted)]"
            >
              {imageActionMessage}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void runImageAction("share");
            }}
            disabled={imageActionsDisabled}
            className="official-button official-button-primary disabled:opacity-50"
          >
            <AppIcon name="share" />
            {t("preview.shareImage")}
          </button>
          <button
            type="button"
            onClick={() => {
              void runImageAction("copy");
            }}
            disabled={imageActionsDisabled}
            className="official-button border border-[var(--line-strong)] bg-white disabled:opacity-50"
          >
            <AppIcon name="copy" />
            {t("preview.copyImage")}
          </button>
          <button
            type="button"
            onClick={() => {
              void runImageAction("link");
            }}
            disabled={linkActionsDisabled}
            className="official-button border border-[var(--line-strong)] bg-white disabled:opacity-50"
          >
            <AppIcon name="copy" />
            {t("preview.copyLink")}
          </button>
          <button
            type="button"
            disabled={imageActionsDisabled}
            onClick={() => {
              if (!currentPreviewArtifact) return;
              void downloadImage(currentPreviewArtifact, {
                failed: t("errors.downloadFailed"),
                blocked: t("errors.downloadBlocked"),
              });
            }}
            className="official-button border border-[var(--line-strong)] bg-white disabled:opacity-50"
          >
            <AppIcon name="download" />
            {t("preview.downloadImage")}
          </button>
          <button
            type="button"
            disabled={actionsDisabled || actionInert}
            onClick={() => {
              shareToX(shareConfig);
            }}
            className="official-button border-slate-950 bg-slate-950 text-white disabled:opacity-50"
          >
            <svg
              className="h-3.5 w-3.5 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            {t("preview.shareToX")}
          </button>
          <button
            ref={footerCloseButtonRef}
            type="button"
            onClick={onClose}
            className="official-button official-button-quiet"
          >
            {t("preview.close")}
          </button>
        </div>
      </m.div>
    </div>
  );
}

interface XShareConfig {
  pageUrl: string;
  shareText: string;
  shareHashtags: string[];
}

function shareToX(config: XShareConfig) {
  const webIntentUrl = buildXWebIntentUrl(config);

  if (isIOSDevice()) {
    openIOSNativeXComposer(webIntentUrl, config);
    return;
  }

  if (isAndroidDevice()) {
    window.location.href = buildXAndroidIntentUrl(webIntentUrl, config);
    return;
  }

  window.open(webIntentUrl, "_blank", "noopener,noreferrer");
}

function buildXWebIntentUrl(config: XShareConfig) {
  const shareText = buildXShareText(config);
  return `https://x.com/intent/post?text=${encodeURIComponent(
    shareText,
  )}&url=${encodeURIComponent(config.pageUrl)}`;
}

function buildXCustomSchemeComposerUrl(config: XShareConfig) {
  return `twitter://post?message=${encodeURIComponent(buildXShareMessage(config))}`;
}

function buildXAndroidIntentUrl(fallbackUrl: string, config: XShareConfig) {
  return `intent://post?message=${encodeURIComponent(
    buildXShareMessage(config),
  )}#Intent;scheme=twitter;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(
    fallbackUrl,
  )};end`;
}

function buildXShareText(config: XShareConfig) {
  return `${config.shareText}\n${config.shareHashtags.join(" ")}`;
}

function buildXShareMessage(config: XShareConfig) {
  return `${buildXShareText(config)}\n${config.pageUrl}`;
}

function openIOSNativeXComposer(webIntentUrl: string, config: XShareConfig) {
  let appOpened = false;

  const markAppOpened = () => {
    appOpened = true;
    cleanup();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      markAppOpened();
    }
  };
  const cleanup = () => {
    window.removeEventListener("pagehide", markAppOpened);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  window.addEventListener("pagehide", markAppOpened, { once: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  window.setTimeout(() => {
    cleanup();
    if (!appOpened && document.visibilityState !== "hidden") {
      window.location.href = webIntentUrl;
    }
  }, 2_500);

  window.location.href = buildXCustomSchemeComposerUrl(config);
}

function isIOSDevice() {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  return (
    /iP(hone|ad|od)/i.test(userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
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
    <label className="flex min-h-11 cursor-pointer select-none items-center justify-center gap-2 rounded-[var(--radius-sm)] px-2 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background)]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-[26px] w-[44px] shrink-0 rounded-full bg-[var(--line-strong)] transition-colors duration-150 after:absolute after:left-[2px] after:top-[2px] after:h-[22px] after:w-[22px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-150 peer-checked:bg-[var(--project-primary)] peer-checked:after:translate-x-[18px] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--focus-ring)] peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
      />
      {label}
    </label>
  );
}

function getImageActionMessage(
  t: (key: MessageKey) => string,
  action: "share" | "copy" | "link",
  outcome: ImageActionOutcome,
) {
  const keys: Record<
    "share" | "copy" | "link",
    Record<ImageActionOutcome, MessageKey>
  > = {
    share: {
      success: "preview.shareImage.success",
      unavailable: "preview.shareImage.unavailable",
      cancelled: "preview.shareImage.cancelled",
      denied: "preview.shareImage.denied",
      failed: "preview.shareImage.failed",
    },
    copy: {
      success: "preview.copyImage.success",
      unavailable: "preview.copyImage.unavailable",
      cancelled: "preview.copyImage.cancelled",
      denied: "preview.copyImage.denied",
      failed: "preview.copyImage.failed",
    },
    link: {
      success: "preview.copyLink.success",
      unavailable: "preview.copyLink.unavailable",
      cancelled: "preview.copyLink.cancelled",
      denied: "preview.copyLink.denied",
      failed: "preview.copyLink.failed",
    },
  };
  return t(keys[action][outcome]);
}

function downloadImage(
  artifact: PreviewImageArtifact,
  messages: { failed: string; blocked: string },
) {
  try {
    const browser = getBrowserProfile();
    const { blob, fileName } = artifact;

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

    openImageFallback(blob, messages.blocked);
  } catch (error) {
    console.error("Failed to download image", error);
    window.alert(messages.failed);
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

function openImageFallback(blob: Blob, downloadBlockedMessage: string) {
  const blobUrl = URL.createObjectURL(blob);
  const openedWindow = window.open(blobUrl, "_blank");

  if (!openedWindow) {
    window.alert(downloadBlockedMessage);
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
  const prefersFallback = isIOS || (isAndroid && hasUnreliableAndroidDownload);

  return {
    prefersOpenImageFallback: prefersFallback,
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
}

interface NavigatorWithLegacySave extends Navigator {
  msSaveBlob?: (blob: Blob, defaultName?: string) => boolean;
  msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
}
