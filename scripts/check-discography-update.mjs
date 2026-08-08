import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRules = new Map([
  [
    "equal-love",
    {
      groupArtist: "=LOVE",
      officialDomains: ["equal-love.jp"],
      coverDomains: [
        "equal-love.jp",
        "s3-aop.plusmember.jp",
        "www.uta-net.com",
      ],
    },
  ],
  [
    "nearly-equal-joy",
    {
      groupArtist: "≒JOY",
      officialDomains: ["nearly-equal-joy.jp"],
      coverDomains: [
        "nearly-equal-joy.jp",
        "s3-aop.plusmember.jp",
        "www.uta-net.com",
      ],
    },
  ],
  [
    "not-equal-me",
    {
      groupArtist: "≠ME",
      officialDomains: ["not-equal-me.jp"],
      coverDomains: [
        "not-equal-me.jp",
        "s3-aop.plusmember.jp",
        "www.uta-net.com",
      ],
    },
  ],
]);
const maxNewSongsPerProject = 30;
const maxNewCoverBytes = 20 * 1024 * 1024;
const maxSingleCoverBytes = 2 * 1024 * 1024;
const creditRoles = ["lyricist", "composer", "arranger"];
const unknownMarkers = ["タイトル未定", "後日発表", "TBD"];
const pendingCreditStatuses = new Set(["announced", "credits_pending"]);
const pendingOwnershipEvidence = new Set([
  "verified-credits",
  "verified-artist",
  "explicit-current-group",
  "official-title-track",
  "official-multi-edition",
]);
const utanetDomains = ["www.uta-net.com"];
const catalogDate = currentJapanDate();
const enforceAllowlist = process.argv.includes("--enforce-allowlist");
const errors = [];
const summaries = [];
const addedCoverPaths = new Set();
const headSongsCache = new Map();
const workingSongsCache = new Map();

if (process.argv.includes("--self-test")) {
  runSelfTests();
  process.exit(0);
}

for (const [projectId, rules] of projectRules) {
  const membersPath = `src/projects/${projectId}/members.json`;
  const beforeSongs = getHeadSongs(projectId);
  const afterSongs = getWorkingSongs(projectId);
  const beforeMembers = readHeadJson(membersPath);
  const afterMembers = readWorkingJson(membersPath);

  validateSongs(projectId, rules, beforeSongs, afterSongs, afterMembers);
  if (!isDeepStrictEqual(beforeMembers, afterMembers)) {
    errors.push(`[${projectId}] daily song sync must not change members.json`);
  }

  const beforeSongIds = new Set(beforeSongs.map((song) => song.id));
  const addedSongs = afterSongs.filter((song) => !beforeSongIds.has(song.id));
  summaries.push(
    `[${projectId}] ${beforeSongs.length} -> ${afterSongs.length} songs (${addedSongs.length} added)`,
  );
}

validateCrossProjectAdditions();
validateAddedCovers();
if (enforceAllowlist) validateChangedPathAllowlist();

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Safe discography update:\n${summaries.join("\n")}`);

function validateSongs(projectId, rules, beforeSongs, afterSongs, members) {
  const prefix = `[${projectId}]`;
  const beforeById = new Map(beforeSongs.map((song) => [song.id, song]));
  const afterById = new Map(afterSongs.map((song) => [song.id, song]));
  const addedSongs = afterSongs.filter((song) => !beforeById.has(song.id));

  if (addedSongs.length > maxNewSongsPerProject) {
    errors.push(
      `${prefix} refuses ${addedSongs.length} new songs in one run (maximum ${maxNewSongsPerProject})`,
    );
  }

  const beforeOrder = beforeSongs.map((song) => song.id);
  const afterExistingOrder = afterSongs
    .filter((song) => beforeById.has(song.id))
    .map((song) => song.id);
  if (!isDeepStrictEqual(beforeOrder, afterExistingOrder)) {
    errors.push(
      `${prefix} refuses reordering or duplicating existing song ids`,
    );
  }

  for (const beforeSong of beforeSongs) {
    const afterSong = afterById.get(beforeSong.id);
    if (!afterSong) {
      errors.push(
        `${prefix} refuses removal of existing song id ${beforeSong.id}`,
      );
      continue;
    }
    if (
      !isDeepStrictEqual(beforeSong, afterSong) &&
      !isAllowedAnnouncementUpdate(
        projectId,
        rules,
        beforeSong,
        afterSong,
        members,
      )
    ) {
      errors.push(
        `${prefix} ${beforeSong.id}: existing record changed outside the announcement-credit allowlist`,
      );
    }
  }

  for (const song of addedSongs) {
    validateAddedSong(projectId, rules, song, members);
  }
}

function isAllowedAnnouncementUpdate(
  projectId,
  rules,
  beforeSong,
  afterSong,
  members = [],
) {
  if (!pendingCreditStatuses.has(beforeSong.sourceStatus)) return false;

  const mutableKeys = new Set([
    "credits",
    "creditSourceUrl",
    "artist",
    "memberIds",
    "ownershipEvidence",
    "sourceStatus",
    "sourceNote",
    "tags",
  ]);
  for (const key of new Set([
    ...Object.keys(beforeSong),
    ...Object.keys(afterSong),
  ])) {
    if (
      !mutableKeys.has(key) &&
      !isDeepStrictEqual(beforeSong[key], afterSong[key])
    ) {
      return false;
    }
  }

  const releaseHasArrived =
    /^\d{4}-\d{2}-\d{2}$/.test(afterSong.releaseDate ?? "") &&
    afterSong.releaseDate <= catalogDate;
  const tags = afterSong.tags ?? [];
  if (!hasCompleteCredits(afterSong)) {
    return (
      beforeSong.sourceStatus === "announced" &&
      afterSong.sourceStatus === "credits_pending" &&
      releaseHasArrived &&
      !beforeSong.credits &&
      !afterSong.credits &&
      beforeSong.creditSourceUrl === afterSong.creditSourceUrl &&
      isDeepStrictEqual(beforeSong.artist, afterSong.artist) &&
      isDeepStrictEqual(beforeSong.memberIds, afterSong.memberIds) &&
      beforeSong.ownershipEvidence === afterSong.ownershipEvidence &&
      Boolean(afterSong.sourceNote) &&
      tags.includes("credits_pending") &&
      !tags.includes("announced")
    );
  }

  const beforeHadCredits = hasCompleteCredits(beforeSong);
  if (
    beforeHadCredits &&
    (!isDeepStrictEqual(beforeSong.credits, afterSong.credits) ||
      beforeSong.creditSourceUrl !== afterSong.creditSourceUrl ||
      !isDeepStrictEqual(beforeSong.artist, afterSong.artist) ||
      !isDeepStrictEqual(beforeSong.memberIds, afterSong.memberIds) ||
      beforeSong.ownershipEvidence !== afterSong.ownershipEvidence)
  ) {
    return false;
  }

  if (
    !hasAllowedHttpsUrl(afterSong.creditSourceUrl, [
      ...utanetDomains,
      ...rules.officialDomains,
    ])
  ) {
    errors.push(
      `[${projectId}] ${afterSong.id}: announcement credits need an allowed source URL`,
    );
    return false;
  }

  if (
    !beforeHadCredits &&
    (afterSong.ownershipEvidence !== "verified-credits" ||
      !hasValidParticipantAssignment(afterSong, rules, members))
  ) {
    return false;
  }

  if (releaseHasArrived) {
    return (
      afterSong.sourceStatus === "released" &&
      !afterSong.sourceNote &&
      !tags.some((tag) => pendingCreditStatuses.has(tag))
    );
  }

  return (
    afterSong.sourceStatus === "announced" &&
    Boolean(afterSong.sourceNote) &&
    tags.includes("announced")
  );
}

function validateAddedSong(projectId, rules, song, members) {
  const prefix = `[${projectId}] ${song.id}`;
  const hasPendingCredits = pendingCreditStatuses.has(song.sourceStatus);
  const officialDomains = hasPendingCredits
    ? rules.officialDomains
    : [...rules.officialDomains, ...utanetDomains];

  if (!hasAllowedHttpsUrl(song.officialUrl, officialDomains)) {
    errors.push(`${prefix}: new song has an untrusted officialUrl`);
  }
  if (!hasAllowedHttpsUrl(song.coverSourceUrl, rules.coverDomains)) {
    errors.push(`${prefix}: new song has an untrusted coverSourceUrl`);
  }
  if (!song.title?.ja || !song.title?.romaji) {
    errors.push(`${prefix}: new song needs a known title`);
  }
  if (!song.releaseTitle?.ja || !song.releaseTitle?.romaji) {
    errors.push(`${prefix}: new song needs a known release title`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(song.releaseDate ?? "")) {
    errors.push(`${prefix}: new song needs a valid release date`);
  } else if (
    song.releaseDate > catalogDate &&
    song.sourceStatus !== "announced"
  ) {
    errors.push(
      `${prefix}: future releaseDate ${song.releaseDate} requires sourceStatus announced`,
    );
  }
  for (const value of [song.title?.ja, song.releaseTitle?.ja]) {
    if (
      value &&
      unknownMarkers.some((marker) =>
        value.toUpperCase().includes(marker.toUpperCase()),
      )
    ) {
      errors.push(`${prefix}: new song contains placeholder metadata`);
    }
  }

  if (hasPendingCredits) {
    const expectedStatus =
      song.releaseDate > catalogDate ? "announced" : "credits_pending";
    if (song.sourceStatus !== expectedStatus) {
      errors.push(
        `${prefix}: releaseDate ${song.releaseDate} requires sourceStatus ${expectedStatus}`,
      );
    }
    if (!pendingOwnershipEvidence.has(song.ownershipEvidence)) {
      errors.push(`${prefix}: pending-credits song needs ownershipEvidence`);
    }
    const tags = song.tags ?? [];
    if (
      !tags.includes(song.sourceStatus) ||
      tags.some(
        (tag) => pendingCreditStatuses.has(tag) && tag !== song.sourceStatus,
      )
    ) {
      errors.push(
        `${prefix}: tags must match sourceStatus ${song.sourceStatus}`,
      );
    }
    if (song.ownershipEvidence === "verified-credits") {
      if (
        !hasCompleteCredits(song) ||
        !hasValidParticipantAssignment(song, rules, members)
      ) {
        errors.push(
          `${prefix}: verified ownership needs complete credits and an exact current-project participant assignment`,
        );
      }
    } else if (song.ownershipEvidence === "verified-artist") {
      if (
        song.credits ||
        !hasAllowedHttpsUrl(song.creditSourceUrl, utanetDomains) ||
        !hasValidParticipantAssignment(song, rules, members)
      ) {
        errors.push(
          `${prefix}: verified artist evidence needs an Uta-Net source and exact participant assignment`,
        );
      }
    } else {
      if (
        normalizeArtist(song.artist?.ja) !== normalizeArtist(rules.groupArtist)
      ) {
        errors.push(
          `${prefix}: no-credit ownership evidence requires the current group artist`,
        );
      }
      if ((song.memberIds ?? []).length > 0) {
        errors.push(
          `${prefix}: heuristic ownership must not guess participating members`,
        );
      }
    }
    const matchingOtherProject = [...projectRules.keys()].find(
      (otherProjectId) =>
        otherProjectId !== projectId &&
        getWorkingSongs(otherProjectId).some(
          (otherSong) =>
            titleKey(otherSong.title?.ja) === titleKey(song.title?.ja),
        ),
    );
    if (
      matchingOtherProject &&
      ![
        "verified-credits",
        "verified-artist",
        "explicit-current-group",
      ].includes(song.ownershipEvidence)
    ) {
      errors.push(
        `${prefix}: pending-credits title already belongs to ${matchingOtherProject}; artist needs review`,
      );
    }
    if (!song.sourceNote) {
      errors.push(`${prefix}: pending-credits song needs a source note`);
    }
    if (song.credits && !hasCompleteCredits(song)) {
      errors.push(`${prefix}: pending-credits song has incomplete credits`);
    }
  } else {
    if (!hasCompleteCredits(song)) {
      errors.push(`${prefix}: verified song needs complete credits`);
    }
    if (
      !hasAllowedHttpsUrl(song.creditSourceUrl, [
        ...utanetDomains,
        ...rules.officialDomains,
      ])
    ) {
      errors.push(`${prefix}: verified song needs an allowed credit source`);
    }
    if (!hasValidParticipantAssignment(song, rules, members)) {
      errors.push(
        `${prefix}: verified song needs an exact current-project participant assignment`,
      );
    }
  }

  const expectedPrefix = `/covers/${projectId}/`;
  if (
    !song.coverUrl?.startsWith(expectedPrefix) ||
    !/^[a-z0-9][a-z0-9-]*\.jpg$/.test(
      song.coverUrl.slice(expectedPrefix.length),
    )
  ) {
    errors.push(`${prefix}: coverUrl must be a safe local project JPEG path`);
    return;
  }
  addedCoverPaths.add(`public${song.coverUrl}`);
}

function validateCrossProjectAdditions() {
  const additions = [];

  for (const projectId of projectRules.keys()) {
    const beforeIds = new Set(getHeadSongs(projectId).map((song) => song.id));
    for (const song of getWorkingSongs(projectId)) {
      if (beforeIds.has(song.id)) continue;
      additions.push({ projectId, song });
    }
  }

  for (const conflict of findCrossProjectAdditionConflicts(additions)) {
    errors.push(
      `[cross-project] ${conflict.title}: added to ${conflict.projectIds.join(", ")} in one run; artist ownership needs review`,
    );
  }
}

function findCrossProjectAdditionConflicts(additions) {
  const additionsByTitle = new Map();
  for (const addition of additions) {
    const key = titleKey(addition.song.title?.ja);
    if (!key) continue;
    const matching = additionsByTitle.get(key) ?? [];
    matching.push(addition);
    additionsByTitle.set(key, matching);
  }

  const conflicts = [];
  for (const matching of additionsByTitle.values()) {
    const projectIds = [...new Set(matching.map(({ projectId }) => projectId))];
    if (projectIds.length < 2) continue;
    conflicts.push({
      title: matching[0].song.title?.ja ?? matching[0].song.id,
      projectIds,
    });
  }
  return conflicts;
}

function validateAddedCovers() {
  let totalBytes = 0;
  for (const relativePath of addedCoverPaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`new song cover is missing: ${relativePath}`);
      continue;
    }

    const buffer = fs.readFileSync(absolutePath);
    totalBytes += buffer.length;
    if (buffer.length < 1024 || buffer.length > maxSingleCoverBytes) {
      errors.push(
        `${relativePath}: JPEG size ${buffer.length} bytes is outside the safe range`,
      );
    }

    const dimensions = readJpegDimensions(buffer);
    if (!dimensions) {
      errors.push(`${relativePath}: file is not a readable JPEG`);
      continue;
    }
    if (
      dimensions.width !== dimensions.height ||
      dimensions.width < 64 ||
      dimensions.width > 900
    ) {
      errors.push(
        `${relativePath}: expected a square 64-900px JPEG, found ${dimensions.width}x${dimensions.height}`,
      );
    }
  }

  if (totalBytes > maxNewCoverBytes) {
    errors.push(
      `new song covers total ${totalBytes} bytes (maximum ${maxNewCoverBytes})`,
    );
  }
}

function validateChangedPathAllowlist() {
  const allowedSongPath =
    /^src\/projects\/(equal-love|nearly-equal-joy|not-equal-me)\/songs\.json$/;
  const allowedCoverPath =
    /^public\/covers\/(equal-love|nearly-equal-joy|not-equal-me)\/[a-z0-9][a-z0-9-]*\.jpg$/;
  const trackedFields = execGit([
    "diff",
    "--name-status",
    "-z",
    "--no-renames",
    "HEAD",
  ])
    .split("\0")
    .filter(Boolean);

  for (let index = 0; index < trackedFields.length; index += 2) {
    const status = trackedFields[index];
    const changedPath = normalizePath(trackedFields[index + 1] ?? "");
    if (status !== "M" || !allowedSongPath.test(changedPath)) {
      errors.push(`unexpected tracked change ${status}: ${changedPath}`);
    }
  }

  const untrackedPaths = execGit([
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter(Boolean)
    .map(normalizePath);
  for (const changedPath of untrackedPaths) {
    if (
      !allowedCoverPath.test(changedPath) ||
      !addedCoverPaths.has(changedPath)
    ) {
      errors.push(`unexpected untracked generated file: ${changedPath}`);
    }
  }
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda || offset + 1 >= buffer.length)
      break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function hasCompleteCredits(song) {
  return creditRoles.every((role) => hasLocalizedValue(song.credits?.[role]));
}

function hasLocalizedValue(value) {
  return Boolean(value?.ja && value?.romaji);
}

function normalizeArtist(value) {
  return (value ?? "").normalize("NFKC").replaceAll(" ", "").toUpperCase();
}

function artistHasProjectEvidence(value, groupArtist) {
  return normalizeArtist(value).includes(normalizeArtist(groupArtist));
}

function expectedMemberIdsForArtist(
  artistValue,
  groupArtist,
  members,
  releaseDate,
) {
  const artist = (artistValue ?? "").normalize("NFKC").trim();
  const normalizedArtist = normalizeArtist(artist);
  const normalizedGroup = normalizeArtist(groupArtist);
  if (!artistHasProjectEvidence(artist, groupArtist)) return null;

  if (normalizedArtist === normalizedGroup) {
    return members
      .filter(
        (member) =>
          member.active ||
          (releaseDate &&
            member.graduationDate &&
            releaseDate <= member.graduationDate),
      )
      .map((member) => member.id);
  }

  const suffix = `(${groupArtist.normalize("NFKC")})`;
  if (!artist.endsWith(suffix)) return null;
  const memberNames = artist
    .slice(0, -suffix.length)
    .split(/[、,\/・]+/u)
    .map((name) => normalizeArtist(name))
    .filter(Boolean);
  if (memberNames.length === 0) return null;

  const memberByName = new Map(
    members.map((member) => [normalizeArtist(member.name?.ja), member.id]),
  );
  const memberIds = memberNames.map((name) => memberByName.get(name));
  if (memberIds.some((memberId) => !memberId)) return null;
  return [...new Set(memberIds)];
}

function hasValidParticipantAssignment(song, rules, members) {
  const expectedMemberIds = expectedMemberIdsForArtist(
    song.artist?.ja,
    rules.groupArtist,
    members,
    song.releaseDate,
  );
  if (
    expectedMemberIds === null ||
    !isDeepStrictEqual(song.memberIds ?? [], expectedMemberIds)
  ) {
    return false;
  }

  const isGroupSong =
    normalizeArtist(song.artist?.ja) === normalizeArtist(rules.groupArtist);
  const participationTags = (song.tags ?? []).filter((tag) =>
    ["solo", "unit"].includes(tag),
  );
  if (isGroupSong) return participationTags.length === 0;
  const expectedTag = expectedMemberIds.length === 1 ? "solo" : "unit";
  return isDeepStrictEqual(participationTags, [expectedTag]);
}

function titleKey(value) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s・!！?？「」『』"“”.,，、。:：〜~♡]+/gu, "")
    .toLowerCase();
}

function hasAllowedHttpsUrl(value, allowedDomains) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      allowedDomains.some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

function readHeadJson(relativePath) {
  try {
    return JSON.parse(execGit(["show", `HEAD:${relativePath}`]));
  } catch (error) {
    errors.push(`failed to read HEAD:${relativePath}: ${error.message}`);
    return [];
  }
}

function readWorkingJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`failed to read ${relativePath}: ${error.message}`);
    return [];
  }
}

function getHeadSongs(projectId) {
  if (!headSongsCache.has(projectId)) {
    headSongsCache.set(
      projectId,
      readHeadJson(`src/projects/${projectId}/songs.json`),
    );
  }
  return headSongsCache.get(projectId);
}

function getWorkingSongs(projectId) {
  if (!workingSongsCache.has(projectId)) {
    workingSongsCache.set(
      projectId,
      readWorkingJson(`src/projects/${projectId}/songs.json`),
    );
  }
  return workingSongsCache.get(projectId);
}

function execGit(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
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

function runSelfTests() {
  const sharedTitleConflicts = findCrossProjectAdditionConflicts([
    {
      projectId: "equal-love",
      song: { id: "shared-a", title: { ja: "合同・新曲" } },
    },
    {
      projectId: "nearly-equal-joy",
      song: { id: "shared-b", title: { ja: "合同 新曲" }, credits: {} },
    },
  ]);
  if (sharedTitleConflicts.length !== 1) {
    throw new Error("cross-project title normalization must fail closed");
  }

  const distinctTitleConflicts = findCrossProjectAdditionConflicts([
    {
      projectId: "equal-love",
      song: { id: "one", title: { ja: "新曲 A" } },
    },
    {
      projectId: "not-equal-me",
      song: { id: "two", title: { ja: "新曲 B" } },
    },
  ]);
  if (distinctTitleConflicts.length !== 0) {
    throw new Error("distinct cross-project additions must remain allowed");
  }

  if (titleKey("ヒーロー") === titleKey("ヒロ")) {
    throw new Error("the semantic long-vowel mark must remain in title keys");
  }
  if (titleKey("A-B") === titleKey("AB")) {
    throw new Error("hyphens must remain in title keys");
  }
  if (titleKey("『夏』") !== titleKey("夏")) {
    throw new Error(
      "paired Japanese title quotes must normalize symmetrically",
    );
  }

  for (const projectId of projectRules.keys()) {
    const titlesByKey = new Map();
    for (const song of getWorkingSongs(projectId)) {
      const key = titleKey(song.title?.ja);
      const titles = titlesByKey.get(key) ?? [];
      titles.push(song.title?.ja);
      titlesByKey.set(key, titles);
    }
    const collisions = [...titlesByKey.values()].filter(
      (titles) => titles.length > 1,
    );
    if (collisions.length > 0) {
      throw new Error(
        `${projectId} contains normalized title collisions: ${JSON.stringify(collisions)}`,
      );
    }
  }

  const rules = projectRules.get("equal-love");
  const pendingBefore = {
    id: "past-announcement",
    releaseDate: "2000-01-01",
    sourceStatus: "announced",
    sourceNote: "official announcement",
    tags: ["announced", "single"],
  };
  const pendingAfter = {
    ...pendingBefore,
    sourceStatus: "credits_pending",
    sourceNote: "credits pending",
    tags: ["credits_pending", "single"],
  };
  if (
    !isAllowedAnnouncementUpdate(
      "equal-love",
      rules,
      pendingBefore,
      pendingAfter,
    )
  ) {
    throw new Error("release-day pending transition must remain allowed");
  }

  const localizedCredit = { ja: "credit", romaji: "Credit" };
  const creditedBefore = {
    ...pendingBefore,
    credits: {
      lyricist: localizedCredit,
      composer: localizedCredit,
      arranger: localizedCredit,
    },
    creditSourceUrl: "https://www.uta-net.com/song/1/",
  };
  const creditedAfter = {
    ...creditedBefore,
    sourceStatus: "released",
    tags: ["single"],
  };
  delete creditedAfter.sourceNote;
  if (
    !isAllowedAnnouncementUpdate(
      "equal-love",
      rules,
      creditedBefore,
      creditedAfter,
    )
  ) {
    throw new Error(
      "credited announcement must release even if scraping misses it",
    );
  }

  const newlyCreditedAfter = {
    ...pendingBefore,
    artist: { ja: "=LOVE", romaji: "Equal Love" },
    memberIds: ["member"],
    ownershipEvidence: "verified-credits",
    credits: {
      lyricist: localizedCredit,
      composer: localizedCredit,
      arranger: localizedCredit,
    },
    creditSourceUrl: "https://www.uta-net.com/song/2/",
    sourceStatus: "released",
    tags: ["single"],
  };
  delete newlyCreditedAfter.sourceNote;
  if (
    !isAllowedAnnouncementUpdate(
      "equal-love",
      rules,
      pendingBefore,
      newlyCreditedAfter,
      [
        {
          id: "member",
          name: { ja: "メンバー" },
          active: true,
        },
      ],
    )
  ) {
    throw new Error(
      "new announcement credits must require exact participant enrichment",
    );
  }

  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/daily-discography-sync.yml"),
    "utf8",
  );
  const finalBuildIndex = workflow.indexOf("Build MyPickNotEqualMe");
  const restoreIndex = workflow.indexOf(
    "git restore --source=HEAD --worktree -- next-env.d.ts",
  );
  const finalGateIndex = workflow.indexOf(
    "Recheck generated data after all builds",
  );
  if (
    finalBuildIndex < 0 ||
    restoreIndex <= finalBuildIndex ||
    finalGateIndex <= restoreIndex
  ) {
    throw new Error(
      "workflow must restore Next.js's generated declaration after builds and before the final gate",
    );
  }

  console.log("Discography safety-gate self-tests passed.");
}
