import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_SCALE,
  EXPORT_SIZE_PRESET_ORDER,
  EXPORT_SIZE_PRESETS,
  EXPORT_TEMPLATE_ORDER,
  getExportSizePreset,
  isExportSizePresetId,
  isExportTemplateId,
  resolveExportComposition,
} from "../src/config/exportPresets";
import { buildExportImageFileName } from "../src/utils/exportFileName";
import {
  parseStoredExportOptions,
  serializeExportOptions,
} from "../src/utils/exportOptions";

test("default contract remains Classic portrait at scale 2", () => {
  assert.deepEqual(DEFAULT_EXPORT_OPTIONS, {
    showTitles: true,
    transparentBg: false,
    templateId: "classic",
    sizePresetId: "portrait",
  });
  assert.equal(EXPORT_SCALE, 2);
  assert.deepEqual(EXPORT_SIZE_PRESETS.portrait, {
    id: "portrait",
    width: 1080,
    height: 1350,
    ratioLabel: "4:5",
    fileNameSuffix: "",
    captureViewportHeight: 1000,
  });

  const composition = resolveExportComposition(
    "classic",
    "portrait",
    "top10-grid",
    "#ff74a8",
  );
  assert.deepEqual(composition.canvas, {
    padding: "44px 54px 34px",
    gap: 20,
    headerPadding: "30px 34px 24px",
    headerTitleSize: 40,
    selectedBySize: 20,
    subtitleSize: 14,
    memberStripMarginTop: 14,
    footerPaddingTop: 14,
    footerFontSize: 15,
  });
  assert.deepEqual(composition.content, {
    mode: "grid",
    columns: 2,
    rows: 5,
    gap: 14,
    fillHeight: true,
    compact: true,
    dense: false,
    titleFontSize: 24,
    cardPadding: "18px 18px 14px",
    tagMarginTop: 12,
  });
  assert.equal(composition.visual.rootBorder, "2px solid #000");
  assert.equal(composition.visual.cardBorder, "2px solid #000");
  assert.equal(composition.visual.headerTextAlign, "center");
});

test("all social presets resolve to exact scale-2 output dimensions", () => {
  const expected = {
    portrait: [2160, 2700],
    square: [2160, 2160],
    story: [2160, 3840],
  } as const;

  for (const [id, size] of Object.entries(EXPORT_SIZE_PRESETS)) {
    assert.deepEqual(
      [size.width * EXPORT_SCALE, size.height * EXPORT_SCALE],
      expected[id as keyof typeof expected],
    );
  }
});

test("layout resolution has explicit standard and Live profiles", () => {
  const theme = "#ff74a8";
  const standardSquare = resolveExportComposition(
    "classic",
    "square",
    "top10-grid",
    theme,
  );
  const liveSquare = resolveExportComposition(
    "spotlight",
    "square",
    "five-memory-list",
    theme,
  );

  assert.equal(standardSquare.content.columns, 2);
  assert.equal(standardSquare.content.rows, 5);
  assert.equal(liveSquare.content.columns, 2);
  assert.equal(liveSquare.content.rows, 3);
  assert.equal(liveSquare.visual.headerTextAlign, "left");
  assert.match(liveSquare.visual.cardBorder, /#ff74a8/);
});

test("every template x size x experience composition has slot capacity", () => {
  const layouts = [
    { id: "top10-grid" as const, slotCount: 10 },
    { id: "five-memory-list" as const, slotCount: 6 },
  ];

  for (const templateId of EXPORT_TEMPLATE_ORDER) {
    for (const sizePresetId of EXPORT_SIZE_PRESET_ORDER) {
      for (const layout of layouts) {
        const composition = resolveExportComposition(
          templateId,
          sizePresetId,
          layout.id,
          "#ff74a8",
        );

        if (composition.content.mode === "grid") {
          assert.ok(composition.content.rows);
          assert.ok(
            composition.content.columns * composition.content.rows >=
              layout.slotCount,
          );
        } else {
          assert.ok(composition.content.fixedCardSize);
          assert.equal(composition.content.columns, 1);
        }
      }
    }
  }
});

test("v2 options round trip only lightweight values", () => {
  const options = {
    showTitles: false,
    transparentBg: true,
    templateId: "spotlight" as const,
    sizePresetId: "story" as const,
  };
  const serialized = serializeExportOptions(options);

  assert.deepEqual(parseStoredExportOptions(serialized, null), options);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), [
    "showTitles",
    "sizePresetId",
    "templateId",
    "transparentBg",
    "version",
  ]);
});

test("preset id guards reject inherited object properties", () => {
  for (const inheritedProperty of ["toString", "__proto__"]) {
    assert.equal(isExportTemplateId(inheritedProperty), false);
    assert.equal(isExportSizePresetId(inheritedProperty), false);
    assert.throws(
      () => getExportSizePreset(inheritedProperty as "portrait"),
      /Unknown export size preset/,
    );
  }
});

test("published schemaVersion 2 options migrate onto Classic portrait", () => {
  assert.deepEqual(
    parseStoredExportOptions(
      JSON.stringify({
        schemaVersion: 2,
        showTitles: false,
        transparentBg: true,
      }),
      null,
    ),
    {
      showTitles: false,
      transparentBg: true,
      templateId: "classic",
      sizePresetId: "portrait",
    },
  );
});

test("invalid schemaVersion options fail closed without legacy fallback", () => {
  const legacy = JSON.stringify({ showTitles: false, transparentBg: true });
  const invalidIntermediateOptions = [
    { schemaVersion: 3, showTitles: false, transparentBg: true },
    { showTitles: false, transparentBg: true },
    { schemaVersion: 2, transparentBg: true },
    { schemaVersion: 2, showTitles: false, transparentBg: "yes" },
    {
      version: 99,
      schemaVersion: 2,
      showTitles: false,
      transparentBg: true,
    },
  ];

  for (const options of invalidIntermediateOptions) {
    assert.deepEqual(
      parseStoredExportOptions(JSON.stringify(options), legacy),
      DEFAULT_EXPORT_OPTIONS,
    );
  }
});

test("legacy booleans migrate onto Classic portrait", () => {
  assert.deepEqual(
    parseStoredExportOptions(
      null,
      JSON.stringify({ showTitles: false, transparentBg: true }),
    ),
    {
      showTitles: false,
      transparentBg: true,
      templateId: "classic",
      sizePresetId: "portrait",
    },
  );
});

test("unknown versions and invalid ids fail closed", () => {
  const unknownVersion = JSON.stringify({
    version: 99,
    showTitles: false,
    transparentBg: true,
    templateId: "spotlight",
    sizePresetId: "story",
  });
  const invalidIds = JSON.stringify({
    version: 2,
    showTitles: false,
    transparentBg: true,
    templateId: "unknown",
    sizePresetId: "banner",
  });

  assert.deepEqual(
    parseStoredExportOptions(unknownVersion, null),
    DEFAULT_EXPORT_OPTIONS,
  );
  assert.deepEqual(
    parseStoredExportOptions(invalidIds, null),
    DEFAULT_EXPORT_OPTIONS,
  );
  assert.deepEqual(
    parseStoredExportOptions("not-json", null),
    DEFAULT_EXPORT_OPTIONS,
  );
});

test("default filename is unchanged and non-default presets are explicit", () => {
  assert.equal(
    buildExportImageFileName("mypick.png", undefined, "classic", "portrait"),
    "mypick.png",
  );
  assert.equal(
    buildExportImageFileName("mypick.png", "day-1", "classic", "square"),
    "mypick_DAY_1_SQUARE.png",
  );
  assert.equal(
    buildExportImageFileName("mypick.png", "day1", "spotlight", "story"),
    "mypick_DAY1_SPOTLIGHT_STORY.png",
  );
});
