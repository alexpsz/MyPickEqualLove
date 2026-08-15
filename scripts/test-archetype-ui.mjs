import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  clientSource,
  controlsSource,
  modalSource,
  registrySource,
  affinitySource,
  messagesSource,
  uiSource,
  approvedAffinitiesSource,
  sourceMapSource,
  songsSource,
  exportBoardSource,
  exportCaptureSource,
] = await Promise.all([
  read("../src/components/PickExperienceClient.tsx"),
  read("../src/components/Controls.tsx"),
  read("../src/components/ArchetypeResultModal.tsx"),
  read("../src/data/equalLoveArchetype.ts"),
  read("../src/data/equalLoveArchetypeAffinities.ts"),
  read("../src/i18n/messages.ts"),
  read("../src/projects/equal-love/archetype-21/ui.json"),
  read("../src/projects/equal-love/archetype-21/song-affinities.json"),
  read("./archetype/source-map.json"),
  read("../src/projects/equal-love/songs.json"),
  read("../src/components/ExportBoard.tsx"),
  read("../src/utils/exportCapture.ts"),
]);

test("result matching is gated to a complete unique equal-love standard Top 10", () => {
  const eligibilityStart = clientSource.indexOf(
    "const archetypeTopTenSongIds = useMemo",
  );
  const eligibilityEnd = clientSource.indexOf(
    "const archetypeResult = useMemo",
    eligibilityStart,
  );
  const eligibility = clientSource.slice(eligibilityStart, eligibilityEnd);

  assert.match(eligibility, /PROJECT_ID !== "equal-love"/);
  assert.match(eligibility, /!isStandard/);
  assert.match(eligibility, /slots\.length !== 10/);
  assert.match(
    eligibility,
    /slots\.map\(\(slot\) => picks\[slot\.id\]\?\.id\)/,
  );
  assert.match(eligibility, /songIds\.some\(\(songId\) => !songId\)/);
  assert.match(eligibility, /new Set\(songIds\)\.size !== slots\.length/);
  assert.match(eligibility, /!hydrated/);
  assert.match(eligibility, /isExportRealm/);
});

test("entry stays visible for equal-love standard and has exact 0/1/9/10 states", () => {
  const entryScopeStart = clientSource.indexOf("const showArchetypeEntry =");
  const entryScopeEnd = clientSource.indexOf(
    "const archetypeTopTenSongIds = useMemo",
    entryScopeStart,
  );
  const entryScope = clientSource.slice(entryScopeStart, entryScopeEnd);
  const entryRenderStart = clientSource.indexOf("{archetypeEntryUi ? (");
  const entryRenderEnd = clientSource.indexOf(
    '<main className="app-content-shell',
    entryRenderStart,
  );
  const entryRender = clientSource.slice(entryRenderStart, entryRenderEnd);

  assert.match(entryScope, /hydrated/);
  assert.match(entryScope, /!isExportRealm/);
  assert.match(entryScope, /PROJECT_ID === "equal-love"/);
  assert.match(entryScope, /isStandard/);
  assert.match(entryScope, /slots\.length === 10/);
  assert.doesNotMatch(entryScope, /archetypeResult/);
  assert.match(entryScope, /new Set\(archetypeSelectedSongIds\)\.size/);
  assert.match(entryRender, /data-archetype-entry-state/);
  assert.match(entryRender, /archetypeSelectedCount === 0/);
  assert.match(entryRender, /archetypeRemainingCount === 0/);
  assert.match(entryRender, /entry\.emptyTitle/);
  assert.match(entryRender, /entry\.incompleteTitle/);
  assert.match(entryRender, /entry\.readyTitle/);
  assert.match(entryRender, /entry\.incompleteRemaining/);
  assert.match(entryRender, /remaining: String\(archetypeRemainingCount\)/);
  assert.doesNotMatch(entryRender, /\{archetypeSelectedCount\}\s*\/\s*10/);

  const ui = JSON.parse(uiSource);
  const zh = ui.locales["zh-CN"].entry;
  assert.equal(zh.campaignLabel, "21单 MV 特别企划");
  assert.equal(zh.emptyTitle, "选出 Top 10，找到你的冒险搭档");
  assert.equal(
    zh.emptyDescription,
    "看看在 21 单 MV 的冒险世界里，谁与你最合拍。",
  );
  assert.equal(zh.incompleteTitle, "找到你的冒险搭档");
  assert.equal(zh.incompleteRemaining, "再选 {{remaining}} 首，即可查看结果。");
  assert.equal(zh.readyTitle, "你的冒险搭档已就绪");
  assert.equal(zh.readyCta, "查看我的冒险搭档");

  const getState = (selectedCount) => {
    if (selectedCount === 0) return "empty";
    if (selectedCount === 10) return "ready";
    return `incomplete:${10 - selectedCount}`;
  };
  assert.deepEqual([0, 1, 9, 10].map(getState), [
    "empty",
    "incomplete:9",
    "incomplete:1",
    "ready",
  ]);

  const entryIsVisible = ({ projectId, kind, slotCount, exportRealm }) =>
    !exportRealm &&
    projectId === "equal-love" &&
    kind === "standard" &&
    slotCount === 10;
  assert.equal(
    entryIsVisible({
      projectId: "equal-love",
      kind: "standard",
      slotCount: 10,
      exportRealm: false,
    }),
    true,
  );
  for (const scenario of [
    {
      projectId: "equal-love",
      kind: "live-afterglow",
      slotCount: 6,
      exportRealm: false,
    },
    {
      projectId: "nearly-equal-joy",
      kind: "standard",
      slotCount: 10,
      exportRealm: false,
    },
    {
      projectId: "not-equal-me",
      kind: "standard",
      slotCount: 10,
      exportRealm: false,
    },
    {
      projectId: "equal-love",
      kind: "standard",
      slotCount: 10,
      exportRealm: true,
    },
  ]) {
    assert.equal(entryIsVisible(scenario), false);
  }
});

test("pre-completion entry action opens the existing song-selection path", () => {
  const handlerStart = clientSource.indexOf(
    "const handleArchetypeEntryClick =",
  );
  const handlerEnd = clientSource.indexOf(
    "const handleNicknameChange =",
    handlerStart,
  );
  const handler = clientSource.slice(handlerStart, handlerEnd);

  assert.match(handler, /archetypeResult && archetypeRemainingCount === 0/);
  assert.match(
    handler,
    /setOpenArchetypeInputKey\(archetypeResult\.inputKey\)/,
  );
  assert.match(handler, /handleSlotClick\(archetypeFirstEmptySlotId\)/);
  assert.match(handler, /handleGlobalSearchClick\(\)/);
  assert.doesNotMatch(handler, /resolveEqualLoveArchetype/);

  const entryRenderStart = clientSource.indexOf("{archetypeEntryUi ? (");
  const entryRenderEnd = clientSource.indexOf(
    '<main className="app-content-shell',
    entryRenderStart,
  );
  const entryRender = clientSource.slice(entryRenderStart, entryRenderEnd);
  assert.match(entryRender, /onClick=\{handleArchetypeEntryClick\}/);
  assert.doesNotMatch(entryRender, /disabled=/);
  assert.match(entryRender, /official-button-primary/);
});

test("the client uses the complete approved 85-song static document", () => {
  assert.match(
    clientSource,
    /import equalLoveArchetypeAffinitiesData from .*song-affinities\.json/,
  );
  assert.match(
    clientSource,
    /resolveEqualLoveArchetype\([\s\S]*archetypeTopTenSongIds,[\s\S]*locale,[\s\S]*equalLoveArchetypeAffinitiesData,[\s\S]*\)/,
  );

  const document = JSON.parse(approvedAffinitiesSource);
  const sourceMap = JSON.parse(sourceMapSource);
  const catalog = JSON.parse(songsSource);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.campaignId, "equal-love-archetype-21");
  assert.equal(document.projectId, "equal-love");
  assert.equal(document.rubricVersion, "gemini-video-v1");
  assert.equal(document.songAffinities.length, 85);
  assert.deepEqual(
    document.songAffinities.map(({ songId }) => songId),
    sourceMap.songs.map(({ songId }) => songId),
  );
  assert.deepEqual(
    document.songAffinities.map(({ songId }) => songId),
    catalog.map(({ id }) => id),
  );
  for (const affinity of document.songAffinities) {
    assert.equal(affinity.status, "approved");
    assert.equal(affinity.rubricVersion, "gemini-video-v1");
    const scores = Object.values(affinity.scores);
    assert.equal(scores.filter((score) => score === 2).length, 2);
    assert.equal(scores.filter((score) => score === 1).length, 1);
    assert.equal(scores.filter((score) => score === 0).length, 5);
  }
});

test("CTA stays between Controls and PickBoard without changing mobile controls", () => {
  const controlsEnd = clientSource.indexOf("</Controls>");
  const cta = clientSource.indexOf(
    "archetypeEntryUi.entry.readyCta",
    controlsEnd,
  );
  const pickBoard = clientSource.indexOf("<PickBoard", controlsEnd);
  assert.ok(controlsEnd >= 0 && cta > controlsEnd && pickBoard > cta);
  assert.doesNotMatch(controlsSource, /archetype\./);
  assert.match(clientSource, /official-button-primary min-h-11 w-full/);
});

test("result is transient and keeps persistence out of the modal and matcher", () => {
  assert.match(
    clientSource,
    /const \[openArchetypeInputKey, setOpenArchetypeInputKey\] = useState/,
  );
  assert.match(
    clientSource,
    /current && current !== archetypeResult\?\.inputKey \? null : current/,
  );
  for (const source of [modalSource, registrySource, affinitySource]) {
    assert.doesNotMatch(
      source,
      /localStorage|STORAGE_KEYS|boardShare|html2canvas/,
    );
  }
  assert.match(modalSource, /onGenerateImage/);
  assert.doesNotMatch(modalSource, /ExportBoard|PreviewModal|html2canvas/);
});

test("modal reuses the retained accessible dialog contract", () => {
  assert.match(clientSource, /<MotionPresence[\s\S]*openArchetypeInputKey/);
  assert.match(modalSource, /useDialogA11y\(\{/);
  assert.match(modalSource, /active: presenceState !== "exiting"/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /aria-hidden=\{presenceState === "exiting"\}/);
  assert.match(modalSource, /inert=\{presenceState === "exiting"\}/);
  assert.match(modalSource, /returnFocusRef/);
  assert.match(modalSource, /returnFocusFallbackKey/);
  assert.match(modalSource, /safe-area-inset-bottom/);
});

test("partner image reuses the existing export realm without becoming a saved template", () => {
  assert.match(modalSource, /ui\.export\.button/);
  assert.match(modalSource, /onGenerateImage/);
  assert.match(clientSource, /generateImage\("archetype"\)/);
  assert.match(clientSource, /kind,[\s\S]*archetypeInputKey/);
  assert.match(
    clientSource,
    /buildBoardShareUrl\([\s\S]*createBoardSharePayload/,
  );
  assert.match(
    clientSource,
    /headerPresentation=\{archetypeExportPresentation\}/,
  );
  assert.match(clientSource, /MY ADVENTURE PARTNER/);
  assert.match(exportBoardSource, /data-export-content-kind/);
  assert.match(exportBoardSource, /data-archetype-highlights/);
  assert.match(exportBoardSource, /headerPresentation\?\.footerLabel/);
  assert.match(exportCaptureSource, /EXPORT_CAPTURE_PROTOCOL_VERSION = 4/);
  assert.match(
    exportCaptureSource,
    /value\.kind === "picks" \|\| value\.kind === "archetype"/,
  );
  assert.match(clientSource, /DIALOG_RETURN_KEYS\.archetype/);
});

test("result omits algorithm prose while keeping traits, songs, and official stats", () => {
  assert.doesNotMatch(modalSource, /similarity|percentage|percent|%/i);
  assert.doesNotMatch(modalSource, /adjustedScore/);
  assert.match(modalSource, /overlapTraitIds/);
  assert.match(modalSource, /contributingSongIds/);
  assert.match(modalSource, /STAT_KEYS\.map/);
  assert.match(
    modalSource,
    /"atk",[\s\S]*"def",[\s\S]*"spdMobility",[\s\S]*"sta",[\s\S]*"bearCharmResistance"/,
  );
  assert.doesNotMatch(modalSource, /singleSummary|tieSummary/);
  assert.doesNotMatch(registrySource, /singleSummary|tieSummary/);
  const ui = JSON.parse(uiSource);
  for (const locale of Object.values(ui.locales)) {
    assert.equal("singleSummary" in locale.explanation, false);
    assert.equal("tieSummary" in locale.explanation, false);
  }
});

test("canonical character names lead the result while title stays separately labeled", () => {
  assert.match(registrySource, /displayName: readString\(character\.name\)/);
  assert.match(registrySource, /weaponName: readString\(weapon\.name\)/);

  const jointNames = modalSource.slice(
    modalSource.indexOf("const characterNames"),
    modalSource.indexOf("const lead"),
  );
  assert.match(jointNames, /character\.displayName/);
  assert.doesNotMatch(jointNames, /character\.title/);
  assert.match(
    modalSource,
    /characterName: result\.characters\[0\]\?\.displayName/,
  );

  const cardHeading = modalSource.slice(
    modalSource.indexOf("<h3"),
    modalSource.indexOf("</h3>") + "</h3>".length,
  );
  assert.match(cardHeading, /character\.displayName/);
  assert.doesNotMatch(cardHeading, /character\.title/);
  assert.match(modalSource, /ui\.labels\.title/);
  assert.match(modalSource, /character\.title/);
  assert.match(modalSource, /ui\.labels\.weapon/);
  assert.match(modalSource, /character\.weaponName/);
});

test("ui.json is the single four-locale UI copy source", () => {
  const ui = JSON.parse(uiSource);
  assert.deepEqual(Object.keys(ui.locales).sort(), ["en", "ja", "ko", "zh-CN"]);
  assert.equal(ui.locales["zh-CN"].title, "你的冒险搭档");
  assert.equal(
    ui.locales["zh-CN"].metadata.entertainmentNotice,
    "AI 选曲分析，仅供娱乐。",
  );
  assert.match(
    ui.locales["zh-CN"].metadata.sourceAttribution,
    /角色设定来源：＝LOVE 第 21 单官方 MV/,
  );
  assert.match(
    ui.locales.en.metadata.entertainmentNotice,
    /AI analysis of your song picks/,
  );
  assert.match(ui.locales.ja.metadata.entertainmentNotice, /AIによる選曲分析/);
  assert.match(ui.locales.ko.metadata.entertainmentNotice, /AI 선곡 분석/);
  for (const locale of Object.values(ui.locales)) {
    assert.match(locale.result.singleLead, /Top 10/);
    assert.match(locale.result.tieLead, /Top 10/);
    assert.doesNotMatch(
      `${locale.title} ${locale.result.singleLead} ${locale.result.tieLead}`,
      /adjust|校正|補正|보정|unadjusted|未经校正|補正前|보정 전/i,
    );
  }
  assert.doesNotMatch(messagesSource, /"archetype\./);
  assert.match(registrySource, /import uiData from .*ui\.json/);

  for (const locale of Object.values(ui.locales)) {
    assert.deepEqual(
      [...locale.entry.incompleteRemaining.matchAll(/\{\{(\w+)\}\}/g)].map(
        (match) => match[1],
      ),
      ["remaining"],
    );
    for (const key of [
      "campaignLabel",
      "emptyTitle",
      "emptyDescription",
      "incompleteTitle",
      "readyTitle",
      "startCta",
      "continueCta",
      "readyCta",
    ]) {
      assert.equal(typeof locale.entry[key], "string");
      assert.ok(locale.entry[key].trim().length > 0);
    }
    assert.deepEqual(
      [...locale.result.singleLead.matchAll(/\{\{(\w+)\}\}/g)].map(
        (match) => match[1],
      ),
      ["characterName"],
    );
    for (const templateKey of ["previewLabel", "shareText"]) {
      assert.deepEqual(
        [...locale.export[templateKey].matchAll(/\{\{(\w+)\}\}/g)].map(
          (match) => match[1],
        ),
        ["characterNames"],
      );
    }
  }
});

test("the matcher still fails closed for missing or invalid approved data", () => {
  assert.match(registrySource, /approvedAffinityDocument === undefined/);
  assert.doesNotMatch(affinitySource, /songAffinities:\s*\[/);
  assert.match(affinitySource, /parseEqualLoveArchetypeAffinityDocument/);
  assert.match(affinitySource, /EXPECTED_APPROVED_SONG_COUNT = 85/);
  assert.match(
    affinitySource,
    /document\.songAffinities\.length !== EXPECTED_APPROVED_SONG_COUNT/,
  );
  assert.match(registrySource, /EXPECTED_CHARACTER_COUNT = 10/);
  assert.match(
    registrySource,
    /localizedCatalog\.characters\.size !== EXPECTED_CHARACTER_COUNT/,
  );
  assert.match(registrySource, /catch \{[\s\S]*return null;/);
  assert.match(
    clientSource,
    /openArchetypeInputKey === archetypeResult\?\.inputKey[\s\S]*\? archetypeResult[\s\S]*: null/,
  );
});

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}
