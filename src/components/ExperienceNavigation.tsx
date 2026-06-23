import React from "react";
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
      className="relative z-10 mx-auto mb-5 flex w-full max-w-7xl px-5 md:px-8"
    >
      <div className="no-scrollbar flex max-w-full gap-2 overflow-x-auto border-y border-black bg-white px-2 py-2">
        {items.map((item) => {
          const active = item.id === activeExperienceId;
          return (
            <a
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                active
                  ? "border-[var(--project-primary)] bg-[var(--project-primary)] text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-black hover:text-black"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
