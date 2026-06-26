import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const projectsDir = path.join(root, "src", "projects");

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
const experienceKinds = new Set([
  "standard",
  "live-afterglow",
  "live-wishlist",
]);
const experienceStatuses = new Set(["draft", "published", "archived"]);
const eligibilityScopes = new Set([
  "catalog",
  "selected-performance",
  "event-union",
]);
const experienceLayouts = new Set(["top10-grid", "five-memory-list"]);
const verificationStatuses = new Set(["unverified", "partial", "verified"]);
const setlistSections = new Set(["main", "encore", "double-encore"]);

const expectedEqualLoveBoundarySongs = new Map([
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

const expectedNearlyEqualJoyBoundarySongs = new Map([
  ["≒JOY", ["fukuyama-moeka"]],
  ["笑って フラジール", ["fukuyama-moeka"]],
  ["超孤独ライオン", ["fukuyama-moeka"]],
]);

const expectedNotEqualMeBoundarySongs = new Map([
  ["君はもう一度タネになる", ["suganami-mirei"]],
]);

const targetProjectId = readProjectArg();
const projectIds = targetProjectId ? [targetProjectId] : listProjectIds();
const errors = [];
const summaries = [];

for (const projectId of projectIds) {
  const result = validateProject(projectId);
  errors.push(...result.errors);
  summaries.push(result.summary);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated project data:\n${summaries.join("\n")}`);

function validateProject(projectId) {
  const projectPrefix = `[${projectId}]`;
  const errors = [];
  const projectDir = path.join(projectsDir, projectId);
  const songsPath = path.join(projectDir, "songs.json");
  const membersPath = path.join(projectDir, "members.json");
  const liveExperiencesPath = path.join(projectDir, "live-experiences.json");

  if (!fs.existsSync(projectDir)) {
    return {
      errors: [`${projectPrefix} project directory is missing`],
      summary: `${projectPrefix} missing`,
    };
  }

  if (!fs.existsSync(songsPath)) {
    errors.push(`${projectPrefix} songs.json is missing`);
  }
  if (!fs.existsSync(membersPath)) {
    errors.push(`${projectPrefix} members.json is missing`);
  }
  if (!fs.existsSync(liveExperiencesPath)) {
    errors.push(`${projectPrefix} live-experiences.json is missing`);
  }
  if (errors.length > 0) {
    return { errors, summary: `${projectPrefix} incomplete` };
  }

  const songs = readJson(songsPath, errors, projectPrefix);
  const members = readJson(membersPath, errors, projectPrefix);
  const liveExperiences = readJson(liveExperiencesPath, errors, projectPrefix);
  if (!Array.isArray(songs)) {
    errors.push(`${projectPrefix} songs.json must be an array`);
  }
  if (!Array.isArray(members)) {
    errors.push(`${projectPrefix} members.json must be an array`);
  }
  if (!Array.isArray(liveExperiences)) {
    errors.push(`${projectPrefix} live-experiences.json must be an array`);
  }
  if (
    errors.length > 0 ||
    !Array.isArray(songs) ||
    !Array.isArray(members) ||
    !Array.isArray(liveExperiences)
  ) {
    return { errors, summary: `${projectPrefix} invalid JSON shape` };
  }

  const memberIds = new Set(members.map((member) => member.id));
  const songIds = new Set();
  const songTitles = new Set();

  validateMembers(projectPrefix, members, errors);
  validateSongs(projectPrefix, songs, memberIds, songIds, songTitles, errors);
  validateLiveExperiences(
    projectPrefix,
    projectId,
    liveExperiences,
    songIds,
    errors,
  );

  if (songs.length === 0) {
    errors.push(`${projectPrefix} songs.json must not be empty`);
  }
  if (members.length === 0) {
    errors.push(`${projectPrefix} members.json must not be empty`);
  }

  if (projectId === "equal-love") {
    validateEqualLoveStrictChecks(
      projectPrefix,
      songs,
      members,
      songIds,
      errors,
    );
  }
  if (projectId === "nearly-equal-joy") {
    validateNearlyEqualJoyStrictChecks(projectPrefix, songs, members, errors);
  }
  if (projectId === "not-equal-me") {
    validateNotEqualMeStrictChecks(projectPrefix, songs, members, errors);
  }

  return {
    errors,
    summary: `${projectPrefix} ${songs.length} songs, ${members.length} members, ${liveExperiences.length} live experiences`,
  };
}

function validateMembers(projectPrefix, members, errors) {
  const memberIds = new Set();

  for (const member of members) {
    if (!member.id) {
      errors.push(`${projectPrefix} member is missing id`);
      continue;
    }
    if (memberIds.has(member.id)) {
      errors.push(`${projectPrefix} duplicate member id: ${member.id}`);
    }
    memberIds.add(member.id);

    if (!member.name?.ja || !member.name?.romaji) {
      errors.push(
        `${projectPrefix} member ${member.id} needs ja and romaji names`,
      );
    }
    if (typeof member.active !== "boolean") {
      errors.push(`${projectPrefix} member ${member.id} needs active boolean`);
    }
    if (typeof member.sortOrder !== "number") {
      errors.push(
        `${projectPrefix} member ${member.id} needs numeric sortOrder`,
      );
    }
    if (
      member.colors !== undefined &&
      (!Array.isArray(member.colors) ||
        member.colors.length === 0 ||
        member.colors.some((color) => typeof color !== "string" || !color))
    ) {
      errors.push(
        `${projectPrefix} member ${member.id}: colors must be a non-empty string array`,
      );
    }
    if (member.graduated && member.active) {
      errors.push(
        `${projectPrefix} graduated member ${member.id} cannot have active: true`,
      );
    }
    if (member.status === "graduated" && member.active) {
      errors.push(
        `${projectPrefix} graduated status member ${member.id} cannot have active: true`,
      );
    }
    if (member.active === false && !member.graduated) {
      errors.push(
        `${projectPrefix} inactive member ${member.id} must be marked graduated`,
      );
    }
    if (
      member.graduationDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(member.graduationDate)
    ) {
      errors.push(
        `${projectPrefix} member ${member.id}: graduationDate must be YYYY-MM-DD`,
      );
    }
  }
}

function validateSongs(
  projectPrefix,
  songs,
  memberIds,
  songIds,
  songTitles,
  errors,
) {
  for (const song of songs) {
    if (!song.id) {
      errors.push(`${projectPrefix} song is missing id`);
      continue;
    }

    if (songIds.has(song.id))
      errors.push(`${projectPrefix} duplicate song id: ${song.id}`);
    songIds.add(song.id);

    if (!song.title?.ja || !song.title?.romaji) {
      errors.push(
        `${projectPrefix} ${song.id}: title.ja and title.romaji are required`,
      );
    } else if (songTitles.has(song.title.ja)) {
      errors.push(`${projectPrefix} duplicate song title.ja: ${song.title.ja}`);
    } else {
      songTitles.add(song.title.ja);
    }

    if (!song.artist?.ja || !song.artist?.romaji) {
      errors.push(
        `${projectPrefix} ${song.id}: artist.ja and artist.romaji are required`,
      );
    }

    if (song.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(song.releaseDate)) {
      errors.push(
        `${projectPrefix} ${song.id}: releaseDate must be YYYY-MM-DD`,
      );
    }

    if (song.releaseType && !releaseTypes.has(song.releaseType)) {
      errors.push(
        `${projectPrefix} ${song.id}: invalid releaseType ${song.releaseType}`,
      );
    }

    if (song.trackType && !trackTypes.has(song.trackType)) {
      errors.push(
        `${projectPrefix} ${song.id}: invalid trackType ${song.trackType}`,
      );
    }

    if (song.visibility && !visibilityTypes.has(song.visibility)) {
      errors.push(
        `${projectPrefix} ${song.id}: invalid visibility ${song.visibility}`,
      );
    }

    if (song.sourceStatus && !sourceStatuses.has(song.sourceStatus)) {
      errors.push(
        `${projectPrefix} ${song.id}: invalid sourceStatus ${song.sourceStatus}`,
      );
    }

    for (const memberId of [
      ...(song.memberIds ?? []),
      ...(song.centerMemberIds ?? []),
    ]) {
      if (!memberIds.has(memberId)) {
        errors.push(
          `${projectPrefix} ${song.id}: unknown member id ${memberId}`,
        );
      }
    }

    validateCover(projectPrefix, song, errors);
    validateCredits(projectPrefix, song, errors);
  }
}

function validateLiveExperiences(
  projectPrefix,
  projectId,
  liveExperiences,
  songIds,
  errors,
) {
  const ids = new Set();
  const slugs = new Set();

  for (const experience of liveExperiences) {
    if (!experience.id) {
      errors.push(`${projectPrefix} live experience is missing id`);
      continue;
    }
    const prefix = `${projectPrefix} live experience ${experience.id}`;

    if (!isStorageSafeSegment(experience.id)) {
      errors.push(`${prefix}: id must use lowercase letters, numbers, _ or -`);
    }
    if (ids.has(experience.id)) {
      errors.push(
        `${projectPrefix} duplicate live experience id: ${experience.id}`,
      );
    }
    ids.add(experience.id);

    if (experience.projectId !== projectId) {
      errors.push(`${prefix}: projectId must be ${projectId}`);
    }

    if (!experience.slug || !/^[a-z0-9][a-z0-9-]*$/.test(experience.slug)) {
      errors.push(`${prefix}: slug must use lowercase letters, numbers or -`);
    } else if (slugs.has(experience.slug)) {
      errors.push(
        `${projectPrefix} duplicate live experience slug: ${experience.slug}`,
      );
    }
    slugs.add(experience.slug);

    if (experience.canonicalPath !== `/live/${experience.slug}/`) {
      errors.push(`${prefix}: canonicalPath must be /live/${experience.slug}/`);
    }

    if (!experienceKinds.has(experience.kind)) {
      errors.push(`${prefix}: invalid kind ${experience.kind}`);
    }
    if (!experienceStatuses.has(experience.status)) {
      errors.push(`${prefix}: invalid status ${experience.status}`);
    }

    validatePublishedExperienceFields(prefix, experience, errors);
    validateExperienceSlots(prefix, experience, errors);
    validateExperiencePerformances(prefix, experience, songIds, errors);
  }
}

function validatePublishedExperienceFields(prefix, experience, errors) {
  if (experience.status !== "published") {
    return;
  }

  if (!experience.title || !experience.description) {
    errors.push(`${prefix}: published experience needs title and description`);
  }
  if (!experience.export?.title || !experience.export?.subtitle) {
    errors.push(`${prefix}: published experience needs export title/subtitle`);
  }
  if (
    !experience.export?.imageFileName ||
    !experience.export.imageFileName.endsWith(".png")
  ) {
    errors.push(`${prefix}: export.imageFileName must end with .png`);
  }
  if (!experienceLayouts.has(experience.export?.layout)) {
    errors.push(
      `${prefix}: invalid export layout ${experience.export?.layout}`,
    );
  }
  if (!experience.share?.text) {
    errors.push(`${prefix}: published experience needs share.text`);
  }
  if (
    !Array.isArray(experience.share?.hashtags) ||
    experience.share.hashtags.length === 0 ||
    experience.share.hashtags.some(
      (hashtag) => typeof hashtag !== "string" || !hashtag.startsWith("#"),
    )
  ) {
    errors.push(`${prefix}: share.hashtags must be non-empty # strings`);
  }
}

function validateExperienceSlots(prefix, experience, errors) {
  if (!Array.isArray(experience.slots) || experience.slots.length === 0) {
    errors.push(`${prefix}: slots must be a non-empty array`);
    return;
  }

  const slotIds = new Set();
  const sortOrders = [];
  const hasPerformances = Array.isArray(experience.performances)
    ? experience.performances.length > 0
    : false;

  for (const slot of experience.slots) {
    if (!slot.id) {
      errors.push(`${prefix}: slot is missing id`);
      continue;
    }
    if (slotIds.has(slot.id)) {
      errors.push(`${prefix}: duplicate slot id ${slot.id}`);
    }
    slotIds.add(slot.id);

    if (!slot.label) {
      errors.push(`${prefix}: slot ${slot.id} needs label`);
    }
    if (typeof slot.sortOrder !== "number") {
      errors.push(`${prefix}: slot ${slot.id} needs numeric sortOrder`);
    } else {
      sortOrders.push(slot.sortOrder);
    }
    if (!eligibilityScopes.has(slot.eligibility)) {
      errors.push(
        `${prefix}: slot ${slot.id} has invalid eligibility ${slot.eligibility}`,
      );
    }
    if (slot.eligibility === "selected-performance" && !hasPerformances) {
      errors.push(
        `${prefix}: slot ${slot.id} cannot use selected-performance without performances`,
      );
    }
  }

  const sortedOrders = sortOrders.slice().sort((a, b) => a - b);
  sortedOrders.forEach((sortOrder, index) => {
    if (sortOrder !== index + 1) {
      errors.push(`${prefix}: slot sortOrder must be continuous from 1`);
    }
  });
}

function validateExperiencePerformances(prefix, experience, songIds, errors) {
  if (experience.performances === undefined) {
    return;
  }
  if (!Array.isArray(experience.performances)) {
    errors.push(`${prefix}: performances must be an array`);
    return;
  }

  const performanceIds = new Set();
  const usesStrictSetlist = experience.slots.some(
    (slot) =>
      slot.eligibility === "selected-performance" ||
      slot.eligibility === "event-union",
  );

  for (const performance of experience.performances) {
    if (!performance.id) {
      errors.push(`${prefix}: performance is missing id`);
      continue;
    }
    const performancePrefix = `${prefix} performance ${performance.id}`;

    if (!isStorageSafeSegment(performance.id)) {
      errors.push(
        `${performancePrefix}: id must use lowercase letters, numbers, _ or -`,
      );
    }
    if (performanceIds.has(performance.id)) {
      errors.push(`${prefix}: duplicate performance id ${performance.id}`);
    }
    performanceIds.add(performance.id);

    if (!performance.label) {
      errors.push(`${performancePrefix}: label is required`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(performance.date ?? "")) {
      errors.push(`${performancePrefix}: date must be YYYY-MM-DD`);
    }
    if (!verificationStatuses.has(performance.verificationStatus)) {
      errors.push(
        `${performancePrefix}: invalid verificationStatus ${performance.verificationStatus}`,
      );
    }
    if (
      experience.status === "published" &&
      usesStrictSetlist &&
      performance.verificationStatus !== "verified"
    ) {
      errors.push(
        `${performancePrefix}: published strict setlist experiences require verified performances`,
      );
    }
    if (
      !Array.isArray(performance.sourceUrls) ||
      performance.sourceUrls.length === 0 ||
      performance.sourceUrls.some(
        (sourceUrl) =>
          typeof sourceUrl !== "string" || !sourceUrl.startsWith("https://"),
      )
    ) {
      errors.push(
        `${performancePrefix}: sourceUrls must include https sources`,
      );
    }
    if (!performance.sourceNote) {
      errors.push(`${performancePrefix}: sourceNote is required`);
    }
    if (
      !Array.isArray(performance.setlist) ||
      performance.setlist.length === 0
    ) {
      errors.push(`${performancePrefix}: setlist must be a non-empty array`);
      continue;
    }

    validateSetlistEntries(
      performancePrefix,
      performance.setlist,
      songIds,
      errors,
    );
  }

  if (
    experience.defaultContextId &&
    experience.defaultContextId !== "both" &&
    !performanceIds.has(experience.defaultContextId)
  ) {
    errors.push(
      `${prefix}: defaultContextId must match a performance id or both`,
    );
  }
}

function validateSetlistEntries(prefix, setlist, songIds, errors) {
  const orders = new Set();

  for (const entry of setlist) {
    if (!Number.isInteger(entry.order) || entry.order <= 0) {
      errors.push(`${prefix}: setlist entry order must be a positive integer`);
    } else if (orders.has(entry.order)) {
      errors.push(`${prefix}: duplicate setlist order ${entry.order}`);
    }
    orders.add(entry.order);

    if (!entry.songId || !songIds.has(entry.songId)) {
      errors.push(`${prefix}: unknown setlist songId ${entry.songId}`);
    }
    if (entry.songId?.toLowerCase().includes("overture")) {
      errors.push(`${prefix}: Overture must not be a selectable songId`);
    }
    if (entry.section && !setlistSections.has(entry.section)) {
      errors.push(`${prefix}: invalid setlist section ${entry.section}`);
    }
  }
}

function validateCover(projectPrefix, song, errors) {
  if (!song.coverUrl) {
    errors.push(`${projectPrefix} ${song.id}: coverUrl is required`);
    return;
  }
  if (song.coverUrl.includes("placeholder")) {
    errors.push(
      `${projectPrefix} ${song.id}: coverUrl must point to a real local cover`,
    );
    return;
  }
  if (!song.coverUrl.startsWith("/")) {
    return;
  }

  const localCover = path.join(root, "public", song.coverUrl);
  if (!fs.existsSync(localCover)) {
    errors.push(
      `${projectPrefix} ${song.id}: cover file missing at public${song.coverUrl}`,
    );
    return;
  }
  if (fs.statSync(localCover).size === 0) {
    errors.push(
      `${projectPrefix} ${song.id}: cover file is empty at public${song.coverUrl}`,
    );
  }
}

function validateCredits(projectPrefix, song, errors) {
  if (!song.credits?.lyricist?.ja || !song.credits.lyricist.romaji) {
    errors.push(
      `${projectPrefix} ${song.id}: credits.lyricist ja and romaji are required`,
    );
  }

  if (!song.credits?.composer?.ja || !song.credits.composer.romaji) {
    errors.push(
      `${projectPrefix} ${song.id}: credits.composer ja and romaji are required`,
    );
  }

  if (!song.credits?.arranger?.ja || !song.credits.arranger.romaji) {
    errors.push(
      `${projectPrefix} ${song.id}: credits.arranger ja and romaji are required`,
    );
  }
}

function validateActiveMemberColors(
  projectPrefix,
  members,
  expectedCount,
  errors,
  options = {},
) {
  const activeMembers = members.filter((member) => member.active !== false);
  if (activeMembers.length !== expectedCount) {
    errors.push(
      `${projectPrefix} expected ${expectedCount} active members for color strip, found ${activeMembers.length}`,
    );
  }

  for (const member of activeMembers) {
    if (typeof member.color !== "string" || !member.color) {
      errors.push(
        `${projectPrefix} active member ${member.id} needs color for member color strip`,
      );
    }
    if (
      options.requireColors &&
      (!Array.isArray(member.colors) || member.colors.length === 0)
    ) {
      errors.push(
        `${projectPrefix} active member ${member.id} needs colors for member color strip`,
      );
    }
    if (options.disallowColors && member.colors !== undefined) {
      errors.push(
        `${projectPrefix} active member ${member.id} must use single member color only`,
      );
    }
  }
}

function validateNearlyEqualJoyStrictChecks(
  projectPrefix,
  songs,
  members,
  errors,
) {
  if (members.length !== 13) {
    errors.push(
      `${projectPrefix} expected exactly 13 members, found ${members.length}`,
    );
  }
  validateActiveMemberColors(projectPrefix, members, 12, errors, {
    disallowColors: true,
  });

  const fukuyama = members.find((member) => member.id === "fukuyama-moeka");
  if (!fukuyama) {
    errors.push(`${projectPrefix} missing graduated member: fukuyama-moeka`);
  } else {
    if (
      fukuyama.active !== false ||
      !fukuyama.graduated ||
      fukuyama.status !== "graduated"
    ) {
      errors.push(
        `${projectPrefix} fukuyama-moeka must be marked as graduated`,
      );
    }
    if (fukuyama.graduationDate !== "2023-03-29") {
      errors.push(
        `${projectPrefix} fukuyama-moeka graduationDate must be 2023-03-29`,
      );
    }
  }

  validateBoundarySongsByTitle(
    projectPrefix,
    songs,
    expectedNearlyEqualJoyBoundarySongs,
    errors,
  );

  for (const song of songs) {
    if (
      !expectedNearlyEqualJoyBoundarySongs.has(song.title?.ja) &&
      (song.memberIds ?? []).includes("fukuyama-moeka")
    ) {
      errors.push(
        `${projectPrefix} ${song.id}: fukuyama-moeka is only expected on early boundary songs`,
      );
    }
  }
}

function validateNotEqualMeStrictChecks(projectPrefix, songs, members, errors) {
  if (members.length !== 12) {
    errors.push(
      `${projectPrefix} expected exactly 12 members, found ${members.length}`,
    );
  }
  validateActiveMemberColors(projectPrefix, members, 11, errors, {
    requireColors: true,
  });

  const suganami = members.find((member) => member.id === "suganami-mirei");
  if (!suganami) {
    errors.push(`${projectPrefix} missing graduated member: suganami-mirei`);
  } else {
    if (
      suganami.active !== false ||
      !suganami.graduated ||
      suganami.status !== "graduated"
    ) {
      errors.push(
        `${projectPrefix} suganami-mirei must be marked as graduated`,
      );
    }
    if (suganami.graduationDate !== "2026-06-12") {
      errors.push(
        `${projectPrefix} suganami-mirei graduationDate must be 2026-06-12`,
      );
    }
  }

  validateBoundarySongsByTitle(
    projectPrefix,
    songs,
    expectedNotEqualMeBoundarySongs,
    errors,
  );
}

function validateEqualLoveStrictChecks(
  projectPrefix,
  songs,
  members,
  songIds,
  errors,
) {
  if (songs.length !== 84) {
    errors.push(
      `${projectPrefix} expected exactly 84 songs, found ${songs.length}`,
    );
  }

  if (members.length !== 12) {
    errors.push(
      `${projectPrefix} expected exactly 12 members, found ${members.length}`,
    );
  }

  for (const song of songs) {
    const expectedMemberIds = expectedEqualLoveBoundarySongs.get(song.id);
    if (!expectedMemberIds) continue;

    if (!song.coverSourceUrl?.startsWith("https://")) {
      errors.push(
        `${projectPrefix} ${song.id}: boundary song needs https coverSourceUrl`,
      );
    }
    if (!song.officialUrl?.startsWith("https://")) {
      errors.push(
        `${projectPrefix} ${song.id}: boundary song needs https officialUrl`,
      );
    }
    if (!song.creditSourceUrl?.startsWith("https://")) {
      errors.push(
        `${projectPrefix} ${song.id}: boundary song needs https creditSourceUrl`,
      );
    }
    if (!sameMembers(song.memberIds ?? [], expectedMemberIds)) {
      errors.push(
        `${projectPrefix} ${song.id}: expected memberIds [${expectedMemberIds.join(", ")}], found [${(song.memberIds ?? []).join(", ")}]`,
      );
    }
  }

  for (const songId of expectedEqualLoveBoundarySongs.keys()) {
    if (!songIds.has(songId)) {
      errors.push(`${projectPrefix} missing boundary song: ${songId}`);
    }
  }
}

function validateBoundarySongsByTitle(
  projectPrefix,
  songs,
  expectedSongs,
  errors,
) {
  for (const [title, expectedMemberIds] of expectedSongs.entries()) {
    const song = songs.find((candidate) => candidate.title?.ja === title);
    if (!song) {
      errors.push(`${projectPrefix} missing boundary song title: ${title}`);
      continue;
    }

    if (!song.coverSourceUrl?.startsWith("https://")) {
      errors.push(
        `${projectPrefix} ${song.id}: boundary song needs https coverSourceUrl`,
      );
    }
    if (!song.officialUrl?.startsWith("https://")) {
      errors.push(
        `${projectPrefix} ${song.id}: boundary song needs https officialUrl`,
      );
    }
    if (!song.creditSourceUrl?.startsWith("https://")) {
      errors.push(
        `${projectPrefix} ${song.id}: boundary song needs https creditSourceUrl`,
      );
    }
    for (const memberId of expectedMemberIds) {
      if (!(song.memberIds ?? []).includes(memberId)) {
        errors.push(
          `${projectPrefix} ${song.id}: expected memberIds to include ${memberId}`,
        );
      }
    }
  }
}

function listProjectIds() {
  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readProjectArg() {
  const projectFlagIndex = process.argv.findIndex((arg) => arg === "--project");
  if (projectFlagIndex >= 0) {
    return process.argv[projectFlagIndex + 1];
  }

  const projectArg = process.argv.find((arg) => arg.startsWith("--project="));
  return projectArg?.slice("--project=".length);
}

function readJson(filePath, errors, projectPrefix) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(
      `${projectPrefix} failed to read ${path.relative(root, filePath)}: ${error.message}`,
    );
    return [];
  }
}

function sameMembers(actual, expected) {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return expected.every((memberId) => actualSet.has(memberId));
}

function isStorageSafeSegment(value) {
  return /^[a-z0-9][a-z0-9_-]*$/.test(value);
}
