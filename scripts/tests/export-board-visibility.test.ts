import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExportBoard, {
  ArchetypeDossierPoster,
  InsightsExportBoard,
} from "../../src/components/ExportBoard";
import BoardComparisonExport from "../../src/components/BoardComparisonExport";
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
import { MEMBERS_BY_ID, SONGS, SONGS_BY_ID } from "../../src/data/songs";
import LocaleProvider from "../../src/i18n/LocaleProvider";
import equalLoveArchetypeAffinitiesData from "../../src/projects/equal-love/archetype-21/song-affinities.json";
import {
  EXPORT_SIZE_PRESET_ORDER,
  EXPORT_TEMPLATE_ORDER,
} from "../../src/config/exportPresets";
import type { PickExperience } from "../../src/schema/pick-experience";
import type { ExportHeaderPresentation } from "../../src/schema/export";
import type { Picks, StoredPicks } from "../../src/schema/music";
import { translate } from "../../src/i18n/translate";
import { deriveBoardInsights } from "../../src/utils/boardInsights";
import { deriveBoardAffinity } from "../../src/utils/boardAffinity";
import { compareBoardPicks } from "../../src/utils/boardComparison";
import {
  EXPORT_CAPTURE_PROTOCOL_VERSION,
  EXPORT_REALM_RENDER_TYPE,
  isExportRenderRequest,
} from "../../src/utils/exportCapture";
import {
  EXPORT_IMAGE_READY_TIMEOUT_MS,
  waitForExportImageReady,
  type ExportImageReadinessTarget,
  type ExportImageReadinessTimers,
} from "../../src/utils/exportImageReadiness";
import { ARCHETYPE_ACCENT_OUTLINE } from "../../src/utils/archetypeAccent";
import ArchetypeRadarChart from "../../src/components/ArchetypeRadarChart";
import OshimenPreferenceControl from "../../src/components/OshimenPreferenceControl";

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
  transparentBg = false,
  oshimenMemberId?: string,
) {
  return renderToStaticMarkup(
    createElement(ExportBoard, {
      contentKind: "picks",
      experience,
      exportCanvasId: "test-export-board",
      slots: getSortedExperienceSlots(experience),
      picks: createPicks(experience),
      showTitles,
      transparentBg,
      templateId,
      sizePresetId,
      pageUrl: "https://mypick.kozueginko.com/",
      headerPresentation,
      oshimenMemberId,
    }),
  );
}

function createStoredBoard(songIds: readonly string[]): StoredPicks {
  const slots = getSortedExperienceSlots(STANDARD_PICK_EXPERIENCE);
  const entries = slots.map((slot, index) => {
    const songId = songIds[index];
    if (!songId) throw new Error(`Missing song for ${slot.id}.`);
    return [slot.id, songId] as const;
  });
  return Object.fromEntries(entries);
}

function renderComparisonPoster({
  sizePresetId,
  showTitles = true,
  sharedSongIds = [
    SONGS[1].id,
    SONGS[0].id,
    ...SONGS.slice(2, 10).map((song) => song.id),
  ],
}: {
  sizePresetId: "portrait" | "square";
  showTitles?: boolean;
  sharedSongIds?: readonly string[];
}) {
  const slots = getSortedExperienceSlots(STANDARD_PICK_EXPERIENCE);
  const comparison = compareBoardPicks({
    slots,
    current: {
      scope: {
        projectId: STANDARD_PICK_EXPERIENCE.projectId,
        experienceId: STANDARD_PICK_EXPERIENCE.id,
      },
      picks: createStoredBoard(SONGS.slice(0, 10).map((song) => song.id)),
    },
    shared: {
      scope: {
        projectId: STANDARD_PICK_EXPERIENCE.projectId,
        experienceId: STANDARD_PICK_EXPERIENCE.id,
      },
      picks: createStoredBoard(sharedSongIds),
    },
  });
  if (comparison.availability !== "available") {
    throw new Error(`Expected comparison export input: ${comparison.reason}`);
  }
  const affinity = deriveBoardAffinity(comparison);
  if (!affinity) throw new Error("Expected board affinity export input.");

  return {
    affinity,
    markup: renderToStaticMarkup(
      createElement(BoardComparisonExport, {
        exportCanvasId: "test-board-comparison",
        experience: STANDARD_PICK_EXPERIENCE,
        comparison,
        affinity,
        locale: "en",
        showTitles,
        showQrCode: false,
        templateId: "classic",
        sizePresetId,
        selectedBy: "Test Picker",
        pageUrl: "https://mypick.kozueginko.com/",
      }),
    ),
  };
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

function renderDossierThroughExportBoard(
  templateId: (typeof EXPORT_TEMPLATE_ORDER)[number],
  transparentBg = false,
  oshimenMemberId?: string,
) {
  const result = realArchetypeResults[0];
  if (!result) throw new Error("Expected a real production archetype result.");
  const slots = getSortedExperienceSlots(STANDARD_PICK_EXPERIENCE);
  const picks: Picks = Object.fromEntries(
    slots.map((slot, index) => [
      slot.id,
      SONGS_BY_ID[result.inputKey.split(":")[index] ?? ""],
    ]),
  );

  return renderToStaticMarkup(
    createElement(ExportBoard, {
      contentKind: "archetype",
      experience: STANDARD_PICK_EXPERIENCE,
      exportCanvasId: "test-archetype-template-contract",
      slots,
      picks,
      showTitles: true,
      transparentBg,
      showQrCode: false,
      templateId,
      sizePresetId: "portrait",
      selectedBy: "Test Picker",
      pageUrl: "https://mypick.kozueginko.com/",
      headerPresentation: {
        title: "MY ADVENTURE PARTNER",
        subtitle: "Template contract",
        highlights: ["TEMPLATE CONTRACT"],
        footerLabel: "MY PICK ARCHETYPE",
      },
      oshimenMemberId,
    }),
  );
}

const realBoardInsights = deriveBoardInsights(SONGS.slice(0, 10));

function renderInsightsPoster(
  sizePresetId: "portrait" | "square" | "story",
  locale: "en" | "zh-CN" | "ja" | "ko" = "en",
  showQrCode = false,
) {
  return renderToStaticMarkup(
    createElement(InsightsExportBoard, {
      exportCanvasId: "test-insights-export",
      insights: realBoardInsights,
      sizePresetId,
      selectedBy: "Test Picker",
      showQrCode,
      pageUrl: "https://mypick.kozueginko.com/",
      locale,
    }),
  );
}

function renderInsightsThroughExportBoard(
  sizePresetId: "portrait" | "square" = "portrait",
) {
  return renderToStaticMarkup(
    createElement(ExportBoard, {
      contentKind: "insights",
      experience: STANDARD_PICK_EXPERIENCE,
      exportCanvasId: "test-insights-through-export-board",
      slots: getSortedExperienceSlots(STANDARD_PICK_EXPERIENCE),
      picks: createPicks(STANDARD_PICK_EXPERIENCE),
      showTitles: false,
      transparentBg: true,
      showQrCode: true,
      templateId: "midnight",
      sizePresetId,
      selectedBy: "Test Picker",
      pageUrl: "https://mypick.kozueginko.com/",
      insights: realBoardInsights,
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

test("insights is a dedicated opaque SSR board in portrait and square", () => {
  const portrait = renderInsightsPoster("portrait", "en", true);
  const square = renderInsightsPoster("square");
  const dispatched = renderInsightsThroughExportBoard();

  for (const markup of [portrait, square, dispatched]) {
    assert.match(markup, /data-export-content-kind="insights"/);
    assert.match(markup, /data-export-boundary="insights-header"/);
    assert.match(markup, /data-export-boundary="insights-summary"/);
    assert.match(markup, /data-export-boundary="insights-content"/);
    assert.match(markup, /data-export-boundary="insights-footer"/);
    assert.doesNotMatch(markup, /background-color:transparent/);
    assert.doesNotMatch(markup, /data-export-song-metadata/);
    assert.doesNotMatch(markup, /data-archetype-radar/);
  }

  assert.match(
    portrait,
    /id="test-insights-export"[^>]*width:1080px;height:1350px/,
  );
  assert.match(
    square,
    /id="test-insights-export"[^>]*width:1080px;height:1080px/,
  );
  assert.match(dispatched, /background-color:#ffffff/);
  assert.match(portrait, /data-export-qr-code="true"/);
  assert.doesNotMatch(square, /data-export-qr-code="true"/);
});

test("insights SSR uses every reviewed locale catalog", () => {
  for (const locale of ["en", "zh-CN", "ja", "ko"] as const) {
    const markup = renderInsightsPoster("portrait", locale);
    for (const key of [
      "insights.title",
      "insights.description",
      "insights.releaseYears",
      "insights.releaseTypes",
      "insights.trackTypes",
      "insights.credits",
    ] as const) {
      assert.ok(
        markup.includes(translate(locale, key)),
        `${locale} insights export omitted ${key}`,
      );
    }
    assert.ok(
      markup.includes(
        translate(locale, "insights.export.selectedBy", {
          name: "Test Picker",
        }),
      ),
      `${locale} insights export omitted its selected-by label`,
    );
  }
});

test("insights rejects the unsupported story preset", () => {
  assert.throws(() => renderInsightsPoster("story"), /does not support story/);
});

test("comparison export fits fixed square and portrait canvases with its formula visible", () => {
  const expectedSizes = {
    square: [1080, 1080],
    portrait: [1080, 1350],
  } as const;

  for (const sizePresetId of ["square", "portrait"] as const) {
    const { affinity, markup } = renderComparisonPoster({ sizePresetId });
    const visibleText = markup.replace(/<[^>]*>/g, " ");
    const [width, height] = expectedSizes[sizePresetId];

    assert.equal(affinity.sharedSongCount, 10);
    assert.equal(affinity.totalRankDistance, 2);
    assert.equal(affinity.points, 98);
    assert.match(markup, /data-export-content-kind="comparison"/);
    assert.match(markup, /data-board-affinity-points="98"/);
    assert.match(markup, /data-board-affinity-shared="10"/);
    assert.match(markup, /data-board-affinity-distance="2"/);
    assert.match(markup, /data-board-affinity-equation="true"/);
    assert.match(
      markup,
      new RegExp(
        `id="test-board-comparison"[^>]*width:${width}px;height:${height}px[^>]*overflow:hidden`,
      ),
    );
    for (const boundary of [
      "comparison-header",
      "comparison-affinity",
      "comparison-shared-songs",
      "comparison-exclusive-counts",
      "comparison-footer",
    ]) {
      assert.match(markup, new RegExp(`data-export-boundary="${boundary}"`));
    }
    assert.equal(
      (markup.match(/data-comparison-shared-song=/g) ?? []).length,
      10,
    );
    assert.match(visibleText, /10 × 10 − 2 = 98 points/);
    assert.doesNotMatch(visibleText, /%|\/\s*100/);
  }
});

test("comparison export handles disjoint boards and title hiding without percentages", () => {
  const { affinity, markup } = renderComparisonPoster({
    sizePresetId: "portrait",
    showTitles: false,
    sharedSongIds: SONGS.slice(10, 20).map((song) => song.id),
  });
  const visibleText = markup.replace(/<[^>]*>/g, " ");

  assert.equal(affinity.sharedSongCount, 0);
  assert.equal(affinity.points, 0);
  assert.equal((markup.match(/data-comparison-shared-song=/g) ?? []).length, 0);
  assert.match(visibleText, /0 × 10 − 0 = 0 points/);
  assert.doesNotMatch(visibleText, /%|\/\s*100/);
});

test("comparison capture keeps protocol v4 and all four frozen content kinds", () => {
  assert.equal(EXPORT_CAPTURE_PROTOCOL_VERSION, 4);
  const baseRequest = {
    type: EXPORT_REALM_RENDER_TYPE,
    version: EXPORT_CAPTURE_PROTOCOL_VERSION,
    requestId: "comparison-request",
    experienceId: "standard",
    picks: { "pick-1": SONGS[0].id },
    showTitles: true,
    transparentBg: false,
    showQrCode: true,
    templateId: "classic",
    sizePresetId: "portrait",
    selectedBy: "Fan",
    pageUrl: "https://mypick.kozueginko.com/",
  };
  const comparison = {
    locale: "en",
    shared: {
      projectId: "equal-love",
      experienceId: "standard",
      picks: { "pick-1": SONGS[0].id },
    },
  };

  for (const kind of ["picks", "archetype", "insights"] as const) {
    assert.equal(isExportRenderRequest({ ...baseRequest, kind }), true);
  }
  assert.equal(
    isExportRenderRequest({ ...baseRequest, kind: "comparison", comparison }),
    true,
  );
  assert.equal(
    isExportRenderRequest({ ...baseRequest, kind: "comparison" }),
    false,
  );
  assert.equal(
    isExportRenderRequest({ ...baseRequest, kind: "picks", comparison }),
    false,
  );
});

test("ordinary light posters use a known oshimen color and fail closed for unknown members", () => {
  const nonWhiteMember = MEMBERS_BY_ID["otani-emiri"];
  assert.equal(nonWhiteMember?.color, "#9B6BC8");

  for (const templateId of ["classic", "spotlight"] as const) {
    const baseline = renderPoster(
      STANDARD_PICK_EXPERIENCE,
      true,
      templateId,
      "portrait",
    );
    const unknown = renderPoster(
      STANDARD_PICK_EXPERIENCE,
      true,
      templateId,
      "portrait",
      undefined,
      false,
      "missing-member",
    );
    const accented = renderPoster(
      STANDARD_PICK_EXPERIENCE,
      true,
      templateId,
      "portrait",
      undefined,
      false,
      nonWhiteMember.id,
    );

    assert.equal(unknown, baseline);
    assert.notEqual(accented, baseline);
    assert.match(
      accented,
      new RegExp(`data-oshimen-accent-color="${nonWhiteMember.color}"`),
    );
    const baselineColorUses = baseline.split(nonWhiteMember.color).length - 1;
    const accentedColorUses = accented.split(nonWhiteMember.color).length - 1;
    assert.ok(
      accentedColorUses >= baselineColorUses + 10,
      `${templateId} must apply the oshimen color beyond the always-present member strip`,
    );
    assert.match(
      accented,
      new RegExp(
        `id="test-export-board"[^>]*border:${templateId === "spotlight" ? 6 : 2}px solid ${nonWhiteMember.color}`,
      ),
    );
    assert.match(
      accented,
      new RegExp(
        `data-export-boundary="footer"[^>]*border-top:2px solid ${nonWhiteMember.color}[^>]*color:${nonWhiteMember.color}`,
      ),
    );
    assert.doesNotMatch(accented, /data-oshimen-accent-outline=/);
  }
});

test("white oshimen poster accents expose a neutral outline fallback", () => {
  const whiteMember = Object.values(MEMBERS_BY_ID).find(
    (member) => member.color?.toLowerCase() === "#ffffff",
  );
  assert.ok(whiteMember?.color);
  const markup = renderPoster(
    STANDARD_PICK_EXPERIENCE,
    true,
    "classic",
    "portrait",
    undefined,
    false,
    whiteMember.id,
  );

  assert.match(markup, /data-oshimen-accent-color="#FFFFFF"/i);
  assert.match(markup, /data-oshimen-accent-outline="#64748b"/);
  assert.match(markup, /border:2px solid #64748b/);
});

test("oshimen cannot alter Live, fixed-color, or Archetype export contracts", () => {
  const memberId = Object.values(MEMBERS_BY_ID).find(
    (member) => member.color?.toLowerCase() !== "#ffffff",
  )?.id;
  assert.ok(memberId);

  for (const templateId of ["classic", "spotlight"] as const) {
    assert.equal(
      renderPoster(liveExperience, true, templateId, "portrait", undefined),
      renderPoster(
        liveExperience,
        true,
        templateId,
        "portrait",
        undefined,
        false,
        memberId,
      ),
    );
  }
  for (const templateId of ["midnight", "cover-tone"] as const) {
    assert.equal(
      renderPoster(STANDARD_PICK_EXPERIENCE, true, templateId, "portrait"),
      renderPoster(
        STANDARD_PICK_EXPERIENCE,
        true,
        templateId,
        "portrait",
        undefined,
        false,
        memberId,
      ),
    );
  }
  for (const templateId of EXPORT_TEMPLATE_ORDER) {
    assert.equal(
      renderDossierThroughExportBoard(templateId),
      renderDossierThroughExportBoard(templateId, false, memberId),
    );
  }
});

test("oshimen control exposes selection, explicit clearing, and only the solo count", () => {
  const members = Object.values(MEMBERS_BY_ID).slice(0, 3);
  const selectedMember = members[0];
  assert.ok(selectedMember);
  const selected = renderToStaticMarkup(
    createElement(LocaleProvider, {
      children: createElement(OshimenPreferenceControl, {
        members,
        memberId: selectedMember.id,
        soloSongCount: 2,
        onChange: () => {},
      }),
    }),
  );
  const unset = renderToStaticMarkup(
    createElement(LocaleProvider, {
      children: createElement(OshimenPreferenceControl, {
        members,
        memberId: null,
        soloSongCount: null,
        onChange: () => {},
      }),
    }),
  );

  assert.match(selected, /data-oshimen-preference="true"/);
  assert.match(selected, /data-oshimen-solo-count="2"/);
  assert.match(selected, /Her solo songs in this Top 10: 2/);
  assert.match(selected, /Clear oshimen/);
  const selectedMemberNamePattern = selectedMember.name.ja.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  assert.match(
    selected,
    new RegExp(`<span[^>]*lang="ja"[^>]*>${selectedMemberNamePattern}</span>`),
  );
  for (const markup of [selected, unset]) {
    assert.match(
      markup,
      /<button[^>]*type="button"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/,
    );
    assert.doesNotMatch(markup, /<(?:select|option)\b/i);
  }
  assert.doesNotMatch(unset, /data-oshimen-solo-count=/);
  assert.doesNotMatch(unset, /Clear oshimen/);
  assert.match(unset, />Not set<\/span>/);
});

test("dark ordinary templates stay opaque while light and archetype exports preserve transparency", () => {
  const classic = renderPoster(
    STANDARD_PICK_EXPERIENCE,
    true,
    "classic",
    "portrait",
    undefined,
    true,
  );
  const midnight = renderPoster(
    STANDARD_PICK_EXPERIENCE,
    true,
    "midnight",
    "portrait",
    undefined,
    true,
  );
  const coverTone = renderPoster(
    STANDARD_PICK_EXPERIENCE,
    true,
    "cover-tone",
    "portrait",
    undefined,
    true,
  );
  const archetype = renderDossierThroughExportBoard("midnight", true);

  assert.match(
    classic,
    /id="test-export-board"[^>]*background-color:transparent/,
  );
  assert.doesNotMatch(
    midnight,
    /id="test-export-board"[^>]*background-color:transparent/,
  );
  assert.doesNotMatch(
    coverTone,
    /id="test-export-board"[^>]*background-color:transparent/,
  );
  assert.match(
    archetype,
    /id="test-archetype-template-contract"[^>]*background-color:transparent/,
  );
});

test("Archetype dossier markup is identical for every ordinary export template", () => {
  const baseline = renderDossierThroughExportBoard("classic");

  for (const templateId of EXPORT_TEMPLATE_ORDER) {
    assert.equal(renderDossierThroughExportBoard(templateId), baseline);
  }
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
  assert.match(
    markup,
    /data-archetype-trait-pill="true"[^>]*box-sizing:border-box;height:28px/,
  );
  assert.match(markup, /data-archetype-trait-pill="true"[^>]*padding:0 11px/);
  assert.match(
    markup,
    /data-archetype-trait-pill="true"[\s\S]*data-archetype-trait-label="true"[^>]*line-height:1.2;text-align:center;transform:translateY\(1px\)/,
  );
  assert.match(
    markup,
    /data-archetype-footer-brand="true"[^>]*font-family:-apple-system[^>]*font-size:25px;font-weight:900;letter-spacing:0.12em;line-height:1.05/,
  );
  assert.match(
    markup,
    /data-archetype-footer-page="true"[^>]*height:52.5px;display:flex;flex-direction:column;justify-content:flex-end[\s\S]*font-family:-apple-system[^>]*font-size:25px;font-weight:900;letter-spacing:0.12em;line-height:1.05/,
  );
  assert.match(markup, /data-archetype-footer-page="true"[\s\S]*color:#111827/);
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
