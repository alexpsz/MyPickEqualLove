import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import pilotManifest from "../src/data/cover-tone-pilot.json";
import {
  COVER_TONE_ALGORITHM_VERSION,
  COVER_TONE_PILOT_ENTRIES,
  type CoverTonePilotEntry,
  getCoverToneAvailability,
  isExportTemplateAvailable,
  resolveAvailableExportTemplateId,
} from "../src/data/coverTonePilot";
import type { Picks, PickSlot, Song } from "../src/schema/music";

const allPilotEntries = pilotManifest.entries as CoverTonePilotEntry[];
const supportedEntry = COVER_TONE_PILOT_ENTRIES[0];

if (!supportedEntry) {
  throw new Error("Expected a cover-tone pilot entry.");
}

const rankOneSlot: PickSlot = {
  id: "rank-1",
  label: "#1",
  sortOrder: 1,
};
const rankTwoSlot: PickSlot = {
  id: "rank-2",
  label: "#2",
  sortOrder: 2,
};

function song(id: string, coverUrl: string): Song {
  return {
    id,
    title: { ja: id, romaji: id },
    artist: { ja: "Test", romaji: "Test" },
    coverUrl,
  };
}

test("pilot remains fixed at v1 with exactly nine approved covers", () => {
  assert.equal(COVER_TONE_ALGORITHM_VERSION, 1);
  assert.equal(pilotManifest.algorithmVersion, 1);
  assert.equal(allPilotEntries.length, 9);
  assert.deepEqual(
    [...new Set(allPilotEntries.map((entry) => entry.projectId))].sort(),
    ["equal-love", "nearly-equal-joy", "not-equal-me"],
  );
  assert.equal(COVER_TONE_PILOT_ENTRIES.length, 3);
  assert.deepEqual(
    COVER_TONE_PILOT_ENTRIES,
    allPilotEntries.filter((entry) => entry.projectId === "equal-love"),
  );
});

test("availability uses the lowest sort-order selected song, never pick insertion order", () => {
  const picks: Picks = {
    [rankTwoSlot.id]: song("not-supported", "/covers/test/not-supported.jpg"),
    [rankOneSlot.id]: song(supportedEntry.songId, supportedEntry.coverUrl),
  };
  const availability = getCoverToneAvailability({
    projectId: supportedEntry.projectId,
    slots: [rankTwoSlot, rankOneSlot],
    picks,
  });

  assert.equal(availability.isSupported, true);
  assert.equal(availability.selectedSongId, supportedEntry.songId);
  assert.deepEqual(availability.palette, supportedEntry.palette);
});

test("unsupported covers never receive a project-color substitute", () => {
  const picks: Picks = {
    [rankOneSlot.id]: song(
      supportedEntry.songId,
      "/covers/test/substituted-cover.jpg",
    ),
  };
  const availability = getCoverToneAvailability({
    projectId: supportedEntry.projectId,
    slots: [rankOneSlot],
    picks,
  });

  assert.deepEqual(availability, {
    isSupported: false,
    selectedSongId: supportedEntry.songId,
  });
  assert.equal(isExportTemplateAvailable("cover-tone", availability), false);
  assert.equal(
    resolveAvailableExportTemplateId("cover-tone", availability),
    "midnight",
  );
  for (const templateId of ["classic", "spotlight", "midnight"] as const) {
    assert.equal(isExportTemplateAvailable(templateId, availability), true);
  }
});

test("cover-tone copy describes the current highest-ranked selected song", () => {
  const messages = readFileSync(resolve("src/i18n/messages.ts"), "utf8");

  for (const copy of [
    "Uses the approved cover palette for your highest-ranked selected song.",
    "現在最上位に選んだ曲の承認済みカバーパレットを使います。",
    "使用你当前排名最高的已选歌曲的已批准封面配色。",
    "현재 가장 높은 순위로 선택한 곡의 승인된 커버 팔레트를 사용합니다.",
  ]) {
    assert.ok(messages.includes(copy));
  }
  assert.doesNotMatch(
    messages,
    /#1 selected song|排名第 1|1位に選んだ曲|1위로 선택한 곡/,
  );
});
