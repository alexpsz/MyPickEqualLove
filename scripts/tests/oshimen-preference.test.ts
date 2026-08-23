import assert from "node:assert/strict";
import test from "node:test";

import { resolveExportComposition } from "../../src/config/exportPresets";
import { messages } from "../../src/i18n/messages";
import { PROJECTS } from "../../src/projects/registry";
import type { ExportCoverTonePalette } from "../../src/schema/export";
import type { Member, Song } from "../../src/schema/music";
import { PROJECT_IDS } from "../../src/schema/project";
import { deriveBoardInsights } from "../../src/utils/boardInsights";
import {
  EXPORT_CAPTURE_PROTOCOL_VERSION,
  EXPORT_REALM_RENDER_TYPE,
  isExportRenderRequest,
} from "../../src/utils/exportCapture";
import {
  OSHIMEN_WHITE_OUTLINE,
  getOshimenPreferenceStorageKey,
  parseOshimenPreference,
  planOshimenPreferenceStorageMutation,
  resolveOshimenPosterAccent,
  serializeOshimenPreference,
} from "../../src/utils/oshimenPreference";

const MEMBERS: readonly Member[] = [
  {
    id: "member-a",
    name: { ja: "メンバーA", romaji: "Member A" },
    color: "#f05a9d",
    active: true,
    sortOrder: 1,
  },
  {
    id: "member-white",
    name: { ja: "白メンバー", romaji: "White Member" },
    color: "#FFFFFF",
    active: true,
    sortOrder: 2,
  },
  {
    id: "colors-only",
    name: { ja: "複色メンバー", romaji: "Multi Color Member" },
    colors: ["#111111", "#eeeeee"],
    active: true,
    sortOrder: 3,
  },
];

const PROJECT_CASES = PROJECT_IDS.map(
  (projectId) => [projectId, PROJECTS[projectId].config.storagePrefix] as const,
);

const COVER_TONE_PALETTE: ExportCoverTonePalette = {
  background: "#101010",
  surface: "#202020",
  border: "#303030",
  text: "#f0f0f0",
  mutedText: "#b0b0b0",
  yearBackground: "#404040",
  yearBorder: "#505050",
  yearText: "#ffffff",
};

function makeSong(id: string, overrides: Partial<Song> = {}): Song {
  return {
    id,
    title: { ja: id, romaji: id },
    artist: { ja: "Test", romaji: "Test" },
    coverUrl: `/covers/${id}.jpg`,
    ...overrides,
  };
}

test("preference keys and documents stay isolated across all three projects", () => {
  const keys = new Set<string>();

  for (const [projectId, storagePrefix] of PROJECT_CASES) {
    const key = getOshimenPreferenceStorageKey(storagePrefix);
    const serialized = serializeOshimenPreference(
      "member-a",
      projectId,
      MEMBERS,
    );
    assert.ok(serialized);
    keys.add(key);
    assert.equal(key, `${storagePrefix}_oshimen_preference_v1`);
    assert.deepEqual(parseOshimenPreference(serialized, projectId, MEMBERS), {
      status: "valid",
      memberId: "member-a",
    });

    const otherProjectId = PROJECT_CASES.find(([id]) => id !== projectId)?.[0];
    assert.ok(otherProjectId);
    assert.deepEqual(
      parseOshimenPreference(serialized, otherProjectId, MEMBERS),
      { status: "project-mismatch", memberId: null },
    );
  }

  assert.equal(keys.size, PROJECT_CASES.length);
});

test("unknown, malformed, and future preferences fail closed", () => {
  assert.equal(
    serializeOshimenPreference("missing-member", "equal-love", MEMBERS),
    null,
  );
  assert.deepEqual(
    parseOshimenPreference(
      JSON.stringify({
        version: 1,
        projectId: "equal-love",
        memberId: "missing-member",
      }),
      "equal-love",
      MEMBERS,
    ),
    { status: "unknown-member", memberId: null },
  );
  assert.deepEqual(parseOshimenPreference("not-json", "equal-love", MEMBERS), {
    status: "invalid",
    memberId: null,
  });
  assert.deepEqual(
    parseOshimenPreference(
      JSON.stringify({
        version: 2,
        projectId: "equal-love",
        memberId: "member-a",
      }),
      "equal-love",
      MEMBERS,
    ),
    { status: "unsupported-version", memberId: null },
  );
});

test("clear is an explicit remove mutation and unknown selections are rejected", () => {
  assert.deepEqual(
    planOshimenPreferenceStorageMutation(null, "equal-love", MEMBERS),
    { action: "remove" },
  );
  assert.deepEqual(
    planOshimenPreferenceStorageMutation(
      "missing-member",
      "equal-love",
      MEMBERS,
    ),
    { action: "reject" },
  );
  const mutation = planOshimenPreferenceStorageMutation(
    "member-a",
    "equal-love",
    MEMBERS,
  );
  assert.equal(mutation.action, "set");
  if (mutation.action === "set") {
    assert.deepEqual(JSON.parse(mutation.value), {
      version: 1,
      projectId: "equal-love",
      memberId: "member-a",
    });
  }
});

test("poster accents use only member.color and give white a neutral outline fallback", () => {
  assert.deepEqual(resolveOshimenPosterAccent(MEMBERS[0]), {
    color: "#f05a9d",
    visibleColor: "#f05a9d",
  });
  assert.deepEqual(resolveOshimenPosterAccent(MEMBERS[1]), {
    color: "#FFFFFF",
    visibleColor: OSHIMEN_WHITE_OUTLINE,
    outlineColor: OSHIMEN_WHITE_OUTLINE,
  });
  assert.equal(resolveOshimenPosterAccent(MEMBERS[2]), null);
  assert.equal(resolveOshimenPosterAccent(null), null);
});

test("oshimen insight counts only explicit solo tracks with one matching member", () => {
  const songs = [
    makeSong("solo-a-1", { trackType: "solo", memberIds: ["member-a"] }),
    makeSong("unique-title-a", {
      trackType: "title",
      memberIds: ["member-a"],
    }),
    makeSong("untyped-a", { memberIds: ["member-a"] }),
    makeSong("solo-multiple", {
      trackType: "solo",
      memberIds: ["member-a", "member-b"],
    }),
    makeSong("solo-unattributed", { trackType: "solo" }),
    makeSong("solo-b", { trackType: "solo", memberIds: ["member-b"] }),
    makeSong("solo-a-2", { trackType: "solo", memberIds: ["member-a"] }),
    makeSong("center-only-a", {
      trackType: "title",
      centerMemberIds: ["member-a"],
    }),
    makeSong("unit-a", { trackType: "unit", memberIds: ["member-a"] }),
    makeSong("empty-members", { trackType: "solo", memberIds: [] }),
  ];

  assert.deepEqual(
    deriveBoardInsights(songs, { oshimenMemberId: "member-a" })
      .oshimenSoloSongs,
    { memberId: "member-a", count: 2 },
  );
  assert.equal(deriveBoardInsights(songs).oshimenSoloSongs, null);
});

test("unset posters keep locked visuals while accents affect only light ordinary templates", () => {
  const accent = resolveOshimenPosterAccent(MEMBERS[0]);
  const whiteAccent = resolveOshimenPosterAccent(MEMBERS[1]);
  assert.ok(accent);
  assert.ok(whiteAccent);

  for (const templateId of ["classic", "spotlight"] as const) {
    const baseline = resolveExportComposition(
      templateId,
      "portrait",
      "top10-grid",
      "#ff74a8",
    );
    assert.deepEqual(
      resolveExportComposition(
        templateId,
        "portrait",
        "top10-grid",
        "#ff74a8",
        undefined,
        undefined,
      ),
      baseline,
    );
    assert.match(
      resolveExportComposition(
        templateId,
        "portrait",
        "top10-grid",
        "#ff74a8",
        undefined,
        accent,
      ).visual.rootBorder,
      /#f05a9d/,
    );
    assert.match(
      resolveExportComposition(
        templateId,
        "portrait",
        "top10-grid",
        "#ff74a8",
        undefined,
        whiteAccent,
      ).visual.rootBorder,
      new RegExp(OSHIMEN_WHITE_OUTLINE),
    );
  }

  const midnight = resolveExportComposition(
    "midnight",
    "portrait",
    "top10-grid",
    "#ff74a8",
  );
  assert.deepEqual(
    resolveExportComposition(
      "midnight",
      "portrait",
      "top10-grid",
      "#ff74a8",
      undefined,
      accent,
    ),
    midnight,
  );
  const coverTone = resolveExportComposition(
    "cover-tone",
    "portrait",
    "top10-grid",
    "#ff74a8",
    COVER_TONE_PALETTE,
  );
  assert.deepEqual(
    resolveExportComposition(
      "cover-tone",
      "portrait",
      "top10-grid",
      "#ff74a8",
      COVER_TONE_PALETTE,
      accent,
    ),
    coverTone,
  );
});

test("capture protocol accepts oshimen only on ordinary pick requests", () => {
  const request = {
    type: EXPORT_REALM_RENDER_TYPE,
    version: EXPORT_CAPTURE_PROTOCOL_VERSION,
    requestId: "request-1",
    kind: "picks",
    experienceId: "standard",
    picks: { "slot-1": "song-1" },
    showTitles: true,
    transparentBg: false,
    showQrCode: true,
    templateId: "classic",
    sizePresetId: "portrait",
    selectedBy: "",
    pageUrl: "https://mypick.kozueginko.com/",
    oshimenMemberId: "member-a",
  } as const;

  assert.equal(isExportRenderRequest(request), true);
  assert.equal(
    isExportRenderRequest({ ...request, oshimenMemberId: "" }),
    false,
  );
  assert.equal(isExportRenderRequest({ ...request, kind: "archetype" }), false);
});

test("oshimen copy makes only the explicit solo claim", () => {
  const forbiddenClaim =
    /\bcenter\b|participat|センター|参加|参与|主唱|센터|참여/i;

  for (const catalog of Object.values(messages)) {
    const copy = [
      catalog["oshimen.label"],
      catalog["oshimen.none"],
      catalog["oshimen.clear"],
      catalog["oshimen.soloCount"],
    ].join(" ");
    assert.doesNotMatch(copy, forbiddenClaim);
    assert.match(catalog["oshimen.soloCount"], /\{count\}/);
  }
});
