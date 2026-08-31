"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { usePathname } from "next/navigation";

import type { ProductFamilyDestination } from "@/config/product-family-navigation";
import { SHELL_LOCALES, SHELL_MESSAGES } from "@/i18n/shell/messages";
import {
  ShellProvider,
  useShell,
  type ShellLocalePreference,
} from "@/i18n/shell/shell-context";
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
  const { messages, theme, toggleTheme } = useShell();
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
        <span aria-hidden="true" className="atlas-shell__accent-line" />
        <div className="atlas-shell__bar">
          <ProductFamilyMenu familyNavigation={familyNavigation} />
          <a className="atlas-shell__brand" href={SHELL_ROUTES.home}>
            ATLAS
          </a>
          <nav
            aria-label={messages.navigation.label}
            className="atlas-shell__navigation"
          >
            <a
              aria-current={
                isCurrentShellRoute(pathname, SHELL_ROUTES.home) ||
                isCurrentShellRoute(pathname, SHELL_ROUTES.events)
                  ? "page"
                  : undefined
              }
              href={SHELL_ROUTES.home}
            >
              {messages.navigation.events}
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
                isCurrentShellRoute(pathname, SHELL_ROUTES.memory)
                  ? "page"
                  : undefined
              }
              href={SHELL_ROUTES.memory}
            >
              {messages.navigation.memory}
            </a>
          </nav>
          <div className="atlas-shell__preferences">
            <button
              aria-label={nextThemeLabel}
              className="atlas-shell__icon-button"
              onClick={toggleTheme}
              title={nextThemeLabel}
              type="button"
            >
              <ShellIcon name={theme === "light" ? "moon" : "sun"} />
            </button>
            <ShellLanguageMenu />
          </div>
        </div>
      </header>
      <main className="atlas-shell__main" id="atlas-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="atlas-shell__footer">
        <p>
          <ShellIcon name="lock" />
          <span>{messages.footer.privacy}</span>
        </p>
      </footer>
    </div>
  );
}

function ProductFamilyMenu({
  familyNavigation,
}: Pick<AtlasShellProps, "familyNavigation">) {
  const { messages } = useShell();
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestoreFocus, isOpen]);

  return (
    <div className="atlas-shell__product-menu" ref={rootRef}>
      <button
        aria-controls={isOpen ? panelId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={messages.navigation.productMenuLabel}
        className="atlas-shell__icon-button"
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <ShellIcon name="menu" />
      </button>
      {isOpen ? (
        <div
          aria-label={messages.navigation.productFamily}
          className="atlas-shell__product-panel"
          id={panelId}
          role="dialog"
        >
          <p>{messages.navigation.productFamily}</p>
          <div className="atlas-shell__product-panel-links">
            {familyNavigation.map((destination) => (
              <a
                href={destination.href}
                key={destination.siteId}
                onClick={() => setIsOpen(false)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span>{messages.productFamily[destination.siteId]}</span>
                <span className="atlas-shell__sr-only">
                  {` ${messages.navigation.externalLinkSuffix}`}
                </span>
                <ShellIcon name="external" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const LANGUAGE_OPTIONS: readonly ShellLocalePreference[] = [
  "auto",
  ...SHELL_LOCALES,
];

function ShellLanguageMenu() {
  const { locale, localePreference, messages, setLocalePreference } =
    useShell();
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, LANGUAGE_OPTIONS.indexOf(localePreference));
  const closeAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => {
      optionRefs.current[selectedIndex]?.focus({ preventScroll: true });
    }, 0);
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestoreFocus, isOpen, selectedIndex]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }

    const currentIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex =
        (currentIndex + 1 + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length;
    } else if (event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = LANGUAGE_OPTIONS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className="atlas-shell__language-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
      ref={rootRef}
    >
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${messages.preferences.languageLabel}: ${messages.languageName}`}
        className="atlas-shell__icon-button"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setIsOpen(true);
        }}
        ref={triggerRef}
        title={`${messages.preferences.languageLabel}: ${messages.languageName}`}
        type="button"
      >
        <span aria-hidden="true" className="atlas-shell__language-glyph">
          <ShellIcon name="globe" />
          <ShellIcon name="chevron-down" />
        </span>
      </button>
      {isOpen ? (
        <div
          aria-label={messages.preferences.languageMenuLabel}
          className="atlas-shell__language-panel"
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          role="menu"
        >
          {LANGUAGE_OPTIONS.map((option, index) => {
            const selected = option === localePreference;
            const optionLocale = option === "auto" ? locale : option;
            const optionLabel =
              option === "auto"
                ? messages.preferences.followBrowser
                : SHELL_MESSAGES[option].languageName;

            return (
              <div key={option}>
                {index === 1 ? (
                  <div
                    className="atlas-shell__menu-separator"
                    role="separator"
                  />
                ) : null}
                <button
                  aria-checked={selected}
                  className="atlas-shell__language-option"
                  onClick={() => {
                    setLocalePreference(option);
                    closeAndRestoreFocus();
                  }}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  role="menuitemradio"
                  tabIndex={-1}
                  type="button"
                >
                  <span className="atlas-shell__language-option-copy">
                    <span lang={optionLocale}>{optionLabel}</span>
                    {option === "auto" ? (
                      <small lang={locale}>{messages.languageName}</small>
                    ) : null}
                  </span>
                  <span aria-hidden="true" className="atlas-shell__check-slot">
                    {selected ? <ShellIcon name="check" /> : null}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type ShellIconName =
  | "check"
  | "chevron-down"
  | "external"
  | "globe"
  | "lock"
  | "menu"
  | "moon"
  | "sun";

function ShellIcon({ name }: { name: ShellIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="atlas-shell__icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      {name === "check" ? <path d="m5.5 12.25 4.1 4.1L18.75 7.2" /> : null}
      {name === "chevron-down" ? <path d="m7 9.5 5 4.75 5-4.75" /> : null}
      {name === "external" ? (
        <>
          <path d="M8.25 15.75 16.5 7.5" />
          <path d="M10.25 7.5h6.25v6.25" />
        </>
      ) : null}
      {name === "globe" ? (
        <>
          <circle cx="12" cy="12" r="8.25" />
          <path d="M3.75 12h16.5" />
          <path d="M12 3.75c2.2 2.25 3.25 5 3.25 8.25S14.2 18 12 20.25C9.8 18 8.75 15.25 8.75 12S9.8 6 12 3.75Z" />
        </>
      ) : null}
      {name === "lock" ? (
        <>
          <rect height="9" rx="2" width="12" x="6" y="11" />
          <path d="M9 11V8a3 3 0 0 1 6 0v3" />
        </>
      ) : null}
      {name === "menu" ? <path d="M5 7.25h14M5 12h14M5 16.75h14" /> : null}
      {name === "moon" ? (
        <path d="M18.25 15.45A7.75 7.75 0 0 1 8.55 5.75a7.75 7.75 0 1 0 9.7 9.7Z" />
      ) : null}
      {name === "sun" ? (
        <>
          <circle cx="12" cy="12" r="3.75" />
          <path d="M12 2.75v2M12 19.25v2M2.75 12h2M19.25 12h2M5.46 5.46l1.42 1.42M17.12 17.12l1.42 1.42M18.54 5.46l-1.42 1.42M6.88 17.12l-1.42 1.42" />
        </>
      ) : null}
    </svg>
  );
}
