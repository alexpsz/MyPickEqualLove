"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as m from "motion/react-m";
import {
  EXTERNAL_MY_PICK_LINKS,
  SISTER_PROJECT_LINKS,
} from "../config/project";
import { DIALOG_RETURN_KEYS, useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import MotionPresence, { type PresenceState } from "./MotionPresence";

export default function SisterProjectsMenu({
  triggerClassName = "",
}: {
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${triggerClassName} icon-button`}
        title="Open other MyPick sites"
        aria-label="Open other MyPick sites"
        aria-controls="sister-projects-drawer"
        aria-expanded={isOpen}
        data-dialog-return-key={DIALOG_RETURN_KEYS.sisterProjects}
      >
        <AppIcon name="menu" />
      </button>

      {portalReady
        ? createPortal(
            <MotionPresence value={isOpen ? true : null}>
              {(_, presenceState) => (
                <SisterProjectsDrawer
                  presenceState={presenceState}
                  onClose={() => setIsOpen(false)}
                />
              )}
            </MotionPresence>,
            document.body,
          )
        : null}
    </>
  );
}

function SisterProjectsDrawer({
  presenceState,
  onClose,
}: {
  presenceState: PresenceState;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting",
    returnFocusKey: DIALOG_RETURN_KEYS.sisterProjects,
  });

  return (
    <div
      className="motion-overlay fixed inset-0 z-50"
      data-presence={presenceState}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={presenceState === "exiting"}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/20 backdrop-blur-[2px]"
        aria-label="Dismiss other MyPick sites"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={APPLE_OPACITY}
      />

      <m.aside
        id="sister-projects-drawer"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-hidden={presenceState === "exiting"}
        inert={presenceState === "exiting"}
        aria-labelledby="sister-projects-title"
        className="apple-sheet absolute inset-y-0 left-0 flex w-[min(92vw,420px)] flex-col overflow-hidden rounded-l-none border-y-0 border-l-0 focus:outline-none"
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={APPLE_SPRING_GENTLE}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
          <div>
            <h2
              id="sister-projects-title"
              className="text-[22px] font-semibold tracking-[-0.035em] text-[var(--foreground)]"
            >
              Other Picks
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">
              Explore the MyPick family
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact"
            aria-label="Close other MyPick sites"
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          <DrawerSection label="Official MyPick sites">
            {SISTER_PROJECT_LINKS.map((link, index) => (
              <DrawerLink
                key={link.id}
                href={link.siteUrl}
                title={link.displayName}
                subtitle={link.groupName}
                color={link.themeColor}
                divided={index > 0}
              />
            ))}
          </DrawerSection>

          <div className="mt-5">
            <DrawerSection label="Community MyPicks">
              {EXTERNAL_MY_PICK_LINKS.map((link, index) => (
                <DrawerLink
                  key={link.id}
                  href={link.siteUrl}
                  title={link.displayName}
                  subtitle={link.groupName}
                  divided={index > 0}
                />
              ))}
            </DrawerSection>
          </div>

          <p className="px-1 pt-4 text-xs leading-relaxed text-[var(--muted)]">
            Community sites are maintained by their respective authors and are
            not affiliated with this project.
          </p>
        </nav>
      </m.aside>
    </div>
  );
}

function DrawerSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold text-[var(--muted)]">
        {label}
      </h3>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white">
        {children}
      </div>
    </section>
  );
}

function DrawerLink({
  href,
  title,
  subtitle,
  color,
  divided,
}: {
  href: string;
  title: string;
  subtitle: string;
  color?: string;
  divided: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex min-h-[66px] items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[var(--background)] focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] active:bg-[var(--project-primary-wash)] ${
        divided ? "border-t border-[var(--line)]" : ""
      }`}
    >
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? "var(--muted-soft)" }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-[var(--foreground)]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
          {subtitle}
        </span>
      </span>
      <AppIcon
        name="external"
        size={16}
        className="text-[var(--muted-soft)] transition-colors group-hover:text-[var(--foreground)]"
      />
    </a>
  );
}
