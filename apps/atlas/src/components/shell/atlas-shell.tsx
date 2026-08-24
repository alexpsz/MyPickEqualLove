"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import type { ProductFamilyDestination } from "@/config/product-family-navigation";
import {
  SHELL_LOCALES,
  SHELL_MESSAGES,
  type ShellLocale,
} from "@/i18n/shell/messages";
import { ShellProvider, useShell } from "@/i18n/shell/shell-context";
import { isCurrentShellRoute, SHELL_ROUTES } from "@/i18n/shell/shell-routes";

interface AtlasShellProps {
  children: ReactNode;
  familyNavigation: readonly ProductFamilyDestination[];
}

export function AtlasShell({ children, familyNavigation }: AtlasShellProps) {
  return (
    <ShellProvider>
      <ShellFrame familyNavigation={familyNavigation}>{children}</ShellFrame>
    </ShellProvider>
  );
}

function ShellFrame({ children, familyNavigation }: AtlasShellProps) {
  const { locale, messages, setLocale, theme, toggleTheme } = useShell();
  const pathname = usePathname();
  const nextThemeLabel =
    theme === "light"
      ? messages.preferences.useDarkTheme
      : messages.preferences.useLightTheme;

  return (
    <div className="atlas-shell">
      <a className="atlas-shell__skip-link" href="#atlas-main">
        {messages.navigation.skipToMain}
      </a>
      <header className="atlas-shell__header">
        <div className="atlas-shell__bar">
          <a className="atlas-shell__brand" href={SHELL_ROUTES.home}>
            <span aria-hidden="true" className="atlas-shell__brand-mark">
              A
            </span>
            <span>Atlas</span>
          </a>

          <nav
            aria-label={messages.navigation.label}
            className="atlas-shell__navigation"
          >
            <a
              aria-current={
                isCurrentShellRoute(pathname, SHELL_ROUTES.home)
                  ? "page"
                  : undefined
              }
              href={SHELL_ROUTES.home}
            >
              {messages.navigation.home}
            </a>
            <a
              aria-current={
                isCurrentShellRoute(pathname, SHELL_ROUTES.journey)
                  ? "page"
                  : undefined
              }
              href={SHELL_ROUTES.journey}
            >
              {messages.navigation.journey}
            </a>
            <a
              aria-current={
                isCurrentShellRoute(pathname, SHELL_ROUTES.localEvent)
                  ? "page"
                  : undefined
              }
              href={SHELL_ROUTES.localEvent}
            >
              {messages.navigation.localEvent}
            </a>
            <span className="atlas-shell__product-label">
              {messages.navigation.productFamily}
            </span>
            <span className="atlas-shell__product-links">
              {familyNavigation.map((destination) => (
                <a
                  href={destination.href}
                  key={destination.siteId}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {messages.productFamily[destination.siteId]}
                  <span className="atlas-shell__sr-only">
                    {` ${messages.navigation.externalLinkSuffix}`}
                  </span>
                  <span
                    aria-hidden="true"
                    className="atlas-shell__external-mark"
                  >
                    ↗
                  </span>
                </a>
              ))}
            </span>
          </nav>

          <div className="atlas-shell__preferences">
            <label>
              <span>{messages.preferences.languageLabel}</span>
              <select
                aria-label={messages.preferences.languageLabel}
                onChange={(event) =>
                  setLocale(event.target.value as ShellLocale)
                }
                value={locale}
              >
                {SHELL_LOCALES.map((language) => (
                  <option key={language} lang={language} value={language}>
                    {SHELL_MESSAGES[language].languageName}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label={nextThemeLabel}
              className="atlas-shell__theme-button"
              onClick={toggleTheme}
              type="button"
            >
              <span aria-hidden="true">{theme === "light" ? "◐" : "☀"}</span>
              <span>{messages.preferences.themeLabel}</span>
            </button>
          </div>
        </div>
      </header>
      <main className="atlas-shell__main" id="atlas-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="atlas-shell__footer">
        <p>{messages.footer.privacy}</p>
      </footer>
    </div>
  );
}
