"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PROJECT_CONFIG, STORAGE_KEYS } from "../config/project";
import { useLocale } from "../i18n/LocaleProvider";
import {
  detectIosSafari,
  detectStandalone,
  dismissInstallHint,
  getInstallPromptMode,
  hasStoredPick,
  markInstallHintPickCompleted,
  readInstallHintState,
  shouldRegisterServiceWorker,
  type InstallPromptMode,
} from "../utils/installPrompt";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export default function InstallPrompt() {
  const { t } = useLocale();
  const [mode, setMode] = useState<InstallPromptMode | null>(null);
  const nativePromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const hasCompletedPickRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  const refreshPrompt = useCallback(() => {
    if (!isInstallEnvironmentEligible()) {
      setMode(null);
      return;
    }

    const storage = getLocalStorage();
    let hint = readInstallHintState(storage, STORAGE_KEYS.installHint);
    if (
      (hint.status === "absent" || hint.status === "valid") &&
      !hint.state?.hasCompletedPick &&
      hasStoredPick(storage, PROJECT_CONFIG.storagePrefix)
    ) {
      markInstallHintPickCompleted(storage, STORAGE_KEYS.installHint);
      hint = readInstallHintState(storage, STORAGE_KEYS.installHint);
    }

    if (hint.status !== "valid" || !hint.state) {
      hasCompletedPickRef.current = false;
      setMode(null);
      return;
    }

    hasCompletedPickRef.current = hint.state.hasCompletedPick;
    setMode(
      getInstallPromptMode({
        dismissed: hint.state.dismissed,
        hasCompletedPick: hint.state.hasCompletedPick,
        hasNativePrompt: nativePromptRef.current !== null,
        isIosSafari: detectCurrentIosSafari(),
        isStandalone: detectCurrentStandalone(),
      }),
    );
  }, []);

  useEffect(() => {
    if (!isInstallEnvironmentEligible()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      nativePromptRef.current = event as BeforeInstallPromptEvent;
      refreshPrompt();
    };
    const handleAppInstalled = () => {
      nativePromptRef.current = null;
      dismissInstallHint(getLocalStorage(), STORAGE_KEYS.installHint);
      setMode(null);
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === STORAGE_KEYS.installHint ||
        event.key.startsWith(`${PROJECT_CONFIG.storagePrefix}_`)
      ) {
        refreshPrompt();
      }
    };
    const refreshAfterInteraction = () => {
      if (hasCompletedPickRef.current) return;
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(refreshPrompt, 200);
    };

    refreshPrompt();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("click", refreshAfterInteraction, true);
    window.addEventListener("keyup", refreshAfterInteraction, true);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("click", refreshAfterInteraction, true);
      window.removeEventListener("keyup", refreshAfterInteraction, true);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, [refreshPrompt]);

  const dismiss = () => {
    dismissInstallHint(getLocalStorage(), STORAGE_KEYS.installHint);
    setMode(null);
  };

  const requestNativeInstall = async () => {
    const promptEvent = nativePromptRef.current;
    if (!promptEvent) return;

    nativePromptRef.current = null;
    setMode(null);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      dismissInstallHint(getLocalStorage(), STORAGE_KEYS.installHint);
    } catch {
      // The browser owns this prompt; failure leaves the application unchanged.
    }
  };

  if (!mode) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:p-5">
      <section
        aria-labelledby="install-prompt-title"
        aria-live="polite"
        className="apple-material pointer-events-auto mx-auto flex max-w-2xl flex-col gap-4 rounded-[var(--radius-md)] border-[var(--line)] bg-[var(--menu-surface)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.18),0_2px_10px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:gap-6 sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <h2
            id="install-prompt-title"
            className="text-base font-semibold tracking-[-0.01em] text-[var(--foreground)]"
          >
            {t("install.title")}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)] sm:text-sm">
            {mode === "ios"
              ? t("install.iosDescription")
              : t("install.description")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {mode === "native" ? (
            <button
              type="button"
              className="official-button"
              onClick={() => void requestNativeInstall()}
            >
              {t("install.action")}
            </button>
          ) : null}
          <button
            type="button"
            className="official-button official-button-quiet"
            onClick={dismiss}
          >
            {t("install.dismiss")}
          </button>
        </div>
      </section>
    </div>
  );
}

function detectCurrentStandalone() {
  let displayModeStandalone = false;
  try {
    displayModeStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
  } catch {
    // Older browsers can still expose the iOS standalone flag.
  }

  return detectStandalone({
    displayModeStandalone,
    navigatorStandalone:
      (navigator as NavigatorWithStandalone).standalone === true,
  });
}

function detectCurrentIosSafari() {
  return detectIosSafari({
    maxTouchPoints: navigator.maxTouchPoints,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  });
}

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isInstallEnvironmentEligible() {
  return shouldRegisterServiceWorker({
    isProduction: process.env.NODE_ENV === "production",
    isSecureContext: window.isSecureContext,
    isTopLevel: window.parent === window,
    serviceWorkerSupported: "serviceWorker" in navigator,
  });
}
