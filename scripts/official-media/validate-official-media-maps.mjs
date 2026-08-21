import { readFile } from "node:fs/promises";

const ALLOWED_SOURCE_MODES = new Set([
  "official-mv",
  "official-art-track",
  "official-dance",
  "official-live",
]);
const EXACT_WATCH_URL =
  /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
const MAP_ENTRY_KEYS = [
  "channelId",
  "channelTitle",
  "clipScope",
  "durationSeconds",
  "qaFlags",
  "songId",
  "sourceAuthority",
  "sourceMode",
  "sourceNotes",
  "sourceUrl",
  "title",
  "videoId",
  "videoTitle",
];
const PROJECTS = [
  {
    projectId: "nearly-equal-joy",
    expectedSongCount: 31,
    catalogPath: new URL(
      "../../src/projects/nearly-equal-joy/songs.json",
      import.meta.url,
    ),
    mapPath: new URL("./nearly-equal-joy-source-map.json", import.meta.url),
    reportPath: new URL(
      "./nearly-equal-joy-source-report.json",
      import.meta.url,
    ),
  },
  {
    projectId: "not-equal-me",
    expectedSongCount: 62,
    catalogPath: new URL(
      "../../src/projects/not-equal-me/songs.json",
      import.meta.url,
    ),
    mapPath: new URL("./not-equal-me-source-map.json", import.meta.url),
    reportPath: new URL("./not-equal-me-source-report.json", import.meta.url),
  },
];
const EXISTING_EQUAL_LOVE_MAP = new URL(
  "../archetype/source-map.json",
  import.meta.url,
);

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

function assertExactKeys(value, keys, label) {
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

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function countValues(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function assertCountObject(actual, expected, label) {
  const normalize = (value) =>
    Object.fromEntries(
      Object.entries(value)
        .filter(([, count]) => count !== 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  assert(
    JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected)),
    `${label} must equal ${JSON.stringify(expected)}`,
  );
}

function validateCatalog(catalog, projectId) {
  assert(
    Array.isArray(catalog) && catalog.length > 0,
    `${projectId} catalog must be a non-empty array`,
  );
  const byId = new Map();
  for (const [index, song] of catalog.entries()) {
    assert(
      song && typeof song.id === "string",
      `${projectId} catalog[${index}] must have an id`,
    );
    assert(
      song.title && typeof song.title.ja === "string",
      `${projectId} catalog[${index}] must have title.ja`,
    );
    assert(!byId.has(song.id), `${projectId} catalog duplicates ${song.id}`);
    byId.set(song.id, song);
  }
  return byId;
}

function validateAllowlist(report, projectId) {
  const entries = report.channelAllowlist ?? report.officialChannelAllowlist;
  assert(Array.isArray(entries), `${projectId} channel allowlist is missing`);
  const channels = new Map();
  for (const [index, entry] of entries.entries()) {
    const label = `${projectId} channel allowlist[${index}]`;
    assert(typeof entry.channelId === "string", `${label} channelId missing`);
    assert(
      typeof entry.channelTitle === "string" && entry.channelTitle.length > 0,
      `${label} channelTitle missing`,
    );
    assert(!channels.has(entry.channelId), `${label} duplicates channelId`);
    if (entry.sourceAuthority !== undefined) {
      assert(entry.sourceAuthority === "official", `${label} is not official`);
      assert(
        typeof entry.evidenceUrl === "string" &&
          entry.evidenceUrl.includes(`/channel/${entry.channelId}`),
        `${label} evidenceUrl must identify the channel`,
      );
      assert(
        typeof entry.evidenceNotes === "string" &&
          entry.evidenceNotes.length > 0,
        `${label} evidenceNotes missing`,
      );
    } else {
      assert(
        typeof entry.scope === "string" && entry.scope.length > 0,
        `${label} scope missing`,
      );
    }
    channels.set(entry.channelId, entry.channelTitle);
  }
  return channels;
}

function validateMap(map, catalogById, channels, projectId) {
  assertExactKeys(
    map,
    ["experienceId", "projectId", "schemaVersion", "songs"],
    `${projectId} map`,
  );
  assert(map.schemaVersion === 1, `${projectId} map schemaVersion must be 1`);
  assert(map.projectId === projectId, `${projectId} map projectId mismatch`);
  assert(
    map.experienceId === "standard-top10",
    `${projectId} map experienceId must be standard-top10`,
  );
  assert(Array.isArray(map.songs), `${projectId} map songs must be an array`);
  assert(
    map.songs.length <= catalogById.size,
    `${projectId} map cannot exceed catalog size`,
  );

  const bySongId = new Map();
  const videoIds = [];
  const sourceUrls = [];
  for (const [index, entry] of map.songs.entries()) {
    const label = `${projectId} map.songs[${index}]`;
    assertExactKeys(entry, MAP_ENTRY_KEYS, label);
    assert(
      typeof entry.songId === "string" && catalogById.has(entry.songId),
      `${label} songId must exist in catalog`,
    );
    assert(!bySongId.has(entry.songId), `${label} duplicates songId`);
    assert(
      entry.title === catalogById.get(entry.songId).title.ja,
      `${label} title must equal catalog title.ja`,
    );
    assert(ALLOWED_SOURCE_MODES.has(entry.sourceMode), `${label} mode invalid`);
    assert(EXACT_WATCH_URL.test(entry.sourceUrl), `${label} URL invalid`);
    assert(
      entry.sourceUrl === `https://www.youtube.com/watch?v=${entry.videoId}`,
      `${label} URL/videoId mismatch`,
    );
    assert(
      /^[A-Za-z0-9_-]{11}$/.test(entry.videoId),
      `${label} videoId invalid`,
    );
    assert(
      typeof entry.videoTitle === "string" && entry.videoTitle.length > 0,
      `${label} videoTitle missing`,
    );
    assert(channels.has(entry.channelId), `${label} channel not allowlisted`);
    assert(
      entry.channelTitle === channels.get(entry.channelId),
      `${label} channelTitle does not match allowlist`,
    );
    assert(
      Number.isInteger(entry.durationSeconds) && entry.durationSeconds > 0,
      `${label} durationSeconds invalid`,
    );
    assert(entry.clipScope === "single-song", `${label} clipScope invalid`);
    assert(entry.sourceAuthority === "official", `${label} authority invalid`);
    assert(
      typeof entry.sourceNotes === "string" && entry.sourceNotes.length > 0,
      `${label} sourceNotes missing`,
    );
    assert(
      Array.isArray(entry.qaFlags) && entry.qaFlags.length === 0,
      `${label} qaFlags not empty`,
    );
    bySongId.set(entry.songId, entry);
    videoIds.push(entry.videoId);
    sourceUrls.push(entry.sourceUrl);
  }
  return {
    bySongId,
    duplicateSongIds: duplicateValues(map.songs.map((entry) => entry.songId)),
    duplicateVideoIds: duplicateValues(videoIds),
    duplicateSourceUrls: duplicateValues(sourceUrls),
  };
}

function assertMapEntryMatchesAudit(mapEntry, auditEntry, label) {
  for (const key of MAP_ENTRY_KEYS) {
    assert(
      JSON.stringify(mapEntry[key]) === JSON.stringify(auditEntry[key]),
      `${label} ${key} mismatch`,
    );
  }
}

function validateReport(report, map, catalogById, mapResult, projectId) {
  assert(
    report.schemaVersion === 1,
    `${projectId} report schemaVersion invalid`,
  );
  assert(
    report.projectId === projectId,
    `${projectId} report projectId mismatch`,
  );
  assert(
    report.experienceId === "standard-top10",
    `${projectId} report experienceId must be standard-top10`,
  );
  const channels = validateAllowlist(report, projectId);
  assert(
    report.catalog?.songCount === catalogById.size ||
      report.songs?.length === catalogById.size,
    `${projectId} report catalog coverage count mismatch`,
  );

  const audit = report.songAudit ?? report.songs;
  assert(
    Array.isArray(audit) && audit.length === catalogById.size,
    `${projectId} report must cover every song`,
  );
  const auditBySongId = new Map();
  for (const [index, entry] of audit.entries()) {
    const label = `${projectId} report audit[${index}]`;
    assert(
      typeof entry.songId === "string" && catalogById.has(entry.songId),
      `${label} songId invalid`,
    );
    assert(!auditBySongId.has(entry.songId), `${label} duplicates songId`);
    assert(
      entry.title === catalogById.get(entry.songId).title.ja,
      `${label} title mismatch`,
    );
    assert(
      entry.status === "VERIFIED" || entry.status === "UNRESOLVED",
      `${label} status invalid`,
    );
    if (entry.status === "VERIFIED") {
      assert(
        mapResult.bySongId.has(entry.songId),
        `${label} VERIFIED entry missing from map`,
      );
      const mapEntry = mapResult.bySongId.get(entry.songId);
      if (report.songAudit) {
        assertMapEntryMatchesAudit(mapEntry, entry, label);
      } else {
        assert(
          entry.sourceMode === mapEntry.sourceMode,
          `${label} sourceMode mismatch`,
        );
      }
    } else {
      assert(
        !mapResult.bySongId.has(entry.songId),
        `${label} unresolved entry is in map`,
      );
      assert(
        typeof entry.reason === "string" && entry.reason.length > 0,
        `${label} unresolved reason missing`,
      );
    }
    auditBySongId.set(entry.songId, entry);
  }

  const verified = audit.filter((entry) => entry.status === "VERIFIED");
  const unresolved = audit.filter((entry) => entry.status === "UNRESOLVED");
  assert(
    verified.length === map.songs.length,
    `${projectId} map/report count mismatch`,
  );
  const statusCounts = countValues(audit.map((entry) => entry.status));
  const modeCounts = countValues(verified.map((entry) => entry.sourceMode));
  const reportedStatusCounts = report.statusCounts ?? {
    VERIFIED: report.summary?.verifiedCount,
    UNRESOLVED: report.summary?.unresolvedCount,
  };
  const reportedModeCounts = report.modeCounts ?? report.summary?.sourceModes;
  assertCountObject(
    reportedStatusCounts,
    statusCounts,
    `${projectId} status counts`,
  );
  assertCountObject(reportedModeCounts, modeCounts, `${projectId} mode counts`);

  const duplicateReport = report.duplicateChecks ?? {
    songIds: report.duplicates?.songId,
    videoIds: report.duplicates?.videoId,
    sourceUrls: report.duplicates?.sourceUrl,
  };
  assertCountObject(
    duplicateReport.songIds,
    mapResult.duplicateSongIds,
    `${projectId} duplicate songIds`,
  );
  assertCountObject(
    duplicateReport.videoIds,
    mapResult.duplicateVideoIds,
    `${projectId} duplicate videoIds`,
  );
  assertCountObject(
    duplicateReport.sourceUrls,
    mapResult.duplicateSourceUrls,
    `${projectId} duplicate URLs`,
  );

  if (report.unresolved) {
    assert(
      Array.isArray(report.unresolved),
      `${projectId} unresolved must be an array`,
    );
    assert(
      report.unresolved.length === unresolved.length,
      `${projectId} unresolved count mismatch`,
    );
    for (const item of report.unresolved) {
      const auditItem = auditBySongId.get(item.songId);
      assert(
        auditItem?.status === "UNRESOLVED",
        `${projectId} unresolved item status mismatch`,
      );
      assert(
        item.title === auditItem.title && item.reason === auditItem.reason,
        `${projectId} unresolved item mismatch`,
      );
    }
  }

  const approvals = report.sharedVideoApprovals ?? [];
  for (const [index, approval] of approvals.entries()) {
    const label = `${projectId} sharedVideoApprovals[${index}]`;
    assertExactKeys(
      approval,
      ["projectIds", "reason", "sourceUrl", "videoId"],
      label,
    );
    assert(
      /^[A-Za-z0-9_-]{11}$/.test(approval.videoId),
      `${label} videoId invalid`,
    );
    assert(
      approval.sourceUrl ===
        `https://www.youtube.com/watch?v=${approval.videoId}`,
      `${label} URL mismatch`,
    );
    assert(
      Array.isArray(approval.projectIds) && approval.projectIds.length >= 2,
      `${label} projects missing`,
    );
    assert(
      typeof approval.reason === "string" && approval.reason.length > 0,
      `${label} reason missing`,
    );
  }
  return {
    channels,
    approvals,
    statusCounts,
    modeCounts,
    unresolved,
  };
}

function validateCrossProjectDuplicates(projects, equalLoveMap) {
  const entries = [
    ...equalLoveMap.songs.map((entry) => ({ projectId: "equal-love", entry })),
    ...projects.flatMap((project) =>
      project.map.songs.map((entry) => ({
        projectId: project.projectId,
        entry,
      })),
    ),
  ];
  const byVideoId = new Map();
  const bySourceUrl = new Map();
  for (const item of entries) {
    byVideoId.set(item.entry.videoId, [
      ...(byVideoId.get(item.entry.videoId) ?? []),
      item,
    ]);
    bySourceUrl.set(item.entry.sourceUrl, [
      ...(bySourceUrl.get(item.entry.sourceUrl) ?? []),
      item,
    ]);
  }
  const duplicateGroups = [...byVideoId.entries()].filter(
    ([, items]) => items.length > 1,
  );
  const duplicateUrlGroups = [...bySourceUrl.entries()].filter(
    ([, items]) => items.length > 1,
  );
  const approvals = projects.flatMap(
    (project) => project.reportResult.approvals,
  );
  for (const [videoId, items] of duplicateGroups) {
    const projectIds = [...new Set(items.map((item) => item.projectId))];
    assert(
      approvals.some(
        (approval) =>
          approval.videoId === videoId &&
          projectIds.every((id) => approval.projectIds.includes(id)),
      ),
      `cross-project duplicate videoId ${videoId} requires manual approval`,
    );
  }
  for (const [sourceUrl, items] of duplicateUrlGroups) {
    const projectIds = [...new Set(items.map((item) => item.projectId))];
    assert(
      approvals.some(
        (approval) =>
          approval.sourceUrl === sourceUrl &&
          projectIds.every((id) => approval.projectIds.includes(id)),
      ),
      `cross-project duplicate sourceUrl ${sourceUrl} requires manual approval`,
    );
  }
  return { duplicateGroups, duplicateUrlGroups };
}

async function main() {
  const equalLoveMap = readJson(
    await readFile(EXISTING_EQUAL_LOVE_MAP, "utf8"),
    "equal-love source map",
  );
  assert(Array.isArray(equalLoveMap.songs), "equal-love source map is invalid");
  const projects = [];
  for (const config of PROJECTS) {
    const [catalogText, mapText, reportText] = await Promise.all([
      readFile(config.catalogPath, "utf8"),
      readFile(config.mapPath, "utf8"),
      readFile(config.reportPath, "utf8"),
    ]);
    const catalog = readJson(catalogText, `${config.projectId} catalog`);
    const map = readJson(mapText, `${config.projectId} source map`);
    const report = readJson(reportText, `${config.projectId} source report`);
    const catalogById = validateCatalog(catalog, config.projectId);
    assert(
      catalog.length === config.expectedSongCount,
      `${config.projectId} catalog count must be ${config.expectedSongCount}`,
    );
    const channels = validateAllowlist(report, config.projectId);
    const mapResult = validateMap(map, catalogById, channels, config.projectId);
    const reportResult = validateReport(
      report,
      map,
      catalogById,
      mapResult,
      config.projectId,
    );
    assert(
      map.songs.length === config.expectedSongCount &&
        reportResult.unresolved.length === 0,
      `${config.projectId} must retain ${config.expectedSongCount}/${config.expectedSongCount} verified coverage with zero unresolved songs`,
    );
    projects.push({ ...config, catalog, map, report, mapResult, reportResult });
  }
  const crossProject = validateCrossProjectDuplicates(projects, equalLoveMap);

  for (const project of projects) {
    const verified = project.reportResult.statusCounts.VERIFIED ?? 0;
    const unresolved = project.reportResult.statusCounts.UNRESOLVED ?? 0;
    const modes = Object.entries(project.reportResult.modeCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mode, count]) => `${mode}=${count}`)
      .join(", ");
    const channelIds = [
      ...new Set(project.map.songs.map((song) => song.channelId)),
    ].sort();
    console.log(
      `${project.projectId}: catalog=${project.catalog.length}, verified=${verified}, unresolved=${unresolved}`,
    );
    console.log(`  mode counts: ${modes}`);
    console.log(`  official channel ids: ${channelIds.join(", ")}`);
    for (const song of project.reportResult.unresolved) {
      console.log(
        `  unresolved: ${song.songId} | ${song.title} | ${song.reason}`,
      );
    }
  }
  console.log(
    `cross-project duplicate videoIds: ${crossProject.duplicateGroups.map(([id]) => id).join(", ") || "none"}`,
  );
  console.log(
    `cross-project duplicate sourceUrls: ${crossProject.duplicateUrlGroups.map(([url]) => url).join(", ") || "none"}`,
  );
  console.log("official media maps: PASS");
}

main().catch((error) => {
  console.error(`official media maps: FAIL: ${error.message}`);
  process.exitCode = 1;
});
