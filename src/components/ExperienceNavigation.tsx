"use client";

import React, { useEffect, useRef } from "react";
import {
  PUBLISHED_LIVE_EXPERIENCES,
  STANDARD_PICK_EXPERIENCE,
} from "../data/pickExperiences";

interface ExperienceNavigationProps {
  activeExperienceId: string;
}

export default function ExperienceNavigation({
  activeExperienceId,
}: ExperienceNavigationProps) {
  const activeItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  }, [activeExperienceId]);

  if (PUBLISHED_LIVE_EXPERIENCES.length === 0) {
    return null;
  }

  const items = [
    {
      id: STANDARD_PICK_EXPERIENCE.id,
      href: STANDARD_PICK_EXPERIENCE.canonicalPath,
      label: "通常版 My Pick",
    },
    ...PUBLISHED_LIVE_EXPERIENCES.map((experience) => ({
      id: experience.id,
      href: experience.canonicalPath,
      label: experience.title,
    })),
  ];

  return (
    <nav
      aria-label="Pick experience navigation"
      data-page-reveal
      className="app-content-shell relative z-10 mb-3 flex px-4 sm:px-6 md:px-8"
    >
      <div className="relative max-w-full after:pointer-events-none after:absolute after:inset-y-1 after:right-0 after:w-8 after:rounded-r-[var(--radius-sm)] after:bg-gradient-to-l after:from-white after:to-transparent sm:after:hidden">
        <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,0.035)]">
          {items.map((item) => {
            const active = item.id === activeExperienceId;
            return (
              <a
                key={item.id}
                ref={active ? activeItemRef : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-[9px] border px-4 py-2.5 text-[13px] font-medium tracking-[-0.01em] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] ${
                  active
                    ? "border-transparent bg-[var(--project-primary)] text-[var(--project-contrast)] shadow-sm"
                    : "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
