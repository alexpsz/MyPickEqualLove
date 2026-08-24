"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PROJECT_CONFIG, PROJECT_THEME_COLOR } from "../config/project";
import { useLocale } from "../i18n/LocaleProvider";
import type { Member, Song } from "../schema/music";
import {
  RELEASE_TYPE_MESSAGE_KEYS,
  TRACK_TYPE_MESSAGE_KEYS,
} from "../utils/songMetadata";
import { getConfirmedSongCredits } from "../utils/songCredits";
import { getSongPagePath, SONG_CATALOG_PATH } from "../utils/songRoutes";
import AppTopBar from "./AppTopBar";
import Footer from "./Footer";
import JapaneseContent from "./JapaneseContent";
import OfficialMediaLinks, {
  OfficialMediaCoverLink,
} from "./OfficialMediaLinks";
import { SongMembersSection, SongSourcesSection } from "./SongDetailSections";

const SONG_CATALOG_BAR_BACKGROUND = `linear-gradient(90deg, ${PROJECT_THEME_COLOR}, var(--project-accent))`;

type SongCatalogItem = Pick<Song, "id" | "title" | "coverUrl" | "releaseDate">;

export function SongCatalogIndex({
  songs,
}: {
  songs: readonly SongCatalogItem[];
}) {
  const { t } = useLocale();

  return (
    <div className="site-shell relative flex min-h-full flex-1 flex-col">
      <AppTopBar memberColorBackground={SONG_CATALOG_BAR_BACKGROUND} />
      <main className="app-content-shell flex flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-9 md:px-8">
        <SongNavigation showCatalogLink={false} />
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--project-primary)]">
            {t("songCatalog.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
            {t("songCatalog.title", { group: PROJECT_CONFIG.groupName })}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {t("songCatalog.description", { count: songs.length })}
          </p>
        </header>

        <section
          aria-label={t("songCatalog.title", {
            group: PROJECT_CONFIG.groupName,
          })}
          className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {songs.map((song) => (
            <Link
              key={song.id}
              href={getSongPagePath(song.id)}
              prefetch={false}
              aria-label={t("songCatalog.openSongAria", {
                title: song.title.ja,
              })}
              className="official-panel group flex min-w-0 gap-3 p-3 transition-[border-color,box-shadow,transform] duration-150 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-panel)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] active:scale-[0.99]"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)]">
                <Image
                  src={song.coverUrl}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 py-0.5">
                <h2 className="truncate text-base font-semibold tracking-[-0.015em] text-[var(--foreground)]">
                  <JapaneseContent>{song.title.ja}</JapaneseContent>
                </h2>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">
                  {song.title.romaji}
                </p>
                <p className="mt-3 text-xs font-medium text-[var(--muted-soft)]">
                  {song.releaseDate?.slice(0, 4) ?? ""}
                </p>
              </div>
            </Link>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export function SongCatalogDetail({
  song,
  members,
}: {
  song: Song;
  members: Member[];
}) {
  const { t } = useLocale();
  const credits = getConfirmedSongCredits(song);
  const hasReleaseInformation = Boolean(
    song.releaseDate || song.releaseTitle || song.releaseType || song.trackType,
  );

  return (
    <div className="site-shell relative flex min-h-full flex-1 flex-col">
      <AppTopBar memberColorBackground={SONG_CATALOG_BAR_BACKGROUND} />
      <main className="app-content-shell flex flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-9 md:px-8">
        <SongNavigation />
        <article className="mx-auto mt-6 w-full max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start lg:gap-10">
            <OfficialMediaCoverLink
              songId={song.id}
              title={song.title.ja}
              className="relative block aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-soft)] shadow-[var(--shadow-panel)]"
            >
              <Image
                src={song.coverUrl}
                alt={t("pick.coverAlt", { title: song.title.ja })}
                fill
                priority
                sizes="(min-width: 1024px) 380px, min(100vw - 2rem, 560px)"
                className="object-cover"
              />
            </OfficialMediaCoverLink>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--project-primary)]">
                {t("songDetail.eyebrow")}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
                <JapaneseContent>{song.title.ja}</JapaneseContent>
              </h1>
              <p className="mt-2 text-base text-[var(--muted)] sm:text-lg">
                {song.title.romaji}
              </p>
              {song.title.en ? (
                <p className="mt-1 text-sm text-[var(--muted-soft)]">
                  {song.title.en}
                </p>
              ) : null}

              {hasReleaseInformation ? (
                <DetailSection title={t("songCatalog.releaseInformation")}>
                  <dl className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]">
                    {song.releaseDate ? (
                      <DetailRow label={t("songDetail.releaseDate")}>
                        <time dateTime={song.releaseDate}>
                          {song.releaseDate}
                        </time>
                      </DetailRow>
                    ) : null}
                    {song.releaseTitle ? (
                      <DetailRow label={t("songDetail.releaseWork")}>
                        <div>
                          <JapaneseContent>
                            {song.releaseTitle.ja}
                          </JapaneseContent>
                          {song.releaseTitle.romaji ? (
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {song.releaseTitle.romaji}
                            </p>
                          ) : null}
                          {song.releaseTitle.en ? (
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {song.releaseTitle.en}
                            </p>
                          ) : null}
                        </div>
                      </DetailRow>
                    ) : null}
                    {song.releaseType ? (
                      <DetailRow label={t("songDetail.releaseType")}>
                        {t(RELEASE_TYPE_MESSAGE_KEYS[song.releaseType])}
                      </DetailRow>
                    ) : null}
                    {song.trackType ? (
                      <DetailRow label={t("songDetail.trackType")}>
                        {t(TRACK_TYPE_MESSAGE_KEYS[song.trackType])}
                      </DetailRow>
                    ) : null}
                  </dl>
                </DetailSection>
              ) : null}

              <SongMembersSection
                song={song}
                members={members}
                surface="page"
              />

              <DetailSection title={t("songDetail.credits")}>
                {credits ? (
                  <dl className="grid gap-3">
                    <CreditRow
                      label={t("songDetail.lyricist")}
                      ja={credits.lyricist.ja}
                      romaji={credits.lyricist.romaji}
                    />
                    <CreditRow
                      label={t("songDetail.composer")}
                      ja={credits.composer.ja}
                      romaji={credits.composer.romaji}
                    />
                    <CreditRow
                      label={t("songDetail.arranger")}
                      ja={credits.arranger.ja}
                      romaji={credits.arranger.romaji}
                    />
                  </dl>
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    {t("credits.unconfirmed")}
                  </p>
                )}
              </DetailSection>

              <SongSourcesSection song={song} surface="page" />

              <OfficialMediaLinks songId={song.id} className="mt-6" />
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

function SongNavigation({
  showCatalogLink = true,
}: {
  showCatalogLink?: boolean;
}) {
  const { t } = useLocale();

  return (
    <nav
      aria-label={t("songCatalog.eyebrow")}
      className="flex flex-wrap items-center gap-2"
    >
      <Link
        href="/"
        prefetch={false}
        className="official-button official-button-quiet"
      >
        {t("songCatalog.backToMyPick")}
      </Link>
      {showCatalogLink ? (
        <Link
          href={SONG_CATALOG_PATH}
          prefetch={false}
          className="official-button official-button-quiet"
        >
          {t("songCatalog.backToCatalog")}
        </Link>
      ) : null}
    </nav>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-t border-[var(--line)] px-4 py-3 first:border-t-0 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] text-sm text-[var(--foreground)]">
        {children}
      </dd>
    </div>
  );
}

function CreditRow({
  label,
  ja,
  romaji,
}: {
  label: string;
  ja: string;
  romaji: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] text-sm text-[var(--foreground)]">
        <JapaneseContent>{ja}</JapaneseContent>
        <span className="ml-2 text-xs text-[var(--muted)]">{romaji}</span>
      </dd>
    </div>
  );
}
