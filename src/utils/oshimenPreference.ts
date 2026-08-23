import type { Member } from "../schema/music";
import type { ProjectId } from "../schema/project";

export const OSHIMEN_PREFERENCE_VERSION = 1 as const;
export const OSHIMEN_WHITE_OUTLINE = "#64748b";

export interface OshimenPreferenceDocument {
  version: typeof OSHIMEN_PREFERENCE_VERSION;
  projectId: ProjectId;
  memberId: string;
}

export type OshimenPreferenceLoadStatus =
  | "empty"
  | "valid"
  | "invalid"
  | "unsupported-version"
  | "project-mismatch"
  | "unknown-member";

export type OshimenPreferenceLoadResult =
  | { status: "valid"; memberId: string }
  | {
      status: Exclude<OshimenPreferenceLoadStatus, "valid">;
      memberId: null;
    };

export interface OshimenPreferenceAccess {
  memberId: string | null;
  writable: boolean;
}

export interface OshimenPosterAccent {
  /** The member's stored color, retained as the factual source value. */
  color: string;
  /** A visible ink fallback for white accents on the fixed-light poster. */
  visibleColor: string;
  /** Present only when the source color needs a neutral outline fallback. */
  outlineColor?: string;
}

export type OshimenPreferenceStorageMutation =
  | { action: "remove" }
  | { action: "set"; memberId: string; value: string }
  | { action: "reject" };

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const OSHIMEN_PREFERENCE_KEYS = ["version", "projectId", "memberId"] as const;

export function getOshimenPreferenceStorageKey(storagePrefix: string): string {
  return `${storagePrefix}_oshimen_preference_v1`;
}

export function resolveOshimenMember(
  members: readonly Member[],
  memberId: string | null | undefined,
): Member | null {
  if (!memberId) return null;
  return members.find((member) => member.id === memberId) ?? null;
}

export function parseOshimenPreference(
  raw: string | null,
  expectedProjectId: ProjectId,
  members: readonly Member[],
): OshimenPreferenceLoadResult {
  if (raw === null) return { status: "empty", memberId: null };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "invalid", memberId: null };
  }

  if (!isRecord(value) || !hasExactPreferenceKeys(value)) {
    return { status: "invalid", memberId: null };
  }
  if (typeof value.version !== "number") {
    return { status: "invalid", memberId: null };
  }
  if (value.version !== OSHIMEN_PREFERENCE_VERSION) {
    return { status: "unsupported-version", memberId: null };
  }
  if (
    typeof value.projectId !== "string" ||
    typeof value.memberId !== "string" ||
    value.memberId.length === 0
  ) {
    return { status: "invalid", memberId: null };
  }
  if (value.projectId !== expectedProjectId) {
    return { status: "project-mismatch", memberId: null };
  }
  if (!resolveOshimenMember(members, value.memberId)) {
    return { status: "unknown-member", memberId: null };
  }

  return { status: "valid", memberId: value.memberId };
}

export function resolveOshimenPreferenceAccess(
  result: OshimenPreferenceLoadResult,
): OshimenPreferenceAccess {
  if (result.status === "valid") {
    return { memberId: result.memberId, writable: true };
  }

  return {
    memberId: null,
    writable: result.status === "empty",
  };
}

export function serializeOshimenPreference(
  memberId: string,
  projectId: ProjectId,
  members: readonly Member[],
): string | null {
  if (!resolveOshimenMember(members, memberId)) return null;

  const document: OshimenPreferenceDocument = {
    version: OSHIMEN_PREFERENCE_VERSION,
    projectId,
    memberId,
  };
  return JSON.stringify(document);
}

export function planOshimenPreferenceStorageMutation(
  storageWritable: boolean,
  memberId: string | null,
  projectId: ProjectId,
  members: readonly Member[],
): OshimenPreferenceStorageMutation {
  if (!storageWritable) return { action: "reject" };
  if (memberId === null) return { action: "remove" };

  const value = serializeOshimenPreference(memberId, projectId, members);
  return value ? { action: "set", memberId, value } : { action: "reject" };
}

export function resolveOshimenPosterAccent(
  member: Member | null | undefined,
): OshimenPosterAccent | null {
  const color = member?.color;
  if (!color || !HEX_COLOR_PATTERN.test(color)) return null;

  if (color.toLowerCase() === "#ffffff") {
    return {
      color,
      visibleColor: OSHIMEN_WHITE_OUTLINE,
      outlineColor: OSHIMEN_WHITE_OUTLINE,
    };
  }

  return { color, visibleColor: color };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactPreferenceKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === OSHIMEN_PREFERENCE_KEYS.length &&
    OSHIMEN_PREFERENCE_KEYS.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}
