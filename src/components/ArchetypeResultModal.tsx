"use client";

import React, { useRef, type RefObject } from "react";
import * as m from "motion/react-m";
import { SONGS_BY_ID } from "../data/songs";
import type {
  EqualLoveArchetypeCharacterResult,
  EqualLoveArchetypeResult,
  EqualLoveArchetypeUiCopy,
} from "../data/equalLoveArchetype";
import { useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import JapaneseContent from "./JapaneseContent";
import type { PresenceState } from "./MotionPresence";

interface ArchetypeResultModalProps {
  result: EqualLoveArchetypeResult;
  presenceState: PresenceState;
  returnFocusRef: RefObject<HTMLElement | null>;
  returnFocusFallbackKey: string;
  onClose: () => void;
}

const STAT_KEYS = [
  "atk",
  "def",
  "spdMobility",
  "sta",
  "bearCharmResistance",
] as const satisfies ReadonlyArray<
  keyof EqualLoveArchetypeCharacterResult["stats"]
>;

export default function ArchetypeResultModal({
  result,
  presenceState,
  returnFocusRef,
  returnFocusFallbackKey,
  onClose,
}: ArchetypeResultModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const ui = result.ui;
  const characterNames = result.characters
    .map((character) => character.title)
    .join(" / ");
  const lead = formatTemplate(
    result.isTie ? ui.result.tieLead : ui.result.singleLead,
    result.isTie
      ? { characterNames }
      : { characterName: result.characters[0]?.title ?? "" },
  );

  useDialogA11y({
    dialogRef: panelRef,
    onClose,
    active: presenceState !== "exiting",
    initialFocusRef: closeButtonRef,
    returnFocusRef,
    returnFocusFallbackKey,
  });

  return (
    <div
      className="motion-overlay fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      data-presence={presenceState}
    >
      <m.button
        type="button"
        onClick={onClose}
        disabled={presenceState === "exiting"}
        tabIndex={-1}
        aria-hidden={presenceState === "exiting"}
        aria-label={ui.result.close}
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
        aria-hidden={presenceState === "exiting"}
        inert={presenceState === "exiting"}
        aria-labelledby="archetype-result-title"
        aria-describedby="archetype-result-summary"
        className="apple-sheet relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none border-x-0 border-b-0 focus:outline-none sm:rounded-[var(--radius-lg)] sm:border"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{
          opacity: APPLE_OPACITY,
          y: APPLE_SPRING_GENTLE,
          scale: APPLE_SPRING_GENTLE,
        }}
      >
        <div className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--project-primary)] uppercase">
              {result.isTie ? ui.result.tieKicker : ui.result.singleKicker}
            </p>
            <h2
              id="archetype-result-title"
              className="mt-1 text-[22px] font-semibold tracking-[-0.035em] text-[var(--foreground)] sm:text-[26px]"
            >
              {ui.title}
            </h2>
            <p
              id="archetype-result-summary"
              className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]"
            >
              {lead}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="icon-button icon-button-compact shrink-0"
            aria-label={ui.result.close}
          >
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 sm:p-6">
          <div className="grid gap-4">
            {result.characters.map((character) => (
              <CharacterResultCard
                key={character.roleId}
                character={character}
                ui={ui}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-white p-4 text-[12px] leading-relaxed text-[var(--muted)] sm:grid-cols-2">
            <p>{ui.metadata.entertainmentNotice}</p>
            <p>{ui.metadata.sourceAttribution}</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--line)] bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <button type="button" onClick={onClose} className="official-button">
            {ui.result.close}
          </button>
        </div>
      </m.div>
    </div>
  );
}

function CharacterResultCard({
  character,
  ui,
}: {
  character: EqualLoveArchetypeCharacterResult;
  ui: EqualLoveArchetypeUiCopy;
}) {
  const contributingSongs = character.contributingSongIds
    .map((songId) => SONGS_BY_ID[songId])
    .filter(Boolean);

  return (
    <article className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <h3
          lang={character.contentLocale}
          className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-[23px]"
        >
          {character.title}
        </h3>
        <p className="mt-1 text-[13px] font-semibold text-[var(--project-primary)]">
          {ui.labels.className}:{" "}
          <span lang={character.contentLocale}>{character.className}</span>
        </p>
        <p
          lang={character.contentLocale}
          className="mt-3 text-[14px] leading-6 text-[var(--foreground)]"
        >
          {character.profile}
        </p>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <h4 className="text-xs font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
            {ui.labels.stats}
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {STAT_KEYS.map((statId) => (
              <div
                key={statId}
                className="rounded-[var(--radius-sm)] bg-[var(--background)] px-3 py-2.5"
              >
                <dt className="text-[11px] leading-tight text-[var(--muted)]">
                  {character.statLabels[statId]}
                </dt>
                <dd className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--foreground)]">
                  {character.stats[statId]}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <h4 className="text-xs font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
              {ui.explanation.dimensionsHeading}
            </h4>
            <ul className="mt-2 flex flex-wrap gap-2">
              {character.overlapTraitIds.map((traitId) => (
                <li
                  key={traitId}
                  className="rounded-full bg-[var(--project-primary-wash)] px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)]"
                >
                  {ui.traits[traitId]}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
              {ui.explanation.songsHeading}
            </h4>
            <ol className="mt-2 grid gap-1.5">
              {contributingSongs.map((song, index) => (
                <li
                  key={song.id}
                  className="flex items-center gap-2 text-[13px] font-medium text-[var(--foreground)]"
                >
                  <span className="text-[var(--muted)] tabular-nums">
                    {index + 1}
                  </span>
                  <JapaneseContent>{song.title.ja}</JapaneseContent>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
}
