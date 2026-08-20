import { readFile } from "node:fs/promises";

const PILOT_PATH = new URL(
  "../src/projects/equal-love/official-media-pilot.json",
  import.meta.url,
);
const SONGS_PATH = new URL(
  "../src/projects/equal-love/songs.json",
  import.meta.url,
);
const SOURCE_MAP_PATH = new URL("./archetype/source-map.json", import.meta.url);

const ALLOWED_SOURCE_MODES = new Set([
  "official-mv",
  "official-art-track",
  "official-dance",
  "official-live",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function isExactYouTubeWatchUrl(value) {
  return (
    typeof value === "string" &&
    /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(value)
  );
}

function hasExactKeys(value, keys, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort()),
    `${label} keys must be exactly ${keys.join(", ")}`,
  );
}

function getEligibleEntries(songs, sourceMap) {
  const sourceBySongId = new Map();
  for (const [index, source] of sourceMap.songs.entries()) {
    assert(
      !sourceBySongId.has(source.songId),
      `source map duplicates ${source.songId}`,
    );
    sourceBySongId.set(source.songId, { source, index });
  }

  return songs.flatMap((song, index) => {
    const sourceRecord = sourceBySongId.get(song.id);
    if (!sourceRecord) {
      return [];
    }

    const { source } = sourceRecord;
    const eligible =
      source.sourceAuthority === "official" &&
      source.clipScope === "single-song" &&
      Array.isArray(source.qaFlags) &&
      source.qaFlags.length === 0 &&
      ALLOWED_SOURCE_MODES.has(source.sourceMode) &&
      isExactYouTubeWatchUrl(source.sourceUrl) &&
      source.songId === song.id &&
      source.title === song.title.ja;

    return eligible
      ? [
          {
            order: index + 1,
            songId: song.id,
            sourceMode: source.sourceMode,
            sourceUrl: source.sourceUrl,
          },
        ]
      : [];
  });
}

async function main() {
  const [pilot, songs, sourceMap] = await Promise.all([
    readFile(PILOT_PATH, "utf8").then((text) =>
      readJson(text, "official media pilot"),
    ),
    readFile(SONGS_PATH, "utf8").then((text) => readJson(text, "songs")),
    readFile(SOURCE_MAP_PATH, "utf8").then((text) =>
      readJson(text, "source map"),
    ),
  ]);

  hasExactKeys(pilot, ["entries", "projectId", "schemaVersion"], "pilot");
  assert(pilot.schemaVersion === 1, "pilot schemaVersion must be 1");
  assert(
    pilot.projectId === "equal-love",
    "pilot projectId must be equal-love",
  );
  assert(Array.isArray(pilot.entries), "pilot entries must be an array");
  assert(
    Array.isArray(songs) && songs.length > 0,
    "songs must be a non-empty array",
  );
  assert(
    sourceMap &&
      sourceMap.projectId === "equal-love" &&
      Array.isArray(sourceMap.songs),
    "source map must contain equal-love songs",
  );
  assert(
    pilot.entries.length > 0 && pilot.entries.length <= 20,
    "pilot must contain 1-20 entries",
  );
  assert(
    pilot.entries.length === 20,
    "pilot must contain exactly the first 20 eligible entries",
  );

  const expectedEntries = getEligibleEntries(songs, sourceMap).slice(0, 20);
  assert(
    expectedEntries.length === 20,
    "source map does not provide 20 eligible entries",
  );

  const pilotSongIds = new Set();
  const pilotUrls = new Set();
  for (const [index, entry] of pilot.entries.entries()) {
    const label = `pilot.entries[${index}]`;
    hasExactKeys(entry, ["songId", "sourceMode", "sourceUrl"], label);
    assert(
      !pilotSongIds.has(entry.songId),
      `${label} duplicates songId ${entry.songId}`,
    );
    assert(
      !pilotUrls.has(entry.sourceUrl),
      `${label} duplicates sourceUrl ${entry.sourceUrl}`,
    );
    pilotSongIds.add(entry.songId);
    pilotUrls.add(entry.sourceUrl);

    const expected = expectedEntries[index];
    assert(
      entry.songId === expected.songId &&
        entry.sourceMode === expected.sourceMode &&
        entry.sourceUrl === expected.sourceUrl,
      `${label} does not match eligible songs.json/source-map entry ${index + 1} (${expected.songId})`,
    );
  }

  const modeCounts = new Map();
  for (const entry of pilot.entries) {
    modeCounts.set(
      entry.sourceMode,
      (modeCounts.get(entry.sourceMode) ?? 0) + 1,
    );
  }
  const renderedModeCounts = [...modeCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mode, count]) => `${mode}=${count}`)
    .join(", ");

  console.log(`official media pilot: ${pilot.entries.length} entries`);
  console.log(
    `song ids: ${pilot.entries.map((entry) => entry.songId).join(", ")}`,
  );
  console.log(`mode counts: ${renderedModeCounts}`);
}

main().catch((error) => {
  console.error(`official media pilot: FAIL: ${error.message}`);
  process.exitCode = 1;
});
