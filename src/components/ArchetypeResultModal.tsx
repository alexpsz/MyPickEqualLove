"use client";

import React, { useRef, type RefObject } from "react";
import * as m from "motion/react-m";
import { PROJECT_THEME_COLOR } from "../config/project";
import { MEMBERS_BY_ID, SONGS_BY_ID } from "../data/songs";
import {
  formatArchetypeTemplate,
  type EqualLoveArchetypeCharacterResult,
  type EqualLoveArchetypeResult,
  type EqualLoveArchetypeUiCopy,
} from "../data/equalLoveArchetype";
import { getMemberColors } from "../utils/memberColors";
import { useDialogA11y } from "../utils/useDialogA11y";
import AppIcon from "./AppIcon";
import { APPLE_OPACITY, APPLE_SPRING_GENTLE } from "./AppleMotion";
import ArchetypeRadarChart from "./ArchetypeRadarChart";
import JapaneseContent from "./JapaneseContent";
import type { PresenceState } from "./MotionPresence";

interface ArchetypeResultModalProps {
  result: EqualLoveArchetypeResult;
  presenceState: PresenceState;
  returnFocusRef: RefObject<HTMLElement | null>;
  returnFocusFallbackKey: string;
  generatingImage: boolean;
  onGenerateImage: () => void;
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
  generatingImage,
  onGenerateImage,
  onClose,
}: ArchetypeResultModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const ui = result.ui;
  const characterNames = result.characters
    .map((character) => character.displayName)
    .join(" / ");
  const lead = formatArchetypeTemplate(
    result.isTie ? ui.result.tieLead : ui.result.singleLead,
    result.isTie
      ? { characterNames }
      : { characterName: result.characters[0]?.displayName ?? "" },
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
            <h2
              id="archetype-result-title"
              className="text-[22px] font-semibold tracking-[-0.035em] text-[var(--foreground)] sm:text-[26px]"
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

        <div className="grid grid-cols-2 gap-2 border-t border-[var(--line)] bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onGenerateImage}
            disabled={generatingImage || presenceState === "exiting"}
            className="official-button min-w-0 disabled:opacity-50"
          >
            {generatingImage ? ui.export.generating : ui.export.button}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="official-button official-button-primary min-w-0"
          >
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
  const contributingSongs = character.contributingSongIds.map((songId) => {
    const song = SONGS_BY_ID[songId];
    if (!song) throw new Error(`Missing contributing song: ${songId}`);
    return song;
  });
  const accentColor = resolveArchetypeAccent(character);
  const radarAriaLabel = buildRadarAriaLabel(character, ui);

  return (
    <article
      data-archetype-character-card={character.roleId}
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-white"
    >
      <div
        className="border-b border-[var(--line)] p-4 sm:p-5"
        style={{ backgroundColor: `${accentColor}0d` }}
      >
        <h3 className="text-[24px] font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-[28px]">
          {character.displayName}
        </h3>
        <p
          lang={character.contentLocale}
          className="mt-1 text-[15px] font-semibold leading-snug text-[var(--foreground)]"
        >
          {character.title}
        </p>

        <dl className="mt-4 grid gap-x-5 gap-y-3 border-y border-[var(--line)] py-3 sm:grid-cols-2">
          <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-2">
            <dt
              className="text-[11px] font-semibold tracking-[0.06em] uppercase"
              style={{ color: accentColor }}
            >
              {ui.labels.className}
            </dt>
            <dd
              lang={character.contentLocale}
              className="min-w-0 text-[13px] font-semibold text-[var(--foreground)]"
            >
              {character.className}
            </dd>
          </div>
          <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-2">
            <dt
              className="text-[11px] font-semibold tracking-[0.06em] uppercase"
              style={{ color: accentColor }}
            >
              {ui.labels.weapon}
            </dt>
            <dd
              lang={character.contentLocale}
              className="min-w-0 text-[13px] font-semibold text-[var(--foreground)]"
            >
              {character.weaponName}
            </dd>
          </div>
        </dl>

        <p
          lang={character.contentLocale}
          className="mt-4 text-[14px] leading-6 text-[var(--foreground)]"
        >
          {character.profile}
        </p>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(17rem,.88fr)] lg:items-center">
        <div
          className="flex min-w-0 justify-center overflow-hidden rounded-[var(--radius-sm)] p-1 sm:p-2"
          style={{ backgroundColor: `${accentColor}0a` }}
        >
          <div className="w-full max-w-[400px] [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-full">
            <ArchetypeRadarChart
              stats={character.stats}
              labels={character.statLabels}
              accentColor={accentColor}
              ariaLabel={radarAriaLabel}
              size={400}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-5">
          <section>
            <h4
              className="text-xs font-semibold tracking-[0.06em] uppercase"
              style={{ color: accentColor }}
            >
              {ui.labels.stats}
            </h4>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              {STAT_KEYS.map((statId) => (
                <div
                  key={statId}
                  className="min-w-0 rounded-[var(--radius-sm)] bg-[var(--background)] px-3 py-2.5"
                >
                  <dt className="text-[12px] leading-snug text-[var(--muted)]">
                    {character.statLabels[statId]}
                  </dt>
                  <dd className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--foreground)]">
                    {character.stats[statId]}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h4
              className="text-xs font-semibold tracking-[0.06em] uppercase"
              style={{ color: accentColor }}
            >
              {ui.explanation.dimensionsHeading}
            </h4>
            <ul className="mt-2 flex flex-wrap gap-2">
              {character.overlapTraitIds.map((traitId) => (
                <li
                  key={traitId}
                  className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)]"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                  {ui.traits[traitId]}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4
              className="text-xs font-semibold tracking-[0.06em] uppercase"
              style={{ color: accentColor }}
            >
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
          </section>
        </div>
      </div>
    </article>
  );
}

function resolveArchetypeAccent(character: EqualLoveArchetypeCharacterResult) {
  const fallback = isHexColor(PROJECT_THEME_COLOR)
    ? PROJECT_THEME_COLOR
    : "#6b7280";
  const member = MEMBERS_BY_ID[character.memberId];
  if (!member) return fallback;
  return getMemberColors(member, fallback).find(isHexColor) ?? fallback;
}

function isHexColor(value: string) {
  return /^#[\da-f]{6}$/i.test(value);
}

function buildRadarAriaLabel(
  character: EqualLoveArchetypeCharacterResult,
  ui: EqualLoveArchetypeUiCopy,
) {
  return [
    `${character.displayName} — ${ui.labels.stats}`,
    ...STAT_KEYS.map(
      (statId) => `${character.statLabels[statId]}: ${character.stats[statId]}`,
    ),
  ].join(". ");
}
