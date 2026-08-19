import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Validates the static song/member/live data for one or all projects.
 *
 * Scope note: this checks that the data on disk is internally consistent and
 * safe to ship. It deliberately does NOT re-derive provenance or source chains.
 * Discography updates are run manually (`npm run sync:songs:all`) and reviewed
 * as a normal diff, so the reviewer is the gate for "is this the right data";
 * this script is the gate for "is this data well-formed".
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const projectsDir = path.join(root, "src", "projects");

const PROJECT_IDS = ["equal-love", "nearly-equal-joy", "not-equal-me"];

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
  "announced",
  "credits_pending",
  "released",
  "digital",
  "limited_cd",
  "youtube_public",
  "cm_pv",
  "live_only",
  "unverified",
]);

/**
 * Placeholder text that must never reach published credits.
 * Keep these specific: normalization strips spaces and punctuation, so a short
 * or punctuation-only marker would match almost every real name.
 */
const unknownCreditMarkers = [
  "未確認",
  "不明",
  "UNKNOWN",
  "TBD",
  "MIKAKUNIN",
  "MI KAKUNIN",
];

/** Catalog sizes that a broken sync must not silently fall below. */
const MINIMUM_CATALOG = {
  "equal-love": { songs: 84, members: 12 },
  "nearly-equal-joy": { songs: 28, members: 12 },
  "not-equal-me": { songs: 58, members: 11 },
};

const catalogDate = new Date().toISOString().slice(0, 10);

function readJson(filePath, errors, prefix) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(
      `${prefix} could not parse ${path.basename(filePath)}: ${error.message}`,
    );
    return null;
  }
}

function normalizeCreditValue(value) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s._-]+/gu, "")
    .toUpperCase();
}

function hasUnknownCreditMarker(value) {
  const normalized = normalizeCreditValue(value);
  if (!normalized) return true;
  return unknownCreditMarkers.some((marker) => {
    const normalizedMarker = normalizeCreditValue(marker);
    return normalizedMarker.length > 0 && normalized.includes(normalizedMarker);
  });
}

function validateMembers(prefix, members, errors) {
  const memberIds = new Set();

  for (const member of members) {
    if (!member.id) {
      errors.push(`${prefix} member is missing id`);
      continue;
    }
    if (memberIds.has(member.id)) {
      errors.push(`${prefix} duplicate member id: ${member.id}`);
    }
    memberIds.add(member.id);

    if (!member.name?.ja || !member.name?.romaji) {
      errors.push(`${prefix} member ${member.id} needs ja and romaji names`);
    }
    if (typeof member.active !== "boolean") {
      errors.push(`${prefix} member ${member.id} needs active boolean`);
    }
    if (typeof member.sortOrder !== "number") {
      errors.push(`${prefix} member ${member.id} needs numeric sortOrder`);
    }
    if (
      member.colors !== undefined &&
      (!Array.isArray(member.colors) ||
        member.colors.length === 0 ||
        member.colors.some((color) => typeof color !== "string" || !color))
    ) {
      errors.push(
        `${prefix} member ${member.id}: colors must be a non-empty string array`,
      );
    }
    // Graduation flags must agree; a mismatch silently changes who appears in
    // the export strip and the search filters.
    if (member.graduated && member.active) {
      errors.push(
        `${prefix} graduated member ${member.id} cannot have active: true`,
      );
    }
    if (member.status === "graduated" && member.active) {
      errors.push(
        `${prefix} graduated status member ${member.id} cannot have active: true`,
      );
    }
    if (member.active === false && !member.graduated) {
      errors.push(
        `${prefix} inactive member ${member.id} must be marked graduated`,
      );
    }
    if (
      member.graduationDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(member.graduationDate)
    ) {
      errors.push(
        `${prefix} member ${member.id}: graduationDate must be YYYY-MM-DD`,
      );
    }
  }
}

function validateCover(prefix, song, errors) {
  if (!song.coverUrl) {
    errors.push(`${prefix} ${song.id}: coverUrl is required`);
    return;
  }
  if (song.coverUrl.includes("placeholder")) {
    errors.push(`${prefix} ${song.id}: coverUrl must point to a real cover`);
    return;
  }
  if (!song.coverUrl.startsWith("/")) return;

  const localCover = path.join(root, "public", song.coverUrl);
  if (!fs.existsSync(localCover)) {
    errors.push(
      `${prefix} ${song.id}: cover file missing at public${song.coverUrl}`,
    );
    return;
  }
  if (fs.statSync(localCover).size === 0) {
    errors.push(
      `${prefix} ${song.id}: cover file is empty at public${song.coverUrl}`,
    );
  }
}

function validateCredits(prefix, song, errors) {
  for (const role of ["lyricist", "composer", "arranger"]) {
    const credit = song.credits?.[role];
    if (!credit?.ja || !credit.romaji) {
      errors.push(
        `${prefix} ${song.id}: credits.${role} ja and romaji are required`,
      );
      continue;
    }
    if (
      hasUnknownCreditMarker(credit.ja) ||
      hasUnknownCreditMarker(credit.romaji)
    ) {
      errors.push(
        `${prefix} ${song.id}: credits.${role} contains an unknown placeholder`,
      );
    }
  }
}

function validateSongs(prefix, songs, memberIds, songIds, errors) {
  const songTitles = new Set();

  for (const song of songs) {
    if (!song.id) {
      errors.push(`${prefix} song is missing id`);
      continue;
    }
    if (songIds.has(song.id)) {
      errors.push(`${prefix} duplicate song id: ${song.id}`);
    }
    songIds.add(song.id);

    if (!song.title?.ja || !song.title?.romaji) {
      errors.push(
        `${prefix} ${song.id}: title.ja and title.romaji are required`,
      );
    } else if (songTitles.has(song.title.ja)) {
      errors.push(`${prefix} duplicate song title.ja: ${song.title.ja}`);
    } else {
      songTitles.add(song.title.ja);
    }

    if (!song.artist?.ja || !song.artist?.romaji) {
      errors.push(
        `${prefix} ${song.id}: artist.ja and artist.romaji are required`,
      );
    }

    if (song.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(song.releaseDate)) {
      errors.push(`${prefix} ${song.id}: releaseDate must be YYYY-MM-DD`);
    }
    // A future date on anything but an announced record means the sync picked
    // up a date it should not have.
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(song.releaseDate ?? "") &&
      song.releaseDate > catalogDate &&
      song.sourceStatus !== "announced"
    ) {
      errors.push(
        `${prefix} ${song.id}: future releaseDate ${song.releaseDate} requires sourceStatus announced`,
      );
    }

    for (const [field, allowed] of [
      ["releaseType", releaseTypes],
      ["trackType", trackTypes],
      ["visibility", visibilityTypes],
      ["sourceStatus", sourceStatuses],
    ]) {
      if (song[field] && !allowed.has(song[field])) {
        errors.push(`${prefix} ${song.id}: invalid ${field} ${song[field]}`);
      }
    }

    for (const memberId of [
      ...(song.memberIds ?? []),
      ...(song.centerMemberIds ?? []),
    ]) {
      if (!memberIds.has(memberId)) {
        errors.push(`${prefix} ${song.id}: unknown member id ${memberId}`);
      }
    }

    validateCover(prefix, song, errors);

    // Placeholder statuses are review states; they must never ship.
    if (["credits_pending", "unverified"].includes(song.sourceStatus)) {
      errors.push(
        `${prefix} ${song.id}: sourceStatus ${song.sourceStatus} must not be published`,
      );
    }
    validateCredits(prefix, song, errors);

    if (!song.creditSourceUrl?.startsWith("https://")) {
      errors.push(`${prefix} ${song.id}: an https creditSourceUrl is required`);
    }
  }
}

/**
 * Live data is hand-curated and untouched by the sync script, so the only
 * cross-check worth keeping is that its song references still resolve; a sync
 * that drops a song would otherwise leave a live page pointing at nothing.
 */
function validateLiveExperienceReferences(
  prefix,
  liveExperiences,
  songIds,
  errors,
) {
  for (const experience of liveExperiences) {
    if (!experience.id) {
      errors.push(`${prefix} live experience is missing id`);
      continue;
    }
    for (const performance of experience.performances ?? []) {
      for (const entry of performance.setlist ?? []) {
        if (!songIds.has(entry.songId)) {
          errors.push(
            `${prefix} live ${experience.id}/${performance.id}: unknown songId ${entry.songId}`,
          );
        }
      }
    }
  }
}

function validateProject(projectId) {
  const prefix = `[${projectId}]`;
  const errors = [];
  const projectDir = path.join(projectsDir, projectId);

  if (!fs.existsSync(projectDir)) {
    return {
      errors: [`${prefix} project directory is missing`],
      summary: `${prefix} missing`,
    };
  }

  const paths = {
    songs: path.join(projectDir, "songs.json"),
    members: path.join(projectDir, "members.json"),
    live: path.join(projectDir, "live-experiences.json"),
  };
  for (const [name, filePath] of Object.entries(paths)) {
    if (!fs.existsSync(filePath)) {
      errors.push(`${prefix} ${name} file is missing`);
    }
  }
  if (errors.length > 0) return { errors, summary: `${prefix} incomplete` };

  const songs = readJson(paths.songs, errors, prefix);
  const members = readJson(paths.members, errors, prefix);
  const liveExperiences = readJson(paths.live, errors, prefix);
  if (
    !Array.isArray(songs) ||
    !Array.isArray(members) ||
    !Array.isArray(liveExperiences)
  ) {
    errors.push(`${prefix} songs, members and live-experiences must be arrays`);
    return { errors, summary: `${prefix} invalid JSON shape` };
  }

  const memberIds = new Set(members.map((member) => member.id));
  const songIds = new Set();

  validateMembers(prefix, members, errors);
  validateSongs(prefix, songs, memberIds, songIds, errors);
  validateLiveExperienceReferences(prefix, liveExperiences, songIds, errors);

  // Catch a sync that emptied or gutted the catalog.
  const minimum = MINIMUM_CATALOG[projectId];
  if (minimum) {
    if (songs.length < minimum.songs) {
      errors.push(
        `${prefix} expected at least ${minimum.songs} songs, found ${songs.length}`,
      );
    }
    if (members.length < minimum.members) {
      errors.push(
        `${prefix} expected at least ${minimum.members} members, found ${members.length}`,
      );
    }
  }

  return {
    errors,
    summary: `${prefix} ${songs.length} songs, ${members.length} members, ${liveExperiences.length} live experiences`,
  };
}

function resolveRequestedProject() {
  const flagIndex = process.argv.findIndex((arg) => arg === "--project");
  if (flagIndex !== -1) return process.argv[flagIndex + 1];
  const inlineArg = process.argv.find((arg) => arg.startsWith("--project="));
  return inlineArg?.slice("--project=".length);
}

const requested = resolveRequestedProject();
const targets = requested ? [requested] : PROJECT_IDS;

if (requested && !PROJECT_IDS.includes(requested)) {
  console.error(`Unknown project: ${requested}`);
  console.error(`Expected one of: ${PROJECT_IDS.join(", ")}`);
  process.exit(1);
}

let failed = false;
for (const projectId of targets) {
  const { errors, summary } = validateProject(projectId);
  if (errors.length > 0) {
    failed = true;
    console.error(`${summary} — ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
  } else {
    console.log(`${summary} — ok`);
  }
}

if (failed) process.exit(1);
console.log("Project data validation passed.");
