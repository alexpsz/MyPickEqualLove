import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { resolveExportComposition } from "../../src/config/exportPresets";
import { messages } from "../../src/i18n/messages";
import { PROJECTS } from "../../src/projects/registry";
import { CURRENT_PROJECT_RUNTIME as EQUAL_LOVE_RUNTIME } from "../../src/projects/equal-love/runtime";
import { CURRENT_PROJECT_RUNTIME as NEARLY_EQUAL_JOY_RUNTIME } from "../../src/projects/nearly-equal-joy/runtime";
import { CURRENT_PROJECT_RUNTIME as NOT_EQUAL_ME_RUNTIME } from "../../src/projects/not-equal-me/runtime";
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
  resolveOshimenPreferenceAccess,
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

const PROJECT_RUNTIME_CASES = [
  {
    projectId: "equal-love",
    runtime: EQUAL_LOVE_RUNTIME,
    graduatedMemberIds: ["satake-nonno", "saito-nagisa"],
  },
  {
    projectId: "nearly-equal-joy",
    runtime: NEARLY_EQUAL_JOY_RUNTIME,
    graduatedMemberIds: ["fukuyama-moeka"],
  },
  {
    projectId: "not-equal-me",
    runtime: NOT_EQUAL_ME_RUNTIME,
    graduatedMemberIds: ["suganami-mirei"],
  },
] as const;

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

test("only empty and exact valid documents enter a writable state", () => {
  const serialized = serializeOshimenPreference(
    "member-a",
    "equal-love",
    MEMBERS,
  );
  assert.ok(serialized);
  assert.deepEqual(
    resolveOshimenPreferenceAccess(
      parseOshimenPreference(null, "equal-love", MEMBERS),
    ),
    { memberId: null, writable: true },
  );
  assert.deepEqual(
    resolveOshimenPreferenceAccess(
      parseOshimenPreference(serialized, "equal-love", MEMBERS),
    ),
    { memberId: "member-a", writable: true },
  );
});

test("noncanonical raw documents stay read-only and cannot be overwritten or removed", () => {
  assert.equal(
    serializeOshimenPreference("missing-member", "equal-love", MEMBERS),
    null,
  );

  const cases = [
    {
      label: "future",
      raw: JSON.stringify({
        version: 2,
        projectId: "equal-love",
        memberId: "member-a",
      }),
      status: "unsupported-version",
    },
    {
      label: "invalid",
      raw: "not-json",
      status: "invalid",
    },
    {
      label: "unknown member",
      raw: JSON.stringify({
        version: 1,
        projectId: "equal-love",
        memberId: "missing-member",
      }),
      status: "unknown-member",
    },
    {
      label: "project mismatch",
      raw: JSON.stringify({
        version: 1,
        projectId: "not-equal-me",
        memberId: "member-a",
      }),
      status: "project-mismatch",
    },
    {
      label: "extra key",
      raw: JSON.stringify({
        version: 1,
        projectId: "equal-love",
        memberId: "member-a",
        displayName: "must-not-be-accepted",
      }),
      status: "invalid",
    },
  ] as const;

  for (const testCase of cases) {
    const result = parseOshimenPreference(testCase.raw, "equal-love", MEMBERS);
    assert.equal(result.status, testCase.status, testCase.label);
    const access = resolveOshimenPreferenceAccess(result);
    assert.deepEqual(
      access,
      { memberId: null, writable: false },
      testCase.label,
    );

    let storedValue: string | null = testCase.raw;
    for (const nextMemberId of ["member-a", null]) {
      const mutation = planOshimenPreferenceStorageMutation(
        access.writable,
        nextMemberId,
        "equal-love",
        MEMBERS,
      );
      if (mutation.action === "set") storedValue = mutation.value;
      if (mutation.action === "remove") storedValue = null;
      assert.deepEqual(mutation, { action: "reject" }, testCase.label);
    }
    assert.equal(storedValue, testCase.raw, testCase.label);
  }
});

test("clear is an explicit remove mutation and unknown selections are rejected", () => {
  assert.deepEqual(
    planOshimenPreferenceStorageMutation(true, null, "equal-love", MEMBERS),
    { action: "remove" },
  );
  assert.deepEqual(
    planOshimenPreferenceStorageMutation(
      true,
      "missing-member",
      "equal-love",
      MEMBERS,
    ),
    { action: "reject" },
  );
  const mutation = planOshimenPreferenceStorageMutation(
    true,
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

test("all three oshimen menus keep graduated members from complete project runtimes", () => {
  const repositoryRoot = process.cwd();
  const membersSource = readFileSync(
    resolve(repositoryRoot, "src/data/songs.ts"),
    "utf8",
  );
  const clientSource = readFileSync(
    resolve(repositoryRoot, "src/components/PickExperienceClient.tsx"),
    "utf8",
  );
  const controlSource = readFileSync(
    resolve(repositoryRoot, "src/components/OshimenPreferenceControl.tsx"),
    "utf8",
  );

  assert.match(
    membersSource,
    /export const MEMBERS: Member\[\] = CURRENT_PROJECT_RUNTIME\.members;/,
  );
  assert.match(clientSource, /<OshimenPreferenceControl\s+members=\{MEMBERS\}/);
  assert.match(
    controlSource,
    /const sortedMembers = members\s*\.slice\(\)\s*\.sort\(/,
  );
  assert.match(
    controlSource,
    /\.\.\.sortedMembers\.map\(\(member\) => \(\{\s*value: member\.id,\s*label: member\.name\.ja,\s*lang: "ja",/,
  );

  for (const {
    projectId,
    runtime,
    graduatedMemberIds,
  } of PROJECT_RUNTIME_CASES) {
    assert.equal(runtime.projectId, projectId);
    const sortedMenuMemberIds = runtime.members
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((member) => member.id);

    for (const memberId of graduatedMemberIds) {
      const member = runtime.members.find(
        (candidate) => candidate.id === memberId,
      );
      assert.ok(member, `${projectId}:${memberId}`);
      assert.equal(member.active, false, `${projectId}:${memberId}:active`);
      assert.equal(
        member.graduated,
        true,
        `${projectId}:${memberId}:graduated`,
      );
      assert.ok(
        sortedMenuMemberIds.includes(memberId),
        `${projectId}:${memberId}:menu-option`,
      );
    }
  }
});

test("oshimen control uses the anchored menu without changing its nullable preference contract", () => {
  const controlSource = readFileSync(
    resolve(process.cwd(), "src/components/OshimenPreferenceControl.tsx"),
    "utf8",
  );

  assert.match(controlSource, /import AnchoredOptionMenu/);
  assert.doesNotMatch(controlSource, /<select\b|<option\b/);
  assert.match(
    controlSource,
    /\.sort\(\(left, right\) => left\.sortOrder - right\.sortOrder\)/,
  );
  assert.match(controlSource, /\{ value: "", label: t\("oshimen\.none"\) \}/);
  assert.match(controlSource, /lang: "ja"/);
  assert.match(controlSource, /value=\{memberId \?\? ""\}/);
  assert.match(
    controlSource,
    /onValueChange=\{\(nextMemberId\) => onChange\(nextMemberId \|\| null\)\}/,
  );
  assert.match(controlSource, /onClick=\{\(\) => onChange\(null\)\}/);
  assert.match(controlSource, /data-oshimen-solo-count=\{soloSongCount\}/);
});

test("anchored oshimen menu keeps bounded scrolling, touch targets, and keyboard focus behavior", () => {
  const menuSource = readFileSync(
    resolve(process.cwd(), "src/components/AnchoredOptionMenu.tsx"),
    "utf8",
  );

  assert.match(menuSource, /role="menu"/);
  assert.match(menuSource, /role="menuitemradio"/);
  assert.match(menuSource, /aria-checked=\{selected\}/);
  assert.match(menuSource, /max-h-\[min\(22rem,calc\(100dvh-2rem\)\)\]/);
  assert.match(menuSource, /overflow-y-auto/);
  assert.match(menuSource, /overscroll-contain/);
  assert.match(
    menuSource,
    /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/,
  );
  assert.ok((menuSource.match(/min-h-11/g)?.length ?? 0) >= 2);
  assert.match(menuSource, /lang=\{selectedOption\?\.lang\}/);
  assert.match(menuSource, /lang=\{option\.lang\}/);

  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"]) {
    assert.match(
      menuSource,
      new RegExp(`event\\.key (?:===|!==) "${key}"`),
      key,
    );
  }

  assert.match(menuSource, /document\.addEventListener\("pointerdown"/);
  assert.match(menuSource, /closeMenu\(true\)/);
  assert.match(
    menuSource,
    /triggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/,
  );
});
