import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExportBoard from "../../src/components/ExportBoard";
import {
  LIVE_EXPERIENCES,
  STANDARD_PICK_EXPERIENCE,
  getSortedExperienceSlots,
} from "../../src/data/pickExperiences";
import { SONGS } from "../../src/data/songs";
import {
  EXPORT_SIZE_PRESET_ORDER,
  EXPORT_TEMPLATE_ORDER,
} from "../../src/config/exportPresets";
import type { PickExperience } from "../../src/schema/pick-experience";
import type { Picks } from "../../src/schema/music";

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
    /data-preview-template-segment=\{option\}[\s\S]*aria-pressed=\{selected\}[\s\S]*min-h-10/,
  );
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
