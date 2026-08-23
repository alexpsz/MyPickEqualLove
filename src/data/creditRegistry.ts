import creditRegistry from "./credit-registry.json";

export interface CreditCreator {
  id: string;
  ja: string;
  romaji: string;
}

interface CreditRegistryEntry {
  ja: string;
  romaji: string;
  aliasesJa?: string[];
  aliasesRomaji?: string[];
  needsReview?: boolean;
}

interface CreditRegistryManifest {
  schemaVersion: number;
  signatureSeparator: { ja: string; romaji: string };
  creators: Record<string, CreditRegistryEntry>;
}

const manifest = creditRegistry as CreditRegistryManifest;

export const CREDIT_SIGNATURE_SEPARATOR = manifest.signatureSeparator;

export const CREDIT_CREATORS: readonly CreditCreator[] = Object.entries(
  manifest.creators,
).map(([id, entry]) => ({ id, ja: entry.ja, romaji: entry.romaji }));

const CREATORS_BY_ID = new Map(
  CREDIT_CREATORS.map((creator) => [creator.id, creator]),
);

/**
 * Every written form that has ever identified a creator, canonical and legacy
 * alike. Identity lives on the creator id, so a name the catalog no longer
 * stores still has to resolve and still has to be searchable.
 */
const CREATORS_BY_JA = new Map<string, CreditCreator>();
const SEARCH_TERMS_BY_ID = new Map<string, readonly string[]>();

for (const [id, entry] of Object.entries(manifest.creators)) {
  const creator = CREATORS_BY_ID.get(id);
  if (!creator) continue;

  CREATORS_BY_JA.set(entry.ja, creator);
  for (const alias of entry.aliasesJa ?? []) {
    CREATORS_BY_JA.set(alias, creator);
  }

  SEARCH_TERMS_BY_ID.set(id, [
    entry.ja,
    entry.romaji,
    ...(entry.aliasesJa ?? []),
    ...(entry.aliasesRomaji ?? []),
  ]);
}

export function getCreditCreator(id: string): CreditCreator | null {
  return CREATORS_BY_ID.get(id) ?? null;
}

export function findCreditCreatorByJa(value: string): CreditCreator | null {
  return CREATORS_BY_JA.get(value.trim()) ?? null;
}

export function getCreditCreatorSearchTerms(id: string): readonly string[] {
  return SEARCH_TERMS_BY_ID.get(id) ?? [];
}
