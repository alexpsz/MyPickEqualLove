import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BOARD_SHARE_HASH_PREFIX,
  BOARD_SHARE_MAX_URL_LENGTH,
  BOARD_SHARE_PROTOCOL_VERSION,
  BoardShareProtocolError,
  buildBoardShareUrl,
  createBoardSharePreviewDiff,
  isBoardShareHash,
  parseBoardShareUrl,
  validateBoardShareImport,
} from "../src/utils/boardShareProtocol.mjs";

const exportCaptureSource = await readFile(
  new URL("../src/utils/exportCapture.ts", import.meta.url),
  "utf8",
);
const EXPORT_REALM_HASH = exportCaptureSource.match(
  /EXPORT_REALM_HASH = "([^"]+)"/u,
)?.[1];
assert.ok(EXPORT_REALM_HASH, "export realm hash constant must be discoverable");

const standardPayload = {
  v: BOARD_SHARE_PROTOCOL_VERSION,
  p: "equal-love",
  e: "standard",
  c: null,
  s: [
    ["slot-1", "equal-love"],
    ["slot-2", "tokubechu-shite"],
  ],
};

test("standard board round trips through a Unicode URL without private fields", async () => {
  const firstUrl = await buildBoardShareUrl(
    "https://example.com/推し/",
    standardPayload,
  );
  const secondUrl = await buildBoardShareUrl(
    "https://example.com/推し/",
    standardPayload,
  );
  assert.equal(firstUrl, secondUrl);
  assert.equal(new URL(firstUrl).pathname, "/%E6%8E%A8%E3%81%97/");
  assert.equal(firstUrl.includes("nickname"), false);
  assert.equal(firstUrl.includes("selectedBy"), false);
  assert.deepEqual(await parseBoardShareUrl(firstUrl), {
    status: "valid",
    payload: standardPayload,
  });
});

test("live board round trips with an explicit context", async () => {
  const payload = {
    v: BOARD_SHARE_PROTOCOL_VERSION,
    p: "equal-love",
    e: "kokuritsu_2026",
    c: "day1",
    s: [["unforgettable", "tokubechu-shite"]],
  };
  const url = await buildBoardShareUrl(
    "https://example.com/live/kokuritsu-2026/",
    payload,
  );
  assert.deepEqual(await parseBoardShareUrl(url), {
    status: "valid",
    payload,
  });
});

test("the URL length limit accepts the boundary and rejects one extra byte", async () => {
  const shortUrl = await buildBoardShareUrl(
    "https://example.com/",
    standardPayload,
  );
  const fragment = new URL(shortUrl).hash;
  const prefix = "https://example.com/";
  const exactPath = "a".repeat(
    BOARD_SHARE_MAX_URL_LENGTH - prefix.length - fragment.length,
  );
  const exactUrl = await buildBoardShareUrl(
    `${prefix}${exactPath}`,
    standardPayload,
  );
  assert.equal(exactUrl.length, BOARD_SHARE_MAX_URL_LENGTH);
  await assert.rejects(
    buildBoardShareUrl(`${prefix}${exactPath}a`, standardPayload),
    (error) =>
      error instanceof BoardShareProtocolError &&
      error.reason === "url-too-long",
  );
  assert.deepEqual(await parseBoardShareUrl(`${exactUrl}a`), {
    status: "invalid",
    reason: "url-too-long",
  });
});

test("unknown namespace versions fail closed", async () => {
  const url = new URL("https://example.com/");
  url.hash = "__mypick_board_v2=anything";
  assert.deepEqual(await parseBoardShareUrl(url.toString()), {
    status: "invalid",
    reason: "unsupported-version",
  });
});

test("an unknown payload version inside the v1 namespace fails closed", async () => {
  const url = await buildSignedUrl(
    new TextEncoder().encode(JSON.stringify({ ...standardPayload, v: 2 })),
  );
  assert.deepEqual(await parseBoardShareUrl(url), {
    status: "invalid",
    reason: "unsupported-version",
  });
});

test("a changed payload with the old digest is rejected", async () => {
  const url = new URL(
    await buildBoardShareUrl("https://example.com/", standardPayload),
  );
  const [encodedPayload, digest] = url.hash
    .slice(BOARD_SHARE_HASH_PREFIX.length)
    .split(".");
  const changedCharacter = encodedPayload.at(-1) === "A" ? "B" : "A";
  url.hash = `${BOARD_SHARE_HASH_PREFIX.slice(1)}${encodedPayload.slice(0, -1)}${changedCharacter}.${digest}`;
  assert.deepEqual(await parseBoardShareUrl(url.toString()), {
    status: "invalid",
    reason: "digest-mismatch",
  });
});

test("malformed UTF-8 is rejected after its digest is verified", async () => {
  const url = await buildSignedUrl(new Uint8Array([0xc3, 0x28]));
  assert.deepEqual(await parseBoardShareUrl(url), {
    status: "invalid",
    reason: "invalid-payload",
  });
});

test("duplicate slots and duplicate songs are rejected", async () => {
  await assert.rejects(
    buildBoardShareUrl("https://example.com/", {
      ...standardPayload,
      s: [
        ["slot-1", "equal-love"],
        ["slot-1", "tokubechu-shite"],
      ],
    }),
    (error) =>
      error instanceof BoardShareProtocolError &&
      error.reason === "duplicate-slot",
  );
  await assert.rejects(
    buildBoardShareUrl("https://example.com/", {
      ...standardPayload,
      s: [
        ["slot-1", "equal-love"],
        ["slot-2", "equal-love"],
      ],
    }),
    (error) =>
      error instanceof BoardShareProtocolError &&
      error.reason === "duplicate-song",
  );
});

test("semantic import validation rejects unknown and ineligible IDs", () => {
  const payload = {
    v: BOARD_SHARE_PROTOCOL_VERSION,
    p: "equal-love",
    e: "kokuritsu_2026",
    c: "day1",
    s: [["unforgettable", "day2-only-song"]],
  };
  const target = {
    projectId: "equal-love",
    experienceId: "kokuritsu_2026",
    contextIds: ["day1", "day2", "both"],
    requiresContext: true,
    songIds: new Set(["day1-song", "day2-only-song"]),
    slots: [
      {
        id: "unforgettable",
        eligibleSongIds: new Set(["day1-song"]),
      },
      {
        id: "way-home",
        eligibleSongIds: new Set(["day1-song", "day2-only-song"]),
      },
    ],
  };
  assert.deepEqual(validateBoardShareImport(payload, target), {
    ok: false,
    reason: "ineligible-song",
  });
  assert.deepEqual(
    validateBoardShareImport(
      { ...payload, s: [["missing-slot", "day1-song"]] },
      target,
    ),
    { ok: false, reason: "unknown-slot" },
  );
  assert.deepEqual(
    validateBoardShareImport(
      { ...payload, s: [["unforgettable", "missing-song"]] },
      target,
    ),
    { ok: false, reason: "unknown-song" },
  );
});

test("semantic import validation accepts catalog eligibility and exact context", () => {
  const payload = {
    v: BOARD_SHARE_PROTOCOL_VERSION,
    p: "equal-love",
    e: "kokuritsu_2026",
    c: "day1",
    s: [["way-home", "day2-only-song"]],
  };
  assert.deepEqual(
    validateBoardShareImport(payload, {
      projectId: "equal-love",
      experienceId: "kokuritsu_2026",
      contextIds: ["day1", "day2", "both"],
      requiresContext: true,
      songIds: new Set(["day2-only-song"]),
      slots: [
        {
          id: "way-home",
          eligibleSongIds: new Set(["day2-only-song"]),
        },
      ],
    }),
    { ok: true, picks: { "way-home": "day2-only-song" } },
  );
});

test("export realm and board share hashes never overlap", async () => {
  assert.equal(isBoardShareHash(EXPORT_REALM_HASH), false);
  assert.deepEqual(
    await parseBoardShareUrl(`https://example.com/${EXPORT_REALM_HASH}`),
    { status: "not-share" },
  );
  const shareUrl = await buildBoardShareUrl(
    "https://example.com/",
    standardPayload,
  );
  assert.equal(new URL(shareUrl).hash === EXPORT_REALM_HASH, false);
});

test("import preview diff is computed from the latest completion-time snapshot", () => {
  const importedPicks = { "slot-1": "shared-song" };
  const stalePreview = createBoardSharePreviewDiff({
    slotIds: ["slot-1", "slot-2"],
    currentPicks: { "slot-1": "old-song" },
    importedPicks,
    currentContextId: "day2",
    importedContextId: "day1",
  });
  const latestPreview = createBoardSharePreviewDiff({
    slotIds: ["slot-1", "slot-2"],
    currentPicks: {
      "slot-1": "shared-song",
      "slot-2": "newly-selected-song",
    },
    importedPicks,
    currentContextId: "day1",
    importedContextId: "day1",
  });

  assert.deepEqual(stalePreview, {
    changes: [
      {
        slotId: "slot-1",
        currentSongId: "old-song",
        importedSongId: "shared-song",
      },
    ],
    contextChanged: true,
  });
  assert.deepEqual(latestPreview, {
    changes: [
      {
        slotId: "slot-2",
        currentSongId: "newly-selected-song",
        importedSongId: undefined,
      },
    ],
    contextChanged: false,
  });
});

async function buildSignedUrl(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const url = new URL("https://example.com/");
  url.hash = `${BOARD_SHARE_HASH_PREFIX.slice(1)}${encodeBase64Url(bytes)}.${encodeBase64Url(digest)}`;
  return url.toString();
}

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}
