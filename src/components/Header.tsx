import React from "react";
import { APP_BRAND } from "../config/equalLove";

const navItems = ["NEWS", "PROFILE", "DISCOGRAPHY", "FAN CLUB"];

export default function Header() {
  return (
    <header className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-8 pt-7 md:px-8 md:pb-12 md:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black pb-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.36em] text-black">
          {APP_BRAND.tagline}
        </div>
        <nav className="hidden items-center gap-7 text-[10px] font-bold uppercase tracking-[0.18em] text-black sm:flex">
          {navItems.map((item) => (
            <span key={item} className="inline-flex items-center gap-2">
              <span className="h-px w-4 bg-black" />
              {item}
            </span>
          ))}
        </nav>
      </div>

      <div className="grid gap-6 py-10 md:grid-cols-[1fr_auto] md:items-end md:py-14">
        <div>
          <div className="mb-5 inline-flex border border-black bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--equal-love-primary)]">
            Favorite Songs Board
          </div>
          <h1 className="max-w-4xl text-5xl font-light leading-none tracking-[-0.01em] text-black sm:text-7xl md:text-8xl">
            MY PICK
            <span className="mt-2 block font-bold text-[var(--equal-love-logo-blue)]">
              =LOVE
            </span>
          </h1>
        </div>

        <div className="official-panel max-w-sm p-5 md:mb-2">
          <p className="text-sm font-bold leading-relaxed text-black">
            {APP_BRAND.subtitle}
          </p>
          <p className="mt-3 border-t border-black pt-3 text-[11px] leading-relaxed text-slate-600">
            Select your favorite tracks and export a clean board for sharing.
          </p>
        </div>
      </div>
    </header>
  );
}
