import {
  ContractValidationError,
  expectLiteral,
  expectPattern,
} from "./strict.js";

export const PRODUCT_FAMILY_SITE_IDS = [
  "atlas",
  "equal-love",
  "nearly-equal-joy",
  "not-equal-me",
] as const;

export const PUBLIC_ATLAS_SITE_IDS = [
  "equal-love",
  "nearly-equal-joy",
  "not-equal-me",
] as const;

export type ProductFamilySiteId = (typeof PRODUCT_FAMILY_SITE_IDS)[number];
export type PublicAtlasSiteId = (typeof PUBLIC_ATLAS_SITE_IDS)[number];
export type PublicEntityKind = "group" | "event" | "performance" | "song";

declare const entityIdBrand: unique symbol;
export type NamespacedEntityId<K extends PublicEntityKind = PublicEntityKind> =
  string & { readonly [entityIdBrand]: K };

export interface ParsedSimpleEntityId<K extends "group" | "event" | "song"> {
  readonly id: NamespacedEntityId<K>;
  readonly siteId: PublicAtlasSiteId;
  readonly kind: K;
  readonly localId: string;
}

export interface ParsedPerformanceEntityId {
  readonly id: NamespacedEntityId<"performance">;
  readonly siteId: PublicAtlasSiteId;
  readonly kind: "performance";
  readonly eventLocalId: string;
  readonly localId: string;
}

export type ParsedEntityId =
  | ParsedSimpleEntityId<"group">
  | ParsedSimpleEntityId<"event">
  | ParsedSimpleEntityId<"song">
  | ParsedPerformanceEntityId;

export type EntityIdParseResult =
  | { readonly ok: true; readonly value: ParsedEntityId }
  | { readonly ok: false; readonly error: string };

const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function localId(value: unknown, path: string) {
  return expectPattern(
    value,
    path,
    LOCAL_ID_PATTERN,
    "expected a stable lowercase local id",
  );
}

function publicSiteId(value: unknown, path: string) {
  return expectLiteral(value, path, PUBLIC_ATLAS_SITE_IDS);
}

export function createGroupEntityId(
  site: PublicAtlasSiteId,
  groupLocalId: string,
) {
  return `${publicSiteId(site, "siteId")}:group:${localId(groupLocalId, "groupLocalId")}` as NamespacedEntityId<"group">;
}

export function createEventEntityId(
  site: PublicAtlasSiteId,
  eventLocalId: string,
) {
  return `${publicSiteId(site, "siteId")}:event:${localId(eventLocalId, "eventLocalId")}` as NamespacedEntityId<"event">;
}

export function createPerformanceEntityId(
  site: PublicAtlasSiteId,
  eventLocalId: string,
  performanceLocalId: string,
) {
  return `${publicSiteId(site, "siteId")}:performance:${localId(eventLocalId, "eventLocalId")}:${localId(performanceLocalId, "performanceLocalId")}` as NamespacedEntityId<"performance">;
}

export function createSongEntityId(
  site: PublicAtlasSiteId,
  existingSongLocalId: string,
) {
  return `${publicSiteId(site, "siteId")}:song:${localId(existingSongLocalId, "songLocalId")}` as NamespacedEntityId<"song">;
}

export function parseNamespacedEntityId(value: unknown): EntityIdParseResult {
  if (typeof value !== "string") {
    return { ok: false, error: "entity id must be a string" };
  }
  try {
    const segments = value.split(":");
    const parsedSiteId = publicSiteId(segments[0], "entityId.siteId");
    const kind = expectLiteral(segments[1], "entityId.kind", [
      "group",
      "event",
      "performance",
      "song",
    ] as const);

    if (kind === "performance") {
      if (segments.length !== 4) {
        throw new ContractValidationError(
          "entityId",
          "performance ids require site, kind, event local id, and performance local id",
        );
      }
      return {
        ok: true,
        value: {
          id: value as NamespacedEntityId<"performance">,
          siteId: parsedSiteId,
          kind,
          eventLocalId: localId(segments[2], "entityId.eventLocalId"),
          localId: localId(segments[3], "entityId.localId"),
        },
      };
    }

    if (segments.length !== 3) {
      throw new ContractValidationError(
        "entityId",
        "group, event, and song ids require exactly three segments",
      );
    }
    return {
      ok: true,
      value: {
        id: value as NamespacedEntityId<typeof kind>,
        siteId: parsedSiteId,
        kind,
        localId: localId(segments[2], "entityId.localId"),
      } as ParsedEntityId,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "invalid namespaced entity id",
    };
  }
}

export function requireNamespacedEntityId<K extends PublicEntityKind>(
  value: unknown,
  path: string,
  expectedKind: K,
) {
  const parsed = parseNamespacedEntityId(value);
  if (!parsed.ok || parsed.value.kind !== expectedKind) {
    throw new ContractValidationError(
      path,
      parsed.ok ? `expected a ${expectedKind} entity id` : parsed.error,
    );
  }
  return parsed.value as Extract<ParsedEntityId, { readonly kind: K }>;
}

export function isPublicAtlasSiteId(
  value: unknown,
): value is PublicAtlasSiteId {
  return (
    typeof value === "string" &&
    (PUBLIC_ATLAS_SITE_IDS as readonly string[]).includes(value)
  );
}
