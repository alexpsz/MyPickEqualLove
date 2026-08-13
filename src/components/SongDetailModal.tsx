"use client";

import { useMemo, useRef, type ReactNode } from "react";
import * as m from "motion/react-m";
import Image from "next/image";
import { useLocale } from "../i18n/LocaleProvider";
import type { Member, Song } from "../schema/music";
import { getConfirmedSongCredits } from "../utils/songCredits";
import {
  RELEASE_TYPE_MESSAGE_KEYS,
  SOURCE_STATUS_MESSAGE_KEYS,
  TRACK_TYPE_MESSAGE_KEYS,
} from "../utils/songMetadata";
import { useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import JapaneseContent from "./JapaneseContent";
import type { PresenceState } from "./MotionPresence";
import type { SearchSelectionMode } from "./SearchModal";

interface SongDetailModalProps {
  song: Song;
  members: Member[];
  isRecentlyViewed: boolean;
  selectionMode: SearchSelectionMode;
  isCandidate?: boolean;
  candidateDisabled?: boolean;
  presenceState: PresenceState;
  onClose: () => void;
  onSelect: (song: Song) => void;
  onToggleCandidate: (song: Song) => void;
}

export default function SongDetailModal({
  song,
  members,
  isRecentlyViewed,
  selectionMode,
  isCandidate = false,
  candidateDisabled = false,
  presenceState,
  onClose,
  onSelect,
  onToggleCandidate,
}: SongDetailModalProps) {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const membersById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])),
    [members],
  );
  const participatingMembers = getMembers(song.memberIds, membersById);
  const centerMembers = getMembers(song.centerMemberIds, membersById);
  const credits = getConfirmedSongCredits(song);
  const titleId = `song-detail-${song.id}-title`;
  const isExiting = presenceState === "exiting";
  const isAssistantShortlistMode = selectionMode === "assistant-shortlist";

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: !isExiting,
    initialFocusRef: closeButtonRef,
  });

  return (
    <div
      className="motion-overlay fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      data-presence={presenceState}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={isExiting}
        tabIndex={-1}
        aria-hidden={isExiting}
        aria-label={t("songDetail.closeAria")}
        className="overlay-scrim absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={APPLE_OPACITY}
      />

      <m.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-hidden={isExiting}
        inert={isExiting}
        aria-labelledby={titleId}
        className="apple-sheet relative z-10 flex h-[100dvh] max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-none border-x-0 border-b-0 focus:outline-none sm:h-auto sm:max-h-[88dvh] sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {t("songDetail.eyebrow")}
            </p>
            <h2
              id={titleId}
              className="mt-0.5 truncate text-[22px] font-semibold tracking-[-0.035em] text-[var(--foreground)]"
            >
              <JapaneseContent>{song.title.ja}</JapaneseContent>
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact shrink-0"
            aria-label={t("songDetail.closeAria")}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--background)] px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(220px,0.82fr)_minmax(0,1.18fr)]">
            <div className="min-w-0">
              <div className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white shadow-sm">
                <Image
                  src={song.coverUrl}
                  alt={t("pick.coverAlt", { title: song.title.ja })}
                  fill
                  sizes="(min-width: 640px) 280px, calc(100vw - 2rem)"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isAssistantShortlistMode && isCandidate ? (
                  <StatusBadge>{t("assistant.candidate")}</StatusBadge>
                ) : null}
                {isRecentlyViewed ? (
                  <StatusBadge muted>{t("search.recentlyViewed")}</StatusBadge>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <dl className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white">
                <DetailRow label={t("songDetail.japaneseTitle")}>
                  <JapaneseContent>{song.title.ja}</JapaneseContent>
                </DetailRow>
                <DetailRow label={t("songDetail.romajiTitle")}>
                  {song.title.romaji}
                </DetailRow>
                {song.title.en ? (
                  <DetailRow label={t("songDetail.englishTitle")}>
                    {song.title.en}
                  </DetailRow>
                ) : null}
                {song.releaseDate ? (
                  <DetailRow label={t("songDetail.releaseDate")}>
                    <time dateTime={song.releaseDate}>{song.releaseDate}</time>
                  </DetailRow>
                ) : null}
                {song.releaseTitle ? (
                  <DetailRow label={t("songDetail.releaseWork")}>
                    <div>
                      <JapaneseContent>{song.releaseTitle.ja}</JapaneseContent>
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

              {participatingMembers.length > 0 || centerMembers.length > 0 ? (
                <DetailSection title={t("songDetail.members")}>
                  {centerMembers.length > 0 ? (
                    <MemberList
                      label={t("songDetail.center")}
                      members={centerMembers}
                    />
                  ) : null}
                  {participatingMembers.length > 0 ? (
                    <MemberList
                      label={t("songDetail.participatingMembers")}
                      members={participatingMembers}
                    />
                  ) : null}
                </DetailSection>
              ) : null}

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

              {song.sourceStatus || song.officialUrl || song.creditSourceUrl ? (
                <DetailSection title={t("songDetail.sources")}>
                  {song.sourceStatus ? (
                    <p className="text-sm text-[var(--foreground)]">
                      {t(SOURCE_STATUS_MESSAGE_KEYS[song.sourceStatus])}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {song.officialUrl ? (
                      <SourceLink href={song.officialUrl}>
                        {t("songDetail.officialSource")}
                      </SourceLink>
                    ) : null}
                    {song.creditSourceUrl ? (
                      <SourceLink href={song.creditSourceUrl}>
                        {t("songDetail.creditSource")}
                      </SourceLink>
                    ) : null}
                  </div>
                </DetailSection>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-white px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={() => onToggleCandidate(song)}
            disabled={candidateDisabled}
            aria-pressed={isCandidate}
            aria-label={
              isCandidate
                ? t("assistant.removeCandidateAria", {
                    title: song.title.ja,
                  })
                : t("assistant.addCandidateAria", {
                    title: song.title.ja,
                  })
            }
            className={`official-button disabled:cursor-not-allowed disabled:opacity-45 ${
              isAssistantShortlistMode
                ? "official-button-primary"
                : isCandidate
                  ? "border-[var(--project-primary)] bg-[var(--project-primary-wash)]"
                  : "official-button-quiet"
            }`}
          >
            <AppIcon name={isCandidate ? "check" : "music"} size={16} />
            {isCandidate
              ? t("assistant.candidate")
              : t("assistant.addCandidate")}
          </button>
          {!isAssistantShortlistMode ? (
            <button
              type="button"
              onClick={() => onSelect(song)}
              className="official-button official-button-primary"
            >
              <AppIcon name="plus" size={16} />
              {t("songDetail.selectSong")}
            </button>
          ) : null}
        </div>
      </m.div>
    </div>
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
    <div className="grid gap-1 border-t border-[var(--line)] px-4 py-3 first:border-t-0 sm:grid-cols-[128px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] text-sm text-[var(--foreground)]">
        {children}
      </dd>
    </div>
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
    <section className="rounded-[var(--radius-md)] border border-[var(--line)] bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        {title}
      </h3>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function MemberList({ label, members }: { label: string; members: Member[] }) {
  const { t } = useLocale();
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {members.map((member) => (
          <span
            key={member.id}
            className="rounded-full border border-[var(--line)] bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--foreground)]"
          >
            <JapaneseContent>{member.name.ja}</JapaneseContent>
            {member.active === false ? (
              <span className="ml-1 text-[var(--muted)]">
                · {t("search.graduated")}
              </span>
            ) : null}
          </span>
        ))}
      </div>
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

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="official-button official-button-quiet w-fit"
    >
      {children}
      <AppIcon name="external" size={14} />
    </a>
  );
}

function StatusBadge({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        muted
          ? "bg-white text-[var(--muted)]"
          : "bg-[var(--project-primary-wash)] text-[var(--foreground)]"
      }`}
    >
      {children}
    </span>
  );
}

function getMembers(
  memberIds: string[] | undefined,
  membersById: Record<string, Member>,
) {
  return Array.from(new Set(memberIds ?? []))
    .map((memberId) => membersById[memberId])
    .filter((member): member is Member => Boolean(member));
}
