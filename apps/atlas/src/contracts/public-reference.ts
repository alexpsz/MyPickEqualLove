import type { PublicEntityKind } from "./identity.js";
import {
  requireNamespacedEntityId,
  type NamespacedEntityId,
} from "./identity.js";
import {
  ContractValidationError,
  expectExactKeys,
  expectIsoDate,
  expectRecord,
  expectString,
  issueFrom,
  type ContractIssue,
} from "./strict.js";

export interface ReadableFallbackSnapshot {
  readonly groupName: string;
  readonly title: string;
  readonly date: string | null;
  readonly venueName: string | null;
}

export interface PublicEntityReference<
  K extends PublicEntityKind = PublicEntityKind,
> {
  readonly entityId: NamespacedEntityId<K>;
  readonly sourceRevision: string;
  readonly fallback: ReadableFallbackSnapshot;
}

export type PublicReferenceParseResult<K extends PublicEntityKind> =
  | { readonly ok: true; readonly value: PublicEntityReference<K> }
  | { readonly ok: false; readonly issue: ContractIssue };

export type PublicReferenceResolution<T, K extends PublicEntityKind> =
  | {
      readonly status: "resolved";
      readonly reference: PublicEntityReference<K>;
      readonly entity: T;
    }
  | {
      readonly status: "missing";
      readonly reference: PublicEntityReference<K>;
      readonly fallback: ReadableFallbackSnapshot;
    };

function nullableText(value: unknown, path: string) {
  return value === null ? null : expectString(value, path, { max: 256 });
}

export function parseReadableFallbackValue(
  value: unknown,
  path: string,
): ReadableFallbackSnapshot {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["groupName", "title", "date", "venueName"]);
  return {
    groupName: expectString(record.groupName, `${path}.groupName`, {
      max: 128,
    }),
    title: expectString(record.title, `${path}.title`, { max: 256 }),
    date:
      record.date === null ? null : expectIsoDate(record.date, `${path}.date`),
    venueName: nullableText(record.venueName, `${path}.venueName`),
  };
}

export function parsePublicReferenceValue<K extends PublicEntityKind>(
  value: unknown,
  path: string,
  allowedKinds: readonly K[],
): PublicEntityReference<K> {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["entityId", "sourceRevision", "fallback"]);

  const parsedKind = allowedKinds
    .map((kind) => {
      try {
        return requireNamespacedEntityId(
          record.entityId,
          `${path}.entityId`,
          kind,
        );
      } catch {
        return null;
      }
    })
    .find((candidate) => candidate !== null);
  if (!parsedKind) {
    throw new ContractValidationError(
      `${path}.entityId`,
      `expected namespaced ${allowedKinds.join(" or ")} id`,
    );
  }

  return {
    entityId: parsedKind.id as NamespacedEntityId<K>,
    sourceRevision: expectString(
      record.sourceRevision,
      `${path}.sourceRevision`,
      {
        max: 128,
      },
    ),
    fallback: parseReadableFallbackValue(record.fallback, `${path}.fallback`),
  };
}

export function parsePublicEntityReference<K extends PublicEntityKind>(
  value: unknown,
  allowedKinds: readonly K[],
): PublicReferenceParseResult<K> {
  try {
    return {
      ok: true,
      value: parsePublicReferenceValue(value, "$", allowedKinds),
    };
  } catch (error) {
    return { ok: false, issue: issueFrom(error) };
  }
}

export function resolvePublicReference<T, K extends PublicEntityKind>(
  reference: PublicEntityReference<K>,
  resolve: (entityId: NamespacedEntityId<K>) => T | undefined,
): PublicReferenceResolution<T, K> {
  const entity = resolve(reference.entityId);
  return entity === undefined
    ? {
        status: "missing",
        reference,
        fallback: reference.fallback,
      }
    : { status: "resolved", reference, entity };
}
