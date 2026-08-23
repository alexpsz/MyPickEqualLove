"use client";

import { useEffect } from "react";
import { SERVICE_WORKER_CONFIG } from "../config/project";
import { shouldRegisterServiceWorker } from "../utils/installPrompt";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      !shouldRegisterServiceWorker({
        isProduction: process.env.NODE_ENV === "production",
        isSecureContext: window.isSecureContext,
        isTopLevel: window.parent === window,
        serviceWorkerSupported: "serviceWorker" in navigator,
      })
    ) {
      return;
    }

    const register = () => {
      void navigator.serviceWorker
        .register(SERVICE_WORKER_CONFIG.scriptUrl, {
          scope: SERVICE_WORKER_CONFIG.scope,
          updateViaCache: "none",
        })
        .catch(() => {
          // Offline support is progressive enhancement; the app remains usable.
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
