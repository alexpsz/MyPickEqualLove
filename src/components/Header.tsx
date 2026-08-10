import React from "react";
import { PROJECT_CONFIG } from "../config/project";

interface HeaderProps {
  titlePrefix?: string;
  titleAccent?: string;
  subtitle?: string;
  description?: string;
  meta?: string;
  showTitle?: boolean;
}

export default function Header({
  titlePrefix = "MY PICK",
  titleAccent = PROJECT_CONFIG.groupName,
  subtitle = PROJECT_CONFIG.subtitle,
  description = "Select your favorite tracks and export a clean board for sharing.",
  meta,
  showTitle = true,
}: HeaderProps) {
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

        <div className="border-l-[3px] border-[var(--project-primary)] pl-3.5 sm:pl-5">
          <p className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[var(--foreground)]">
            {subtitle}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)] sm:mt-1.5 sm:text-sm">
            {description}
          </p>
          {meta ? (
            <p className="mt-2 text-xs font-medium text-[var(--muted)]">
              {meta}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
