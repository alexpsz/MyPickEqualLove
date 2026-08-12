export const BOARD_SHARE_PROTOCOL_VERSION: 1;
export const BOARD_SHARE_HASH_NAMESPACE: string;
export const BOARD_SHARE_HASH_PREFIX: string;
export const BOARD_SHARE_MAX_URL_LENGTH: number;

export interface BoardSharePayload {
  v: 1;
  p: string;
  e: string;
  c: string | null;
  s: Array<[string, string]>;
}

export type BoardShareInvalidReason =
  | "digest-mismatch"
  | "duplicate-slot"
  | "duplicate-song"
  | "experience-mismatch"
  | "ineligible-song"
  | "invalid-base64"
  | "invalid-context"
  | "invalid-digest"
  | "invalid-id"
  | "invalid-payload"
  | "invalid-picks"
  | "invalid-shape"
  | "invalid-token"
  | "invalid-url"
  | "payload-too-long"
  | "project-mismatch"
  | "too-many-picks"
  | "unknown-slot"
  | "unknown-song"
  | "unsupported-version"
  | "url-too-long";

export class BoardShareProtocolError extends Error {
  reason: BoardShareInvalidReason;
  constructor(reason: BoardShareInvalidReason);
}

export function isBoardShareHash(hash: string): boolean;

export function buildBoardShareUrl(
  baseUrl: string,
  payload: BoardSharePayload,
): Promise<string>;

export function parseBoardShareUrl(
  value: string,
): Promise<
  | { status: "not-share" }
  | { status: "invalid"; reason: BoardShareInvalidReason }
  | { status: "valid"; payload: BoardSharePayload }
>;

export function validateBoardShareImport(
  payload: BoardSharePayload,
  target: {
    projectId: string;
    experienceId: string;
    contextIds: string[];
    requiresContext: boolean;
    songIds: Set<string>;
    slots: Array<{ id: string; eligibleSongIds: Set<string> }>;
  },
):
  | { ok: true; picks: Record<string, string> }
  | { ok: false; reason: BoardShareInvalidReason };

export function createBoardSharePreviewDiff(snapshot: {
  slotIds: string[];
  currentPicks: Record<string, string>;
  importedPicks: Record<string, string>;
  currentContextId: string | null;
  importedContextId: string | null;
}): {
  changes: Array<{
    slotId: string;
    currentSongId: string | undefined;
    importedSongId: string | undefined;
  }>;
  contextChanged: boolean;
};
