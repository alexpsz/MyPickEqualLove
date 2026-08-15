import charactersEnData from "../projects/equal-love/archetype-21/characters.en.json";
import charactersJaData from "../projects/equal-love/archetype-21/characters.ja.json";
import charactersKoData from "../projects/equal-love/archetype-21/characters.ko.json";
import uiData from "../projects/equal-love/archetype-21/ui.json";
import charactersZhCnData from "../projects/equal-love/archetype-21/characters.zh-CN.json";
import type { RoleAffinityProfile, TraitId } from "../schema/archetype";
import type { AppLocale } from "../i18n/locales";
import {
  ARCHETYPE_TOP_TEN_SIZE,
  createAdventureAffinityMatcher,
} from "../utils/archetypeAffinity";
import { parseEqualLoveArchetypeAffinityDocument } from "./equalLoveArchetypeAffinities";

const CAMPAIGN_ID = "equal-love-archetype-21";
const EXPECTED_CHARACTER_COUNT = 10;

export interface EqualLoveArchetypeStats {
  atk: number;
  def: number;
  spdMobility: number;
  sta: number;
  bearCharmResistance: number;
}

export type EqualLoveArchetypeStatId = keyof EqualLoveArchetypeStats;

export interface EqualLoveArchetypeCharacterResult {
  roleId: string;
  contentLocale: AppLocale;
  displayName: string;
  title: string;
  className: string;
  weaponName: string;
  profile: string;
  stats: EqualLoveArchetypeStats;
  statLabels: Record<EqualLoveArchetypeStatId, string>;
  overlapTraitIds: readonly TraitId[];
  contributingSongIds: readonly string[];
}

export interface EqualLoveArchetypeUiCopy {
  title: string;
  entry: {
    campaignLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    incompleteTitle: string;
    incompleteRemaining: string;
    readyTitle: string;
    startCta: string;
    continueCta: string;
    readyCta: string;
  };
  result: {
    close: string;
    singleKicker: string;
    singleLead: string;
    tieKicker: string;
    tieLead: string;
  };
  export: {
    button: string;
    generating: string;
    previewLabel: string;
    shareText: string;
  };
  explanation: {
    dimensionsHeading: string;
    songsHeading: string;
  };
  labels: {
    title: string;
    className: string;
    weapon: string;
    stats: string;
  };
  traits: Record<TraitId, string>;
  metadata: {
    sourceAttribution: string;
    entertainmentNotice: string;
  };
}

export interface EqualLoveArchetypeResult {
  inputKey: string;
  isTie: boolean;
  ui: EqualLoveArchetypeUiCopy;
  characters: readonly EqualLoveArchetypeCharacterResult[];
}

interface EnglishCharacter {
  roleId: string;
  displayName: string;
  title: string;
  className: string;
  weaponName: string;
  profile: string;
  stats: EqualLoveArchetypeStats;
  roleFingerprint: RoleAffinityProfile["affinities"];
}

interface LocalizedCharacterCatalog {
  characters: Map<string, CharacterPresentation>;
  statLabels: Record<EqualLoveArchetypeStatId, string>;
}

interface CharacterPresentation {
  title: string;
  className: string;
  weaponName: string;
  profile: string;
}

export function getEqualLoveArchetypeUiCopy(
  locale: AppLocale,
): EqualLoveArchetypeUiCopy | null {
  try {
    return parseUiCopy(uiData, locale);
  } catch {
    return null;
  }
}

/**
 * Resolves a result only when a separately integrated, schema-valid approved
 * fingerprint document covers all ten selected songs. Missing input and every
 * validation or coverage failure intentionally return null.
 */
export function resolveEqualLoveArchetype(
  songIds: readonly string[],
  locale: AppLocale,
  approvedAffinityDocument?: unknown,
): EqualLoveArchetypeResult | null {
  if (
    songIds.length !== ARCHETYPE_TOP_TEN_SIZE ||
    new Set(songIds).size !== ARCHETYPE_TOP_TEN_SIZE ||
    approvedAffinityDocument === undefined
  ) {
    return null;
  }

  try {
    const approvedSongAffinities = parseEqualLoveArchetypeAffinityDocument(
      approvedAffinityDocument,
    );
    const englishCharacters = parseEnglishCharacters(charactersEnData);
    const localizedCatalog = parseLocalizedCharacters(
      getLocalizedCharacterData(locale),
      locale,
    );
    const roleIds = new Set(
      englishCharacters.map((character) => character.roleId),
    );
    if (
      englishCharacters.length !== EXPECTED_CHARACTER_COUNT ||
      localizedCatalog.characters.size !== EXPECTED_CHARACTER_COUNT ||
      [...roleIds].some((roleId) => !localizedCatalog.characters.has(roleId))
    ) {
      throw new Error("Archetype character catalogs are incomplete");
    }
    const roleProfiles = englishCharacters.map<RoleAffinityProfile>(
      (character) => ({
        roleId: character.roleId,
        profileVersion: "v1",
        affinities: character.roleFingerprint,
      }),
    );
    const match = createAdventureAffinityMatcher({
      songAffinities: approvedSongAffinities,
      roleProfiles,
    })(songIds);
    const charactersByRoleId = new Map(
      englishCharacters.map((character) => [character.roleId, character]),
    );
    const characters = match.winners.map((winner) => {
      if (
        winner.overlapTraits.length !== 2 ||
        winner.contributingSongs.length !== 2
      ) {
        throw new Error("Archetype explanation is incomplete");
      }
      const character = charactersByRoleId.get(winner.roleId);
      const presentation = localizedCatalog.characters.get(winner.roleId);
      if (!character || !presentation) {
        throw new Error("Matched role is missing from the localized catalog");
      }
      return {
        roleId: winner.roleId,
        contentLocale: locale,
        displayName: character.displayName,
        title: presentation.title,
        className: presentation.className,
        weaponName: presentation.weaponName,
        profile: presentation.profile,
        stats: character.stats,
        statLabels: localizedCatalog.statLabels,
        overlapTraitIds: winner.overlapTraits.map(({ traitId }) => traitId),
        contributingSongIds: winner.contributingSongs.map(
          ({ songId }) => songId,
        ),
      };
    });

    if (characters.length === 0) return null;
    return {
      inputKey: songIds.join(":"),
      isTie: match.isTie,
      ui: parseUiCopy(uiData, locale),
      characters,
    };
  } catch {
    return null;
  }
}

function parseEnglishCharacters(value: unknown): EnglishCharacter[] {
  const root = asRecord(value);
  if (
    root.schemaVersion !== 1 ||
    root.campaignId !== CAMPAIGN_ID ||
    root.locale !== "en" ||
    root.roleProfileVersion !== "v1" ||
    !Array.isArray(root.characters)
  ) {
    throw new Error("Invalid English archetype catalog");
  }

  const seenRoleIds = new Set<string>();
  return root.characters.map((candidate) => {
    const character = asRecord(candidate);
    const roleId = readString(character.roleId);
    if (seenRoleIds.has(roleId)) throw new Error("Duplicate archetype role");
    seenRoleIds.add(roleId);
    const stats = asRecord(character.stats);
    const weapon = asRecord(character.weapon);
    return {
      roleId,
      displayName: readString(character.name),
      title: readString(character.title),
      className: readString(character.className),
      weaponName: readString(weapon.name),
      profile: readString(character.profile),
      stats: {
        atk: readFiniteNumber(stats.atk),
        def: readFiniteNumber(stats.def),
        spdMobility: readFiniteNumber(stats.spdMobility),
        sta: readFiniteNumber(stats.sta),
        bearCharmResistance: readFiniteNumber(stats.bearCharmResistance),
      },
      roleFingerprint: asRecord(
        character.roleFingerprint,
      ) as RoleAffinityProfile["affinities"],
    };
  });
}

function parseLocalizedCharacters(
  value: unknown,
  locale: AppLocale,
): LocalizedCharacterCatalog {
  if (locale === "en") {
    const characters = parseEnglishCharacters(value);
    return {
      characters: new Map(
        characters.map(({ roleId, title, className, weaponName, profile }) => [
          roleId,
          { title, className, weaponName, profile },
        ]),
      ),
      statLabels: {
        atk: "ATK",
        def: "DEF",
        spdMobility: "SPD / MOBILITY",
        sta: "STA",
        bearCharmResistance: "BEAR CHARM RESISTANCE",
      },
    };
  }

  const root = asRecord(value);
  if (
    root.schemaVersion !== 1 ||
    root.campaignId !== CAMPAIGN_ID ||
    root.locale !== locale
  ) {
    throw new Error("Invalid localized archetype catalog");
  }
  const labels = asRecord(root.labels);
  const stats = asRecord(labels.stats);
  const characters = asRecord(root.characters);
  return {
    characters: new Map<string, CharacterPresentation>(
      Object.entries(characters).map(([roleId, candidate]) => {
        const character = asRecord(candidate);
        const weapon = asRecord(character.weapon);
        return [
          roleId,
          {
            title: readString(character.title),
            className: readString(character.className),
            weaponName: readString(weapon.name),
            profile: readString(character.profile),
          },
        ];
      }),
    ),
    statLabels: {
      atk: readString(stats.atk),
      def: readString(stats.def),
      spdMobility: readString(stats.spdMobility),
      sta: readString(stats.sta),
      bearCharmResistance: readString(stats.bearCharmResistance),
    },
  };
}

function parseUiCopy(
  value: unknown,
  locale: AppLocale,
): EqualLoveArchetypeUiCopy {
  const root = asRecord(value);
  if (root.schemaVersion !== 1 || root.campaignId !== CAMPAIGN_ID) {
    throw new Error("Invalid archetype UI catalog");
  }
  const localeCopy = asRecord(asRecord(root.locales)[locale]);
  const entry = asRecord(localeCopy.entry);
  const result = asRecord(localeCopy.result);
  const exportCopy = asRecord(localeCopy.export);
  const explanation = asRecord(localeCopy.explanation);
  const labels = asRecord(localeCopy.labels);
  const traits = asRecord(localeCopy.traits);
  const metadata = asRecord(localeCopy.metadata);
  return {
    title: readString(localeCopy.title),
    entry: {
      campaignLabel: readString(entry.campaignLabel),
      emptyTitle: readString(entry.emptyTitle),
      emptyDescription: readString(entry.emptyDescription),
      incompleteTitle: readString(entry.incompleteTitle),
      incompleteRemaining: readTemplate(entry.incompleteRemaining, [
        "remaining",
      ]),
      readyTitle: readString(entry.readyTitle),
      startCta: readString(entry.startCta),
      continueCta: readString(entry.continueCta),
      readyCta: readString(entry.readyCta),
    },
    result: {
      close: readString(result.close),
      singleKicker: readString(result.singleKicker),
      singleLead: readTemplate(result.singleLead, ["characterName"]),
      tieKicker: readString(result.tieKicker),
      tieLead: readTemplate(result.tieLead, ["characterNames"]),
    },
    export: {
      button: readString(exportCopy.button),
      generating: readString(exportCopy.generating),
      previewLabel: readTemplate(exportCopy.previewLabel, ["characterNames"]),
      shareText: readTemplate(exportCopy.shareText, ["characterNames"]),
    },
    explanation: {
      dimensionsHeading: readString(explanation.dimensionsHeading),
      songsHeading: readString(explanation.songsHeading),
    },
    labels: {
      title: readString(labels.title),
      className: readString(labels.className),
      weapon: readString(labels.weapon),
      stats: readString(labels.stats),
    },
    traits: {
      drive: readString(traits.drive),
      care: readString(traits.care),
      rhythm: readString(traits.rhythm),
      growth: readString(traits.growth),
      drama: readString(traits.drama),
      ingenuity: readString(traits.ingenuity),
      uplift: readString(traits.uplift),
      cuteness: readString(traits.cuteness),
    },
    metadata: {
      sourceAttribution: readString(metadata.sourceAttribution),
      entertainmentNotice: readString(metadata.entertainmentNotice),
    },
  };
}

function getLocalizedCharacterData(locale: AppLocale): unknown {
  switch (locale) {
    case "en":
      return charactersEnData;
    case "zh-CN":
      return charactersZhCnData;
    case "ja":
      return charactersJaData;
    case "ko":
      return charactersKoData;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Expected a non-empty string");
  }
  return value;
}

function readTemplate(value: unknown, expectedPlaceholders: readonly string[]) {
  const template = readString(value);
  const placeholders = new Set(
    [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]),
  );
  if (
    placeholders.size !== expectedPlaceholders.length ||
    expectedPlaceholders.some((placeholder) => !placeholders.has(placeholder))
  ) {
    throw new Error("Invalid archetype UI template placeholders");
  }
  return template;
}

export function formatArchetypeTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
) {
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const replacement = values[key];
    return Object.hasOwn(values, key) && replacement ? replacement : match;
  });
  if (/\{\{\w+\}\}/.test(rendered)) {
    throw new Error("Unresolved archetype UI template placeholder");
  }
  return rendered;
}

function readFiniteNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expected a finite number");
  }
  return value;
}
