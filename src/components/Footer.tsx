import React from "react";
import { PROJECT_CONFIG } from "../config/project";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-14 flex w-full flex-col items-center justify-center gap-5 border-t border-black bg-white px-4 py-8 text-center">
      <div className="max-w-2xl text-[11px] leading-relaxed text-slate-500">
        <p>
          Unofficial fan-made selection board. {PROJECT_CONFIG.groupName} names, song titles, and
          related images belong to their respective rights holders.
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
            className="font-medium text-[var(--project-accent)] underline-offset-2 hover:underline"
          >
            mypickhasunosora
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
