import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

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
const pendingOwnershipEvidence = new Set([
  "verified-credits",
  "verified-artist",
  "explicit-current-group",
  "official-title-track",
  "official-multi-edition",
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
const provenanceSchemaVersions = new Set([1]);
const evidenceGrades = new Set(["A", "B", "C", "D", "E"]);
const supportingSourceRoles = new Set([
  "official-playlist",
  "cross-check-report",
]);
const crossCheckStatuses = new Set([
  "matched",
  "matched-with-documented-differences",
]);
const excludedEntryReasons = new Set([
  "non-catalog-intro",
  "non-song",
  "not-in-project-catalog",
]);
const excludedEntryFields = new Set([
  "sourceUrl",
  "sourceOrder",
  "beforeSourceOrder",
  "label",
  "reason",
]);
const unknownAnnouncementMarkers = ["タイトル未定", "後日発表", "TBD"];
const catalogDate = currentJapanDate();

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
if (process.argv.includes("--self-test-live-experiences")) {
  runLiveExperienceValidatorSelfTests();
  process.exit(0);
}
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
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(song.releaseDate ?? "") &&
      song.releaseDate > catalogDate &&
      song.sourceStatus !== "announced"
    ) {
      errors.push(
        `${projectPrefix} ${song.id}: future releaseDate ${song.releaseDate} requires sourceStatus announced`,
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
    if (["announced", "credits_pending"].includes(song.sourceStatus)) {
      validatePendingCreditsSong(projectPrefix, song, errors);
    } else {
      validateCredits(projectPrefix, song, errors);
    }
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
    if (experience.kind === "standard") {
      errors.push(`${prefix}: live experience files cannot use standard kind`);
    }
    if (!experienceStatuses.has(experience.status)) {
      errors.push(`${prefix}: invalid status ${experience.status}`);
    }

    validateLiveEventEvidence(prefix, experience, errors);
    validatePublishedExperienceFields(prefix, experience, errors);
    validateExperienceSlots(prefix, experience, errors);
    validateExperiencePerformances(prefix, experience, songIds, errors);
  }
}

function validateLiveEventEvidence(prefix, experience, errors) {
  if (experience.status === "draft") {
    return;
  }

  if (!experience.eventName || !experience.venue) {
    errors.push(`${prefix}: routable experience needs eventName and venue`);
  }
  if (
    typeof experience.officialUrl !== "string" ||
    !experience.officialUrl.startsWith("https://")
  ) {
    errors.push(`${prefix}: routable experience needs https officialUrl`);
  }

  const evidence = experience.eventEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push(`${prefix}: routable experience needs eventEvidence`);
    return;
  }
  if (evidence.verificationStatus !== "verified") {
    errors.push(
      `${prefix}: routable eventEvidence must have verified event metadata`,
    );
  }
  if (
    !Array.isArray(evidence.dates) ||
    evidence.dates.length === 0 ||
    evidence.dates.some((date) => !isValidIsoDate(date))
  ) {
    errors.push(
      `${prefix}: eventEvidence.dates must contain valid YYYY-MM-DD dates`,
    );
  }
  if (
    !Array.isArray(evidence.sourceUrls) ||
    evidence.sourceUrls.length === 0 ||
    evidence.sourceUrls.some(
      (sourceUrl) =>
        typeof sourceUrl !== "string" || !sourceUrl.startsWith("https://"),
    )
  ) {
    errors.push(
      `${prefix}: eventEvidence.sourceUrls must include https sources`,
    );
  } else if (!evidence.sourceUrls.includes(experience.officialUrl)) {
    errors.push(
      `${prefix}: officialUrl must be included in eventEvidence.sourceUrls`,
    );
  }
  if (typeof evidence.sourceNote !== "string" || !evidence.sourceNote.trim()) {
    errors.push(`${prefix}: eventEvidence.sourceNote is required`);
  }
}

function validatePublishedExperienceFields(prefix, experience, errors) {
  if (experience.status !== "published") {
    return;
  }

  if (!experience.title || !experience.subtitle || !experience.description) {
    errors.push(
      `${prefix}: published experience needs title, subtitle and description`,
    );
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
  const slotLabels = new Set();
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
    } else if (slotLabels.has(slot.label)) {
      errors.push(`${prefix}: duplicate slot label ${slot.label}`);
    } else {
      slotLabels.add(slot.label);
    }
    if (experience.status === "published" && !slot.subtitle) {
      errors.push(`${prefix}: published slot ${slot.id} needs subtitle`);
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
    if (slot.eligibility !== "catalog" && !hasPerformances) {
      errors.push(
        `${prefix}: slot ${slot.id} cannot use ${slot.eligibility} without performances`,
      );
    }
  }

  if (experience.kind === "live-wishlist") {
    if (experience.slots.some((slot) => slot.eligibility !== "catalog")) {
      errors.push(
        `${prefix}: live-wishlist slots must use catalog eligibility`,
      );
    }
    if (
      experience.performances !== undefined ||
      experience.defaultContextId !== undefined ||
      experience.includeCombinedPerformance !== undefined
    ) {
      errors.push(
        `${prefix}: live-wishlist cannot define performances or performance context`,
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
  const provenanceVersion = experience.provenanceSchemaVersion;
  const requiresVersionedProvenance =
    experience.kind === "live-afterglow" &&
    experience.id?.endsWith("_afterglow");
  if (requiresVersionedProvenance && provenanceVersion !== 1) {
    errors.push(
      `${prefix}: versioned live-afterglow experiences require provenanceSchemaVersion 1`,
    );
  }
  if (
    provenanceVersion !== undefined &&
    !provenanceSchemaVersions.has(provenanceVersion)
  ) {
    errors.push(
      `${prefix}: unsupported provenanceSchemaVersion ${provenanceVersion}`,
    );
  }

  if (
    experience.combinedPerformanceLabel !== undefined &&
    (!experience.includeCombinedPerformance ||
      typeof experience.combinedPerformanceLabel !== "string" ||
      !experience.combinedPerformanceLabel.trim())
  ) {
    errors.push(
      `${prefix}: combinedPerformanceLabel requires includeCombinedPerformance and a non-empty label`,
    );
  }

  if (experience.performances === undefined) {
    if (provenanceVersion !== undefined) {
      errors.push(`${prefix}: provenanceSchemaVersion requires performances`);
    }
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
    if (!isValidIsoDate(performance.date)) {
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
    validatePerformanceProvenance(
      performancePrefix,
      performance,
      provenanceVersion,
      experience.status,
      errors,
    );
  }

  if (
    experience.includeCombinedPerformance &&
    experience.performances.length < 2
  ) {
    errors.push(
      `${prefix}: includeCombinedPerformance requires at least two performances`,
    );
  }
  if (
    experience.performances.length > 0 &&
    (typeof experience.defaultContextId !== "string" ||
      !experience.defaultContextId)
  ) {
    errors.push(`${prefix}: performances require defaultContextId`);
  }
  if (
    experience.defaultContextId &&
    ((experience.defaultContextId === "both" &&
      !experience.includeCombinedPerformance) ||
      (experience.defaultContextId !== "both" &&
        !performanceIds.has(experience.defaultContextId)))
  ) {
    errors.push(
      `${prefix}: defaultContextId must match a performance id or an enabled combined context`,
    );
  }
}

function validatePerformanceProvenance(
  prefix,
  performance,
  experienceProvenanceVersion,
  experienceStatus,
  errors,
) {
  const provenance = performance.provenance;
  if (experienceProvenanceVersion === undefined) {
    if (provenance !== undefined) {
      errors.push(
        `${prefix}: provenance requires experience provenanceSchemaVersion`,
      );
    }
    return;
  }
  if (
    !provenance ||
    typeof provenance !== "object" ||
    Array.isArray(provenance)
  ) {
    errors.push(`${prefix}: provenance is required by provenanceSchemaVersion`);
    return;
  }
  if (provenance.schemaVersion !== experienceProvenanceVersion) {
    errors.push(
      `${prefix}: provenance.schemaVersion must match the experience`,
    );
  }

  const primary = provenance.primarySource;
  if (!primary || typeof primary !== "object" || Array.isArray(primary)) {
    errors.push(`${prefix}: provenance.primarySource is required`);
    return;
  }
  validateProvenanceSource(`${prefix} primarySource`, primary, true, errors);
  if (
    experienceStatus === "published" &&
    !["A", "B"].includes(primary.evidenceGrade) &&
    !(primary.evidenceGrade === "C" && isValidIsoDate(provenance.confirmedAt))
  ) {
    errors.push(
      `${prefix}: published ordered setlists require A/B evidence or a confirmed C source`,
    );
  }

  if (
    !Array.isArray(provenance.supportingSources) ||
    provenance.supportingSources.length === 0
  ) {
    errors.push(`${prefix}: provenance.supportingSources must be non-empty`);
  }
  const supportingSources = Array.isArray(provenance.supportingSources)
    ? provenance.supportingSources
    : [];
  for (const [index, source] of supportingSources.entries()) {
    validateProvenanceSource(
      `${prefix} supportingSources[${index}]`,
      source,
      false,
      errors,
    );
    if (!supportingSourceRoles.has(source?.role)) {
      errors.push(
        `${prefix} supportingSources[${index}]: invalid role ${source?.role}`,
      );
    }
    if (source?.role === "official-playlist" && source.evidenceGrade !== "B") {
      errors.push(
        `${prefix} supportingSources[${index}]: official-playlist evidenceGrade must be B`,
      );
    }
    if (
      source?.role === "cross-check-report" &&
      !["C", "D"].includes(source.evidenceGrade)
    ) {
      errors.push(
        `${prefix} supportingSources[${index}]: cross-check-report evidenceGrade must be C or D`,
      );
    }
  }

  const derivedSourceUrls = [
    primary.url,
    ...supportingSources.map((source) => source?.url),
  ];
  if (
    new Set(derivedSourceUrls).size !== derivedSourceUrls.length ||
    !arraysEqual(performance.sourceUrls, derivedSourceUrls)
  ) {
    errors.push(
      `${prefix}: sourceUrls must exactly equal primarySource.url followed by unique supportingSources URLs`,
    );
  }

  if (!isValidIsoDate(provenance.reviewedAt)) {
    errors.push(`${prefix}: provenance.reviewedAt must be YYYY-MM-DD`);
  }
  if (!isValidIsoDate(provenance.confirmedAt)) {
    errors.push(`${prefix}: provenance.confirmedAt must be YYYY-MM-DD`);
  }

  const sourceUrlSet = new Set(derivedSourceUrls);
  const supportingUrlSet = new Set(
    supportingSources.map((source) => source?.url),
  );
  const officialPlaylistUrlSet = new Set(
    supportingSources
      .filter((source) => source?.role === "official-playlist")
      .map((source) => source.url),
  );
  const reportUrlSet = new Set(
    supportingSources
      .filter((source) => source?.role === "cross-check-report")
      .map((source) => source.url),
  );
  if (!Array.isArray(provenance.excludedEntries)) {
    errors.push(`${prefix}: provenance.excludedEntries must be an array`);
  } else {
    const excludedOrders = new Set();
    const setlistOrders = new Set(
      performance.setlist.map((entry) => entry.order),
    );
    for (const [index, entry] of provenance.excludedEntries.entries()) {
      const entryPrefix = `${prefix} excludedEntries[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${entryPrefix}: entry must be an object`);
        continue;
      }
      if (!sourceUrlSet.has(entry.sourceUrl)) {
        errors.push(
          `${entryPrefix}: sourceUrl must reference a declared source`,
        );
      }
      for (const field of Object.getOwnPropertyNames(entry)) {
        if (excludedEntryFields.has(field)) continue;
        errors.push(
          field === "sourcePosition"
            ? `${entryPrefix}: sourcePosition is not supported; use sourceOrder or beforeSourceOrder`
            : `${entryPrefix}: unknown field ${field}`,
        );
      }
      const hasOrder = entry.sourceOrder !== undefined;
      const hasBeforeOrder = entry.beforeSourceOrder !== undefined;
      if (Number(hasOrder) + Number(hasBeforeOrder) !== 1) {
        errors.push(
          `${entryPrefix}: define exactly one of sourceOrder or beforeSourceOrder`,
        );
      }
      if (hasOrder) {
        if (!Number.isInteger(entry.sourceOrder) || entry.sourceOrder <= 0) {
          errors.push(`${entryPrefix}: sourceOrder must be a positive integer`);
        } else if (excludedOrders.has(entry.sourceOrder)) {
          errors.push(`${entryPrefix}: duplicate excluded sourceOrder`);
        } else {
          excludedOrders.add(entry.sourceOrder);
        }
      }
      if (
        hasBeforeOrder &&
        (!Number.isInteger(entry.beforeSourceOrder) ||
          entry.beforeSourceOrder <= 0)
      ) {
        errors.push(
          `${entryPrefix}: beforeSourceOrder must be a positive integer`,
        );
      } else if (
        hasBeforeOrder &&
        !setlistOrders.has(entry.beforeSourceOrder)
      ) {
        errors.push(
          `${entryPrefix}: beforeSourceOrder must reference an existing setlist order`,
        );
      }
      if (typeof entry.label !== "string" || !entry.label.trim()) {
        errors.push(`${entryPrefix}: label is required`);
      }
      if (!excludedEntryReasons.has(entry.reason)) {
        errors.push(`${entryPrefix}: invalid reason ${entry.reason}`);
      }
    }
    validateNumericSourceOrderCoverage(
      prefix,
      performance.setlist,
      provenance.excludedEntries,
      errors,
    );
  }

  const repeatedSongIds = getRepeatedSongIds(performance.setlist);
  if (
    !Array.isArray(provenance.repeatedSongIds) ||
    new Set(provenance.repeatedSongIds).size !==
      provenance.repeatedSongIds.length ||
    !setsEqual(new Set(provenance.repeatedSongIds), new Set(repeatedSongIds))
  ) {
    errors.push(
      `${prefix}: repeatedSongIds must exactly describe repeated ordered setlist songs`,
    );
  }

  const crossCheck = provenance.crossCheck;
  if (
    !crossCheck ||
    typeof crossCheck !== "object" ||
    Array.isArray(crossCheck)
  ) {
    errors.push(`${prefix}: provenance.crossCheck is required`);
  } else {
    if (!crossCheckStatuses.has(crossCheck.status)) {
      errors.push(`${prefix}: invalid crossCheck.status ${crossCheck.status}`);
    }
    if (
      !Array.isArray(crossCheck.sourceUrls) ||
      crossCheck.sourceUrls.length === 0 ||
      new Set(crossCheck.sourceUrls).size !== crossCheck.sourceUrls.length ||
      crossCheck.sourceUrls.some(
        (sourceUrl) => !supportingUrlSet.has(sourceUrl),
      )
    ) {
      errors.push(
        `${prefix}: crossCheck.sourceUrls must be unique supporting source URLs`,
      );
    } else if (
      !crossCheck.sourceUrls.some((sourceUrl) =>
        officialPlaylistUrlSet.has(sourceUrl),
      ) ||
      !crossCheck.sourceUrls.some((sourceUrl) => reportUrlSet.has(sourceUrl))
    ) {
      errors.push(
        `${prefix}: crossCheck must combine an official playlist and a separate report`,
      );
    }
    if (typeof crossCheck.note !== "string" || !crossCheck.note.trim()) {
      errors.push(`${prefix}: crossCheck.note is required`);
    }
    if (crossCheck.status === "matched-with-documented-differences") {
      const excludedEntries = Array.isArray(provenance.excludedEntries)
        ? provenance.excludedEntries
        : [];
      const crossCheckUrlSet = new Set(
        Array.isArray(crossCheck.sourceUrls) ? crossCheck.sourceUrls : [],
      );
      if (
        excludedEntries.length === 0 ||
        excludedEntries.some((entry) => !crossCheckUrlSet.has(entry?.sourceUrl))
      ) {
        errors.push(
          `${prefix}: matched-with-documented-differences requires every excluded entry to use a crossCheck source URL`,
        );
      }
    }
  }
}

function validateProvenanceSource(prefix, source, isPrimary, errors) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    errors.push(`${prefix}: source must be an object`);
    return;
  }
  if (typeof source.url !== "string" || !source.url.startsWith("https://")) {
    errors.push(`${prefix}: url must use https`);
  }
  if (typeof source.publisher !== "string" || !source.publisher.trim()) {
    errors.push(`${prefix}: publisher is required`);
  }
  if (isPrimary && !isValidSourceDate(source.publishedAt)) {
    errors.push(`${prefix}: publishedAt must be an ISO date or datetime`);
  }
  if (!isPrimary) {
    if (
      source.publishedAt !== undefined &&
      !isValidSourceDate(source.publishedAt)
    ) {
      errors.push(`${prefix}: publishedAt must be an ISO date or datetime`);
    }
    if (source.verifiedAt !== undefined && !isValidIsoDate(source.verifiedAt)) {
      errors.push(`${prefix}: verifiedAt must be YYYY-MM-DD`);
    }
    if (
      !isValidSourceDate(source.publishedAt) &&
      !isValidIsoDate(source.verifiedAt)
    ) {
      errors.push(
        `${prefix}: supporting sources require a publishedAt or verifiedAt`,
      );
    }
  }
  if (isPrimary && !evidenceGrades.has(source.evidenceGrade)) {
    errors.push(`${prefix}: invalid evidenceGrade ${source.evidenceGrade}`);
  }
  if (!isPrimary && !["B", "C", "D"].includes(source.evidenceGrade)) {
    errors.push(
      `${prefix}: invalid supporting evidenceGrade ${source.evidenceGrade}`,
    );
  }
}

function validateNumericSourceOrderCoverage(
  prefix,
  setlist,
  excludedEntries,
  errors,
) {
  const numericOrders = [
    ...setlist.map((entry) => entry.order),
    ...excludedEntries
      .filter((entry) => Number.isInteger(entry?.sourceOrder))
      .map((entry) => entry.sourceOrder),
  ].sort((left, right) => left - right);
  if (new Set(numericOrders).size !== numericOrders.length) {
    errors.push(
      `${prefix}: setlist and excluded entries must not share source orders`,
    );
    return;
  }
  numericOrders.forEach((order, index) => {
    if (order !== index + 1) {
      errors.push(`${prefix}: numeric source orders must be continuous from 1`);
    }
  });
}

function getRepeatedSongIds(setlist) {
  const counts = new Map();
  for (const entry of setlist) {
    counts.set(entry.songId, (counts.get(entry.songId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([songId]) => songId);
}

function arraysEqual(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function setsEqual(left, right) {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function isValidSourceDate(value) {
  return (
    isValidIsoDate(value) ||
    (typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) &&
      !Number.isNaN(Date.parse(value)))
  );
}

function runLiveExperienceValidatorSelfTests() {
  const fixtures = new Map();
  for (const projectId of ["nearly-equal-joy", "not-equal-me"]) {
    const projectDir = path.join(projectsDir, projectId);
    const experiences = JSON.parse(
      fs.readFileSync(path.join(projectDir, "live-experiences.json"), "utf8"),
    );
    const songs = JSON.parse(
      fs.readFileSync(path.join(projectDir, "songs.json"), "utf8"),
    );
    fixtures.set(projectId, {
      experience: experiences[0],
      songIds: new Set(songs.map((song) => song.id)),
    });
    const baselineErrors = [];
    validateLiveExperiences(
      `[self-test:${projectId}]`,
      projectId,
      experiences,
      new Set(songs.map((song) => song.id)),
      baselineErrors,
    );
    assert.deepEqual(baselineErrors, []);
  }

  const expectRejected = (label, projectId, mutate, pattern) => {
    const fixture = fixtures.get(projectId);
    assert.ok(fixture);
    const experience = structuredClone(fixture.experience);
    mutate(experience);
    const errors = [];
    validateLiveExperiences(
      `[self-test:${label}]`,
      projectId,
      [experience],
      fixture.songIds,
      errors,
    );
    assert.ok(
      errors.some((error) => pattern.test(error)),
      `${label} should be rejected by ${pattern}; got ${errors.join(" | ")}`,
    );
  };

  expectRejected(
    "future-schema",
    "nearly-equal-joy",
    (experience) => {
      experience.provenanceSchemaVersion = 2;
    },
    /unsupported provenanceSchemaVersion/,
  );
  expectRejected(
    "missing-schema",
    "nearly-equal-joy",
    (experience) => {
      delete experience.provenanceSchemaVersion;
    },
    /versioned live-afterglow experiences require provenanceSchemaVersion 1/,
  );
  for (const projectId of ["nearly-equal-joy", "not-equal-me"]) {
    expectRejected(
      `missing-entire-provenance-chain-${projectId}`,
      projectId,
      (experience) => {
        delete experience.provenanceSchemaVersion;
        for (const performance of experience.performances) {
          delete performance.provenance;
        }
      },
      /versioned live-afterglow experiences require provenanceSchemaVersion 1/,
    );
  }
  expectRejected(
    "missing-provenance",
    "nearly-equal-joy",
    (experience) => {
      delete experience.performances[0].provenance;
    },
    /provenance is required/,
  );
  expectRejected(
    "insufficient-source-grade",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.primarySource.evidenceGrade = "D";
    },
    /published ordered setlists require A\/B evidence/,
  );
  expectRejected(
    "compatibility-source-drift",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].sourceUrls.pop();
    },
    /sourceUrls must exactly equal/,
  );
  expectRejected(
    "missing-supporting-source-date",
    "nearly-equal-joy",
    (experience) => {
      delete experience.performances[0].provenance.supportingSources[0]
        .publishedAt;
      delete experience.performances[0].provenance.supportingSources[0]
        .verifiedAt;
    },
    /supporting sources require a publishedAt or verifiedAt/,
  );
  expectRejected(
    "supporting-source-grade-role-mismatch",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.supportingSources[0].evidenceGrade =
        "C";
    },
    /official-playlist evidenceGrade must be B/,
  );
  expectRejected(
    "cross-check-without-separate-report",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.crossCheck.sourceUrls = [
        experience.performances[0].provenance.supportingSources[0].url,
      ];
    },
    /crossCheck must combine an official playlist and a separate report/,
  );
  expectRejected(
    "unbound-excluded-entry",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.excludedEntries[0].sourceUrl =
        "https://example.com/unbound";
    },
    /sourceUrl must reference a declared source/,
  );
  expectRejected(
    "unanchored-excluded-entry",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.excludedEntries[0].beforeSourceOrder = 999;
    },
    /beforeSourceOrder must reference an existing setlist order/,
  );
  expectRejected(
    "legacy-free-text-excluded-position",
    "nearly-equal-joy",
    (experience) => {
      const excludedEntry =
        experience.performances[0].provenance.excludedEntries[0];
      delete excludedEntry.beforeSourceOrder;
      excludedEntry.sourcePosition = "after M999";
    },
    /define exactly one of sourceOrder or beforeSourceOrder/,
  );
  expectRejected(
    "structured-exclusion-with-legacy-position",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.excludedEntries[0].sourcePosition =
        "before M1";
    },
    /sourcePosition is not supported/,
  );
  expectRejected(
    "excluded-entry-with-unknown-field",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.excludedEntries[0].unexpectedNote =
        "ignored by older validators";
    },
    /unknown field unexpectedNote/,
  );
  expectRejected(
    "documented-difference-without-exclusion",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.excludedEntries = [];
    },
    /matched-with-documented-differences requires every excluded entry/,
  );
  expectRejected(
    "documented-difference-with-unbound-additional-exclusion",
    "nearly-equal-joy",
    (experience) => {
      const performance = experience.performances[0];
      performance.provenance.excludedEntries.push({
        sourceUrl: performance.provenance.primarySource.url,
        beforeSourceOrder: 2,
        label: "MC",
        reason: "non-song",
      });
    },
    /matched-with-documented-differences requires every excluded entry/,
  );
  expectRejected(
    "incorrect-repeat-declaration",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].provenance.repeatedSongIds = [];
    },
    /repeatedSongIds must exactly describe/,
  );
  expectRejected(
    "unknown-cross-project-song",
    "nearly-equal-joy",
    (experience) => {
      experience.performances[0].setlist[0].songId = "not-equal-me";
    },
    /unknown setlist songId/,
  );
  expectRejected(
    "missing-context",
    "nearly-equal-joy",
    (experience) => {
      delete experience.defaultContextId;
    },
    /performances require defaultContextId/,
  );
  expectRejected(
    "invalid-context",
    "nearly-equal-joy",
    (experience) => {
      experience.defaultContextId = "unknown";
    },
    /defaultContextId must match/,
  );
  expectRejected(
    "wrong-project",
    "nearly-equal-joy",
    (experience) => {
      experience.projectId = "not-equal-me";
    },
    /projectId must be nearly-equal-joy/,
  );

  const joyFixture = fixtures.get("nearly-equal-joy");
  assert.ok(joyFixture);
  const duplicateErrors = [];
  validateLiveExperiences(
    "[self-test:duplicate-route-and-id]",
    "nearly-equal-joy",
    [joyFixture.experience, structuredClone(joyFixture.experience)],
    joyFixture.songIds,
    duplicateErrors,
  );
  assert.ok(
    duplicateErrors.some((error) => /duplicate live experience id/.test(error)),
  );
  assert.ok(
    duplicateErrors.some((error) =>
      /duplicate live experience slug/.test(error),
    ),
  );

  console.log("Live experience validator self-tests passed.");
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

function validatePendingCreditsSong(projectPrefix, song, errors) {
  if (!song.releaseTitle?.ja || !song.releaseTitle?.romaji) {
    errors.push(
      `${projectPrefix} ${song.id}: pending-credits song needs releaseTitle ja and romaji`,
    );
  }

  for (const value of [song.title?.ja, song.releaseTitle?.ja]) {
    if (
      value &&
      unknownAnnouncementMarkers.some((marker) =>
        value.toUpperCase().includes(marker.toUpperCase()),
      )
    ) {
      errors.push(
        `${projectPrefix} ${song.id}: pending-credits song cannot use placeholder metadata`,
      );
    }
  }

  if (!song.coverSourceUrl?.startsWith("https://")) {
    errors.push(
      `${projectPrefix} ${song.id}: pending-credits song needs https coverSourceUrl`,
    );
  }
  if (!song.officialUrl?.startsWith("https://")) {
    errors.push(
      `${projectPrefix} ${song.id}: pending-credits song needs https officialUrl`,
    );
  }
  if (!song.sourceNote) {
    errors.push(
      `${projectPrefix} ${song.id}: pending-credits song needs sourceNote`,
    );
  }

  if (!pendingOwnershipEvidence.has(song.ownershipEvidence)) {
    errors.push(
      `${projectPrefix} ${song.id}: pending-credits song needs trusted ownershipEvidence`,
    );
  }

  if (song.ownershipEvidence === "verified-credits" && !song.credits) {
    errors.push(
      `${projectPrefix} ${song.id}: verified-credits evidence needs complete credits`,
    );
  } else if (song.ownershipEvidence === "verified-artist") {
    if (
      song.credits ||
      !song.creditSourceUrl?.startsWith("https://www.uta-net.com/")
    ) {
      errors.push(
        `${projectPrefix} ${song.id}: verified-artist evidence needs an Uta-Net source and no partial credits payload`,
      );
    }
  } else if (
    song.ownershipEvidence !== "verified-credits" &&
    (song.memberIds ?? []).length > 0
  ) {
    errors.push(
      `${projectPrefix} ${song.id}: heuristic ownership must not guess participating members`,
    );
  }

  const tags = song.tags ?? [];
  if (
    !tags.includes(song.sourceStatus) ||
    tags.some(
      (tag) =>
        ["announced", "credits_pending"].includes(tag) &&
        tag !== song.sourceStatus,
    )
  ) {
    errors.push(
      `${projectPrefix} ${song.id}: tags must match sourceStatus ${song.sourceStatus}`,
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(song.releaseDate ?? "")) {
    const expectedStatus =
      song.releaseDate > catalogDate ? "announced" : "credits_pending";
    if (song.sourceStatus !== expectedStatus) {
      errors.push(
        `${projectPrefix} ${song.id}: releaseDate ${song.releaseDate} requires sourceStatus ${expectedStatus}`,
      );
    }
  }

  if (song.credits) {
    validateCredits(projectPrefix, song, errors);
  }
}

function currentJapanDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
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
  if (songs.length < 84) {
    errors.push(
      `${projectPrefix} expected at least 84 songs, found ${songs.length}`,
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
