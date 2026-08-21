import { readFile } from "node:fs/promises";

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

async function main() {
  const [songs, sourceMap] = await Promise.all([
    readFile(SONGS_PATH, "utf8").then((text) => readJson(text, "songs")),
    readFile(SOURCE_MAP_PATH, "utf8").then((text) =>
      readJson(text, "official media source map"),
    ),
  ]);

  assert(
    Array.isArray(songs) && songs.length > 0,
    "songs must be a non-empty array",
  );
  assert(sourceMap.schemaVersion === 1, "source map schemaVersion must be 1");
  assert(
    sourceMap.projectId === "equal-love",
    "source map projectId must be equal-love",
  );
  assert(
    sourceMap.experienceId === "standard-top10",
    "source map experienceId must be standard-top10",
  );
  assert(Array.isArray(sourceMap.songs), "source map songs must be an array");
  assert(
    sourceMap.songs.length === songs.length,
    `source map must cover every current equal-love song (${sourceMap.songs.length}/${songs.length})`,
  );

  const songIds = new Set();
  const sourceUrls = new Set();
  const modeCounts = new Map();

  for (const [index, source] of sourceMap.songs.entries()) {
    const song = songs[index];
    const label = `sourceMap.songs[${index}]`;

    assert(
      source.songId === song.id,
      `${label} must match songs.json order (${song.id})`,
    );
    assert(
      source.title === song.title.ja,
      `${label} title must match songs.json (${song.title.ja})`,
    );
    assert(
      !songIds.has(source.songId),
      `${label} duplicates songId ${source.songId}`,
    );
    assert(
      !sourceUrls.has(source.sourceUrl),
      `${label} duplicates sourceUrl ${source.sourceUrl}`,
    );
    assert(
      ALLOWED_SOURCE_MODES.has(source.sourceMode),
      `${label} has unsupported sourceMode ${source.sourceMode}`,
    );
    assert(
      source.sourceAuthority === "official",
      `${label} must have official source authority`,
    );
    assert(
      source.clipScope === "single-song",
      `${label} must use a single-song clip`,
    );
    assert(
      Array.isArray(source.qaFlags) && source.qaFlags.length === 0,
      `${label} must have no QA flags`,
    );
    assert(
      isExactYouTubeWatchUrl(source.sourceUrl),
      `${label} must use an exact HTTPS YouTube watch URL`,
    );
    assert(
      source.sourceUrl.endsWith(`v=${source.videoId}`),
      `${label} videoId must match sourceUrl`,
    );

    songIds.add(source.songId);
    sourceUrls.add(source.sourceUrl);
    modeCounts.set(
      source.sourceMode,
      (modeCounts.get(source.sourceMode) ?? 0) + 1,
    );
  }

  for (const songId of ["love-song-ni-osowareru", "moratoriamu"]) {
    const source = sourceMap.songs.find((entry) => entry.songId === songId);
    assert(source, `source map must include ${songId}`);
    assert(
      source.sourceMode === "official-mv",
      `${songId} must be linked as an official MV`,
    );
  }

  const renderedModeCounts = [...modeCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mode, count]) => `${mode}=${count}`)
    .join(", ");

  console.log(
    `official media: ${sourceMap.songs.length}/${songs.length} songs`,
  );
  console.log(`mode counts: ${renderedModeCounts}`);
}

main().catch((error) => {
  console.error(`official media: FAIL: ${error.message}`);
  process.exitCode = 1;
});
