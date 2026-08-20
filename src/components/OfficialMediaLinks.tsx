"use client";

import type { ReactNode } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import {
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
