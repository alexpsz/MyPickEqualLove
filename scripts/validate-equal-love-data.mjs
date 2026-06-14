import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const songs = readJson("src/data/equal-love-songs.json");
const members = readJson("src/data/equal-love-members.json");

const releaseTypes = new Set(["single", "album", "digital", "dvd_bd", "other"]);
const trackTypes = new Set([
  "title",
  "coupling",
  "album",
  "solo",
  "unit",
  "live",
  "other",
]);
const memberIds = new Set(members.map((member) => member.id));
const songIds = new Set();
const errors = [];

for (const member of members) {
  if (!member.id) errors.push("Member is missing id");
  if (!member.name?.ja || !member.name?.romaji) {
    errors.push(`Member ${member.id ?? "(unknown)"} needs ja and romaji names`);
  }
}

for (const song of songs) {
  if (!song.id) {
    errors.push("Song is missing id");
    continue;
  }

  if (songIds.has(song.id)) errors.push(`Duplicate song id: ${song.id}`);
  songIds.add(song.id);

  if (!song.title?.ja || !song.title?.romaji) {
    errors.push(`${song.id}: title.ja and title.romaji are required`);
  }

  if (song.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(song.releaseDate)) {
    errors.push(`${song.id}: releaseDate must be YYYY-MM-DD`);
  }

  if (song.releaseType && !releaseTypes.has(song.releaseType)) {
    errors.push(`${song.id}: invalid releaseType ${song.releaseType}`);
  }

  if (song.trackType && !trackTypes.has(song.trackType)) {
    errors.push(`${song.id}: invalid trackType ${song.trackType}`);
  }

  for (const memberId of [...(song.memberIds ?? []), ...(song.centerMemberIds ?? [])]) {
    if (!memberIds.has(memberId)) {
      errors.push(`${song.id}: unknown member id ${memberId}`);
    }
  }

  if (!song.coverUrl) {
    errors.push(`${song.id}: coverUrl is required`);
  } else if (song.coverUrl.includes("placeholder")) {
    errors.push(`${song.id}: coverUrl must point to a real local cover`);
  } else if (song.coverUrl.startsWith("/")) {
    const localCover = path.join(root, "public", song.coverUrl);
    if (!fs.existsSync(localCover)) {
      errors.push(`${song.id}: cover file missing at public${song.coverUrl}`);
    } else if (fs.statSync(localCover).size === 0) {
      errors.push(`${song.id}: cover file is empty at public${song.coverUrl}`);
    }
  }

  if (!song.credits?.lyricist?.ja || !song.credits.lyricist.romaji) {
    errors.push(`${song.id}: credits.lyricist ja and romaji are required`);
  }

  if (!song.credits?.composer?.ja || !song.credits.composer.romaji) {
    errors.push(`${song.id}: credits.composer ja and romaji are required`);
  }

  if (!song.credits?.arranger?.ja || !song.credits.arranger.romaji) {
    errors.push(`${song.id}: credits.arranger ja and romaji are required`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${songs.length} songs and ${members.length} members for MyPickEqualLove.`,
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}
