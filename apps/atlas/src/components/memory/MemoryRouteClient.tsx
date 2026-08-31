"use client";

import { useMemo } from "react";

import type { NamespacedEntityId } from "../../contracts/identity.js";
import type {
  MemoryPublicContextResolution,
  MemoryPublicContextResolver,
} from "../../share/memory-selection.js";
import { MemoryPage } from "./MemoryPage.js";

export interface MemoryRouteContextRecord {
  readonly entityId: NamespacedEntityId<"event" | "performance">;
  readonly sourceRevision: string;
  readonly groupName: string;
  readonly eventName: string;
  readonly performanceName: string | null;
  readonly date: string;
  readonly venueName: string | null;
  readonly exactMyPickHref: string | null;
}

export interface MemoryRouteClientProps {
  readonly sourceRevision: string;
  readonly contextRecords: readonly MemoryRouteContextRecord[];
}

export function createMemoryContextResolver(
  sourceRevision: string,
  contextRecords: readonly MemoryRouteContextRecord[],
): MemoryPublicContextResolver {
  const recordsByEntityId = new Map<string, MemoryRouteContextRecord>();
  for (const record of contextRecords) {
    if (record.sourceRevision === sourceRevision) {
      recordsByEntityId.set(record.entityId, record);
    }
  }

  return (reference): MemoryPublicContextResolution => {
    if (reference.sourceRevision !== sourceRevision) {
      return { status: "stale" };
    }

    const record = recordsByEntityId.get(reference.entityId);
    if (record === undefined) {
      return { status: "missing" };
    }

    return {
      status: "resolved",
      context: {
        reference,
        groupName: record.groupName,
        eventName: record.eventName,
        performanceName: record.performanceName,
        date: record.date,
        venueName: record.venueName,
        exactMyPickHref: record.exactMyPickHref,
      },
    };
  };
}

export function MemoryRouteClient({
  contextRecords,
  sourceRevision,
}: MemoryRouteClientProps) {
  const resolvePublicContext = useMemo(
    () => createMemoryContextResolver(sourceRevision, contextRecords),
    [contextRecords, sourceRevision],
  );

  return <MemoryPage resolvePublicContext={resolvePublicContext} />;
}
