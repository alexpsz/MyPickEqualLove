"use client";

import type { ReactNode } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import {
  getPrimaryOfficialMediaLink,
  getOfficialMediaLinks,
  OFFICIAL_MEDIA_MESSAGE_KEYS,
} from "../utils/officialMedia";
import { getPreviewMedia } from "../utils/previewMedia";
import AppIcon from "./AppIcon";
import { usePreviewAudio } from "./PreviewAudioProvider";

export default function OfficialMediaLinks({
  songId,
  headingLevel = "h2",
}: {
  songId: string;
  headingLevel?: "h2" | "h3";
}) {
  const { t } = useLocale();
  const links = getOfficialMediaLinks(songId);
  const previewMedia = getPreviewMedia(songId);

  if (links.length === 0 && !previewMedia) {
    return null;
  }

  const Heading = headingLevel;

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] p-4">
      <Heading className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        {t("songDetail.officialMedia")}
      </Heading>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <OfficialMediaLink key={link.sourceUrl} href={link.sourceUrl}>
            {t(OFFICIAL_MEDIA_MESSAGE_KEYS[link.sourceMode])}
          </OfficialMediaLink>
        ))}
        {previewMedia ? (
          <OfficialMediaLink href={previewMedia.trackViewUrl}>
            {t("songDetail.appleMusic")}
          </OfficialMediaLink>
        ) : null}
      </div>
      {previewMedia ? (
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          {t("songDetail.preview.attribution")}
        </p>
      ) : null}
    </section>
  );
}

export function OfficialMediaCoverLink({
  songId,
  title,
  className,
  children,
}: {
  songId: string;
  title: string;
  className: string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const link = getPrimaryOfficialMediaLink(songId);
  const previewMedia = getPreviewMedia(songId);
  const { playingSongId, status, progress, failedSongIds, toggle } =
    usePreviewAudio();
  const mode = resolvePreviewMediaControlMode({
    hasPreview: Boolean(previewMedia),
    failed: failedSongIds.has(songId),
    hasOfficialLink: Boolean(link),
  });
  const isActive =
    playingSongId === songId && (status === "loading" || status === "playing");

  if (mode === "preview") {
    return (
      <button
        type="button"
        onClick={() => toggle(songId)}
        aria-pressed={isActive}
        aria-label={t(
          isActive
            ? "songDetail.preview.stopAria"
            : "songDetail.preview.playAria",
          { title },
        )}
        title={t(
          isActive ? "songDetail.preview.stop" : "songDetail.preview.play",
        )}
        className={`${className} group p-0 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`}
      >
        {children}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5 transition-colors duration-150 group-hover:bg-black/20 group-focus-visible:bg-black/20">
          <PreviewGlyph isActive={isActive} progress={progress} size={32} />
        </span>
      </button>
    );
  }

  if (mode === "official-link" && link) {
    const mediaLabel = t(OFFICIAL_MEDIA_MESSAGE_KEYS[link.sourceMode]);
    return (
      <a
        href={link.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("songDetail.openOfficialMediaAria", {
          media: mediaLabel,
          title,
        })}
        title={mediaLabel}
        className={`${className} group focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`}
      >
        {children}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5 transition-colors duration-150 group-hover:bg-black/20 group-focus-visible:bg-black/20">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-transform duration-150 group-hover:scale-[1.04] group-focus-visible:scale-[1.04] group-active:scale-[0.96]">
            <AppIcon name="play" size={32} />
          </span>
        </span>
      </a>
    );
  }

  return <div className={className}>{children}</div>;
}

export function PreviewMediaIconControl({
  songId,
  title,
  className,
}: {
  songId: string;
  title: string;
  className: string;
}) {
  const { t } = useLocale();
  const link = getPrimaryOfficialMediaLink(songId);
  const previewMedia = getPreviewMedia(songId);
  const { playingSongId, status, progress, failedSongIds, toggle } =
    usePreviewAudio();
  const mode = resolvePreviewMediaControlMode({
    hasPreview: Boolean(previewMedia),
    failed: failedSongIds.has(songId),
    hasOfficialLink: Boolean(link),
  });
  const isActive =
    playingSongId === songId && (status === "loading" || status === "playing");
  const mediaLabel = link
    ? t(OFFICIAL_MEDIA_MESSAGE_KEYS[link.sourceMode])
    : "";

  return (
    <PreviewMediaControlView
      mode={mode}
      isActive={isActive}
      progress={progress}
      className={className}
      previewTitle={t(
        isActive ? "songDetail.preview.stop" : "songDetail.preview.play",
      )}
      previewAriaLabel={t(
        isActive
          ? "songDetail.preview.stopAria"
          : "songDetail.preview.playAria",
        { title },
      )}
      officialHref={link?.sourceUrl}
      officialTitle={mediaLabel}
      officialAriaLabel={
        link
          ? t("songDetail.openOfficialMediaAria", {
              media: mediaLabel,
              title,
            })
          : undefined
      }
      onToggle={() => toggle(songId)}
    />
  );
}

export type PreviewMediaControlMode = "preview" | "official-link" | "none";

export function resolvePreviewMediaControlMode({
  hasPreview,
  failed,
  hasOfficialLink,
}: {
  hasPreview: boolean;
  failed: boolean;
  hasOfficialLink: boolean;
}): PreviewMediaControlMode {
  if (hasPreview && !failed) return "preview";
  if (hasOfficialLink) return "official-link";
  return "none";
}

export function PreviewMediaControlView({
  mode,
  isActive,
  progress,
  className,
  previewTitle,
  previewAriaLabel,
  officialHref,
  officialTitle,
  officialAriaLabel,
  onToggle,
}: {
  mode: PreviewMediaControlMode;
  isActive: boolean;
  progress: number;
  className: string;
  previewTitle: string;
  previewAriaLabel: string;
  officialHref?: string;
  officialTitle?: string;
  officialAriaLabel?: string;
  onToggle: () => void;
}) {
  if (mode === "preview") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isActive}
        aria-label={previewAriaLabel}
        title={previewTitle}
        className={`${className} relative overflow-hidden`}
      >
        <AppIcon name={isActive ? "pause" : "play"} size={16} />
        <ProgressBar progress={progress} />
      </button>
    );
  }

  if (
    mode === "official-link" &&
    officialHref &&
    officialTitle &&
    officialAriaLabel
  ) {
    return (
      <a
        href={officialHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={officialAriaLabel}
        title={officialTitle}
        className={className}
      >
        <AppIcon name="play" size={16} />
      </a>
    );
  }

  return null;
}

function PreviewGlyph({
  isActive,
  progress,
  size,
}: {
  isActive: boolean;
  progress: number;
  size: 16 | 32;
}) {
  return (
    <span className="relative flex h-14 w-14 overflow-hidden rounded-full bg-black/60 text-white shadow-lg transition-transform duration-150 group-hover:scale-[1.04] group-focus-visible:scale-[1.04] group-active:scale-[0.96]">
      <span className="m-auto flex items-center justify-center">
        <AppIcon name={isActive ? "pause" : "play"} size={size} />
      </span>
      <ProgressBar progress={progress} onDark />
    </span>
  );
}

function ProgressBar({
  progress,
  onDark = false,
}: {
  progress: number;
  onDark?: boolean;
}) {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 ${
        onDark ? "bg-white/25" : "bg-[var(--line)]"
      }`}
    >
      <span
        className={`block h-full transition-[width] duration-200 motion-reduce:transition-none ${
          onDark ? "bg-white" : "bg-[var(--project-primary)]"
        }`}
        style={{ width: `${boundedProgress * 100}%` }}
      />
    </span>
  );
}

function OfficialMediaLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="official-button official-button-quiet w-fit"
    >
      {children}
      <AppIcon name="external" size={14} />
    </a>
  );
}
