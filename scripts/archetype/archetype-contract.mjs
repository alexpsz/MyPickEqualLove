import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const MODEL_ID = "gemini-3.6-flash";
export const INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DIMENSIONS = Object.freeze([
  "drive",
  "care",
  "rhythm",
  "growth",
  "drama",
  "ingenuity",
  "uplift",
  "cuteness",
]);
export const YOUTUBE_PREVIEW_DAILY_SECONDS = 8 * 60 * 60;
export const MAX_SINGLE_SONG_SECONDS = 15 * 60;
export const TEXT_ONLY_QA_FLAGS = Object.freeze([
  "long_video_text_only",
  "human_review_required",
]);

const CONTRACT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PROMPT_PATH = fileURLToPath(new URL("./prompt.md", import.meta.url));
const OUTPUT_SCHEMA_PATH = fileURLToPath(
  new URL("./archetype-output.schema.json", import.meta.url),
);

export function fail(message) {
  throw new Error(message);
}

export function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys must be exactly: ${wanted.join(", ")}`);
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isOfficialYoutubeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") {
    return (
      /^\/[A-Za-z0-9_-]{6,}$/.test(url.pathname) &&
      [...url.searchParams.keys()].every((key) => key === "si")
    );
  }
  if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    return false;
  }
  return (
    url.pathname === "/watch" &&
    /^[A-Za-z0-9_-]{6,}$/.test(url.searchParams.get("v") ?? "") &&
    [...url.searchParams.keys()].every((key) => ["v", "si"].includes(key))
  );
}

export function validateSourceMap(sourceMap) {
  assertExactKeys(
    sourceMap,
    ["schemaVersion", "projectId", "experienceId", "songs"],
    "source map",
  );
  if (sourceMap.schemaVersion !== 1) fail("source map schemaVersion must be 1");
  if (sourceMap.projectId !== "equal-love") {
    fail("source map projectId must be equal-love");
  }
  if (sourceMap.experienceId !== "standard-top10") {
    fail("source map experienceId must be standard-top10");
  }
  if (!Array.isArray(sourceMap.songs) || sourceMap.songs.length === 0) {
    fail("source map songs must be a non-empty array");
  }

  const songIds = new Set();
  const sourceUrls = new Set();
  for (const [index, song] of sourceMap.songs.entries()) {
    const label = `songs[${index}]`;
    assertExactKeys(
      song,
      [
        "songId",
        "title",
        "sourceMode",
        "sourceUrl",
        "durationSeconds",
        "clipScope",
        "sourceAuthority",
        "sourceNotes",
        "qaFlags",
      ],
      label,
    );
    if (!/^[a-z0-9][a-z0-9-]*$/.test(song.songId)) {
      fail(`${label}.songId is invalid`);
    }
    if (songIds.has(song.songId)) fail(`${label}.songId is duplicated`);
    songIds.add(song.songId);
    if (typeof song.title !== "string" || !song.title.trim()) {
      fail(`${label}.title must be non-empty`);
    }
    if (
      !["official-mv", "official-live", "text-only"].includes(song.sourceMode)
    ) {
      fail(`${label}.sourceMode is invalid`);
    }
    if (!isOfficialYoutubeUrl(song.sourceUrl)) {
      fail(`${label}.sourceUrl must be a canonical HTTPS YouTube video URL`);
    }
    if (sourceUrls.has(song.sourceUrl))
      fail(`${label}.sourceUrl is duplicated`);
    sourceUrls.add(song.sourceUrl);
    if (!Number.isInteger(song.durationSeconds) || song.durationSeconds <= 0) {
      fail(`${label}.durationSeconds must be a positive integer`);
    }
    if (song.sourceAuthority !== "official") {
      fail(`${label}.sourceAuthority must be official`);
    }
    if (typeof song.sourceNotes !== "string") {
      fail(`${label}.sourceNotes must be a string`);
    }
    if (
      !Array.isArray(song.qaFlags) ||
      new Set(song.qaFlags).size !== song.qaFlags.length
    ) {
      fail(`${label}.qaFlags must be a unique string array`);
    }
    if (song.qaFlags.some((flag) => typeof flag !== "string" || !flag)) {
      fail(`${label}.qaFlags contains an invalid flag`);
    }

    if (song.sourceMode === "text-only") {
      if (song.clipScope !== "long-form") {
        fail(`${label} text-only source must use clipScope=long-form`);
      }
      if (!song.sourceNotes.trim()) {
        fail(`${label} text-only source requires sourceNotes`);
      }
      for (const flag of TEXT_ONLY_QA_FLAGS) {
        if (!song.qaFlags.includes(flag)) {
          fail(`${label} text-only source requires qa flag ${flag}`);
        }
      }
    } else {
      if (song.clipScope !== "single-song") {
        fail(`${label} video input must use clipScope=single-song`);
      }
      if (song.durationSeconds > MAX_SINGLE_SONG_SECONDS) {
        fail(`${label} video input exceeds the 15-minute single-song limit`);
      }
      if (
        song.sourceMode === "official-live" &&
        song.qaFlags.includes("long_video_text_only")
      ) {
        fail(
          `${label} official-live video cannot carry the long-video fallback flag`,
        );
      }
    }
  }

  const youtubePreviewSeconds = sourceMap.songs
    .filter((song) => song.sourceMode !== "text-only")
    .reduce((total, song) => total + song.durationSeconds, 0);
  if (youtubePreviewSeconds > YOUTUBE_PREVIEW_DAILY_SECONDS) {
    fail(
      `YouTube preview input totals ${youtubePreviewSeconds}s, exceeding the 8-hour daily gate`,
    );
  }
  return sourceMap;
}

export async function loadContracts() {
  const [promptTemplate, outputSchemaText] = await Promise.all([
    readFile(PROMPT_PATH, "utf8"),
    readFile(OUTPUT_SCHEMA_PATH, "utf8"),
  ]);
  return {
    contractDir: CONTRACT_DIR,
    promptTemplate: promptTemplate.trim(),
    promptContractHash: sha256(promptTemplate.trim()),
    outputSchema: JSON.parse(outputSchemaText),
  };
}

export function renderPrompt(promptTemplate, song) {
  const source = {
    songId: song.songId,
    title: song.title,
    sourceMode: song.sourceMode,
    sourceUrl: song.sourceUrl,
    durationSeconds: song.durationSeconds,
    sourceNotes: song.sourceNotes,
    qaFlags: song.qaFlags,
  };
  return `${promptTemplate}\n\nSOURCE RECORD\n${JSON.stringify(source, null, 2)}`;
}

export function buildInteractionBody(song, prompt, outputSchema) {
  const assessmentSchema = outputSchema.properties;
  const responseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["scores", "dominant", "accent", "evidence"],
    properties: {
      scores: assessmentSchema.scores,
      dominant: assessmentSchema.dominant,
      accent: assessmentSchema.accent,
      evidence: assessmentSchema.evidence,
    },
    $defs: outputSchema.$defs,
  };
  const input = [];
  if (song.sourceMode !== "text-only") {
    input.push({ type: "video", uri: song.sourceUrl });
  }
  input.push({ type: "text", text: prompt });
  return {
    model: MODEL_ID,
    input,
    store: false,
    response_format: [
      {
        type: "text",
        mime_type: "application/json",
        schema: responseSchema,
      },
    ],
  };
}

function parseTimestamp(timestamp, label) {
  if (!/^[0-9]{2}:[0-5][0-9]$/.test(timestamp)) {
    fail(`${label}.timestamp must use MM:SS`);
  }
  const [minutes, seconds] = timestamp.split(":").map(Number);
  return minutes * 60 + seconds;
}

export function validateAssessment(assessment, song) {
  assertExactKeys(
    assessment,
    ["scores", "dominant", "accent", "evidence"],
    "assessment",
  );
  assertExactKeys(assessment.scores, DIMENSIONS, "assessment.scores");
  for (const dimension of DIMENSIONS) {
    if (![0, 1, 2].includes(assessment.scores[dimension])) {
      fail(`assessment.scores.${dimension} must be 0, 1, or 2`);
    }
  }
  const scoreTwos = DIMENSIONS.filter(
    (dimension) => assessment.scores[dimension] === 2,
  );
  const scoreOnes = DIMENSIONS.filter(
    (dimension) => assessment.scores[dimension] === 1,
  );
  if (scoreTwos.length !== 2 || scoreOnes.length !== 1) {
    fail(
      "assessment must contain exactly two score-2 dimensions and one score-1 dimension",
    );
  }
  if (
    !Array.isArray(assessment.dominant) ||
    assessment.dominant.length !== 2 ||
    new Set(assessment.dominant).size !== 2 ||
    assessment.dominant.some((dimension) => !DIMENSIONS.includes(dimension))
  ) {
    fail("assessment.dominant must contain two distinct dimensions");
  }
  if ([...assessment.dominant].sort().join() !== [...scoreTwos].sort().join()) {
    fail("assessment.dominant must match the score-2 dimensions");
  }
  if (
    !DIMENSIONS.includes(assessment.accent) ||
    assessment.scores[assessment.accent] !== 1
  ) {
    fail("assessment.accent must match the score-1 dimension");
  }
  if (assessment.dominant.includes(assessment.accent)) {
    fail("assessment.accent must differ from dominant dimensions");
  }
  if (
    !Array.isArray(assessment.evidence) ||
    assessment.evidence.length < 1 ||
    assessment.evidence.length > 8
  ) {
    fail("assessment.evidence must contain 1-8 entries");
  }
  const selected = new Set([...assessment.dominant, assessment.accent]);
  const supported = new Set();
  for (const [index, evidence] of assessment.evidence.entries()) {
    const label = `assessment.evidence[${index}]`;
    assertExactKeys(
      evidence,
      ["timestamp", "basis", "observation", "supports"],
      label,
    );
    if (
      typeof evidence.observation !== "string" ||
      !evidence.observation.trim() ||
      evidence.observation.length > 300
    ) {
      fail(`${label}.observation must contain 1-300 characters`);
    }
    if (
      !Array.isArray(evidence.supports) ||
      evidence.supports.length === 0 ||
      new Set(evidence.supports).size !== evidence.supports.length ||
      evidence.supports.some((dimension) => !selected.has(dimension))
    ) {
      fail(`${label}.supports must reference selected dimensions only`);
    }
    evidence.supports.forEach((dimension) => supported.add(dimension));
    if (song.sourceMode === "text-only") {
      if (evidence.timestamp !== null || evidence.basis !== "source-note") {
        fail(
          `${label} text-only evidence must use null timestamp and source-note basis`,
        );
      }
    } else {
      if (
        typeof evidence.timestamp !== "string" ||
        evidence.basis !== "video"
      ) {
        fail(`${label} video evidence must use a timestamp and video basis`);
      }
      if (parseTimestamp(evidence.timestamp, label) > song.durationSeconds) {
        fail(`${label}.timestamp exceeds source duration`);
      }
    }
  }
  for (const dimension of selected) {
    if (!supported.has(dimension))
      fail(`assessment evidence does not support ${dimension}`);
  }
  return assessment;
}

export function createEnvelope(song, assessment, promptHash, annotatedAt) {
  validateAssessment(assessment, song);
  return {
    schemaVersion: 1,
    songId: song.songId,
    title: song.title,
    sourceMode: song.sourceMode,
    sourceUrl: song.sourceUrl,
    modelId: MODEL_ID,
    promptHash,
    annotatedAt,
    scores: assessment.scores,
    dominant: assessment.dominant,
    accent: assessment.accent,
    evidence: assessment.evidence,
    qaFlags: [...song.qaFlags],
  };
}

export function validateEnvelope(envelope, song, promptHash) {
  assertExactKeys(
    envelope,
    [
      "schemaVersion",
      "songId",
      "title",
      "sourceMode",
      "sourceUrl",
      "modelId",
      "promptHash",
      "annotatedAt",
      "scores",
      "dominant",
      "accent",
      "evidence",
      "qaFlags",
    ],
    "annotation",
  );
  if (
    envelope.schemaVersion !== 1 ||
    envelope.songId !== song.songId ||
    envelope.title !== song.title ||
    envelope.sourceMode !== song.sourceMode ||
    envelope.sourceUrl !== song.sourceUrl ||
    envelope.modelId !== MODEL_ID ||
    envelope.promptHash !== promptHash
  ) {
    fail(`annotation metadata mismatch for ${song.songId}`);
  }
  if (Number.isNaN(Date.parse(envelope.annotatedAt))) {
    fail(`annotation annotatedAt is invalid for ${song.songId}`);
  }
  if (canonicalJson(envelope.qaFlags) !== canonicalJson(song.qaFlags)) {
    fail(`annotation qaFlags mismatch for ${song.songId}`);
  }
  validateAssessment(
    {
      scores: envelope.scores,
      dominant: envelope.dominant,
      accent: envelope.accent,
      evidence: envelope.evidence,
    },
    song,
  );
  return envelope;
}
