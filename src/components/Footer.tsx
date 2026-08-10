import React from "react";
import { PROJECT_CONFIG } from "../config/project";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-12 flex w-full flex-col items-center justify-center border-t border-[var(--line)] px-5 py-8 text-center">
      <div className="max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
        <p>
          Unofficial fan-made selection board. {PROJECT_CONFIG.groupName} names,
          song titles, and related images belong to their respective rights
          holders.
        </p>
        <p className="mt-1">
          Song metadata is synced from public discography and credit sources;
          local covers are used for static image export.
        </p>
        <p className="mt-1">
          Inspired by{" "}
          <a
            href="https://mypick.rurino.dev/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--foreground)] underline decoration-[var(--project-primary)] decoration-2 underline-offset-4 transition-colors hover:text-black"
          >
            mypickhasunosora
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
