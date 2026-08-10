"use client";

import React from "react";
import { PROJECT_CONFIG } from "../config/project";
import { useLocale } from "../i18n/LocaleProvider";

export default function Footer() {
  const { t } = useLocale();
  const inspirationName = "mypickhasunosora";
  const [inspirationPrefix, inspirationSuffix = ""] = t("footer.inspiredBy", {
    name: inspirationName,
  }).split(inspirationName);

  return (
    <footer className="relative z-10 mt-12 flex w-full flex-col items-center justify-center border-t border-[var(--line)] px-5 py-8 text-center">
      <div className="max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
        <p>
          {t("footer.rightsDisclaimer", { group: PROJECT_CONFIG.groupName })}
        </p>
        <p className="mt-1">{t("footer.metadataDisclaimer")}</p>
        <p className="mt-1">
          {inspirationPrefix}
          <a
            href="https://mypick.rurino.dev/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--foreground)] underline decoration-[var(--project-primary)] decoration-2 underline-offset-4 transition-colors hover:text-black"
          >
            {inspirationName}
          </a>
          {inspirationSuffix}
        </p>
      </div>
    </footer>
  );
}
