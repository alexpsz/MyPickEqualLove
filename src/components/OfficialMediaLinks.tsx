"use client";

import type { ReactNode } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import {
  getPrimaryOfficialMediaLink,
  getOfficialMediaLinks,
  OFFICIAL_MEDIA_MESSAGE_KEYS,
} from "../utils/officialMedia";
import AppIcon from "./AppIcon";

export default function OfficialMediaLinks({
  songId,
  headingLevel = "h2",
}: {
  songId: string;
  headingLevel?: "h2" | "h3";
}) {
  const { t } = useLocale();
  const links = getOfficialMediaLinks(songId);

  if (links.length === 0) {
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
      </div>
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

  if (!link) {
    return <div className={className}>{children}</div>;
  }

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
