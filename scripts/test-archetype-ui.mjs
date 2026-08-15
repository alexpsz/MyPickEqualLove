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
] = await Promise.all([
  read("../src/components/PickExperienceClient.tsx"),
  read("../src/components/Controls.tsx"),
  read("../src/components/ArchetypeResultModal.tsx"),
  read("../src/data/equalLoveArchetype.ts"),
  read("../src/data/equalLoveArchetypeAffinities.ts"),
  read("../src/i18n/messages.ts"),
  read("../src/projects/equal-love/archetype-21/ui.json"),
]);

test("CTA is gated to a complete unique equal-love standard Top 10", () => {
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

test("CTA stays between Controls and PickBoard without changing mobile controls", () => {
  const controlsEnd = clientSource.indexOf("</Controls>");
  const cta = clientSource.indexOf("archetypeResult.ui.entry.cta", controlsEnd);
  const pickBoard = clientSource.indexOf("<PickBoard", controlsEnd);
  assert.ok(controlsEnd >= 0 && cta > controlsEnd && pickBoard > cta);
  assert.doesNotMatch(controlsSource, /archetype\./);
  assert.match(clientSource, /official-button-primary min-h-11 w-full/);
});

test("result is transient and isolated from storage, links, and image export", () => {
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
      /localStorage|STORAGE_KEYS|boardShare|ExportBoard|PreviewModal|html2canvas/,
    );
  }
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

test("result omits similarity percentages and renders the required explanation", () => {
  assert.doesNotMatch(modalSource, /similarity|percentage|percent|%/i);
  assert.match(modalSource, /overlapTraitIds/);
  assert.match(modalSource, /contributingSongIds/);
  assert.match(modalSource, /STAT_KEYS\.map/);
  assert.match(
    modalSource,
    /"atk",[\s\S]*"def",[\s\S]*"spdMobility",[\s\S]*"sta",[\s\S]*"bearCharmResistance"/,
  );
  assert.match(
    registrySource,
    /singleSummary: readTemplate\(explanation\.singleSummary/,
  );
  assert.match(
    registrySource,
    /tieSummary: readTemplate\(explanation\.tieSummary/,
  );
  assert.match(
    modalSource,
    /isTie \? ui\.explanation\.tieSummary : ui\.explanation\.singleSummary/,
  );
  for (const placeholder of ["dimension1", "dimension2", "song1", "song2"]) {
    assert.match(modalSource, new RegExp(`${placeholder}:`));
  }
  assert.match(modalSource, /Unresolved archetype UI template placeholder/);
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
  assert.equal(
    ui.locales["zh-CN"].metadata.entertainmentNotice,
    "AI 选曲同频分析，仅供娱乐。",
  );
  assert.match(
    ui.locales["zh-CN"].metadata.sourceAttribution,
    /角色设定来源：＝LOVE 第 21 单官方 MV/,
  );
  assert.match(
    ui.locales.en.metadata.entertainmentNotice,
    /AI song-sync analysis/,
  );
  assert.match(
    ui.locales.ja.metadata.entertainmentNotice,
    /AIによる選曲シンクロ分析/,
  );
  assert.match(
    ui.locales.ko.metadata.entertainmentNotice,
    /AI 선곡 싱크로 분석/,
  );
  assert.doesNotMatch(messagesSource, /"archetype\./);
  assert.match(registrySource, /import uiData from .*ui\.json/);

  const templateValues = {
    dimension1: "D1",
    dimension2: "D2",
    song1: "S1",
    song2: "S2",
  };
  for (const locale of Object.values(ui.locales)) {
    for (const templateKey of ["singleSummary", "tieSummary"]) {
      const template = locale.explanation[templateKey];
      const placeholders = [...template.matchAll(/\{\{(\w+)\}\}/g)].map(
        (match) => match[1],
      );
      assert.deepEqual([...new Set(placeholders)].sort(), [
        "dimension1",
        "dimension2",
        "song1",
        "song2",
      ]);
      const rendered = template.replace(
        /\{\{(\w+)\}\}/g,
        (_, key) => templateValues[key],
      );
      assert.doesNotMatch(rendered, /\{\{\w+\}\}/);
    }
  }
});

test("missing approved fingerprints leave the feature fail closed", () => {
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
  assert.match(clientSource, /\{archetypeResult \? \(/);
});

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}
