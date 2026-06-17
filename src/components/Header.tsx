import React from "react";
import { PROJECT_CONFIG } from "../config/project";

export default function Header() {
  return (
    <header className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-8 pt-7 md:px-8 md:pb-12 md:pt-10">
      <div className="grid gap-6 py-10 md:grid-cols-[1fr_auto] md:items-end md:py-14">
        <div>
          <h1 className="max-w-4xl text-5xl font-light leading-none tracking-[-0.01em] text-black sm:text-7xl md:text-8xl">
            MY PICK
            <span className="mt-2 block font-bold text-[var(--project-accent)]">
              {PROJECT_CONFIG.groupName}
            </span>
          </h1>
        </div>

        <div className="official-panel max-w-sm p-5 md:mb-2">
          <p className="text-sm font-bold leading-relaxed text-black">
            {PROJECT_CONFIG.subtitle}
          </p>
          <p className="mt-3 border-t border-black pt-3 text-[11px] leading-relaxed text-slate-600">
            Select your favorite tracks and export a clean board for sharing.
          </p>
        </div>
      </div>
    </header>
  );
}
