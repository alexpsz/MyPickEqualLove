"use client";

import React, { useId, useState } from "react";
import { PROJECT_CONFIG, PROJECT_ID } from "../config/project";
import { localizeProjectCopy } from "../i18n/content";
import { useLocale } from "../i18n/LocaleProvider";
import AppIcon from "./AppIcon";

interface HeaderProps {
  titlePrefix?: string;
  titleAccent?: string;
  subtitle?: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  showTitle?: boolean;
  collapseDetailsOnMobile?: boolean;
}

export default function Header({
  titlePrefix = "MY PICK",
  titleAccent = PROJECT_CONFIG.groupName,
  subtitle,
  description,
  meta,
  showTitle = true,
  collapseDetailsOnMobile = false,
}: HeaderProps) {
  const { locale, t } = useLocale();
  const projectCopy = localizeProjectCopy(PROJECT_ID, locale);
  const resolvedSubtitle = subtitle ?? projectCopy.subtitle;
  const resolvedDescription = description ?? projectCopy.description;
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);
  const mobileDetailsId = useId();

  const subtitleContent = (
    <p className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[var(--foreground)]">
      {resolvedSubtitle}
    </p>
  );
  const extendedDetails = (
    <>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)] sm:mt-1.5 sm:text-sm">
        {resolvedDescription}
      </p>
      {meta ? (
        <p className="mt-2 text-xs font-medium text-[var(--muted)]">{meta}</p>
      ) : null}
    </>
  );
  const details = (
    <div className="border-l-[3px] border-[var(--project-primary)] pl-3.5 sm:pl-5">
      {collapseDetailsOnMobile ? (
        <>
          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setIsMobileDetailsOpen((open) => !open)}
              aria-expanded={isMobileDetailsOpen}
              aria-controls={mobileDetailsId}
              aria-label={
                isMobileDetailsOpen
                  ? t("header.hideActivityDetails")
                  : t("header.showActivityDetails")
              }
              className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[var(--foreground)]">
                {resolvedSubtitle}
              </span>
              <AppIcon
                name="chevron-down"
                size={14}
                strokeWidth={1.5}
                className={`text-[var(--muted-soft)] transition-transform duration-150 ${
                  isMobileDetailsOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              id={mobileDetailsId}
              className={isMobileDetailsOpen ? "block sm:hidden" : "hidden"}
            >
              {extendedDetails}
            </div>
          </div>
          <div className="hidden sm:block">
            {subtitleContent}
            {extendedDetails}
          </div>
        </>
      ) : (
        <>
          {subtitleContent}
          {extendedDetails}
        </>
      )}
    </div>
  );

  return (
    <header
      data-page-reveal
      className="app-content-shell relative z-10 px-4 py-3.5 sm:px-6 sm:py-6 md:px-8"
    >
      <div
        className={
          showTitle
            ? "grid gap-2.5 sm:gap-4 md:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] md:items-center md:gap-8"
            : "max-w-2xl"
        }
      >
        {showTitle ? (
          <h1 className="brand-type flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[clamp(1.875rem,4vw,2.75rem)] font-medium leading-[1.02] tracking-[-0.045em] text-[var(--foreground)]">
            <span>{titlePrefix}</span>
            <span className="font-semibold">{titleAccent}</span>
          </h1>
        ) : null}

        {details}
      </div>
    </header>
  );
}
