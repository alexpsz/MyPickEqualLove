"use client";

import { useId } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import type { Member } from "../schema/music";

interface OshimenPreferenceControlProps {
  members: readonly Member[];
  memberId: string | null;
  soloSongCount: number | null;
  disabled?: boolean;
  onChange: (memberId: string | null) => void;
}

export default function OshimenPreferenceControl({
  members,
  memberId,
  soloSongCount,
  disabled = false,
  onChange,
}: OshimenPreferenceControlProps) {
  const { t } = useLocale();
  const selectId = useId();
  const sortedMembers = members
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <div
      data-oshimen-preference="true"
      className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--background)] p-3"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={selectId} className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
            {t("oshimen.label")}
          </span>
          <select
            id={selectId}
            value={memberId ?? ""}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value || null)}
            className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{t("oshimen.none")}</option>
            {sortedMembers.map((member) => (
              <option key={member.id} value={member.id} lang="ja">
                {member.name.ja}
              </option>
            ))}
          </select>
        </label>

        {memberId ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="official-button official-button-quiet min-h-11 w-auto !px-3 text-[12px]"
          >
            {t("oshimen.clear")}
          </button>
        ) : null}
      </div>

      {memberId && soloSongCount !== null ? (
        <p
          data-oshimen-solo-count={soloSongCount}
          className="text-[12px] font-medium leading-relaxed text-[var(--muted)]"
        >
          {t("oshimen.soloCount", { count: soloSongCount })}
        </p>
      ) : null}
    </div>
  );
}
