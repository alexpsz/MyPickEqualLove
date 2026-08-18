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
  radarSource,
  membersSource,
  charactersEnSource,
  charactersZhCnSource,
  charactersJaSource,
  charactersKoSource,
  archetypeAccentSource,
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
  read("../src/components/ArchetypeRadarChart.tsx"),
  read("../src/projects/equal-love/members.json"),
  read("../src/projects/equal-love/archetype-21/characters.en.json"),
  read("../src/projects/equal-love/archetype-21/characters.zh-CN.json"),
  read("../src/projects/equal-love/archetype-21/characters.ja.json"),
  read("../src/projects/equal-love/archetype-21/characters.ko.json"),
  read("../src/utils/archetypeAccent.ts"),
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

test("every single or tied result card renders a localized member-color radar and compact values", () => {
  const characterCards = modalSource.slice(
    modalSource.indexOf("{result.characters.map"),
    modalSource.indexOf("ui.metadata.entertainmentNotice"),
  );
  const cardSource = modalSource.slice(
    modalSource.indexOf("function CharacterResultCard"),
  );

  assert.match(characterCards, /result\.characters\.map\(\(character\)/);
  assert.match(characterCards, /key=\{character\.roleId\}/);
  assert.match(characterCards, /<CharacterResultCard/);
  assert.match(
    cardSource,
    /data-archetype-character-card=\{character\.roleId\}/,
  );
  assert.match(cardSource, /<ArchetypeRadarChart/);
  assert.match(cardSource, /stats=\{character\.stats\}/);
  assert.match(cardSource, /labels=\{character\.statLabels\}/);
  assert.match(cardSource, /accentColor=\{accentColor\}/);
  assert.match(cardSource, /ariaLabel=\{radarAriaLabel\}/);
  assert.doesNotMatch(cardSource, /maxValue=/);
  assert.match(cardSource, /MEMBERS_BY_ID\[character\.memberId\]/);
  assert.match(cardSource, /getMemberColors\(member, fallback\)/);
  assert.match(cardSource, /isHexColor\(PROJECT_THEME_COLOR\)/);
  assert.match(cardSource, /"#6b7280"/);
  assert.match(cardSource, /<dl[\s\S]*STAT_KEYS\.map/);
  assert.match(cardSource, /character\.statLabels\[statId\]/);
  assert.match(cardSource, /character\.stats\[statId\]/);
  assert.doesNotMatch(cardSource, /roleId[\s\S]{0,80}#[\da-f]{6}/i);

  const members = new Map(
    JSON.parse(membersSource).map((member) => [member.id, member]),
  );
  for (const character of JSON.parse(charactersEnSource).characters) {
    const member = members.get(character.memberId);
    assert.ok(member);
    const colors = member.colors ?? [member.color];
    assert.ok(colors.some((color) => /^#[\da-f]{6}$/i.test(color)));
  }
});

test("image generation stays a secondary action behind close", () => {
  assert.match(modalSource, /safe-area-inset-bottom/);
  const footer = modalSource.slice(
    modalSource.indexOf('className="grid grid-cols-2 gap-2 border-t'),
    modalSource.indexOf("</m.div>"),
  );
  const generateButton = footer.slice(
    footer.indexOf("onClick={onGenerateImage}"),
    footer.indexOf("</button>"),
  );
  const closeButton = footer.slice(
    footer.indexOf("onClick={onClose}", footer.indexOf("</button>")),
  );
  assert.doesNotMatch(generateButton, /official-button-primary/);
  assert.match(closeButton, /official-button-primary/);
});

test("four locale catalogs provide reviewed export summaries and canonical member ids", () => {
  const members = new Set(JSON.parse(membersSource).map(({ id }) => id));
  const catalogs = {
    en: JSON.parse(charactersEnSource),
    "zh-CN": JSON.parse(charactersZhCnSource),
    ja: JSON.parse(charactersJaSource),
    ko: JSON.parse(charactersKoSource),
  };
  const englishCharacters = catalogs.en.characters;
  const roleIds = englishCharacters.map(({ roleId }) => roleId);
  assert.equal(englishCharacters.length, 10);
  for (const character of englishCharacters) {
    assert.ok(members.has(character.memberId));
    assert.ok(character.exportSummary.length >= 55);
    assert.ok(character.exportSummary.length <= 175);
    assert.ok(countSentences(character.exportSummary, "en") >= 1);
    assert.ok(countSentences(character.exportSummary, "en") <= 2);
  }
  for (const locale of ["zh-CN", "ja", "ko"]) {
    assert.deepEqual(Object.keys(catalogs[locale].characters), roleIds);
    for (const character of Object.values(catalogs[locale].characters)) {
      assert.ok(character.exportSummary.length >= 35);
      assert.ok(character.exportSummary.length <= 95);
      assert.ok(countSentences(character.exportSummary, locale) >= 1);
      assert.ok(countSentences(character.exportSummary, locale) <= 2);
    }
  }
  assert.match(registrySource, /memberId: readString\(character\.memberId\)/);
  assert.match(
    registrySource,
    /exportSummary: readString\(character\.exportSummary\)/,
  );
  assert.match(exportBoardSource, /MEMBERS_BY_ID\[character\.memberId\]/);
  assert.match(exportBoardSource, /window\.parent\.document/);
  assert.match(
    exportBoardSource,
    /locale === "en"[\s\S]*locale === "zh-CN"[\s\S]*locale === "ja"[\s\S]*locale === "ko"/,
  );
  assert.doesNotMatch(exportBoardSource, /archetype-21-\w+["']\s*:/);
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

test("canonical character names lead the result while title body stays visible without a field label", () => {
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
  assert.doesNotMatch(modalSource, /ui\.labels\.title/);
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
  assert.match(
    ui.locales.en.export.shareText,
    /Please attach the downloaded image\./,
  );
  assert.match(ui.locales["zh-CN"].export.shareText, /※请附上已下载的图片。/);
  assert.match(
    ui.locales.ja.export.shareText,
    /※ダウンロードした画像を添付してください。/,
  );
  assert.match(
    ui.locales.ko.export.shareText,
    /※다운로드한 이미지를 첨부해 주세요\./,
  );
  for (const locale of Object.values(ui.locales)) {
    assert.equal("singleKicker" in locale.result, false);
    assert.equal("tieKicker" in locale.result, false);
    assert.equal("title" in locale.labels, false);
    assert.match(locale.result.singleLead, /Top 10/);
    assert.match(locale.result.tieLead, /Top 10/);
    assert.doesNotMatch(
      `${locale.title} ${locale.result.singleLead} ${locale.result.tieLead}`,
      /adjust|校正|補正|보정|unadjusted|未经校正|補正前|보정 전/i,
    );
  }
  assert.doesNotMatch(messagesSource, /"archetype\./);
  assert.match(registrySource, /import uiData from .*ui\.json/);
  assert.doesNotMatch(registrySource, /singleKicker|tieKicker|labels\.title/);
  assert.doesNotMatch(modalSource, /singleKicker|tieKicker|ui\.labels\.title/);

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

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function countSentences(value, locale) {
  const punctuation = locale === "en" ? /[.!?]+/g : /[。！？.!?]+/g;
  return value.match(punctuation)?.length ?? 0;
}
