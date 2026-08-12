export const BOARD_SHARE_PROTOCOL_VERSION = 1;
export const BOARD_SHARE_HASH_NAMESPACE = "#__mypick_board_v";
export const BOARD_SHARE_HASH_PREFIX = `${BOARD_SHARE_HASH_NAMESPACE}${BOARD_SHARE_PROTOCOL_VERSION}=`;
export const BOARD_SHARE_MAX_URL_LENGTH = 2048;

const BOARD_SHARE_MAX_JSON_BYTES = 1024;
const BOARD_SHARE_MAX_PAIRS = 32;
const BOARD_SHARE_DIGEST_BYTES = 32;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/;

/** @typedef {{v: 1, p: string, e: string, c: string | null, s: Array<[string, string]>}} BoardSharePayload */

export class BoardShareProtocolError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(`Board share link rejected: ${reason}`);
    this.name = "BoardShareProtocolError";
    this.reason = reason;
  }
}

/**
 * @param {string} hash
 */
export function isBoardShareHash(hash) {
  return hash.startsWith(BOARD_SHARE_HASH_NAMESPACE);
}

/**
 * @param {string} baseUrl
 * @param {BoardSharePayload} payload
 */
export async function buildBoardShareUrl(baseUrl, payload) {
  const normalizedPayload = normalizeBoardSharePayload(payload);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(normalizedPayload));
  if (jsonBytes.byteLength > BOARD_SHARE_MAX_JSON_BYTES) {
    throw new BoardShareProtocolError("payload-too-long");
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", jsonBytes),
  );
  const url = new URL(baseUrl);
  url.hash = `${BOARD_SHARE_HASH_PREFIX.slice(1)}${encodeBase64Url(jsonBytes)}.${encodeBase64Url(digest)}`;
  const result = url.toString();
  if (result.length > BOARD_SHARE_MAX_URL_LENGTH) {
    throw new BoardShareProtocolError("url-too-long");
  }
  return result;
}

/**
 * @param {string} value
 * @returns {Promise<
 *   | {status: "not-share"}
 *   | {status: "invalid", reason: string}
 *   | {status: "valid", payload: BoardSharePayload}
 * >}
 */
export async function parseBoardShareUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { status: "invalid", reason: "invalid-url" };
  }

  if (!isBoardShareHash(url.hash)) {
    return { status: "not-share" };
  }
  if (value.length > BOARD_SHARE_MAX_URL_LENGTH) {
    return { status: "invalid", reason: "url-too-long" };
  }
  if (!url.hash.startsWith(BOARD_SHARE_HASH_PREFIX)) {
    return { status: "invalid", reason: "unsupported-version" };
  }

  const token = url.hash.slice(BOARD_SHARE_HASH_PREFIX.length);
  const segments = token.split(".");
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    return { status: "invalid", reason: "invalid-token" };
  }

  try {
    const jsonBytes = decodeBase64Url(segments[0], BOARD_SHARE_MAX_JSON_BYTES);
    const suppliedDigest = decodeBase64Url(
      segments[1],
      BOARD_SHARE_DIGEST_BYTES,
    );
    if (suppliedDigest.byteLength !== BOARD_SHARE_DIGEST_BYTES) {
      throw new BoardShareProtocolError("invalid-digest");
    }

    const expectedDigest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", jsonBytes),
    );
    if (!equalBytes(suppliedDigest, expectedDigest)) {
      throw new BoardShareProtocolError("digest-mismatch");
    }

    const json = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes);
    const parsed = JSON.parse(json);
    return {
      status: "valid",
      payload: normalizeBoardSharePayload(parsed),
    };
  } catch (error) {
    return {
      status: "invalid",
      reason:
        error instanceof BoardShareProtocolError
          ? error.reason
          : "invalid-payload",
    };
  }
}

/**
 * @param {BoardSharePayload} payload
 * @param {{
 *   projectId: string,
 *   experienceId: string,
 *   contextIds: string[],
 *   requiresContext: boolean,
 *   songIds: Set<string>,
 *   slots: Array<{id: string, eligibleSongIds: Set<string>}>
 * }} target
 */
export function validateBoardShareImport(payload, target) {
  if (payload.p !== target.projectId) {
    return { ok: false, reason: "project-mismatch" };
  }
  if (payload.e !== target.experienceId) {
    return { ok: false, reason: "experience-mismatch" };
  }

  if (target.requiresContext) {
    if (payload.c === null || !target.contextIds.includes(payload.c)) {
      return { ok: false, reason: "invalid-context" };
    }
  } else if (payload.c !== null) {
    return { ok: false, reason: "invalid-context" };
  }

  const slotsById = new Map(target.slots.map((slot) => [slot.id, slot]));
  if (payload.s.length > target.slots.length) {
    return { ok: false, reason: "too-many-picks" };
  }

  /** @type {Record<string, string>} */
  const picks = {};
  for (const [slotId, songId] of payload.s) {
    const slot = slotsById.get(slotId);
    if (!slot) {
      return { ok: false, reason: "unknown-slot" };
    }
    if (!target.songIds.has(songId)) {
      return { ok: false, reason: "unknown-song" };
    }
    if (!slot.eligibleSongIds.has(songId)) {
      return { ok: false, reason: "ineligible-song" };
    }
    picks[slotId] = songId;
  }

  return { ok: true, picks };
}

/**
 * @param {{
 *   slotIds: string[],
 *   currentPicks: Record<string, string>,
 *   importedPicks: Record<string, string>,
 *   currentContextId: string | null,
 *   importedContextId: string | null
 * }} snapshot
 */
export function createBoardSharePreviewDiff(snapshot) {
  const changes = snapshot.slotIds.flatMap((slotId) => {
    const currentSongId = snapshot.currentPicks[slotId];
    const importedSongId = snapshot.importedPicks[slotId];
    return currentSongId === importedSongId
      ? []
      : [{ slotId, currentSongId, importedSongId }];
  });

  return {
    changes,
    contextChanged:
      snapshot.importedContextId !== null &&
      snapshot.importedContextId !== snapshot.currentContextId,
  };
}

/** @param {unknown} value @returns {BoardSharePayload} */
function normalizeBoardSharePayload(value) {
  if (!isRecord(value)) {
    throw new BoardShareProtocolError("invalid-shape");
  }

  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "c,e,p,s,v") {
    throw new BoardShareProtocolError("invalid-shape");
  }
  if (value.v !== BOARD_SHARE_PROTOCOL_VERSION) {
    throw new BoardShareProtocolError("unsupported-version");
  }
  if (!isId(value.p) || !isId(value.e)) {
    throw new BoardShareProtocolError("invalid-id");
  }
  if (value.c !== null && !isId(value.c)) {
    throw new BoardShareProtocolError("invalid-context");
  }
  if (
    !Array.isArray(value.s) ||
    value.s.length === 0 ||
    value.s.length > BOARD_SHARE_MAX_PAIRS
  ) {
    throw new BoardShareProtocolError("invalid-picks");
  }

  const slotIds = new Set();
  const songIds = new Set();
  const pairs = value.s.map((pair) => {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      !isId(pair[0]) ||
      !isId(pair[1])
    ) {
      throw new BoardShareProtocolError("invalid-picks");
    }
    if (slotIds.has(pair[0])) {
      throw new BoardShareProtocolError("duplicate-slot");
    }
    if (songIds.has(pair[1])) {
      throw new BoardShareProtocolError("duplicate-song");
    }
    slotIds.add(pair[0]);
    songIds.add(pair[1]);
    return /** @type {[string, string]} */ ([pair[0], pair[1]]);
  });

  return {
    v: BOARD_SHARE_PROTOCOL_VERSION,
    p: value.p,
    e: value.e,
    c: value.c,
    s: pairs,
  };
}

/** @param {unknown} value */
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value */
function isId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** @param {Uint8Array} bytes */
function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

/** @param {string} value @param {number} maxBytes */
function decodeBase64Url(value, maxBytes) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new BoardShareProtocolError("invalid-base64");
  }

  const estimatedBytes = Math.floor((value.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    throw new BoardShareProtocolError("payload-too-long");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  if (binary.length > maxBytes) {
    throw new BoardShareProtocolError("payload-too-long");
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) {
    throw new BoardShareProtocolError("invalid-base64");
  }
  return bytes;
}

/** @param {Uint8Array} left @param {Uint8Array} right */
function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
