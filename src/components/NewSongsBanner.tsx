"use client";

import { useLocale } from "../i18n/LocaleProvider";

interface NewSongsBannerProps {
  count: number;
  onViewNewSongs: () => void;
  onMarkSeen: () => void;
}

export default function NewSongsBanner({
  count,
  onViewNewSongs,
  onMarkSeen,
}: NewSongsBannerProps) {
  const { t } = useLocale();

  return (
    <div
      data-page-reveal
      data-new-songs-banner
      className="app-content-shell relative z-10 mb-4 px-4 [--reveal-delay:120ms] sm:mb-5 sm:px-6 md:px-8"
    >
      <section
        aria-labelledby="new-songs-banner-title"
        className="official-panel-soft flex flex-col gap-3 border-[var(--line)] bg-[var(--paper)] p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--project-primary)] uppercase">
            {t("songDiscovery.eyebrow")}
          </p>
          <h2
            id="new-songs-banner-title"
            className="mt-1 text-base font-semibold tracking-[-0.01em] text-[var(--foreground)] sm:text-lg"
          >
            {t("songDiscovery.bannerTitle", { count: String(count) })}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)] sm:text-sm">
            {t("songDiscovery.bannerDescription")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onViewNewSongs}
            className="official-button w-full sm:w-auto"
          >
            {t("songDiscovery.viewNewSongs")}
          </button>
          <button
            type="button"
            onClick={onMarkSeen}
            className="official-button official-button-quiet w-full sm:w-auto"
          >
            {t("songDiscovery.markSeen")}
          </button>
        </div>
      </section>
    </div>
  );
}
