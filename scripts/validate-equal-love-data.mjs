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
const visibilityTypes = new Set(["default", "special", "archive"]);
const sourceStatuses = new Set([
  "released",
  "digital",
  "limited_cd",
  "youtube_public",
  "cm_pv",
  "live_only",
  "unverified",
]);
const memberIds = new Set(members.map((member) => member.id));
const songIds = new Set();
const songTitles = new Set();
const errors = [];

const expectedBoundarySongs = new Map([
  ["kimi-dake-no-hanamichi", ["saito-nagisa"]],
  ["okaeri-hanadayori", ["yamamoto-anna"]],
  ["takaramono-wa-green", ["morohashi-sana"]],
  ["furajairu", ["satake-nonno", "noguchi-iori"]],
  [
    "madamada-minor-mainacard",
    [
      "otani-emiri",
      "oba-hana",
      "otoshima-risa",
      "saito-kiara",
      "sasaki-maika",
      "takamatsu-hitomi",
      "takiwaki-shoko",
      "noguchi-iori",
      "morohashi-sana",
      "yamamoto-anna",
    ],
  ],
]);

if (songs.length !== 84) {
  errors.push(`Expected exactly 84 songs, found ${songs.length}`);
}

if (members.length !== 12) {
  errors.push(`Expected exactly 12 members, found ${members.length}`);
}

for (const member of members) {
  if (!member.id) errors.push("Member is missing id");
  if (!member.name?.ja || !member.name?.romaji) {
    errors.push(`Member ${member.id ?? "(unknown)"} needs ja and romaji names`);
  }
  if (typeof member.active !== "boolean") {
    errors.push(`Member ${member.id ?? "(unknown)"} needs active boolean`);
  }
  if (member.graduated && member.active) {
    errors.push(`Graduated member ${member.id} cannot have active: true`);
  }
  if (member.status === "graduated" && member.active) {
    errors.push(
      `Graduated status member ${member.id} cannot have active: true`,
    );
  }
  if (member.active === false && !member.graduated) {
    errors.push(`Inactive member ${member.id} must be marked graduated`);
  }
  if (
    member.graduationDate &&
    !/^\d{4}-\d{2}-\d{2}$/.test(member.graduationDate)
  ) {
    errors.push(`Member ${member.id}: graduationDate must be YYYY-MM-DD`);
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
  } else if (songTitles.has(song.title.ja)) {
    errors.push(`Duplicate song title.ja: ${song.title.ja}`);
  } else {
    songTitles.add(song.title.ja);
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

  if (song.visibility && !visibilityTypes.has(song.visibility)) {
    errors.push(`${song.id}: invalid visibility ${song.visibility}`);
  }

  if (song.sourceStatus && !sourceStatuses.has(song.sourceStatus)) {
    errors.push(`${song.id}: invalid sourceStatus ${song.sourceStatus}`);
  }

  for (const memberId of [
    ...(song.memberIds ?? []),
    ...(song.centerMemberIds ?? []),
  ]) {
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
    } else if (/\.(jpe?g)$/i.test(localCover)) {
      const coverBytes = fs.readFileSync(localCover);
      if (coverBytes[0] !== 0xff || coverBytes[1] !== 0xd8) {
        errors.push(
          `${song.id}: cover file is not a valid JPEG at public${song.coverUrl}`,
        );
      }
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

  const expectedMemberIds = expectedBoundarySongs.get(song.id);
  if (expectedMemberIds) {
    if (!song.coverSourceUrl?.startsWith("https://")) {
      errors.push(`${song.id}: boundary song needs https coverSourceUrl`);
    }
    if (!song.officialUrl?.startsWith("https://")) {
      errors.push(`${song.id}: boundary song needs https officialUrl`);
    }
    if (!song.creditSourceUrl?.startsWith("https://")) {
      errors.push(`${song.id}: boundary song needs https creditSourceUrl`);
    }
    if (!sameMembers(song.memberIds ?? [], expectedMemberIds)) {
      errors.push(
        `${song.id}: expected memberIds [${expectedMemberIds.join(", ")}], found [${(song.memberIds ?? []).join(", ")}]`,
      );
    }
  }
}

for (const songId of expectedBoundarySongs.keys()) {
  if (!songIds.has(songId)) {
    errors.push(`Missing boundary song: ${songId}`);
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

function sameMembers(actual, expected) {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return expected.every((memberId) => actualSet.has(memberId));
}
