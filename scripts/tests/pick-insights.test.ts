import assert from "node:assert/strict";
import test from "node:test";
import equalLoveMembersJson from "../../src/projects/equal-love/members.json";
import equalLoveSongsJson from "../../src/projects/equal-love/songs.json";
import nearlyEqualJoyMembersJson from "../../src/projects/nearly-equal-joy/members.json";
import nearlyEqualJoySongsJson from "../../src/projects/nearly-equal-joy/songs.json";
import notEqualMeMembersJson from "../../src/projects/not-equal-me/members.json";
import notEqualMeSongsJson from "../../src/projects/not-equal-me/songs.json";
import {
  derivePickInsights,
  getUniquePickedSongs,
  limitInsightExportValues,
} from "../../src/utils/pickInsights";
import { getInsightsExportLayoutMetrics } from "../../src/utils/insightsExportLayout";
import {
  EXPORT_CAPTURE_PROTOCOL_VERSION,
  EXPORT_REALM_RENDER_TYPE,
  isExportRenderRequest,
} from "../../src/utils/exportCapture";
import type {
  LocalizedString,
  Member,
  Picks,
  Song,
} from "../../src/schema/music";

const equalLoveMembers = equalLoveMembersJson as Member[];
const equalLoveSongs = equalLoveSongsJson as Song[];
const nearlyEqualJoyMembers = nearlyEqualJoyMembersJson as Member[];
const nearlyEqualJoySongs = nearlyEqualJoySongsJson as Song[];
const notEqualMeMembers = notEqualMeMembersJson as Member[];
const notEqualMeSongs = notEqualMeSongsJson as Song[];

const projects = [
  { id: "equal-love", songs: equalLoveSongs, members: equalLoveMembers },
  {
    id: "nearly-equal-joy",
    songs: nearlyEqualJoySongs,
    members: nearlyEqualJoyMembers,
  },
  { id: "not-equal-me", songs: notEqualMeSongs, members: notEqualMeMembers },
];

for (const project of projects) {
  test(`${project.id}: full catalog reports actual coverage without a center ranking`, () => {
    const insights = derivePickInsights(
      asPicks(project.songs),
      toMembersById(project.members),
    );
    const expected = calculateExpectedCoverage(project.songs, project.members);

    console.info(
      `${project.id}: years=${insights.releaseYears.coverage.known}/${insights.selectedCount}, track=${insights.trackTypes.coverage.known}/${insights.selectedCount}, release=${insights.releaseTypes.coverage.known}/${insights.selectedCount}, members=${insights.members.coverage.known}/${insights.selectedCount}, credits=${insights.credits.coverage.known}/${insights.selectedCount}, centers=${insights.centers.coverage.known}/${insights.selectedCount}`,
    );

    assert.equal(insights.selectedCount, project.songs.length);
    assert.equal(insights.releaseYears.coverage.known, expected.releaseYears);
    assert.equal(insights.decades.coverage.known, expected.releaseYears);
    assert.equal(insights.releaseTypes.coverage.known, expected.releaseTypes);
    assert.equal(insights.trackTypes.coverage.known, expected.trackTypes);
    assert.equal(insights.members.coverage.known, expected.members);
    assert.equal(insights.credits.coverage.known, expected.credits);
    assert.equal(insights.centers.coverage.known, expected.centers);
    assert.equal(insights.centers.eligible, false);
  });
}

test("missing member IDs and unconfirmed credits do not become zero-valued facts", () => {
  const equalMissingMembers = findSongs(equalLoveSongs, [
    "ryuuseigun",
    "gen-eki-aidoru-chu",
    "boku-no-hiroin",
  ]);
  const equalInsights = derivePickInsights(
    asPicks(equalMissingMembers),
    toMembersById(equalLoveMembers),
  );
  assert.equal(equalInsights.members.coverage.known, 0);
  assert.equal(equalInsights.credits.coverage.known, 3);

  const joyMissingFacts = findSongs(nearlyEqualJoySongs, [
    "samaatsuinteeru",
    "watashi-chuuihou",
    "natsu-ha-juerii",
  ]);
  const joyInsights = derivePickInsights(
    asPicks(joyMissingFacts),
    toMembersById(nearlyEqualJoyMembers),
  );
  assert.equal(joyInsights.members.coverage.known, 0);
  assert.equal(joyInsights.credits.coverage.known, 0);

  const notEqualMissingCredits = findSongs(notEqualMeSongs, [
    "kokode-faasutokissu",
    "summer-haze",
  ]);
  const notEqualInsights = derivePickInsights(
    asPicks(notEqualMissingCredits),
    toMembersById(notEqualMeMembers),
  );
  assert.equal(notEqualInsights.credits.coverage.known, 0);
  assert.equal(notEqualInsights.members.coverage.known, 1);
  assert.equal(notEqualInsights.members.eligible, false);
});

test("cross-year picks and shared classifications count distinct songs", () => {
  const songs = findSongs(equalLoveSongs, [
    "equal-love",
    "teokure-caution",
    "be-selfish",
    "love-song-ni-osowareru",
  ]);
  const insights = derivePickInsights(
    asPicks(songs),
    toMembersById(equalLoveMembers),
  );

  assert.deepEqual(
    insights.releaseYears.values.map(({ key }) => key),
    ["2017", "2018", "2022", "2025"],
  );
  assert.deepEqual(insights.releaseTypes.values, [{ key: "single", count: 4 }]);
  assert.deepEqual(insights.trackTypes.values, [{ key: "title", count: 4 }]);

  const sameClassification = derivePickInsights(
    { "slot-1": songs[0], "slot-2": songs[1] },
    toMembersById(equalLoveMembers),
  );
  assert.deepEqual(sameClassification.releaseTypes.values, [
    { key: "single", count: 2 },
  ]);
  assert.deepEqual(sameClassification.trackTypes.values, [
    { key: "title", count: 2 },
  ]);
});

test("duplicate song IDs are excluded defensively from an invalid raw pick map", () => {
  const song = equalLoveSongs[0];
  const insights = derivePickInsights(
    { "slot-1": song, "slot-2": song },
    toMembersById(equalLoveMembers),
  );
  assert.equal(insights.selectedCount, 1);
});

test("confirmed credit combinations stay whole instead of inventing contributors", () => {
  const base = equalLoveSongs[0];
  const combinedCredit = {
    ja: "Person A・Person B / Unit C",
    romaji: "Person A / Person B / Unit C",
  };
  const songs: Song[] = [0, 1].map((index) => ({
    ...base,
    id: `credit-combination-${index}`,
    credits: {
      lyricist: combinedCredit,
      composer: combinedCredit,
      arranger: combinedCredit,
    },
  }));
  const insights = derivePickInsights(
    asPicks(songs),
    toMembersById(equalLoveMembers),
  );
  assert.deepEqual(insights.credits.composers.leaders, [combinedCredit.ja]);
  assert.equal(insights.credits.composers.leaderCount, 2);
});

test("blank, unverified, unknown-member, and invalid-year facts fail closed", () => {
  const base = equalLoveSongs[0];
  const blankCredits: Song = {
    ...base,
    id: "blank-credits",
    releaseDate: "not-a-date",
    memberIds: ["missing-member"],
    credits: {
      lyricist: { ja: " ", romaji: "blank" },
      composer: base.credits!.composer,
      arranger: base.credits!.arranger,
    },
  };
  const unverified: Song = {
    ...base,
    id: "unverified-credits",
    sourceStatus: "unverified",
  };
  const insights = derivePickInsights(
    asPicks([blankCredits, unverified]),
    toMembersById(equalLoveMembers),
  );
  assert.equal(insights.releaseYears.coverage.known, 1);
  assert.equal(insights.members.coverage.known, 1);
  assert.equal(insights.credits.coverage.known, 0);
});

test("center ranking only appears behind the complete-coverage gate", () => {
  const base = equalLoveSongs[0];
  const memberId = equalLoveMembers[0].id;
  const complete = derivePickInsights(
    asPicks(
      [0, 1].map((index) => ({
        ...base,
        id: `center-${index}`,
        centerMemberIds: [memberId, memberId],
      })),
    ),
    toMembersById(equalLoveMembers),
  );
  assert.equal(complete.centers.eligible, true);
  assert.deepEqual(complete.centers.leaders, [memberId]);

  const partial = derivePickInsights(
    asPicks([
      { ...base, id: "center-known", centerMemberIds: [memberId] },
      { ...base, id: "center-missing", centerMemberIds: undefined },
    ]),
    toMembersById(equalLoveMembers),
  );
  assert.equal(partial.centers.eligible, false);
});

test("empty, single-pick, Top 10, and Live six-slot input use their actual selected count", () => {
  const membersById = toMembersById(equalLoveMembers);
  assert.equal(derivePickInsights({}, membersById).selectedCount, 0);
  assert.equal(
    derivePickInsights(asPicks(equalLoveSongs.slice(0, 1)), membersById).members
      .eligible,
    false,
  );
  assert.equal(
    derivePickInsights(asPicks(equalLoveSongs.slice(0, 10)), membersById)
      .selectedCount,
    10,
  );
  assert.equal(
    derivePickInsights(asPicks(equalLoveSongs.slice(0, 6)), membersById)
      .selectedCount,
    6,
  );
});

test("three-pick and Top 10 cover context keep real selected songs visible", () => {
  const threePicks = asPicks(equalLoveSongs.slice(0, 3));
  const topTenPicks = asPicks(equalLoveSongs.slice(0, 10));
  const portraitLayout = getInsightsExportLayoutMetrics("portrait");
  const squareLayout = getInsightsExportLayoutMetrics("square");

  assert.equal(getUniquePickedSongs(threePicks).length, 3);
  assert.deepEqual(
    limitInsightExportValues(
      getUniquePickedSongs(threePicks),
      portraitLayout.maxCoverThumbnails,
    ),
    { visible: equalLoveSongs.slice(0, 3), hiddenCount: 0 },
  );
  assert.equal(getUniquePickedSongs(topTenPicks).length, 10);
  assert.equal(
    limitInsightExportValues(
      getUniquePickedSongs(topTenPicks),
      squareLayout.maxCoverThumbnails,
    ).hiddenCount,
    6,
  );
});

test("export limits retain overflow semantics for ten years and many tied leaders", () => {
  const portraitLayout = getInsightsExportLayoutMetrics("portrait");
  const storyLayout = getInsightsExportLayoutMetrics("story");
  const tenYears = Array.from({ length: 10 }, (_, index) => `20${index + 10}`);
  const yearLimit = limitInsightExportValues(
    tenYears,
    portraitLayout.maxDistributionValues,
  );
  assert.equal(yearLimit.visible.length, portraitLayout.maxDistributionValues);
  assert.equal(yearLimit.hiddenCount, 5);

  const tiedMembers = equalLoveMembers.slice(0, 10).map((member, index) => ({
    ...equalLoveSongs[0],
    id: `test-tie-${index}`,
    memberIds: [member.id],
  }));
  const tieInsights = derivePickInsights(
    asPicks(tiedMembers),
    toMembersById(equalLoveMembers),
  );
  const rankingLimit = limitInsightExportValues(
    tieInsights.members.leaders,
    storyLayout.maxRankingLeaders,
  );
  assert.equal(tieInsights.members.leaders.length, 10);
  assert.equal(rankingLimit.visible.length, 3);
  assert.equal(rankingLimit.hiddenCount, 7);
  assert.deepEqual(limitInsightExportValues(tenYears, -1), {
    visible: [],
    hiddenCount: tenYears.length,
  });
});

test("all social presets leave a deterministic three-section Insights layout", () => {
  const portrait = getInsightsExportLayoutMetrics("portrait");
  const square = getInsightsExportLayoutMetrics("square");
  const story = getInsightsExportLayoutMetrics("story");
  for (const layout of [portrait, square, story]) {
    assert.match(
      layout.gridTemplateRows,
      /^minmax\(.+0\.82fr\) minmax\(.+1\.18fr\)$/,
    );
    assert.ok(layout.metricHeight >= 220);
    assert.ok(layout.coverSize > 0);
    assert.ok(layout.maxCoverThumbnails > 0);
  }
  assert.equal(square.canvasHeight, 1080);
  assert.ok(square.maxDistributionValues < portrait.maxDistributionValues);
  assert.ok(square.maxRankingLeaders < story.maxRankingLeaders);
  assert.ok(square.maxCoverThumbnails < story.maxCoverThumbnails);
  assert.ok(story.metricHeight > portrait.metricHeight);
});

test("combined export protocol requires card type, template, and size", () => {
  const request = {
    type: EXPORT_REALM_RENDER_TYPE,
    version: EXPORT_CAPTURE_PROTOCOL_VERSION,
    requestId: "request-1",
    experienceId: "standard",
    picks: { "slot-1": equalLoveSongs[0].id },
    cardType: "insights",
    showTitles: false,
    transparentBg: false,
    showQrCode: true,
    templateId: "classic",
    sizePresetId: "square",
    selectedBy: "tester",
    pageUrl: "https://example.test/",
  } as const;
  assert.equal(isExportRenderRequest(request), true);
  assert.equal(
    isExportRenderRequest({ ...request, cardType: undefined }),
    false,
  );
  assert.equal(
    isExportRenderRequest({ ...request, cardType: "unknown" }),
    false,
  );
  assert.equal(
    isExportRenderRequest({ ...request, sizePresetId: undefined }),
    false,
  );
  assert.equal(
    isExportRenderRequest({ ...request, templateId: undefined }),
    false,
  );
  assert.equal(
    isExportRenderRequest({ ...request, showQrCode: undefined }),
    false,
  );
  assert.equal(isExportRenderRequest({ ...request, showQrCode: "yes" }), false);
  assert.equal(
    isExportRenderRequest({
      ...request,
      pageUrl: "https://example.test/?share=1",
    }),
    false,
  );
});

function asPicks(songs: Song[]): Picks {
  return Object.fromEntries(
    songs.map((song, index) => [`slot-${index + 1}`, song]),
  );
}

function toMembersById(members: Member[]): Record<string, Member> {
  return Object.fromEntries(members.map((member) => [member.id, member]));
}

function findSongs(songs: Song[], ids: string[]): Song[] {
  const songsById = new Map(songs.map((song) => [song.id, song]));
  return ids.map((id) => {
    const song = songsById.get(id);
    assert.ok(song, `Expected fixture song ${id}`);
    return song;
  });
}

function calculateExpectedCoverage(songs: Song[], members: Member[]) {
  const memberIds = new Set(members.map((member) => member.id));
  let membersKnown = 0;
  let creditsKnown = 0;
  let centersKnown = 0;
  let releaseYearsKnown = 0;
  let releaseTypesKnown = 0;
  let trackTypesKnown = 0;

  for (const song of songs) {
    if (/^\d{4}/.test(song.releaseDate ?? "")) releaseYearsKnown += 1;
    if (song.releaseType) releaseTypesKnown += 1;
    if (song.trackType) trackTypesKnown += 1;
    if (
      Array.isArray(song.memberIds) &&
      song.memberIds.length > 0 &&
      song.memberIds.every((memberId) => memberIds.has(memberId))
    ) {
      membersKnown += 1;
    }
    if (
      Array.isArray(song.centerMemberIds) &&
      song.centerMemberIds.length > 0 &&
      song.centerMemberIds.every((memberId) => memberIds.has(memberId))
    ) {
      centersKnown += 1;
    }
    const credits = song.credits;
    if (
      song.sourceStatus !== "unverified" &&
      hasLocalizedValue(credits?.lyricist) &&
      hasLocalizedValue(credits?.composer) &&
      hasLocalizedValue(credits?.arranger)
    ) {
      creditsKnown += 1;
    }
  }

  return {
    releaseYears: releaseYearsKnown,
    releaseTypes: releaseTypesKnown,
    trackTypes: trackTypesKnown,
    members: membersKnown,
    credits: creditsKnown,
    centers: centersKnown,
  };
}

function hasLocalizedValue(value: LocalizedString | undefined) {
  return Boolean(value?.ja && value?.romaji);
}
