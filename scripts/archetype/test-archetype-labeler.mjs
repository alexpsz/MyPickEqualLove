import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MODEL_ID,
  RUBRIC_VERSION,
  TEXT_ONLY_QA_FLAGS,
  YOUTUBE_PREVIEW_DAILY_SECONDS,
  buildInteractionBody,
  createEnvelope,
  loadContracts,
  renderPrompt,
  sha256,
  validateAssessment,
  validateSourceMap,
} from "./archetype-contract.mjs";
import {
  buildPlan,
  callInteraction,
  runLive,
  selectSongs,
} from "./label-archetypes.mjs";

function song(index, overrides = {}) {
  return {
    songId: `song-${index}`,
    title: `Song ${index}`,
    sourceMode: "official-mv",
    sourceUrl: `https://www.youtube.com/watch?v=video_${index}`,
    videoId: `video_${index}`,
    videoTitle: `Official video ${index}`,
    channelId: "UCofficial123",
    channelTitle: "Official Channel",
    durationSeconds: 240,
    clipScope: "single-song",
    sourceAuthority: "official",
    sourceNotes: "",
    qaFlags: [],
    ...overrides,
  };
}

function sourceMap(count = 8) {
  return {
    schemaVersion: 1,
    projectId: "equal-love",
    experienceId: "standard-top10",
    songs: Array.from({ length: count }, (_, index) => song(index + 1)),
  };
}

function assessment(overrides = {}) {
  return {
    scores: {
      drive: 2,
      care: 0,
      rhythm: 2,
      growth: 0,
      drama: 0,
      ingenuity: 0,
      uplift: 1,
      cuteness: 0,
    },
    dominant: ["drive", "rhythm"],
    accent: "uplift",
    confidence: "high",
    evidence: [
      {
        timestamp: "00:12",
        basis: "video",
        observation: "A strong downbeat starts the first dance phrase.",
        supports: ["drive", "rhythm"],
      },
      {
        timestamp: "01:05",
        basis: "video",
        observation: "The chorus opens into a bright group refrain.",
        supports: ["uplift"],
      },
    ],
    ...overrides,
  };
}

test("source map is locked to =LOVE standard Top10", () => {
  assert.equal(validateSourceMap(sourceMap()).songs.length, 8);
  assert.throws(
    () => validateSourceMap({ ...sourceMap(), projectId: "not-equal-me" }),
    /projectId must be equal-love/,
  );
  assert.throws(
    () => validateSourceMap({ ...sourceMap(), experienceId: "live" }),
    /experienceId must be standard-top10/,
  );
  const timestamped = sourceMap(1);
  timestamped.songs[0].sourceUrl =
    "https://www.youtube.com/watch?v=video_1&t=20";
  assert.throws(
    () => validateSourceMap(timestamped),
    /canonical HTTPS YouTube/,
  );
  const mismatchedIdentity = sourceMap(1);
  mismatchedIdentity.songs[0].videoId = "different_video";
  assert.throws(
    () => validateSourceMap(mismatchedIdentity),
    /videoId must match sourceUrl/,
  );
  const duplicatedIdentity = sourceMap(2);
  duplicatedIdentity.songs[1].sourceUrl =
    "https://youtu.be/video_1?si=provider";
  duplicatedIdentity.songs[1].videoId = "video_1";
  assert.throws(
    () => validateSourceMap(duplicatedIdentity),
    /videoId is duplicated/,
  );
});

test("all official source modes use direct video input", async () => {
  const contracts = await loadContracts();
  for (const sourceMode of [
    "official-mv",
    "official-art-track",
    "official-dance",
    "official-live",
  ]) {
    const map = sourceMap(1);
    map.songs[0].sourceMode = sourceMode;
    assert.doesNotThrow(() => validateSourceMap(map));
    const prompt = renderPrompt(contracts.promptTemplate, map.songs[0]);
    const body = buildInteractionBody(
      map.songs[0],
      prompt,
      contracts.outputSchema,
    );
    assert.equal(body.input[0].type, "video");
  }
});

test("official live video must be a single-song clip", () => {
  const invalid = sourceMap(1);
  invalid.songs[0] = song(1, {
    sourceMode: "official-live",
    clipScope: "long-form",
    durationSeconds: 7200,
  });
  assert.throws(() => validateSourceMap(invalid), /clipScope=single-song/);

  const valid = sourceMap(1);
  valid.songs[0] = song(1, { sourceMode: "official-live" });
  assert.doesNotThrow(() => validateSourceMap(valid));
});

test("long video fallback is text-only and carries mandatory QA flags", () => {
  const map = sourceMap(1);
  map.songs[0] = song(1, {
    sourceMode: "text-only",
    clipScope: "long-form",
    durationSeconds: 7200,
    sourceNotes: "Official concert source; no single-song clip is available.",
    qaFlags: [...TEXT_ONLY_QA_FLAGS],
  });
  assert.doesNotThrow(() => validateSourceMap(map));
  map.songs[0].qaFlags = ["human_review_required"];
  assert.throws(() => validateSourceMap(map), /long_video_text_only/);
});

test("YouTube preview duration gate fails closed above eight hours", () => {
  const map = sourceMap(1);
  map.songs[0].durationSeconds = YOUTUBE_PREVIEW_DAILY_SECONDS + 1;
  assert.throws(() => validateSourceMap(map), /single-song limit/);

  const many = sourceMap(40);
  many.songs.forEach((entry) => {
    entry.durationSeconds = 721;
  });
  assert.throws(() => validateSourceMap(many), /8-hour daily gate/);
});

test("smoke mode selects exactly eight songs", () => {
  assert.equal(selectSongs(sourceMap(10), true).length, 8);
  assert.throws(() => selectSongs(sourceMap(7), true), /at least 8 songs/);
});

test("Interactions response_format is the exact single text object", async () => {
  const contracts = await loadContracts();
  const entry = song(1);
  const prompt = renderPrompt(contracts.promptTemplate, entry);
  const body = buildInteractionBody(entry, prompt, contracts.outputSchema);
  assert.equal(body.model, MODEL_ID);
  assert.equal(body.store, false);
  assert.equal(body.input[0].type, "video");
  assert.equal(body.input[1].type, "text");
  assert.equal(Array.isArray(body.response_format), false);
  assert.deepEqual(Object.keys(body.response_format).sort(), [
    "mime_type",
    "schema",
    "type",
  ]);
  assert.equal(body.response_format.type, "text");
  assert.equal(body.response_format.mime_type, "application/json");
  assert.deepEqual(body.response_format.schema.required, [
    "scores",
    "dominant",
    "accent",
    "confidence",
    "evidence",
  ]);
  assert.deepEqual(body.response_format.schema.properties.confidence, {
    enum: ["low", "medium", "high"],
  });
  assert.equal("previous_interaction_id" in body, false);
  assert.equal("background" in body, false);
  assert.equal("requests" in body, false);
});

test("text-only fallback never sends the YouTube URI", async () => {
  const contracts = await loadContracts();
  const entry = song(1, {
    sourceMode: "text-only",
    clipScope: "long-form",
    durationSeconds: 7200,
    sourceNotes: "Official long-form source requires human review.",
    qaFlags: [...TEXT_ONLY_QA_FLAGS],
  });
  const prompt = renderPrompt(contracts.promptTemplate, entry);
  const body = buildInteractionBody(entry, prompt, contracts.outputSchema);
  assert.equal(body.input.length, 1);
  assert.equal(body.input[0].type, "text");
  assert.equal(JSON.stringify(body.input).includes(entry.sourceUrl), true);
  assert.equal(
    body.input.some((item) => item.type === "video"),
    false,
  );
});

test("assessment requires two dominants, one different accent, and bounded evidence", () => {
  assert.doesNotThrow(() => validateAssessment(assessment(), song(1)));
  const invalid = assessment({ accent: "drive" });
  assert.throws(
    () => validateAssessment(invalid, song(1)),
    /score-1 dimension/,
  );
  const late = assessment();
  late.evidence[0].timestamp = "09:59";
  assert.throws(
    () => validateAssessment(late, song(1)),
    /exceeds source duration/,
  );
  assert.throws(
    () => validateAssessment(assessment({ confidence: "approved" }), song(1)),
    /confidence must be low, medium, or high/,
  );
  assert.throws(
    () => validateAssessment({ ...assessment(), status: "approved" }, song(1)),
    /assessment keys must be exactly/,
  );
});

test("dry-run plan reports calls, YouTube seconds, remaining gate, and estimates", async () => {
  const contracts = await loadContracts();
  const map = validateSourceMap(sourceMap());
  const plan = await buildPlan(map, map.songs, contracts);
  assert.equal(plan.expectedRequestCount, 8);
  assert.equal(plan.sourceMapSongCount, 8);
  assert.equal(plan.youtubePreviewSeconds, 8 * 240);
  assert.equal(plan.youtubePreviewRemainingSeconds, 8 * 60 * 60 - 8 * 240);
  assert.equal(plan.estimatedVideoInputTokensLow, 8 * 240 * 100);
  assert.equal(plan.estimatedVideoInputTokensDefault, 8 * 240 * 300);
  assert.equal(plan.store, false);
  assert.equal(plan.serverBatch, false);
  assert.equal(plan.modelId, "gemini-3.6-flash");
  assert.equal(plan.rubricVersion, RUBRIC_VERSION);

  const largerMap = validateSourceMap(sourceMap(10));
  const smokePlan = await buildPlan(
    largerMap,
    selectSongs(largerMap, true),
    contracts,
  );
  assert.equal(smokePlan.youtubePreviewSeconds, 10 * 240);
  assert.equal(smokePlan.selectedYoutubePreviewSeconds, 8 * 240);
  assert.equal(smokePlan.expectedRequestCount, 8);
});

test("provider key is sent only as a header and is redacted from errors", async () => {
  const contracts = await loadContracts();
  const secret = "unit-test-secret";
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "authentication", message: `bad ${secret}` },
      }),
    };
  };
  await assert.rejects(
    () =>
      callInteraction(
        song(1),
        "prompt",
        contracts.outputSchema,
        secret,
        fakeFetch,
      ),
    (error) =>
      !error.message.includes(secret) && error.message.includes("[redacted]"),
  );
  assert.equal(captured.init.headers["x-goog-api-key"], secret);
  assert.equal(captured.init.body.includes(secret), false);
});

test("live run requires the exact preflight call confirmation", async () => {
  const contracts = await loadContracts();
  const map = validateSourceMap(sourceMap(1));
  const directory = await mkdtemp(join(tmpdir(), "mypick-archetype-confirm-"));
  const plan = await buildPlan(map, map.songs, contracts, directory);
  await assert.rejects(
    () =>
      runLive({
        selectedSongs: map.songs,
        contracts,
        outputDir: directory,
        plan,
        confirmCalls: 0,
        requestsPerMinute: 60,
        apiKey: "secret",
      }),
    /confirm-calls/,
  );
});

test("missing API key fails before fetch", async () => {
  const contracts = await loadContracts();
  const map = validateSourceMap(sourceMap(1));
  const directory = await mkdtemp(join(tmpdir(), "mypick-archetype-key-"));
  const plan = await buildPlan(map, map.songs, contracts, directory);
  let calls = 0;
  await assert.rejects(
    () =>
      runLive({
        selectedSongs: map.songs,
        contracts,
        outputDir: directory,
        plan,
        confirmCalls: 1,
        requestsPerMinute: 60,
        apiKey: "",
        fetchImpl: async () => {
          calls += 1;
          throw new Error("must not run");
        },
      }),
    /GEMINI_API_KEY is required/,
  );
  assert.equal(calls, 0);
});

test("each successful response is frozen and recovered without another request", async () => {
  const contracts = await loadContracts();
  const map = validateSourceMap(sourceMap(1));
  const directory = await mkdtemp(join(tmpdir(), "mypick-archetype-freeze-"));
  const plan = await buildPlan(map, map.songs, contracts, directory);
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(assessment()) }],
          },
        ],
      }),
    };
  };
  await runLive({
    selectedSongs: map.songs,
    contracts,
    outputDir: directory,
    plan,
    confirmCalls: 1,
    requestsPerMinute: 60,
    apiKey: "secret",
    fetchImpl: fakeFetch,
  });
  assert.equal(calls, 1);
  const resultText = await readFile(
    join(directory, "results", "song-1.json"),
    "utf8",
  );
  const result = JSON.parse(resultText);
  assert.equal(result.modelId, MODEL_ID);
  assert.equal(result.rubricVersion, RUBRIC_VERSION);
  assert.equal(result.status, "draft");
  assert.equal(result.confidence, "high");
  assert.equal(result.videoId, map.songs[0].videoId);
  assert.equal(result.channelId, map.songs[0].channelId);
  assert.equal(
    result.promptHash,
    sha256(renderPrompt(contracts.promptTemplate, map.songs[0])),
  );

  const resumed = await buildPlan(map, map.songs, contracts, directory);
  assert.equal(resumed.expectedRequestCount, 0);
  assert.equal(resumed.frozenSongCount, 1);
  const checkpoint = JSON.parse(
    await readFile(join(directory, "checkpoint.json"), "utf8"),
  );
  assert.equal(checkpoint.frozen["song-1"].resultSha256, sha256(resultText));
});

test("existing frozen result fails closed when metadata drifts", async () => {
  const contracts = await loadContracts();
  const map = validateSourceMap(sourceMap(1));
  const directory = await mkdtemp(join(tmpdir(), "mypick-archetype-drift-"));
  const resultsDir = join(directory, "results");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(resultsDir, { recursive: true }),
  );
  const promptHash = sha256(
    renderPrompt(contracts.promptTemplate, map.songs[0]),
  );
  const envelope = createEnvelope(
    map.songs[0],
    assessment(),
    promptHash,
    new Date().toISOString(),
  );
  envelope.modelId = "different-model";
  await writeFile(
    join(resultsDir, "song-1.json"),
    `${JSON.stringify(envelope)}\n`,
    "utf8",
  );
  await assert.rejects(
    () => buildPlan(map, map.songs, contracts, directory),
    /metadata mismatch/,
  );
});

test("checkpoint fails closed when the source map drifts", async () => {
  const contracts = await loadContracts();
  const map = validateSourceMap(sourceMap(1));
  const directory = await mkdtemp(
    join(tmpdir(), "mypick-archetype-checkpoint-"),
  );
  const originalPlan = await buildPlan(map, map.songs, contracts, directory);
  await writeFile(
    join(directory, "checkpoint.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      sourceMapHash: originalPlan.sourceMapHash,
      modelId: MODEL_ID,
      rubricVersion: RUBRIC_VERSION,
      promptContractHash: contracts.promptContractHash,
      frozen: {},
    })}\n`,
    "utf8",
  );
  const changed = structuredClone(map);
  changed.songs[0].title = "Changed title";
  await assert.rejects(
    () => buildPlan(changed, changed.songs, contracts, directory),
    /checkpoint metadata does not match/,
  );
});
