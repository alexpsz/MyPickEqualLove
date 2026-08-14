import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const provenanceOverridePayload = JSON.parse(
  fs.readFileSync(
    path.join(root, "scripts/release-provenance-overrides.json"),
    "utf8",
  ),
);
if (provenanceOverridePayload.schemaVersion !== 1) {
  throw new Error("unsupported release provenance override schema");
}
const commercialReleaseDomains = [
  "equal-love.jp",
  "music.apple.com",
  "nearly-equal-joy.jp",
  "not-equal-me.jp",
];
const commercialCoverDomains = [
  "aop-emtg-jp.s3.amazonaws.com",
  "equal-love.jp",
  "is1-ssl.mzstatic.com",
  "nearly-equal-joy.jp",
  "not-equal-me.jp",
  "s3-aop.plusmember.jp",
];
const provenanceOverrideFields = [
  "releaseId",
  "releaseTitle",
  "releaseType",
  "releaseDate",
  "trackNo",
  "trackType",
  "coverUrl",
  "coverSourceUrl",
  "officialUrl",
];
const releaseCampaignTransitionFields = ["advanceRelease", "primaryRelease"];
const projectRules = new Map([
  [
    "equal-love",
    {
      groupArtist: "=LOVE",
      officialDomains: ["equal-love.jp"],
      coverDomains: [
        "aop-emtg-jp.s3.amazonaws.com",
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
const unknownMarkers = [
  "タイトル未定",
  "後日発表",
  "未確認",
  "不明",
  "UNKNOWN",
  "TBD",
  "MIKAKUNIN",
  "MI KAKUNIN",
];
const pendingCreditStatuses = new Set(["announced", "credits_pending"]);
const utanetDomains = ["www.uta-net.com"];
const catalogDate = currentJapanDate();
const enforceAllowlist = process.argv.includes("--enforce-allowlist");
const sourceReportDir = argumentValue("--source-report-dir");
const errors = [];
const summaries = [];
const addedCoverPaths = new Set();
const correctedCoverPaths = new Set();
const allowedSongDataPath =
  /^src\/projects\/(equal-love|nearly-equal-joy|not-equal-me)\/songs\.json$/;
const allowedProjectCoverPath =
  /^public\/covers\/(equal-love|nearly-equal-joy|not-equal-me)\/[a-z0-9][a-z0-9-]*\.jpg$/;
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
  validateSourceReport(projectId, beforeSongs, afterSongs);
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

function argumentValue(flag) {
  const flagIndex = process.argv.indexOf(flag);
  if (flagIndex < 0) return null;
  const value = process.argv[flagIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function sourceReportReviewState(prefix, report) {
  const failures = [];
  if (!Array.isArray(report.reviewCandidates)) {
    failures.push(`${prefix}: reviewCandidates must be an array`);
    return { reviewCount: 0, failures };
  }

  const reviewCount = report.reviewCandidates.length;
  const expectedReviewRequired = reviewCount > 0;
  if (report.reviewRequired !== expectedReviewRequired) {
    failures.push(
      `${prefix}: reviewRequired must exactly match reviewCandidates`,
    );
  }
  if (reviewCount > 0) {
    failures.push(
      `${prefix}: ${reviewCount} review candidate(s) block automatic publication`,
    );
  }
  return { reviewCount, failures };
}

function validateSourceReport(projectId, beforeSongs, afterSongs) {
  if (!sourceReportDir) return;
  const reportPath = path.resolve(sourceReportDir, `${projectId}.json`);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    errors.push(`[${projectId}] cannot read source report: ${error.message}`);
    return;
  }

  const prefix = `[${projectId}] source report`;
  const headSha = execGit(["rev-parse", "HEAD"]).trim();
  if (report.schemaVersion !== 1) {
    errors.push(`${prefix}: unsupported schemaVersion ${report.schemaVersion}`);
  }
  if (report.projectId !== projectId) {
    errors.push(`${prefix}: projectId does not match the catalog`);
  }
  if (report.baseSha !== headSha) {
    errors.push(`${prefix}: baseSha does not match HEAD ${headSha}`);
  }

  const beforeById = new Map(beforeSongs.map((song) => [song.id, song]));
  const actualAddedIds = afterSongs
    .filter((song) => !beforeById.has(song.id))
    .map((song) => song.id)
    .sort();
  const actualUpdatedIds = afterSongs
    .filter(
      (song) =>
        beforeById.has(song.id) &&
        !isDeepStrictEqual(beforeById.get(song.id), song),
    )
    .map((song) => song.id)
    .sort();
  const reportedAddedIds = [...(report.publishableAddedIds ?? [])].sort();
  const reportedUpdatedIds = [...(report.allowedUpdatedIds ?? [])].sort();
  if (!isDeepStrictEqual(actualAddedIds, reportedAddedIds)) {
    errors.push(
      `${prefix}: publishableAddedIds do not match the generated diff`,
    );
  }
  if (!isDeepStrictEqual(actualUpdatedIds, reportedUpdatedIds)) {
    errors.push(`${prefix}: allowedUpdatedIds do not match the generated diff`);
  }

  const hasChanges = actualAddedIds.length > 0 || actualUpdatedIds.length > 0;
  const { reviewCount, failures: reviewFailures } = sourceReportReviewState(
    prefix,
    report,
  );
  errors.push(...reviewFailures);
  if (reviewCount > 0) {
    if (report.publishDecision !== "review") {
      errors.push(
        `${prefix}: review candidates require publishDecision review`,
      );
    }
  } else if (hasChanges) {
    if (report.publishDecision !== "publish") {
      errors.push(
        `${prefix}: generated changes require publishDecision publish`,
      );
    }
  } else if (report.publishDecision !== "none") {
    errors.push(`${prefix}: unchanged data require publishDecision none`);
  }
  if (report.sources?.officialDiscography?.status !== "healthy") {
    errors.push(`${prefix}: official discography discovery must be healthy`);
  }
  if (report.publishDecision === "block") {
    errors.push(`${prefix}: source report blocks publication`);
  }

  const creditsStatus = report.sources?.credits?.status ?? "missing";
  const newsStatus = report.sources?.officialNews?.status ?? "missing";
  if (newsStatus !== "healthy") {
    errors.push(`${prefix}: official NEWS discovery must be healthy`);
  }
  summaries.push(
    `[${projectId}] sources credits=${creditsStatus}, news=${newsStatus}, review=${reviewCount}, decision=${report.publishDecision}`,
  );
}

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
      ) &&
      !isAllowedLegacyUnverifiedUpgrade(
        rules,
        beforeSong,
        afterSong,
        members,
      ) &&
      !isAllowedEarlierReleaseProvenanceCorrection(
        projectId,
        beforeSong,
        afterSong,
      ) &&
      !isAllowedReleaseCampaignTransition(projectId, beforeSong, afterSong)
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

function isAllowedEarlierReleaseProvenanceCorrection(
  projectId,
  beforeSong,
  afterSong,
) {
  const expected =
    provenanceOverridePayload.projects?.[projectId]?.[afterSong.title?.ja];
  if (!expected || afterSong.releaseDate >= beforeSong.releaseDate)
    return false;

  const mutableKeys = new Set([
    "releaseId",
    "releaseTitle",
    "releaseType",
    "releaseDate",
    "trackNo",
    "trackType",
    "coverUrl",
    "coverSourceUrl",
    "officialUrl",
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

  for (const field of [
    "releaseId",
    "releaseType",
    "releaseDate",
    "trackNo",
    "trackType",
    "coverUrl",
    "coverSourceUrl",
    "officialUrl",
  ]) {
    if (!isDeepStrictEqual(afterSong[field], expected[field])) return false;
  }
  if (afterSong.releaseTitle?.ja !== expected.releaseTitle) return false;
  if (
    !afterSong.releaseTitle?.romaji ||
    afterSong.coverUrl !== beforeSong.coverUrl
  ) {
    return false;
  }
  if (
    !hasAllowedHttpsUrl(afterSong.officialUrl, commercialReleaseDomains) ||
    !hasAllowedHttpsUrl(afterSong.coverSourceUrl, commercialCoverDomains)
  ) {
    return false;
  }

  const oldProvenanceTags = new Set([
    beforeSong.releaseType,
    beforeSong.trackType,
    beforeSong.releaseDate.slice(0, 4),
  ]);
  const expectedTags = [
    ...(beforeSong.tags ?? []).filter((tag) => !oldProvenanceTags.has(tag)),
    expected.releaseType,
    expected.trackType,
    expected.releaseDate.slice(0, 4),
  ].filter((value, index, values) => values.indexOf(value) === index);
  expectedTags.sort();
  if (!isDeepStrictEqual(afterSong.tags, expectedTags)) return false;

  correctedCoverPaths.add(`public${afterSong.coverUrl}`);
  return true;
}

function expectedReleaseCampaignBundle(
  projectId,
  title,
  effectiveDate = catalogDate,
) {
  const transition =
    provenanceOverridePayload.campaignTransitions?.[projectId]?.[title];
  if (!transition) return null;
  return effectiveDate < transition.primaryRelease.releaseDate
    ? transition.advanceRelease
    : transition.primaryRelease;
}

function songMatchesReleaseBundle(song, expected) {
  if (!expected) return false;
  for (const field of [
    "releaseId",
    "releaseType",
    "releaseDate",
    "trackNo",
    "trackType",
    "coverUrl",
    "coverSourceUrl",
    "officialUrl",
  ]) {
    if (!isDeepStrictEqual(song[field], expected[field])) return false;
  }
  return song.releaseTitle?.ja === expected.releaseTitle;
}

function isAllowedReleaseCampaignTransition(
  projectId,
  beforeSong,
  afterSong,
  effectiveDate = catalogDate,
) {
  const expected = expectedReleaseCampaignBundle(
    projectId,
    afterSong.title?.ja,
    effectiveDate,
  );
  if (!expected) return false;

  const mutableKeys = new Set([
    "releaseId",
    "releaseTitle",
    "releaseType",
    "releaseDate",
    "trackNo",
    "trackType",
    "coverUrl",
    "coverSourceUrl",
    "officialUrl",
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

  for (const field of [
    "releaseId",
    "releaseType",
    "releaseDate",
    "trackNo",
    "trackType",
    "coverUrl",
    "coverSourceUrl",
    "officialUrl",
  ]) {
    if (!isDeepStrictEqual(afterSong[field], expected[field])) return false;
  }
  if (
    afterSong.releaseTitle?.ja !== expected.releaseTitle ||
    !afterSong.releaseTitle?.romaji ||
    afterSong.coverUrl !== beforeSong.coverUrl ||
    !hasAllowedHttpsUrl(afterSong.officialUrl, commercialReleaseDomains) ||
    !hasAllowedHttpsUrl(afterSong.coverSourceUrl, commercialCoverDomains)
  ) {
    return false;
  }

  const beforeWasPending = pendingCreditStatuses.has(beforeSong.sourceStatus);
  if (beforeWasPending) {
    if (
      expected.releaseDate > effectiveDate ||
      afterSong.sourceStatus !== "released" ||
      afterSong.sourceNote ||
      !hasCompleteCredits(afterSong)
    ) {
      return false;
    }
  } else if (
    beforeSong.sourceStatus !== afterSong.sourceStatus ||
    beforeSong.sourceNote !== afterSong.sourceNote
  ) {
    return false;
  }

  const oldProvenanceTags = new Set([
    beforeSong.releaseType,
    beforeSong.trackType,
    beforeSong.releaseDate.slice(0, 4),
  ]);
  if (beforeWasPending) {
    for (const pendingStatus of pendingCreditStatuses) {
      oldProvenanceTags.add(pendingStatus);
    }
  }
  const expectedTags = [
    ...(beforeSong.tags ?? []).filter((tag) => !oldProvenanceTags.has(tag)),
    expected.releaseType,
    expected.trackType,
    expected.releaseDate.slice(0, 4),
  ].filter((value, index, values) => values.indexOf(value) === index);
  expectedTags.sort();
  if (!isDeepStrictEqual(afterSong.tags, expectedTags)) return false;

  correctedCoverPaths.add(`public${afterSong.coverUrl}`);
  return true;
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
    "centerMemberIds",
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
    return false;
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

function isAllowedLegacyUnverifiedUpgrade(
  rules,
  beforeSong,
  afterSong,
  members,
) {
  if (beforeSong.sourceStatus !== "unverified") return false;
  if (
    !creditRoles.every((role) => {
      const credit = beforeSong.credits?.[role];
      return (
        credit?.ja &&
        credit?.romaji &&
        hasUnknownMarker(credit.ja) &&
        hasUnknownMarker(credit.romaji)
      );
    })
  ) {
    return false;
  }

  const mutableKeys = new Set([
    "releaseId",
    "releaseTitle",
    "coverSourceUrl",
    "centerMemberIds",
    "credits",
    "creditSourceUrl",
    "officialUrl",
    "sourceStatus",
    "sourceNote",
    "ownershipEvidence",
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

  const isAllowed =
    afterSong.sourceStatus === "released" &&
    !afterSong.sourceNote &&
    afterSong.ownershipEvidence === "verified-credits" &&
    hasCompleteCredits(afterSong) &&
    hasValidParticipantAssignment(afterSong, rules, members) &&
    hasAllowedHttpsUrl(afterSong.officialUrl, rules.officialDomains) &&
    hasAllowedHttpsUrl(afterSong.coverSourceUrl, rules.coverDomains) &&
    hasAllowedHttpsUrl(afterSong.creditSourceUrl, utanetDomains);

  if (isAllowed) {
    correctedCoverPaths.add(`public${afterSong.coverUrl}`);
  }
  return isAllowed;
}

function validateAddedSong(projectId, rules, song, members) {
  const prefix = `[${projectId}] ${song.id}`;
  const hasPendingCredits = song.sourceStatus === "announced";
  const curatedReleaseBundle =
    expectedReleaseCampaignBundle(projectId, song.title?.ja) ??
    provenanceOverridePayload.projects?.[projectId]?.[song.title?.ja];
  const hasExactCuratedReleaseBundle = songMatchesReleaseBundle(
    song,
    curatedReleaseBundle,
  );
  const officialDomains = hasExactCuratedReleaseBundle
    ? commercialReleaseDomains
    : rules.officialDomains;
  const coverDomains = hasExactCuratedReleaseBundle
    ? commercialCoverDomains
    : rules.coverDomains;

  if (["credits_pending", "unverified"].includes(song.sourceStatus)) {
    errors.push(
      `${prefix}: incomplete or unverified records belong in the review report, not the public catalog`,
    );
  }

  if (!hasAllowedHttpsUrl(song.officialUrl, officialDomains)) {
    errors.push(`${prefix}: new song has an untrusted officialUrl`);
  }
  if (!hasAllowedHttpsUrl(song.coverSourceUrl, coverDomains)) {
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
    if (song.releaseDate <= catalogDate) {
      errors.push(`${prefix}: released dates cannot remain announced`);
    }
    if (
      song.ownershipEvidence !== "verified-credits" ||
      !hasCompleteCredits(song) ||
      !hasValidParticipantAssignment(song, rules, members)
    ) {
      errors.push(
        `${prefix}: announced songs require complete credits and exact verified participants`,
      );
    }
    if (
      !hasAllowedHttpsUrl(song.creditSourceUrl, [
        ...utanetDomains,
        ...rules.officialDomains,
      ])
    ) {
      errors.push(`${prefix}: announced song needs an allowed credit source`);
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
  for (const relativePath of new Set([
    ...addedCoverPaths,
    ...correctedCoverPaths,
  ])) {
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
    if (!isAllowedTrackedGeneratedChange(status, changedPath)) {
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
      !allowedProjectCoverPath.test(changedPath) ||
      !addedCoverPaths.has(changedPath)
    ) {
      errors.push(`unexpected untracked generated file: ${changedPath}`);
    }
  }
}

function isAllowedTrackedGeneratedChange(status, changedPath) {
  if (status === "M") {
    return (
      allowedSongDataPath.test(changedPath) ||
      correctedCoverPaths.has(changedPath)
    );
  }
  return (
    status === "A" &&
    allowedProjectCoverPath.test(changedPath) &&
    addedCoverPaths.has(changedPath)
  );
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
  return Boolean(
    value?.ja &&
    value?.romaji &&
    !hasUnknownMarker(value.ja) &&
    !hasUnknownMarker(value.romaji),
  );
}

function hasUnknownMarker(value) {
  const normalizedValue = (value ?? "")
    .normalize("NFKC")
    .replace(/[\s._-]+/gu, "")
    .toUpperCase();
  return unknownMarkers.some((marker) =>
    normalizedValue.includes(
      marker
        .normalize("NFKC")
        .replace(/[\s._-]+/gu, "")
        .toUpperCase(),
    ),
  );
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
  const mixedReviewState = sourceReportReviewState("[self-test]", {
    reviewRequired: true,
    reviewCandidates: [{ candidateKey: "needs-review" }],
  });
  if (
    mixedReviewState.reviewCount !== 1 ||
    !mixedReviewState.failures.some((failure) =>
      failure.includes("block automatic publication"),
    )
  ) {
    throw new Error(
      "any review candidate must block an otherwise safe automatic publication",
    );
  }
  const clearReviewState = sourceReportReviewState("[self-test]", {
    reviewRequired: false,
    reviewCandidates: [],
  });
  if (clearReviewState.failures.length !== 0) {
    throw new Error("an empty, internally consistent review state must pass");
  }
  const invalidReviewState = sourceReportReviewState("[self-test]", {
    reviewRequired: false,
    reviewCandidates: null,
  });
  if (
    !invalidReviewState.failures.some((failure) =>
      failure.includes("must be an array"),
    )
  ) {
    throw new Error("malformed reviewCandidates must fail closed");
  }

  for (const [projectId, overrides] of Object.entries(
    provenanceOverridePayload.projects ?? {},
  )) {
    for (const [title, override] of Object.entries(overrides)) {
      if (
        !isDeepStrictEqual(
          Object.keys(override).sort(),
          [...provenanceOverrideFields].sort(),
        )
      ) {
        throw new Error(
          `invalid provenance override fields: ${projectId} ${title}`,
        );
      }
    }
  }
  for (const [projectId, transitions] of Object.entries(
    provenanceOverridePayload.campaignTransitions ?? {},
  )) {
    for (const [title, transition] of Object.entries(transitions)) {
      if (
        !isDeepStrictEqual(
          Object.keys(transition).sort(),
          [...releaseCampaignTransitionFields].sort(),
        ) ||
        releaseCampaignTransitionFields.some(
          (stage) =>
            !isDeepStrictEqual(
              Object.keys(transition[stage] ?? {}).sort(),
              [...provenanceOverrideFields].sort(),
            ),
        ) ||
        transition.advanceRelease.releaseDate >=
          transition.primaryRelease.releaseDate ||
        transition.advanceRelease.coverUrl !==
          transition.primaryRelease.coverUrl
      ) {
        throw new Error(
          `invalid release campaign transition: ${projectId} ${title}`,
        );
      }
    }
  }
  const provenanceBefore = {
    id: "not-equal-me",
    title: { ja: "≠ME", romaji: "Not Equal Me" },
    releaseId: "2021-later-album",
    releaseTitle: { ja: "Later Album", romaji: "Later Album" },
    releaseType: "album",
    releaseDate: "2021-04-07",
    trackNo: 9,
    trackType: "album",
    coverUrl: "/covers/not-equal-me/not-equal-me.jpg",
    coverSourceUrl: "https://s3-aop.plusmember.jp/later.jpeg",
    officialUrl: "https://not-equal-me.jp/discography/detail/4/",
    tags: ["2021", "album", "manual-tag"],
  };
  const expectedProvenance =
    provenanceOverridePayload.projects["not-equal-me"]["≠ME"];
  const provenanceAfter = {
    ...provenanceBefore,
    releaseId: expectedProvenance.releaseId,
    releaseTitle: {
      ja: expectedProvenance.releaseTitle,
      romaji: "Not Equal Me Single",
    },
    releaseType: expectedProvenance.releaseType,
    releaseDate: expectedProvenance.releaseDate,
    trackNo: expectedProvenance.trackNo,
    trackType: expectedProvenance.trackType,
    coverUrl: expectedProvenance.coverUrl,
    coverSourceUrl: expectedProvenance.coverSourceUrl,
    officialUrl: expectedProvenance.officialUrl,
    tags: ["2019", "digital", "manual-tag", "title"],
  };
  if (
    !isAllowedEarlierReleaseProvenanceCorrection(
      "not-equal-me",
      provenanceBefore,
      provenanceAfter,
    )
  ) {
    throw new Error("complete earlier commercial provenance must be allowed");
  }
  if (
    isAllowedEarlierReleaseProvenanceCorrection(
      "not-equal-me",
      provenanceBefore,
      {
        ...provenanceAfter,
        releaseTitle: provenanceBefore.releaseTitle,
      },
    )
  ) {
    throw new Error(
      "mixed early-date/later-release provenance must fail closed",
    );
  }

  const koiTransition =
    provenanceOverridePayload.campaignTransitions["equal-love"][
      "恋、はじめました。"
    ];
  const advanceCampaignSong = {
    ...provenanceBefore,
    title: { ja: "恋、はじめました。", romaji: "Koi, Hajimemashita." },
    ...koiTransition.advanceRelease,
    releaseTitle: {
      ja: koiTransition.advanceRelease.releaseTitle,
      romaji: "Koi, Hajimemashita. Single",
    },
    tags: ["2026", "digital", "manual-tag", "title"],
  };
  const primaryCampaignSong = {
    ...advanceCampaignSong,
    ...koiTransition.primaryRelease,
    releaseTitle: {
      ja: koiTransition.primaryRelease.releaseTitle,
      romaji: "Koi, Hajimemashita. Type A",
    },
    tags: ["2026", "manual-tag", "single", "title"],
  };
  if (
    !isAllowedReleaseCampaignTransition(
      "equal-love",
      advanceCampaignSong,
      primaryCampaignSong,
      "2026-08-26",
    )
  ) {
    throw new Error(
      "an advance release must atomically switch to its primary campaign release",
    );
  }
  if (
    isAllowedReleaseCampaignTransition(
      "equal-love",
      advanceCampaignSong,
      primaryCampaignSong,
      "2026-08-14",
    )
  ) {
    throw new Error(
      "a future primary campaign release must not activate early",
    );
  }
  if (
    isAllowedEarlierReleaseProvenanceCorrection(
      "not-equal-me",
      provenanceAfter,
      provenanceBefore,
    )
  ) {
    throw new Error(
      "later album reissues must never replace the canonical date",
    );
  }

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
    isAllowedAnnouncementUpdate(
      "equal-love",
      rules,
      pendingBefore,
      pendingAfter,
    )
  ) {
    throw new Error("release-day records without credits must fail closed");
  }

  const unknownCredit = { ja: "未確認", romaji: "Mi Kakunin" };
  if (
    hasCompleteCredits({
      credits: {
        lyricist: unknownCredit,
        composer: unknownCredit,
        arranger: unknownCredit,
      },
    })
  ) {
    throw new Error("placeholder credits must never count as complete");
  }

  const legacyBefore = {
    id: "legacy-placeholder",
    title: { ja: "旧曲", romaji: "Kyokyoku" },
    artist: { ja: "=LOVE", romaji: "=LOVE" },
    releaseId: "legacy-release",
    releaseTitle: { ja: "旧作", romaji: "Kyuusaku" },
    releaseType: "single",
    releaseDate: "2000-01-01",
    trackNo: 1,
    trackType: "title",
    coverUrl: "/covers/equal-love/legacy-placeholder.jpg",
    coverSourceUrl: "https://www.uta-net.com/legacy.jpg",
    memberIds: ["member"],
    tags: ["single", "title"],
    credits: {
      lyricist: unknownCredit,
      composer: unknownCredit,
      arranger: unknownCredit,
    },
    officialUrl: "https://equal-love.jp/feature/legacy",
    creditSourceUrl: "https://equal-love.jp/feature/legacy",
    sourceStatus: "unverified",
    sourceNote: "legacy placeholder",
  };
  const legacyAfter = {
    ...legacyBefore,
    releaseId: "verified-release",
    releaseTitle: { ja: "検証済み", romaji: "Kenshouzumi" },
    coverSourceUrl: "https://s3-aop.plusmember.jp/verified.jpg",
    credits: {
      lyricist: { ja: "作詞者", romaji: "Lyricist" },
      composer: { ja: "作曲者", romaji: "Composer" },
      arranger: { ja: "編曲者", romaji: "Arranger" },
    },
    officialUrl: "https://equal-love.jp/discography/detail/1/",
    creditSourceUrl: "https://www.uta-net.com/song/1/",
    sourceStatus: "released",
    ownershipEvidence: "verified-credits",
  };
  delete legacyAfter.sourceNote;
  if (
    !isAllowedLegacyUnverifiedUpgrade(rules, legacyBefore, legacyAfter, [
      { id: "member", name: { ja: "メンバー" }, active: true },
    ])
  ) {
    throw new Error(
      "the exact legacy placeholder migration must remain allowed",
    );
  }

  const legacyCoverPath = `public${legacyAfter.coverUrl}`;
  if (
    !correctedCoverPaths.has(legacyCoverPath) ||
    !isAllowedTrackedGeneratedChange("M", legacyCoverPath)
  ) {
    throw new Error(
      "a verified legacy migration must register its corrected cover",
    );
  }

  const rejectedLegacyCoverPath =
    "public/covers/equal-love/rejected-legacy-cover.jpg";
  const rejectedLegacyBefore = {
    ...legacyBefore,
    id: "rejected-legacy-placeholder",
    coverUrl: rejectedLegacyCoverPath.slice("public".length),
  };
  const rejectedLegacyAfter = {
    ...legacyAfter,
    id: rejectedLegacyBefore.id,
    coverUrl: rejectedLegacyBefore.coverUrl,
    coverSourceUrl: "https://example.com/tampered.jpg",
  };
  if (
    isAllowedLegacyUnverifiedUpgrade(
      rules,
      rejectedLegacyBefore,
      rejectedLegacyAfter,
      [{ id: "member", name: { ja: "メンバー" }, active: true }],
    ) ||
    correctedCoverPaths.has(rejectedLegacyCoverPath)
  ) {
    throw new Error("a rejected legacy migration must not register its cover");
  }

  const stagedAddedCoverPath = "public/covers/equal-love/staged-new-song.jpg";
  addedCoverPaths.add(stagedAddedCoverPath);
  if (
    !isAllowedTrackedGeneratedChange("A", stagedAddedCoverPath) ||
    isAllowedTrackedGeneratedChange("M", stagedAddedCoverPath) ||
    isAllowedTrackedGeneratedChange(
      "A",
      "public/covers/equal-love/unreported-new-song.jpg",
    ) ||
    isAllowedTrackedGeneratedChange("D", stagedAddedCoverPath)
  ) {
    throw new Error(
      "publish staging must accept only reported A covers and controlled M paths",
    );
  }
  addedCoverPaths.delete(stagedAddedCoverPath);

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
