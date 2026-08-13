"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import * as m from "motion/react-m";
import { EXPORT_TEMPLATE_ORDER } from "../config/exportPresets";
import { getExportTemplateMessageKey } from "../i18n/content";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";
import type { ExportTemplateId } from "../schema/export";
import { useDialogA11y } from "../utils/useDialogA11y";
import {
  preparePreviewImageArtifact,
  sharePreviewImage,
  sharePreviewPage,
  type ImageActionOutcome,
  type PageShareOutcome,
  type PreviewImageArtifact,
  type PreviewPageShareSnapshot,
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
  const mobileOptionsId = useId();
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const [imageActionStatus, setImageActionStatus] = useState<
    | {
        action: "image";
        outcome: ImageActionOutcome;
      }
    | {
        action: "page";
        outcome: PageShareOutcome;
      }
    | null
  >(null);
  const [imageActionPending, setImageActionPending] = useState(false);
  const [imagePreparationFailed, setImagePreparationFailed] = useState(false);
  const [previewArtifact, setPreviewArtifact] =
    useState<PreviewImageArtifact | null>(null);
  const shareConfig = {
    pageUrl,
    shareText,
    shareHashtags,
  };
  const pageShareSnapshot: PreviewPageShareSnapshot = {
    pageUrl,
    shareTitle,
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

  useEffect(() => {
    if (!imageActionStatus && !imagePreparationFailed) return;

    const timer = window.setTimeout(() => {
      setImageActionStatus(null);
      setImagePreparationFailed(false);
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [imageActionStatus, imagePreparationFailed]);

  const actionInert = imageActionPending || presenceState === "exiting";
  const currentPreviewArtifact =
    previewArtifact?.dataUrl === previewUrl &&
    previewArtifact.fileName === imageFileName
      ? previewArtifact
      : null;
  const imageActionsDisabled =
    actionsDisabled || actionInert || !currentPreviewArtifact;
  const pageActionDisabled = actionsDisabled || actionInert;
  const imageActionMessage = imagePreparationFailed
    ? t("preview.imageUnavailable")
    : imageActionStatus
      ? getImageActionMessage(
          t,
          imageActionStatus.action,
          imageActionStatus.outcome,
        )
      : null;

  const runShareAction = async (action: "image" | "page") => {
    if (actionInert) return;

    const runId = ++actionRunIdRef.current;
    setImageActionPending(true);
    setImageActionStatus(null);
    setImagePreparationFailed(false);
    let nextStatus:
      | { action: "image"; outcome: ImageActionOutcome }
      | { action: "page"; outcome: PageShareOutcome };
    if (action === "page") {
      if (actionsDisabled) {
        setImageActionPending(false);
        return;
      }
      const result = await sharePreviewPage(pageShareSnapshot);
      nextStatus = { action: "page", outcome: result.outcome };
    } else {
      const artifact = currentPreviewArtifact;
      if (actionsDisabled || !artifact) {
        setImageActionPending(false);
        return;
      }
      const result = await sharePreviewImage(artifact, shareTitle);
      nextStatus = { action: "image", outcome: result.outcome };
    }
    if (runId !== actionRunIdRef.current) return;
    setImageActionStatus(nextStatus);
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
        className="apple-sheet relative z-10 flex h-[92dvh] max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none border-x-0 border-b-0 focus:outline-none sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex flex-col gap-2 border-b border-[var(--line)] bg-white px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <h3
                id="preview-modal-title"
                className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-[20px]"
              >
                {t("preview.title")}
              </h3>
              <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">
                {previewLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOptionsExpanded((expanded) => !expanded)}
              aria-expanded={isOptionsExpanded}
              aria-controls={mobileOptionsId}
              className="official-button min-h-11 shrink-0 gap-1.5 px-3 text-[13px] sm:hidden"
            >
              <span>{t("preview.options")}</span>
              <AppIcon
                name="chevron-down"
                size={14}
                strokeWidth={1.65}
                className={`transition-transform duration-150 ${
                  isOptionsExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          <div
            id={mobileOptionsId}
            data-preview-options-panel
            className={`${isOptionsExpanded ? "block" : "hidden"} sm:block`}
          >
            <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--background)] p-3">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
                <AnchoredOptionMenu
                  compact
                  label={t("preview.templateLabel")}
                  value={templateId}
                  disabled={generating}
                  onValueChange={onTemplateChange}
                  options={EXPORT_TEMPLATE_ORDER.map((id) => ({
                    value: id,
                    label: t(getExportTemplateMessageKey(id)),
                  }))}
                />
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-2">
                  <ToggleOption
                    checked={showQrCode}
                    disabled={generating}
                    onChange={onToggleShowQrCode}
                    label={t("preview.showQrCode")}
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
            </div>
          </div>
        </div>

        <div
          data-preview-image-stage
          className="no-scrollbar relative flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto bg-[var(--background)] p-4 sm:p-6"
        >
          <img
            src={previewUrl}
            alt={t("preview.imageAlt", { title: shareTitle })}
            className={`block h-auto w-auto max-h-full max-w-full object-contain shadow-[var(--shadow-panel)] transition-[opacity,filter] duration-150 ${
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

        <div className="relative grid grid-cols-5 items-stretch gap-1 border-t border-[var(--line)] bg-white px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2 sm:p-3 sm:pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {imageActionMessage ? (
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="pointer-events-none absolute inset-x-3 bottom-[calc(100%+0.5rem)] z-20 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-full bg-black/85 px-3 py-2 text-center text-[12px] leading-4 font-medium text-white shadow-lg backdrop-blur-md"
            >
              {imageActionMessage}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void runShareAction("image");
            }}
            disabled={imageActionsDisabled}
            aria-label={t("preview.shareImage")}
            className="official-button official-button-primary min-w-0 flex-col gap-0.5 px-1 py-1 text-[10px] leading-none disabled:opacity-50 sm:flex-row sm:gap-2 sm:px-4 sm:py-0 sm:text-[13px]"
          >
            <AppIcon name="image" size={16} />
            <span className="max-w-full truncate sm:hidden">
              {t("preview.shareImage.short")}
            </span>
            <span className="hidden sm:inline">{t("preview.shareImage")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void runShareAction("page");
            }}
            disabled={pageActionDisabled}
            aria-label={t("preview.sharePage")}
            className="official-button min-w-0 flex-col gap-0.5 border-transparent bg-transparent px-1 py-1 text-[10px] leading-none shadow-none disabled:opacity-50 sm:flex-row sm:gap-2 sm:border-[var(--line-strong)] sm:bg-white sm:px-4 sm:py-0 sm:text-[13px]"
          >
            <AppIcon name="share" size={16} />
            <span className="max-w-full truncate sm:hidden">
              {t("preview.sharePage.short")}
            </span>
            <span className="hidden sm:inline">{t("preview.sharePage")}</span>
          </button>
          <button
            type="button"
            disabled={imageActionsDisabled}
            aria-label={t("preview.downloadImage")}
            onClick={() => {
              if (!currentPreviewArtifact) return;
              void downloadImage(currentPreviewArtifact, {
                failed: t("errors.downloadFailed"),
                blocked: t("errors.downloadBlocked"),
              });
            }}
            className="official-button min-w-0 flex-col gap-0.5 border-transparent bg-transparent px-1 py-1 text-[10px] leading-none shadow-none disabled:opacity-50 sm:flex-row sm:gap-2 sm:border-[var(--line-strong)] sm:bg-white sm:px-4 sm:py-0 sm:text-[13px]"
          >
            <AppIcon name="download" size={16} />
            <span className="max-w-full truncate sm:hidden">
              {t("preview.downloadImage.short")}
            </span>
            <span className="hidden sm:inline">
              {t("preview.downloadImage")}
            </span>
          </button>
          <button
            type="button"
            disabled={actionsDisabled || actionInert}
            aria-label={t("preview.shareToX")}
            onClick={() => {
              shareToX(shareConfig);
            }}
            className="official-button min-w-0 flex-col gap-0.5 border-transparent bg-transparent px-1 py-1 text-[10px] leading-none text-slate-950 shadow-none disabled:opacity-50 sm:flex-row sm:gap-2 sm:border-slate-950 sm:bg-slate-950 sm:px-4 sm:py-0 sm:text-[13px] sm:text-white"
          >
            <svg
              className="h-4 w-4 shrink-0 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="sm:hidden">{t("preview.shareToX.short")}</span>
            <span className="hidden sm:inline">{t("preview.shareToX")}</span>
          </button>
          <button
            ref={footerCloseButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("preview.close")}
            className="official-button official-button-quiet min-w-0 flex-col gap-0.5 px-1 py-1 text-[10px] leading-none sm:flex-row sm:gap-2 sm:px-4 sm:py-0 sm:text-[13px]"
          >
            <AppIcon name="close" size={16} />
            <span className="max-w-full truncate sm:hidden">
              {t("preview.close.short")}
            </span>
            <span className="hidden sm:inline">{t("preview.close")}</span>
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
  action: "image" | "page",
  outcome: ImageActionOutcome | PageShareOutcome,
) {
  const keys: Record<
    "image" | "page",
    Partial<Record<ImageActionOutcome | PageShareOutcome, MessageKey>>
  > = {
    image: {
      success: "preview.shareImage.success",
      unavailable: "preview.shareImage.unavailable",
      cancelled: "preview.shareImage.cancelled",
      denied: "preview.shareImage.denied",
      failed: "preview.shareImage.failed",
    },
    page: {
      success: "preview.sharePage.success",
      copied: "preview.sharePage.copied",
      unavailable: "preview.sharePage.unavailable",
      cancelled: "preview.sharePage.cancelled",
      denied: "preview.sharePage.denied",
      failed: "preview.sharePage.failed",
    },
  };
  const key = keys[action][outcome];
  return key ? t(key) : null;
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
