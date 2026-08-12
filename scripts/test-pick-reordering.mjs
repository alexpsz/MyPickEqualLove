import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        resolveJsonModule: true,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}

const {
  PUBLISHED_LIVE_EXPERIENCES,
  STANDARD_PICK_EXPERIENCE,
  getDefaultExperienceContextId,
  getEligibleSongsForSlot,
  getSortedExperienceSlots,
  parseStoredPicksForExperience,
  relocateStoredPick,
} = require("../src/data/pickExperiences.ts");
const { SONGS } = require("../src/data/songs.ts");
const {
  activateReorderLongPress,
  advanceReorderPointerGesture,
  createSurfaceClickSuppression,
  createReorderPointerGesture,
  shouldSuppressReorderClick,
  shouldSuppressSurfaceClick,
} = require("../src/utils/pickReorderGesture.ts");

function expectSuccessfulRelocation(result, mode) {
  assert.equal(result.ok, true);
  assert.equal(result.mode, mode);
  return result.nextPicks;
}

const standardSlots = getSortedExperienceSlots(STANDARD_PICK_EXPERIENCE);
const [firstSlot, secondSlot, thirdSlot] = standardSlots;
const [firstSong, secondSong] = SONGS;

assert.ok(
  firstSlot && secondSlot && thirdSlot,
  "standard slots are configured",
);
assert.ok(firstSong && secondSong, "catalog contains at least two songs");

const normalizedLegacyPicks = parseStoredPicksForExperience({
  experience: STANDARD_PICK_EXPERIENCE,
  serialized: JSON.stringify({
    [thirdSlot.id]: secondSong.id,
    [secondSlot.id]: firstSong.id,
    [firstSlot.id]: firstSong.id,
  }),
});
assert.deepEqual(normalizedLegacyPicks, {
  [firstSlot.id]: firstSong.id,
  [thirdSlot.id]: secondSong.id,
});

const movedStandardPicks = expectSuccessfulRelocation(
  relocateStoredPick({
    experience: STANDARD_PICK_EXPERIENCE,
    storedPicks: { [firstSlot.id]: firstSong.id },
    fromSlotId: firstSlot.id,
    toSlotId: secondSlot.id,
  }),
  "move",
);
assert.deepEqual(movedStandardPicks, { [secondSlot.id]: firstSong.id });

const swappedStandardPicks = expectSuccessfulRelocation(
  relocateStoredPick({
    experience: STANDARD_PICK_EXPERIENCE,
    storedPicks: {
      [firstSlot.id]: firstSong.id,
      [secondSlot.id]: secondSong.id,
    },
    fromSlotId: firstSlot.id,
    toSlotId: secondSlot.id,
  }),
  "swap",
);
assert.deepEqual(swappedStandardPicks, {
  [firstSlot.id]: secondSong.id,
  [secondSlot.id]: firstSong.id,
});

const liveExperience = PUBLISHED_LIVE_EXPERIENCES.find(
  (experience) =>
    experience.slots.some((slot) => slot.eligibility === "catalog") &&
    experience.slots.some((slot) => slot.eligibility !== "catalog"),
);
assert.ok(
  liveExperience,
  "a published Live experience has catalog and strict slots",
);

const contextId = getDefaultExperienceContextId(liveExperience);
const liveSlots = getSortedExperienceSlots(liveExperience);
const strictSlot = liveSlots.find((slot) => slot.eligibility !== "catalog");
const catalogSlot = liveSlots.find((slot) => slot.eligibility === "catalog");
assert.ok(strictSlot && catalogSlot, "Live slot scopes are configured");

const strictSongs = getEligibleSongsForSlot(
  liveExperience,
  strictSlot,
  contextId,
);
const [firstStrictSong, secondStrictSong] = strictSongs;
assert.ok(
  firstStrictSong && secondStrictSong,
  "strict Live slot has at least two eligible songs",
);

const strictSongIds = new Set(strictSongs.map((song) => song.id));
const catalogOnlySong = SONGS.find((song) => !strictSongIds.has(song.id));
assert.ok(catalogOnlySong, "catalog contains a song outside the Live setlist");

const legalLivePicks = {
  [strictSlot.id]: firstStrictSong.id,
  [catalogSlot.id]: secondStrictSong.id,
};
const strictToCatalog = expectSuccessfulRelocation(
  relocateStoredPick({
    experience: liveExperience,
    contextId,
    storedPicks: legalLivePicks,
    fromSlotId: strictSlot.id,
    toSlotId: catalogSlot.id,
  }),
  "swap",
);
assert.deepEqual(strictToCatalog, {
  [strictSlot.id]: secondStrictSong.id,
  [catalogSlot.id]: firstStrictSong.id,
});

const catalogToStrict = expectSuccessfulRelocation(
  relocateStoredPick({
    experience: liveExperience,
    contextId,
    storedPicks: legalLivePicks,
    fromSlotId: catalogSlot.id,
    toSlotId: strictSlot.id,
  }),
  "swap",
);
assert.deepEqual(catalogToStrict, strictToCatalog);

const illegalLivePicks = {
  [strictSlot.id]: firstStrictSong.id,
  [catalogSlot.id]: catalogOnlySong.id,
};
const illegalSnapshot = JSON.stringify(illegalLivePicks);
const rejectedLiveSwap = relocateStoredPick({
  experience: liveExperience,
  contextId,
  storedPicks: illegalLivePicks,
  fromSlotId: catalogSlot.id,
  toSlotId: strictSlot.id,
});
assert.deepEqual(rejectedLiveSwap, {
  ok: false,
  reason: "ineligible",
  fromSlotId: catalogSlot.id,
  toSlotId: strictSlot.id,
});
assert.equal(JSON.stringify(illegalLivePicks), illegalSnapshot);
assert.equal("nextPicks" in rejectedLiveSwap, false);

const mouseSurfacePending = advanceReorderPointerGesture({
  gesture: createReorderPointerGesture({
    source: "surface",
    pointerType: "mouse",
  }),
  deltaX: 6,
  deltaY: 7,
});
assert.equal(mouseSurfacePending.phase, "pending");
assert.equal(shouldSuppressReorderClick(mouseSurfacePending), false);

const mouseSurfaceDragging = advanceReorderPointerGesture({
  gesture: mouseSurfacePending,
  deltaX: 12,
  deltaY: 0,
});
assert.equal(mouseSurfaceDragging.phase, "dragging");
assert.equal(shouldSuppressReorderClick(mouseSurfaceDragging), true);

const penSurfaceDragging = advanceReorderPointerGesture({
  gesture: createReorderPointerGesture({
    source: "surface",
    pointerType: "pen",
  }),
  deltaX: 0,
  deltaY: 11,
});
assert.equal(penSurfaceDragging.phase, "dragging");

const touchSurfaceScroll = advanceReorderPointerGesture({
  gesture: createReorderPointerGesture({
    source: "surface",
    pointerType: "touch",
  }),
  deltaX: 2,
  deltaY: 12,
});
assert.equal(touchSurfaceScroll.phase, "cancelled");
assert.equal(shouldSuppressReorderClick(touchSurfaceScroll), true);

const touchSurfaceLongPress = activateReorderLongPress(
  createReorderPointerGesture({ source: "surface", pointerType: "touch" }),
);
assert.equal(touchSurfaceLongPress.phase, "dragging");
assert.equal(shouldSuppressReorderClick(touchSurfaceLongPress), true);

const touchHandleDragging = advanceReorderPointerGesture({
  gesture: createReorderPointerGesture({
    source: "handle",
    pointerType: "touch",
  }),
  deltaX: 0,
  deltaY: 10,
});
assert.equal(touchHandleDragging.phase, "dragging");
assert.equal(shouldSuppressReorderClick(touchHandleDragging), true);

const handleLongPressDoesNotStart = activateReorderLongPress(
  createReorderPointerGesture({ source: "handle", pointerType: "touch" }),
);
assert.equal(handleLongPressDoesNotStart.phase, "pending");

const surfaceSuppression = createSurfaceClickSuppression("slot-1", 1_000);
assert.equal(
  shouldSuppressSurfaceClick({
    suppression: surfaceSuppression,
    slotId: "slot-1",
    now: 1_650,
  }),
  true,
);
assert.equal(
  shouldSuppressSurfaceClick({
    suppression: surfaceSuppression,
    slotId: "slot-2",
    now: 1_650,
  }),
  false,
);

const releaseAnchoredSuppression = createSurfaceClickSuppression(
  "slot-1",
  10_000,
);
assert.equal(
  shouldSuppressSurfaceClick({
    suppression: releaseAnchoredSuppression,
    slotId: "slot-1",
    now: 10_650,
  }),
  true,
);
assert.equal(
  shouldSuppressSurfaceClick({
    suppression: surfaceSuppression,
    slotId: "slot-1",
    now: 1_701,
  }),
  false,
);

console.log("Pick reordering state and gesture tests passed.");
