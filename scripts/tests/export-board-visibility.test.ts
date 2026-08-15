import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExportBoard, {
  ArchetypeDossierPoster,
} from "../../src/components/ExportBoard";
import {
  LIVE_EXPERIENCES,
  STANDARD_PICK_EXPERIENCE,
  getSortedExperienceSlots,
} from "../../src/data/pickExperiences";
import {
  resolveEqualLoveArchetype,
  type EqualLoveArchetypeCharacterResult,
  type EqualLoveArchetypeResult,
} from "../../src/data/equalLoveArchetype";
import { MEMBERS_BY_ID, SONGS } from "../../src/data/songs";
import equalLoveArchetypeAffinitiesData from "../../src/projects/equal-love/archetype-21/song-affinities.json";
import {
  EXPORT_SIZE_PRESET_ORDER,
  EXPORT_TEMPLATE_ORDER,
} from "../../src/config/exportPresets";
import type { PickExperience } from "../../src/schema/pick-experience";
import type { ExportHeaderPresentation } from "../../src/schema/export";
import type { Picks } from "../../src/schema/music";
import {
  EXPORT_IMAGE_READY_TIMEOUT_MS,
  waitForExportImageReady,
  type ExportImageReadinessTarget,
  type ExportImageReadinessTimers,
} from "../../src/utils/exportImageReadiness";
import { ARCHETYPE_ACCENT_OUTLINE } from "../../src/utils/archetypeAccent";
import ArchetypeRadarChart from "../../src/components/ArchetypeRadarChart";

type ImageEventType = "load" | "error";
type ImageListener = () => void;

class TestImage implements ExportImageReadinessTarget {
  complete: boolean;
  naturalWidth: number;
  decode?: () => Promise<void>;
  private readonly listeners = new Map<ImageEventType, Set<ImageListener>>();

  constructor({
    complete,
    naturalWidth,
    decode,
  }: {
    complete: boolean;
    naturalWidth: number;
    decode?: () => Promise<void>;
  }) {
    this.complete = complete;
    this.naturalWidth = naturalWidth;
    this.decode = decode;
  }

  addEventListener(type: ImageEventType, listener: ImageListener) {
    const listeners = this.listeners.get(type) ?? new Set<ImageListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: ImageEventType, listener: ImageListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: ImageEventType) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  get listenerCount() {
    return [...this.listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0,
    );
  }
}

class ManualTimers implements ExportImageReadinessTimers {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  setTimeout(callback: () => void) {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  clearTimeout(timerId: unknown) {
    this.callbacks.delete(timerId as number);
  }

  fireNext() {
    const entry = this.callbacks.entries().next().value as
      | [number, () => void]
      | undefined;
    assert.ok(entry, "Expected a pending timer");
    const [id, callback] = entry;
    this.callbacks.delete(id);
    callback();
  }

  get pendingCount() {
    return this.callbacks.size;
  }
}

const liveExperience = LIVE_EXPERIENCES.find(
  (experience) => experience.export.layout === "five-memory-list",
);

if (!liveExperience) {
  throw new Error("Expected a published five-memory export experience.");
}

function createPicks(experience: PickExperience): Picks {
  return Object.fromEntries(
    getSortedExperienceSlots(experience).map((slot, index) => [
      slot.id,
      SONGS[index],
    ]),
  );
}

function renderPoster(
  experience: PickExperience,
  showTitles: boolean,
  templateId: (typeof EXPORT_TEMPLATE_ORDER)[number],
  sizePresetId: (typeof EXPORT_SIZE_PRESET_ORDER)[number],
  headerPresentation?: ExportHeaderPresentation,
) {
  return renderToStaticMarkup(
    createElement(ExportBoard, {
      experience,
      exportCanvasId: "test-export-board",
      slots: getSortedExperienceSlots(experience),
      picks: createPicks(experience),
      showTitles,
      templateId,
      sizePresetId,
      pageUrl: "https://mypick.kozueginko.com/",
      headerPresentation,
    }),
  );
}

const realArchetypeResults = Array.from({ length: SONGS.length }, (_, offset) =>
  resolveEqualLoveArchetype(
    Array.from(
      { length: 10 },
      (__, index) => SONGS[(offset + index) % SONGS.length].id,
    ),
    "en",
    equalLoveArchetypeAffinitiesData,
  ),
).filter((result): result is EqualLoveArchetypeResult => Boolean(result));

const realArchetypeCharacters = [
  ...new Map(
    realArchetypeResults
      .flatMap((result) => result.characters)
      .map((character) => [character.roleId, character]),
  ).values(),
];

if (realArchetypeCharacters.length < 3 || !realArchetypeResults[0]) {
  throw new Error("Expected at least three real production archetype winners.");
}

function renderDossierPoster(
  characters: readonly EqualLoveArchetypeCharacterResult[],
  showQrCode = false,
  baseResult: EqualLoveArchetypeResult = realArchetypeResults[0],
) {
  return renderToStaticMarkup(
    createElement(ArchetypeDossierPoster, {
      exportCanvasId: "test-archetype-dossier",
      result: {
        ...baseResult,
        isTie: characters.length > 1,
        characters,
      },
      slots: getSortedExperienceSlots(STANDARD_PICK_EXPERIENCE),
      picks: createPicks(STANDARD_PICK_EXPERIENCE),
      showTitles: true,
      transparentBg: false,
      showQrCode,
      selectedBy: "Test Picker",
      pageUrl: "https://mypick.kozueginko.com/",
      footerLabel: "MY PICK ARCHETYPE",
    }),
  );
}

test("poster metadata is all-or-nothing across templates, sizes, and layouts", () => {
  for (const experience of [STANDARD_PICK_EXPERIENCE, liveExperience]) {
    const slotCount = getSortedExperienceSlots(experience).length;

    for (const templateId of EXPORT_TEMPLATE_ORDER) {
      for (const sizePresetId of EXPORT_SIZE_PRESET_ORDER) {
        const withTitles = renderPoster(
          experience,
          true,
          templateId,
          sizePresetId,
        );
        const coverPriority = renderPoster(
          experience,
          false,
          templateId,
          sizePresetId,
        );

        assert.equal(
          (withTitles.match(/data-export-song-metadata/g) ?? []).length,
          slotCount,
        );
        assert.equal(
          (withTitles.match(/data-export-year-tag/g) ?? []).length,
          slotCount,
        );
        assert.doesNotMatch(coverPriority, /data-export-song-metadata/);
        assert.doesNotMatch(coverPriority, /data-export-year-tag/);
      }
    }
  }
});

test("titleless standard cards become cover-priority while Live keeps slot semantics", () => {
  const titledStandardMarkup = renderPoster(
    STANDARD_PICK_EXPERIENCE,
    true,
    "classic",
    "portrait",
  );
  const standardMarkup = renderPoster(
    STANDARD_PICK_EXPERIENCE,
    false,
    "classic",
    "portrait",
  );
  const liveMarkup = renderPoster(liveExperience, false, "spotlight", "story");

  assert.match(
    standardMarkup,
    /data-export-cover-box="square"[^>]*height:100%;aspect-ratio:1 \/ 1;margin:0 auto;overflow:hidden/,
  );
  assert.match(
    standardMarkup,
    /width:100%;height:100%;object-fit:contain;object-position:center/,
  );
  assert.doesNotMatch(standardMarkup, /border-left/);
  assert.match(
    titledStandardMarkup,
    /width:auto;height:100%;aspect-ratio:1 \/ 1;object-fit:cover/,
  );
  assert.match(titledStandardMarkup, /border-left/);
  assert.ok(liveMarkup.includes(liveExperience.slots[0].label));
  assert.doesNotMatch(liveMarkup, /data-export-year-tag/);
});

test("ordinary poster retains its existing header, grid, metadata, and footer DOM", () => {
  const markup = renderPoster(
    STANDARD_PICK_EXPERIENCE,
    true,
    "classic",
    "portrait",
  );
  assert.match(markup, /data-export-content-kind="picks"/);
  assert.match(markup, /data-export-header="hasunosora-style"/);
  assert.match(markup, /data-member-color-strip="true"/);
  assert.match(markup, /data-export-boundary="content"/);
  assert.match(markup, /data-export-boundary="footer"/);
  assert.equal((markup.match(/data-export-song-metadata/g) ?? []).length, 10);
  assert.equal((markup.match(/data-export-year-tag/g) ?? []).length, 10);
  assert.doesNotMatch(markup, /data-archetype-radar/);
  assert.doesNotMatch(markup, /data-export-boundary="archetype-dossier"/);
});

test("single archetype export is a dedicated fixed dossier with radar and Top 10", () => {
  const character = realArchetypeCharacters[0];
  const markup = renderDossierPoster([character], true);
  const officialAccent = MEMBERS_BY_ID[character.memberId].color;

  assert.match(markup, /data-export-content-kind="archetype"/);
  assert.match(markup, /data-archetype-tie-mode="single"/);
  assert.match(markup, /data-export-boundary="archetype-dossier"/);
  assert.match(markup, /data-export-boundary="archetype-top-ten"/);
  assert.match(markup, /data-export-boundary="archetype-footer"/);
  assert.match(markup, /width:1080px;height:1350px/);
  assert.match(markup, /height:596px/);
  assert.match(markup, /height:615px/);
  assert.match(markup, /height:135px/);
  assert.ok(markup.includes(character.displayName));
  assert.ok(markup.includes(character.exportSummary));
  assert.equal((markup.match(/data-archetype-radar="true"/g) ?? []).length, 1);
  assert.match(markup, /data-archetype-radar-max="1200"/);
  assert.doesNotMatch(
    markup,
    /AI song-pick analysis, for entertainment only\./,
  );
  assert.match(
    markup,
    /data-archetype-traits="true"[\s\S]*display:inline-flex;align-items:center;justify-content:center/,
  );
  assert.equal((markup.match(/data-archetype-song-rank=/g) ?? []).length, 10);
  assert.equal((markup.match(/data-archetype-song-title=/g) ?? []).length, 10);
  assert.equal(
    (markup.match(/data-archetype-contributing-song="true"/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(markup, /data-export-year-tag/);
  assert.match(markup, /-webkit-line-clamp:2/);
  assert.equal((markup.match(/<img/g) ?? []).length, 10);
  assert.match(markup, /data-export-qr-code="true"/);
  assert.ok(officialAccent && markup.includes(officialAccent));
});

test("white archetype accents remain white with a derived neutral export outline", () => {
  const character = realArchetypeCharacters[0];
  const secondCharacter = realArchetypeCharacters[1];
  const member = MEMBERS_BY_ID[character.memberId];
  const originalColor = member.color;
  let markup = "";

  try {
    member.color = "#FFFFFF";
    markup = renderDossierPoster([character, secondCharacter]);
  } finally {
    member.color = originalColor;
  }

  assert.match(markup, /data-archetype-accent-color="#FFFFFF"/);
  assert.match(
    markup,
    new RegExp(`data-archetype-accent-outline="${ARCHETYPE_ACCENT_OUTLINE}"`),
  );
  assert.match(markup, /fill="#FFFFFF"/);
  assert.match(markup, /stroke="#64748b"/);
  assert.match(markup, /color:#FFFFFF;text-shadow:[^;]*#64748b/);
  assert.match(
    markup,
    /border-top:4px solid #FFFFFF;box-shadow:inset 0 1px 0 #64748b/,
  );
  assert.equal(member.color, originalColor);

  const nonWhiteRadar = renderToStaticMarkup(
    createElement(ArchetypeRadarChart, {
      stats: character.stats,
      labels: character.statLabels,
      accentColor: originalColor ?? "#986ad6",
      ariaLabel: "Non-white radar",
    }),
  );
  assert.doesNotMatch(nonWhiteRadar, /data-archetype-accent-outline=/);
  assert.doesNotMatch(nonWhiteRadar, /#64748b/);
});

test("two-person ties render a dual dossier without silently selecting one", () => {
  const characters = realArchetypeCharacters.slice(0, 2);
  const markup = renderDossierPoster(characters);
  assert.match(markup, /data-archetype-tie-mode="dual"/);
  assert.match(markup, /data-archetype-dual-dossier="true"/);
  assert.equal(
    (markup.match(/data-archetype-dual-character=/g) ?? []).length,
    2,
  );
  assert.equal((markup.match(/data-archetype-radar="true"/g) ?? []).length, 2);
  for (const character of characters) {
    assert.ok(markup.includes(character.displayName));
  }
});

test("three-or-more ties render every winner as a compact squad", () => {
  const characters = realArchetypeCharacters.slice(0, 3);
  const markup = renderDossierPoster(characters);
  assert.match(markup, /data-archetype-tie-mode="squad"/);
  assert.match(markup, /data-archetype-squad-dossier="true"/);
  assert.match(markup, /data-archetype-squad-size="3"/);
  assert.equal(
    (markup.match(/data-archetype-squad-character=/g) ?? []).length,
    3,
  );
  assert.equal((markup.match(/data-archetype-radar="true"/g) ?? []).length, 3);
  for (const character of characters) {
    assert.ok(markup.includes(character.displayName));
  }
});

test("localized dossier fields render from all four reviewed catalogs", () => {
  const songIds = SONGS.slice(0, 10).map(({ id }) => id);
  for (const locale of ["en", "zh-CN", "ja", "ko"] as const) {
    const result = resolveEqualLoveArchetype(
      songIds,
      locale,
      equalLoveArchetypeAffinitiesData,
    );
    assert.ok(result);
    const markup = renderDossierPoster(result.characters, false, result);
    for (const character of result.characters) {
      assert.ok(markup.includes(character.title));
      assert.ok(markup.includes(character.className));
      assert.ok(markup.includes(character.weaponName));
      assert.ok(markup.includes(character.exportSummary));
    }
  }
});

test("mobile preview collapses export options and keeps the image stage flexible", () => {
  const previewModalSource = readFileSync(
    resolve(process.cwd(), "src/components/PreviewModal.tsx"),
    "utf8",
  );

  assert.match(
    previewModalSource,
    /const \[isOptionsExpanded, setIsOptionsExpanded\] = useState\(false\)/,
  );
  assert.match(previewModalSource, /aria-expanded=\{isOptionsExpanded\}/);
  assert.match(previewModalSource, /aria-controls=\{mobileOptionsId\}/);
  assert.match(
    previewModalSource,
    /data-preview-options-panel[\s\S]*isOptionsExpanded \? "block" : "hidden"\} sm:block/,
  );
  assert.match(
    previewModalSource,
    /data-preview-options-grid[\s\S]*grid-cols-2[\s\S]*sm:flex/,
  );
  assert.match(
    previewModalSource,
    /data-preview-option="template"[\s\S]*data-preview-option="transparent"[\s\S]*data-preview-option="qr"[\s\S]*data-preview-option="titles"/,
  );
  assert.match(previewModalSource, /order-2 min-w-0 sm:order-4/);
  assert.match(previewModalSource, /order-3 min-w-0 sm:order-2/);
  assert.match(previewModalSource, /order-4 min-w-0 sm:order-3/);
  assert.match(
    previewModalSource,
    /data-preview-template-segment=\{option\}[\s\S]*aria-pressed=\{selected\}[\s\S]*min-h-11/,
  );
  const templateSegmentedControlSource = previewModalSource.slice(
    previewModalSource.indexOf("function TemplateSegmentedControl"),
    previewModalSource.indexOf("function ToggleChip"),
  );
  assert.match(
    templateSegmentedControlSource,
    /bg-\[var\(--project-primary\)\] text-\[var\(--project-contrast\)\]/,
  );
  assert.match(
    previewModalSource,
    /locale === "zh-CN" \? "sm:w-44" : "sm:w-60"/,
  );
  assert.match(
    previewModalSource,
    /data-preview-option="template"[\s\S]*col-span-2 min-w-0 sm:col-auto/,
  );
  assert.match(
    templateSegmentedControlSource,
    /compactLabels \? "sm:text-\[12px\]" : "sm:text-\[13px\]"/,
  );
  assert.doesNotMatch(templateSegmentedControlSource, /text-white/);
  assert.match(previewModalSource, /config\.shareHashtags\.join\("\\n"\)/);
  assert.match(previewModalSource, /role="group"[\s\S]*aria-label=\{label\}/);
  assert.match(
    previewModalSource,
    /data-preview-toggle-chip[\s\S]*aria-pressed=\{checked\}[\s\S]*min-h-11/,
  );
  assert.match(previewModalSource, /compactTransparentBackground/);
  assert.match(previewModalSource, /compactShowQrCode/);
  assert.match(previewModalSource, /compactShowTitles/);
  assert.doesNotMatch(previewModalSource, /AnchoredOptionMenu/);
  assert.doesNotMatch(previewModalSource, /min-h-\[72px\]/);
  assert.doesNotMatch(previewModalSource, /flex-col-reverse/);
  assert.doesNotMatch(previewModalSource, /type="checkbox"/);
  assert.match(
    previewModalSource,
    /data-preview-image-stage[\s\S]*min-h-0 flex-1 flex-col items-center justify-start/,
  );
  assert.match(previewModalSource, /h-\[92dvh\] max-h-\[92dvh\]/);
  assert.match(
    previewModalSource,
    /block h-auto w-auto max-h-full max-w-full object-contain shadow-\[var\(--shadow-panel\)\]/,
  );
  assert.doesNotMatch(previewModalSource, /absolute inset-4/);
  assert.doesNotMatch(previewModalSource, /bg-white object-contain object-top/);
  assert.doesNotMatch(previewModalSource, /max-h-\[58dvh\]/);
  assert.match(previewModalSource, /grid-cols-5 items-stretch/);
});

test("desktop preview keeps headings left aligned and centers its independent controls row", () => {
  const previewModalSource = readFileSync(
    resolve(process.cwd(), "src/components/PreviewModal.tsx"),
    "utf8",
  );

  assert.match(
    previewModalSource,
    /className="min-w-0 text-left"[\s\S]*id="preview-modal-title"/,
  );
  assert.match(
    previewModalSource,
    /data-preview-options-panel[\s\S]*sm:block sm:w-full/,
  );
  assert.match(
    previewModalSource,
    /data-preview-options-grid[\s\S]*grid-cols-2[\s\S]*sm:flex sm:w-full sm:flex-wrap sm:items-center sm:justify-center sm:gap-3/,
  );
  assert.doesNotMatch(previewModalSource, /sm:justify-end sm:gap-x-2/);
});

test("export image readiness resolves only after load and decode", async () => {
  assert.equal(EXPORT_IMAGE_READY_TIMEOUT_MS, 10_000);
  const timers = new ManualTimers();
  let decodeCalls = 0;
  const image = new TestImage({
    complete: false,
    naturalWidth: 0,
    decode: async () => {
      decodeCalls += 1;
    },
  });
  const readiness = waitForExportImageReady(
    image,
    EXPORT_IMAGE_READY_TIMEOUT_MS,
    timers,
  );

  assert.equal(image.listenerCount, 2);
  assert.equal(timers.pendingCount, 1);
  image.complete = true;
  image.naturalWidth = 320;
  image.dispatch("load");
  await readiness;

  assert.equal(decodeCalls, 1);
  assert.equal(image.listenerCount, 0);
  assert.equal(timers.pendingCount, 0);
});

test("export image readiness rejects images without decoded pixels", async () => {
  const timers = new ManualTimers();
  const image = new TestImage({ complete: true, naturalWidth: 0 });

  await assert.rejects(
    waitForExportImageReady(image, EXPORT_IMAGE_READY_TIMEOUT_MS, timers),
    /no decoded pixels/,
  );
  assert.equal(image.listenerCount, 0);
  assert.equal(timers.pendingCount, 0);
});

test("export image readiness rejects load errors and cleans up", async () => {
  const timers = new ManualTimers();
  const image = new TestImage({ complete: false, naturalWidth: 0 });
  const readiness = waitForExportImageReady(
    image,
    EXPORT_IMAGE_READY_TIMEOUT_MS,
    timers,
  );

  image.dispatch("error");
  await assert.rejects(readiness, /failed to load/);
  assert.equal(image.listenerCount, 0);
  assert.equal(timers.pendingCount, 0);
});

test("export image readiness rejects load timeouts and ignores late load", async () => {
  const timers = new ManualTimers();
  const image = new TestImage({ complete: false, naturalWidth: 0 });
  let settlements = 0;
  const readiness = waitForExportImageReady(
    image,
    EXPORT_IMAGE_READY_TIMEOUT_MS,
    timers,
  );
  void readiness.then(
    () => {
      settlements += 1;
    },
    () => {
      settlements += 1;
    },
  );

  timers.fireNext();
  await assert.rejects(readiness, /load timed out/);
  image.complete = true;
  image.naturalWidth = 320;
  image.dispatch("load");
  await Promise.resolve();

  assert.equal(settlements, 1);
  assert.equal(image.listenerCount, 0);
  assert.equal(timers.pendingCount, 0);
});

test("export image readiness rejects decode failures and clears its timer", async () => {
  const timers = new ManualTimers();
  const image = new TestImage({
    complete: true,
    naturalWidth: 320,
    decode: () => Promise.reject(new Error("decode failed")),
  });

  await assert.rejects(
    waitForExportImageReady(image, EXPORT_IMAGE_READY_TIMEOUT_MS, timers),
    /decode failed/,
  );
  assert.equal(image.listenerCount, 0);
  assert.equal(timers.pendingCount, 0);
});

test("export image readiness rejects decode timeouts and ignores late decode", async () => {
  const timers = new ManualTimers();
  let resolveDecode: (() => void) | undefined;
  const image = new TestImage({
    complete: true,
    naturalWidth: 320,
    decode: () =>
      new Promise<void>((resolve) => {
        resolveDecode = resolve;
      }),
  });
  let settlements = 0;
  const readiness = waitForExportImageReady(
    image,
    EXPORT_IMAGE_READY_TIMEOUT_MS,
    timers,
  );
  void readiness.then(
    () => {
      settlements += 1;
    },
    () => {
      settlements += 1;
    },
  );

  assert.equal(timers.pendingCount, 1);
  timers.fireNext();
  await assert.rejects(readiness, /decode timed out/);
  resolveDecode?.();
  await Promise.resolve();

  assert.equal(settlements, 1);
  assert.equal(image.listenerCount, 0);
  assert.equal(timers.pendingCount, 0);
});
