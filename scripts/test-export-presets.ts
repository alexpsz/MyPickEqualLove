import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_CONTENT_SIZE_PRESET_IDS,
  EXPORT_OPTIONS_VERSION,
  EXPORT_SCALE,
  EXPORT_SIZE_PRESET_ORDER,
  EXPORT_SIZE_PRESETS,
  EXPORT_TEMPLATE_ORDER,
  getExportSizePreset,
  isExportSizePresetId,
  isExportSizePresetAvailableForContent,
  isExportTemplateId,
  isTransparentBackgroundAvailableForContent,
  resolveExportComposition,
} from "../src/config/exportPresets";
import { COVER_TONE_PILOT_ENTRIES } from "../src/data/coverTonePilot";
import { EXPORT_CONTENT_KINDS } from "../src/schema/export";
import { buildExportImageFileName } from "../src/utils/exportFileName";
import {
  EXPORT_CAPTURE_PROTOCOL_VERSION,
  EXPORT_REALM_HASH,
  EXPORT_REALM_RENDER_TYPE,
  captureExportImageInFrame,
  getExportContentConstraintError,
  isExportRenderRequest,
} from "../src/utils/exportCapture";
import {
  parseStoredExportOptions,
  serializeExportOptions,
} from "../src/utils/exportOptions";
import { getExportQrTarget, isExportQrTarget } from "../src/utils/exportQr";

test("default contract remains Classic portrait at scale 2", () => {
  assert.deepEqual(DEFAULT_EXPORT_OPTIONS, {
    showTitles: true,
    transparentBg: false,
    showQrCode: true,
    templateId: "classic",
    sizePresetId: "portrait",
  });
  assert.equal(EXPORT_SCALE, 2);
  assert.equal(EXPORT_OPTIONS_VERSION, 2);
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

test("content-kind protocol is exact while insights owns only portrait and square", () => {
  assert.deepEqual(EXPORT_CONTENT_KINDS, [
    "picks",
    "archetype",
    "insights",
    "comparison",
  ]);
  assert.equal(EXPORT_CAPTURE_PROTOCOL_VERSION, 4);
  assert.equal(EXPORT_REALM_HASH, "#__mypick_export_realm_v4");
  assert.deepEqual(EXPORT_CONTENT_SIZE_PRESET_IDS.insights, [
    "portrait",
    "square",
  ]);
  assert.deepEqual(EXPORT_CONTENT_SIZE_PRESET_IDS.comparison, [
    "portrait",
    "square",
  ]);
  assert.deepEqual(EXPORT_CONTENT_SIZE_PRESET_IDS.picks, [
    "portrait",
    "square",
    "story",
  ]);
  assert.deepEqual(EXPORT_CONTENT_SIZE_PRESET_IDS.archetype, [
    "portrait",
    "square",
    "story",
  ]);

  assert.equal(
    isExportSizePresetAvailableForContent("insights", "portrait"),
    true,
  );
  assert.equal(
    isExportSizePresetAvailableForContent("insights", "square"),
    true,
  );
  assert.equal(
    isExportSizePresetAvailableForContent("insights", "story"),
    false,
  );
  assert.equal(
    isTransparentBackgroundAvailableForContent("insights", "classic"),
    false,
  );
  assert.equal(
    isTransparentBackgroundAvailableForContent("comparison", "classic"),
    false,
  );
  assert.equal(
    isTransparentBackgroundAvailableForContent("picks", "classic"),
    true,
  );
  assert.equal(
    isTransparentBackgroundAvailableForContent("picks", "midnight"),
    false,
  );
  assert.equal(
    isTransparentBackgroundAvailableForContent("archetype", "midnight"),
    true,
  );

  assert.equal(
    getExportContentConstraintError({
      kind: "insights",
      sizePresetId: "portrait",
      transparentBg: false,
    }),
    null,
  );
  assert.match(
    getExportContentConstraintError({
      kind: "insights",
      sizePresetId: "story",
      transparentBg: false,
    }) ?? "",
    /does not support the story size preset/,
  );
  assert.match(
    getExportContentConstraintError({
      kind: "insights",
      sizePresetId: "square",
      transparentBg: true,
    }) ?? "",
    /requires an opaque background/,
  );
  assert.match(
    getExportContentConstraintError({
      kind: "comparison",
      sizePresetId: "portrait",
      transparentBg: false,
    }) ?? "",
    /not available/,
  );
});

test("capture rejects invalid insights options before mounting a frame", async () => {
  const basePayload = {
    kind: "insights" as const,
    experienceId: "standard",
    picks: { "pick-1": "song-1" },
    showTitles: true,
    transparentBg: false,
    showQrCode: true,
    templateId: "classic" as const,
    sizePresetId: "portrait" as const,
    selectedBy: "Fan",
    pageUrl: "https://mypick.kozueginko.com/",
  };

  await assert.rejects(
    captureExportImageInFrame({ ...basePayload, transparentBg: true }),
    /requires an opaque background/,
  );
  await assert.rejects(
    captureExportImageInFrame({ ...basePayload, sizePresetId: "story" }),
    /does not support the story size preset/,
  );
});

test("Classic and Spotlight retain their locked visual values", () => {
  const theme = "#ff74a8";
  const classic = resolveExportComposition(
    "classic",
    "portrait",
    "top10-grid",
    theme,
  );
  const spotlight = resolveExportComposition(
    "spotlight",
    "portrait",
    "top10-grid",
    theme,
  );

  assert.deepEqual(classic.visual, {
    canvasBackground: "#ffffff",
    rootBorder: "2px solid #000",
    textureBackground:
      "repeating-linear-gradient(135deg, rgba(0,0,0,0.035) 0, rgba(0,0,0,0.035) 1px, transparent 1px, transparent 9px)",
    headerBackground: "#ffffff",
    headerBorder: "none",
    headerRadius: "0",
    headerTextAlign: "center",
    headerTitleColor: "#07182a",
    memberStripJustify: "center",
    cardBorder: "2px solid #000",
    cardRadius: "0",
    emptyBackground: "#f8f8f8",
    cardBackground: "#ffffff",
    cardDivider: "2px solid #000",
    footerBorder: "2px solid #000",
    footerColor: "#000000",
    mutedTextColor: "#6f8199",
    songTitleColor: "#000",
    emptyTextColor: "#777",
    slotLabelColor: theme,
    yearTagBorder: `1px solid ${theme}`,
    yearTagBackground: "#fff",
    yearTagColor: theme,
  });
  assert.deepEqual(spotlight.visual, {
    canvasBackground: "#ffffff",
    rootBorder: `6px solid ${theme}`,
    textureBackground:
      "repeating-linear-gradient(135deg, rgba(0,0,0,0.018) 0, rgba(0,0,0,0.018) 2px, transparent 2px, transparent 14px)",
    headerBackground: "#ffffff",
    headerBorder: `2px solid ${theme}`,
    headerRadius: "22px",
    headerTextAlign: "left",
    headerTitleColor: theme,
    memberStripJustify: "flex-start",
    cardBorder: `2px solid ${theme}`,
    cardRadius: "18px",
    emptyBackground: "#ffffff",
    cardBackground: "#ffffff",
    cardDivider: `2px solid ${theme}`,
    footerBorder: `2px solid ${theme}`,
    footerColor: theme,
    mutedTextColor: "#6f8199",
    songTitleColor: "#000",
    emptyTextColor: "#777",
    slotLabelColor: theme,
    yearTagBorder: `1px solid ${theme}`,
    yearTagBackground: "#fff",
    yearTagColor: theme,
  });
});

test("Midnight is fixed while cover-tone requires an approved palette", () => {
  const palette = COVER_TONE_PILOT_ENTRIES[0]?.palette;
  assert.ok(palette);
  assert.throws(
    () =>
      resolveExportComposition(
        "cover-tone",
        "portrait",
        "top10-grid",
        "#ff74a8",
      ),
    /requires an approved cover palette/,
  );
  assert.equal(
    resolveExportComposition("midnight", "portrait", "top10-grid", "#ff74a8")
      .visual.canvasBackground,
    "#08111f",
  );
  assert.deepEqual(
    resolveExportComposition(
      "cover-tone",
      "portrait",
      "top10-grid",
      "#ff74a8",
      palette,
    ).visual,
    {
      canvasBackground: palette.background,
      rootBorder: `2px solid ${palette.border}`,
      textureBackground: "none",
      headerBackground: palette.surface,
      headerBorder: `1px solid ${palette.border}`,
      headerRadius: "0",
      headerTextAlign: "center",
      headerTitleColor: palette.text,
      memberStripJustify: "center",
      cardBorder: `1px solid ${palette.border}`,
      cardRadius: "0",
      emptyBackground: palette.surface,
      cardBackground: palette.surface,
      cardDivider: `1px solid ${palette.border}`,
      footerBorder: `1px solid ${palette.border}`,
      footerColor: palette.mutedText,
      mutedTextColor: palette.mutedText,
      songTitleColor: palette.text,
      emptyTextColor: palette.mutedText,
      slotLabelColor: palette.text,
      yearTagBorder: `1px solid ${palette.yearBorder}`,
      yearTagBackground: palette.yearBackground,
      yearTagColor: palette.yearText,
    },
  );
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
          templateId === "cover-tone"
            ? COVER_TONE_PILOT_ENTRIES[0]?.palette
            : undefined,
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
    showQrCode: true,
    templateId: "cover-tone" as const,
    sizePresetId: "story" as const,
  };
  const serialized = serializeExportOptions(options);

  assert.deepEqual(parseStoredExportOptions(serialized, null), options);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), [
    "showQrCode",
    "showTitles",
    "sizePresetId",
    "templateId",
    "transparentBg",
    "version",
  ]);
});

test("preset id guards reject inherited object properties", () => {
  assert.equal(isExportTemplateId("midnight"), true);
  assert.equal(isExportTemplateId("cover-tone"), true);
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
      showQrCode: true,
      templateId: "classic",
      sizePresetId: "portrait",
    },
  );
});

test("published schemaVersion 2 preserves explicit QR booleans", () => {
  for (const showQrCode of [false, true]) {
    assert.equal(
      parseStoredExportOptions(
        JSON.stringify({
          schemaVersion: 2,
          showTitles: true,
          transparentBg: false,
          showQrCode,
        }),
        null,
      ).showQrCode,
      showQrCode,
    );
  }
});

test("invalid schemaVersion options fail closed without legacy fallback", () => {
  const legacy = JSON.stringify({ showTitles: false, transparentBg: true });
  const invalidIntermediateOptions = [
    { schemaVersion: 3, showTitles: false, transparentBg: true },
    { showTitles: false, transparentBg: true },
    { schemaVersion: 2, transparentBg: true },
    { schemaVersion: 2, showTitles: false, transparentBg: "yes" },
    {
      schemaVersion: 2,
      showTitles: false,
      transparentBg: true,
      showQrCode: "yes",
    },
    {
      version: 99,
      schemaVersion: 2,
      showTitles: false,
      transparentBg: true,
      showQrCode: false,
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
      showQrCode: true,
      templateId: "classic",
      sizePresetId: "portrait",
    },
  );
});

test("legacy options preserve explicit QR booleans", () => {
  for (const showQrCode of [false, true]) {
    assert.equal(
      parseStoredExportOptions(
        null,
        JSON.stringify({
          showTitles: true,
          transparentBg: false,
          showQrCode,
        }),
      ).showQrCode,
      showQrCode,
    );
  }
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

test("published v2 options without QR migrate to enabled QR", () => {
  const oldV2 = JSON.stringify({
    version: 2,
    showTitles: false,
    transparentBg: true,
    templateId: "spotlight",
    sizePresetId: "story",
  });
  assert.deepEqual(parseStoredExportOptions(oldV2, null), {
    showTitles: false,
    transparentBg: true,
    showQrCode: true,
    templateId: "spotlight",
    sizePresetId: "story",
  });

  assert.deepEqual(
    parseStoredExportOptions(
      JSON.stringify({ ...JSON.parse(oldV2), showQrCode: "yes" }),
      JSON.stringify({ showTitles: true, transparentBg: false }),
    ),
    DEFAULT_EXPORT_OPTIONS,
  );
});

test("canonical QR booleans preserve explicit false and true", () => {
  const base = {
    version: 2,
    showTitles: true,
    transparentBg: false,
    templateId: "classic",
    sizePresetId: "portrait",
  };

  for (const showQrCode of [false, true]) {
    assert.equal(
      parseStoredExportOptions(JSON.stringify({ ...base, showQrCode }), null)
        .showQrCode,
      showQrCode,
    );
  }
});

test("QR targets accept only canonical HTTP or HTTPS page URLs", () => {
  for (const value of [
    "https://mypick.kozueginko.com/",
    "https://mypick.kozueginko.com/live/kokuritsu-2026/",
    "http://localhost:3000/",
  ]) {
    assert.equal(getExportQrTarget(value), value);
    assert.equal(isExportQrTarget(value), true);
  }

  for (const value of [
    "https://mypick.kozueginko.com/?board=1",
    "https://mypick.kozueginko.com/#state",
    "https://user:pass@mypick.kozueginko.com/",
    "ftp://mypick.kozueginko.com/",
    "not-a-url",
  ]) {
    assert.equal(isExportQrTarget(value), false);
  }
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
  assert.equal(
    buildExportImageFileName("mypick.png", undefined, "midnight", "portrait"),
    "mypick_MIDNIGHT.png",
  );
  assert.equal(
    buildExportImageFileName("mypick.png", undefined, "cover-tone", "portrait"),
    "mypick_COVER-TONE.png",
  );
});

test("capture export request strictly validates its ephemeral payload", () => {
  assert.equal(EXPORT_CAPTURE_PROTOCOL_VERSION, 4);
  const pageUrl = "https://mypick.kozueginko.com/";
  const request = {
    type: EXPORT_REALM_RENDER_TYPE,
    version: EXPORT_CAPTURE_PROTOCOL_VERSION,
    requestId: "request-1",
    kind: "picks",
    experienceId: "standard",
    picks: { "pick-1": "song-1" },
    showTitles: true,
    transparentBg: false,
    showQrCode: true,
    templateId: "classic",
    sizePresetId: "portrait",
    selectedBy: "Fan",
    pageUrl,
  };

  assert.equal(isExportRenderRequest(request, pageUrl), true);
  for (const kind of EXPORT_CONTENT_KINDS) {
    assert.equal(isExportRenderRequest({ ...request, kind }, pageUrl), true);
  }
  assert.equal(
    isExportRenderRequest({ ...request, showQrCode: "yes" }, pageUrl),
    false,
  );
  assert.equal(
    isExportRenderRequest({ ...request, kind: "profile" }, pageUrl),
    false,
  );
  assert.equal(
    isExportRenderRequest({ ...request, pageUrl: `${pageUrl}?qr=1` }, pageUrl),
    false,
  );
  assert.equal(
    isExportRenderRequest(request, "https://mypick.kozueginko.com/live/"),
    false,
  );

  for (const requiredField of [
    "requestId",
    "kind",
    "experienceId",
    "picks",
    "showTitles",
    "transparentBg",
    "showQrCode",
    "templateId",
    "sizePresetId",
    "selectedBy",
    "pageUrl",
  ] as const) {
    const malformedRequest = { ...request } as Record<string, unknown>;
    delete malformedRequest[requiredField];
    assert.equal(isExportRenderRequest(malformedRequest, pageUrl), false);
  }
});
