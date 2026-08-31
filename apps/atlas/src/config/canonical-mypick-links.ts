import "server-only";

import { MY_PICK_SITE_URLS } from "../../../../src/projects/product-family-sites";
import {
  parseNamespacedEntityId,
  type NamespacedEntityId,
  type PublicAtlasSiteId,
} from "../contracts/identity";
import type { PublicAtlasProjectionV1 } from "../contracts/public-atlas-projection";
import type {
  CanonicalSongSiteOrigins,
  EventPresentationOptions,
  ExactCanonicalEventLink,
  ExactCanonicalSongLink,
} from "../features/events/event-presentation";
import linkProjection from "../generated/canonical-mypick-links.v1.json";

const SITE_IDS: readonly PublicAtlasSiteId[] = [
  "equal-love",
  "nearly-equal-joy",
  "not-equal-me",
];

export const CANONICAL_MYPICK_SITE_ORIGINS: CanonicalSongSiteOrigins =
  MY_PICK_SITE_URLS;

export const CANONICAL_GROUP_NAMES = Object.fromEntries(
  SITE_IDS.map((siteId) => [
    siteId,
    siteId === "equal-love"
      ? "=LOVE"
      : siteId === "nearly-equal-joy"
        ? "≒JOY"
        : "≠ME",
  ]),
) as Readonly<Record<PublicAtlasSiteId, string>>;

export const CANONICAL_GROUP_ACCENTS = Object.fromEntries(
  SITE_IDS.map((siteId) => [
    siteId,
    siteId === "equal-love"
      ? "#ea6c81"
      : siteId === "nearly-equal-joy"
        ? "#f2c94c"
        : "#3bb8e8",
  ]),
) as Readonly<Record<PublicAtlasSiteId, string>>;

function absoluteMyPickHref(siteId: PublicAtlasSiteId, path: string) {
  const origin = MY_PICK_SITE_URLS[siteId];
  if (!path.startsWith("/") || !path.endsWith("/")) return null;
  const url = new URL(path, origin);
  return url.origin === new URL(origin).origin ? url.href : null;
}

export function canonicalEventLinks(
  projection: PublicAtlasProjectionV1,
): readonly ExactCanonicalEventLink[] {
  if (projection.sourceRevision !== linkProjection.sourceRevision) return [];
  return projection.groups.flatMap((group) =>
    group.events.flatMap((event) => {
      const path = (linkProjection.events as Readonly<Record<string, string>>)[
        event.id
      ];
      const canonicalHref = path
        ? absoluteMyPickHref(group.siteId, path)
        : null;
      return canonicalHref
        ? [
            {
              entityId: event.id,
              sourceRevision: projection.sourceRevision,
              canonicalHref,
            },
          ]
        : [];
    }),
  );
}

export function canonicalSongLinks(
  projection: PublicAtlasProjectionV1,
): readonly ExactCanonicalSongLink[] {
  if (projection.sourceRevision !== linkProjection.sourceRevision) return [];
  const links = new Map<string, ExactCanonicalSongLink>();
  for (const group of projection.groups) {
    for (const event of group.events) {
      for (const performance of event.performances) {
        for (const { songRef } of performance.setlist) {
          if (links.has(songRef.entityId)) continue;
          const parsed = parseNamespacedEntityId(songRef.entityId);
          if (!parsed.ok || parsed.value.kind !== "song") continue;
          const canonicalHref = absoluteMyPickHref(
            parsed.value.siteId,
            `${linkProjection.songPathPrefix}${parsed.value.localId}/`,
          );
          if (!canonicalHref) continue;
          links.set(songRef.entityId, {
            entityId: songRef.entityId as NamespacedEntityId<"song">,
            sourceRevision: projection.sourceRevision,
            canonicalHref,
          });
        }
      }
    }
  }
  return [...links.values()];
}

export function eventPresentationOptions(
  projection: PublicAtlasProjectionV1,
): EventPresentationOptions {
  return {
    canonicalEventLinks: canonicalEventLinks(projection),
    canonicalSongLinks: canonicalSongLinks(projection),
    canonicalSongSiteOrigins: CANONICAL_MYPICK_SITE_ORIGINS,
    groupNames: CANONICAL_GROUP_NAMES,
    groupAccents: CANONICAL_GROUP_ACCENTS,
  };
}
