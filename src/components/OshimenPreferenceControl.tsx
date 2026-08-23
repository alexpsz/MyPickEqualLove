"use client";

import { useLocale } from "../i18n/LocaleProvider";
import type { Member } from "../schema/music";
import AnchoredOptionMenu, { type AnchoredOption } from "./AnchoredOptionMenu";

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
  const sortedMembers = members
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const options: readonly AnchoredOption<string>[] = [
    { value: "", label: t("oshimen.none") },
    ...sortedMembers.map((member) => ({
      value: member.id,
      label: member.name.ja,
      lang: "ja",
    })),
  ];

  return (
    <div
      data-oshimen-preference="true"
      className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] p-3"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <AnchoredOptionMenu
            label={t("oshimen.label")}
            value={memberId ?? ""}
            options={options}
            disabled={disabled}
            fullWidth
            onValueChange={(nextMemberId) => onChange(nextMemberId || null)}
          />
        </div>

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
