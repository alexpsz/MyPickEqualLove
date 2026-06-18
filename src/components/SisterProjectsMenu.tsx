"use client";

import React, { useEffect, useRef, useState } from "react";
import { SISTER_PROJECT_LINKS } from "../config/project";

export default function SisterProjectsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center border border-black bg-white text-black transition-colors hover:bg-black hover:text-white sm:left-6 sm:top-6"
        title="Open sister MyPick sites"
        aria-label="Open sister MyPick sites"
        aria-controls="sister-projects-drawer"
        aria-expanded={isOpen}
      >
        <svg
          className="h-5 w-5 stroke-current"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="square"
            strokeLinejoin="miter"
            d="M4 7h16M4 12h16M4 17h16"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-900/35 backdrop-blur-sm"
            aria-label="Dismiss sister MyPick sites"
          />

          <aside
            id="sister-projects-drawer"
            ref={panelRef}
            tabIndex={-1}
            className="official-panel absolute inset-y-0 left-0 flex w-[min(88vw,390px)] flex-col overflow-hidden bg-white focus:outline-none"
            aria-label="Sister MyPick sites"
          >
            <div className="flex items-center justify-between gap-4 border-b border-black bg-white p-5">
              <h2 className="text-lg font-bold uppercase tracking-[0.22em] text-black">
                Other Picks
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center border border-black bg-white text-black transition-colors hover:bg-black hover:text-white"
                aria-label="Close sister MyPick sites"
              >
                <svg
                  className="h-4 w-4 fill-current"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="M10 8.586 2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z" />
                </svg>
              </button>
            </div>

            <nav className="official-stripe flex-1 overflow-y-auto p-5">
              <div className="grid gap-4">
                {SISTER_PROJECT_LINKS.map((link) => (
                  <a
                    key={link.id}
                    href={link.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group grid min-h-28 grid-cols-[1fr_auto] items-center gap-4 border border-black bg-white p-4 text-left shadow-[8px_8px_0_rgba(0,0,0,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[10px_10px_0_rgba(0,0,0,0.12)] focus:outline-none focus:ring-2 focus:ring-[var(--project-primary)]"
                  >
                    <span className="min-w-0">
                      <span className="mb-3 flex items-center gap-2">
                        <span
                          className="h-3 w-3 border border-black"
                          style={{ backgroundColor: link.themeColor }}
                          aria-hidden="true"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Sister Site
                        </span>
                      </span>
                      <span className="block break-words text-lg font-bold leading-tight text-black">
                        {link.displayName}
                      </span>
                      <span className="mt-2 block text-sm font-bold text-slate-500">
                        {link.groupName}
                      </span>
                    </span>

                    <span className="flex h-9 w-9 items-center justify-center border border-black text-black transition-colors group-hover:bg-black group-hover:text-white">
                      <svg
                        className="h-4 w-4 stroke-current"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="square"
                          strokeLinejoin="miter"
                          d="M7 17 17 7M9 7h8v8"
                        />
                      </svg>
                    </span>
                  </a>
                ))}
              </div>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
