"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import type { Member, Song } from "../schema/music";
import { SOURCE_STATUS_MESSAGE_KEYS } from "../utils/songMetadata";
import AppIcon from "./AppIcon";
import JapaneseContent from "./JapaneseContent";

/**
 * 歌曲详情弹窗与静态歌曲页共用的成员与来源区块。两个界面的区块外观不同：
 * 弹窗把每个区块画成卡片并使用 h3，静态页使用平铺 section 与 h2。
 */
export type SongSectionSurface = "modal" | "page";

export function SongMembersSection({
  song,
  members,
  surface,
}: {
  song: Song;
  members: Member[];
  surface: SongSectionSurface;
}) {
  const { t } = useLocale();
  const membersById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])),
    [members],
  );
  const centerMembers = getMembers(song.centerMemberIds, membersById);
  const participatingMembers = getMembers(song.memberIds, membersById);

  if (centerMembers.length === 0 && participatingMembers.length === 0) {
    return null;
  }

  return (
    <SongSectionShell surface={surface} title={t("songDetail.members")}>
      {centerMembers.length > 0 ? (
        <MemberList label={t("songDetail.center")} members={centerMembers} />
      ) : null}
      {participatingMembers.length > 0 ? (
        <MemberList
          label={t("songDetail.participatingMembers")}
          members={participatingMembers}
        />
      ) : null}
    </SongSectionShell>
  );
}

export function SongSourcesSection({
  song,
  surface,
}: {
  song: Song;
  surface: SongSectionSurface;
}) {
  const { t } = useLocale();

  if (!song.sourceStatus && !song.officialUrl && !song.creditSourceUrl) {
    return null;
  }

  return (
    <SongSectionShell surface={surface} title={t("songDetail.sources")}>
      {song.sourceStatus ? (
        <p className="text-sm text-[var(--foreground)]">
          {t(SOURCE_STATUS_MESSAGE_KEYS[song.sourceStatus])}
        </p>
      ) : null}
      {song.officialUrl || song.creditSourceUrl ? (
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
      ) : null}
    </SongSectionShell>
  );
}

function SongSectionShell({
  surface,
  title,
  children,
}: {
  surface: SongSectionSurface;
  title: string;
  children: ReactNode;
}) {
  const headingClassName =
    "text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]";

  if (surface === "page") {
    return (
      <section className="mt-6">
        <h2 className={headingClassName}>{title}</h2>
        <div className="mt-3 grid gap-3">{children}</div>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] p-4">
      <h3 className={headingClassName}>{title}</h3>
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

function getMembers(
  memberIds: string[] | undefined,
  membersById: Record<string, Member>,
) {
  return Array.from(new Set(memberIds ?? []))
    .map((memberId) => membersById[memberId])
    .filter((member): member is Member => Boolean(member));
}
