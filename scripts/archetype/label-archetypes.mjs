#!/usr/bin/env node

import { parseArgs } from "node:util";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  INTERACTIONS_ENDPOINT,
  MODEL_ID,
  YOUTUBE_PREVIEW_DAILY_SECONDS,
  buildInteractionBody,
  canonicalJson,
  createEnvelope,
  loadContracts,
  renderPrompt,
  sha256,
  validateEnvelope,
  validateSourceMap,
} from "./archetype-contract.mjs";

function usage() {
  return `Usage:
  node scripts/archetype/label-archetypes.mjs --source-map <file> --dry-run [--smoke]
  node scripts/archetype/label-archetypes.mjs --source-map <file> --output-dir <dir> --live --confirm-calls <n> [--smoke] [--requests-per-minute <n>]

Modes are explicit. --smoke always selects exactly the first 8 validated songs.`;
}

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      "source-map": { type: "string" },
      "output-dir": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      live: { type: "boolean", default: false },
      smoke: { type: "boolean", default: false },
      "confirm-calls": { type: "string" },
      "requests-per-minute": { type: "string", default: "10" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) return { help: true };
  if (!values["source-map"]) throw new Error("--source-map is required");
  if (values["dry-run"] === values.live) {
    throw new Error("choose exactly one of --dry-run or --live");
  }
  if (values.live && !values["output-dir"]) {
    throw new Error("--output-dir is required for --live");
  }
  const requestsPerMinute = Number(values["requests-per-minute"]);
  if (
    !Number.isInteger(requestsPerMinute) ||
    requestsPerMinute < 1 ||
    requestsPerMinute > 60
  ) {
    throw new Error("--requests-per-minute must be an integer from 1 to 60");
  }
  const confirmCalls =
    values["confirm-calls"] === undefined
      ? null
      : Number(values["confirm-calls"]);
  if (
    confirmCalls !== null &&
    (!Number.isInteger(confirmCalls) || confirmCalls < 0)
  ) {
    throw new Error("--confirm-calls must be a non-negative integer");
  }
  return {
    help: false,
    sourceMapPath: resolve(values["source-map"]),
    outputDir: values["output-dir"] ? resolve(values["output-dir"]) : null,
    dryRun: values["dry-run"],
    live: values.live,
    smoke: values.smoke,
    confirmCalls,
    requestsPerMinute,
  };
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${label} cannot be read: ${error.code ?? error.name}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

export function selectSongs(sourceMap, smoke) {
  if (!smoke) return sourceMap.songs;
  if (sourceMap.songs.length < 8) {
    throw new Error(
      "--smoke requires at least 8 songs in the validated source map",
    );
  }
  return sourceMap.songs.slice(0, 8);
}

function promptForSong(contracts, song) {
  const prompt = renderPrompt(contracts.promptTemplate, song);
  return { prompt, promptHash: sha256(prompt) };
}

function resultPath(outputDir, songId) {
  return join(outputDir, "results", `${songId}.json`);
}

async function existingFrozenSongs(
  outputDir,
  songs,
  contracts,
  expectedMetadata,
) {
  if (!outputDir) return new Map();
  const checkpointPath = join(outputDir, "checkpoint.json");
  let checkpoint = null;
  try {
    checkpoint = await readJson(checkpointPath, "checkpoint");
  } catch (error) {
    if (!error.message.includes("ENOENT")) throw error;
  }
  if (checkpoint) {
    const checkpointKeys = Object.keys(checkpoint).sort();
    const expectedKeys = [
      "schemaVersion",
      "sourceMapHash",
      "modelId",
      "promptContractHash",
      "frozen",
    ].sort();
    if (JSON.stringify(checkpointKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error("checkpoint keys do not match schema v1");
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.sourceMapHash !== expectedMetadata.sourceMapHash ||
      checkpoint.modelId !== MODEL_ID ||
      checkpoint.promptContractHash !== contracts.promptContractHash ||
      !checkpoint.frozen ||
      typeof checkpoint.frozen !== "object" ||
      Array.isArray(checkpoint.frozen)
    ) {
      throw new Error("checkpoint metadata does not match this run");
    }
  }
  const resultsDir = join(outputDir, "results");
  let names = [];
  try {
    names = await readdir(resultsDir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const songById = new Map(songs.map((song) => [song.songId, song]));
  const frozen = new Map();
  for (const name of names) {
    if (!name.endsWith(".json")) {
      throw new Error(`unexpected file in results directory: ${name}`);
    }
    const songId = name.slice(0, -5);
    const song = songById.get(songId);
    if (!song)
      throw new Error(`result has no selected source-map song: ${name}`);
    const { promptHash } = promptForSong(contracts, song);
    const path = join(resultsDir, name);
    const text = await readFile(path, "utf8");
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new Error(`existing result is invalid JSON: ${name}`);
    }
    validateEnvelope(envelope, song, promptHash);
    frozen.set(songId, {
      resultPath: `results/${name}`,
      resultSha256: sha256(text),
      promptHash,
    });
  }
  if (checkpoint) {
    for (const [songId, receipt] of Object.entries(checkpoint.frozen)) {
      const recovered = frozen.get(songId);
      if (!recovered || canonicalJson(receipt) !== canonicalJson(recovered)) {
        throw new Error(`checkpoint receipt mismatch for ${songId}`);
      }
    }
  }
  return frozen;
}

export async function buildPlan(
  sourceMap,
  selectedSongs,
  contracts,
  outputDir = null,
) {
  const sourceMapHash = sha256(canonicalJson(sourceMap));
  const frozen = await existingFrozenSongs(
    outputDir,
    selectedSongs,
    contracts,
    {
      sourceMapHash,
    },
  );
  const pendingSongs = selectedSongs.filter((song) => !frozen.has(song.songId));
  const referencedYoutubeSeconds = sourceMap.songs.reduce(
    (total, song) => total + song.durationSeconds,
    0,
  );
  const youtubePreviewSeconds = sourceMap.songs
    .filter((song) => song.sourceMode !== "text-only")
    .reduce((total, song) => total + song.durationSeconds, 0);
  const selectedReferencedYoutubeSeconds = selectedSongs.reduce(
    (total, song) => total + song.durationSeconds,
    0,
  );
  const selectedYoutubePreviewSeconds = selectedSongs
    .filter((song) => song.sourceMode !== "text-only")
    .reduce((total, song) => total + song.durationSeconds, 0);
  return {
    schemaVersion: 1,
    modelId: MODEL_ID,
    api: "interactions",
    endpoint: INTERACTIONS_ENDPOINT,
    stateful: false,
    store: false,
    background: false,
    serverBatch: false,
    clientQueue: "sequential-rate-limited",
    sourceMapHash,
    promptContractHash: contracts.promptContractHash,
    sourceMapSongCount: sourceMap.songs.length,
    selectedSongCount: selectedSongs.length,
    frozenSongCount: frozen.size,
    expectedRequestCount: pendingSongs.length,
    referencedYoutubeSeconds,
    youtubePreviewSeconds,
    youtubePreviewGateSeconds: YOUTUBE_PREVIEW_DAILY_SECONDS,
    youtubePreviewRemainingSeconds:
      YOUTUBE_PREVIEW_DAILY_SECONDS - youtubePreviewSeconds,
    selectedReferencedYoutubeSeconds,
    selectedYoutubePreviewSeconds,
    estimatedVideoInputTokensLow: selectedYoutubePreviewSeconds * 100,
    estimatedVideoInputTokensDefault: selectedYoutubePreviewSeconds * 300,
    estimatesExclude: [
      "text prompt tokens",
      "output tokens",
      "provider pricing",
    ],
    selectedSongIds: selectedSongs.map((song) => song.songId),
    pendingSongIds: pendingSongs.map((song) => song.songId),
    frozen: Object.fromEntries(frozen),
  };
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const texts = [];
  for (const step of response.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.type === "text" && typeof content.text === "string") {
        texts.push(content.text);
      }
    }
  }
  if (texts.length === 0)
    throw new Error("Interactions response has no model text output");
  return texts.at(-1);
}

function sanitizeProviderMessage(message, apiKey) {
  const raw = typeof message === "string" ? message : "provider request failed";
  return apiKey ? raw.split(apiKey).join("[redacted]") : raw;
}

export async function callInteraction(
  song,
  prompt,
  outputSchema,
  apiKey,
  fetchImpl = fetch,
) {
  const body = buildInteractionBody(song, prompt, outputSchema);
  let response;
  try {
    response = await fetchImpl(INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `Interactions request failed: ${sanitizeProviderMessage(error.message, apiKey)}`,
    );
  }
  if (!response.ok) {
    let providerMessage = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      providerMessage = `${providerMessage} ${payload?.error?.code ?? "request_failed"}: ${payload?.error?.message ?? "no details"}`;
    } catch {
      // Keep the status-only error; never echo raw provider bodies.
    }
    throw new Error(sanitizeProviderMessage(providerMessage, apiKey));
  }
  const payload = await response.json();
  if (payload.status && payload.status !== "completed") {
    throw new Error(`Interactions request did not complete: ${payload.status}`);
  }
  const outputText = extractOutputText(payload);
  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error("Interactions model output is not valid JSON");
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, path);
  return text;
}

async function writeCheckpoint(outputDir, plan, frozen) {
  const checkpoint = {
    schemaVersion: 1,
    sourceMapHash: plan.sourceMapHash,
    modelId: MODEL_ID,
    promptContractHash: plan.promptContractHash,
    frozen: Object.fromEntries(
      [...frozen.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  await writeJsonAtomic(join(outputDir, "checkpoint.json"), checkpoint);
}

export async function runLive({
  selectedSongs,
  contracts,
  outputDir,
  plan,
  confirmCalls,
  requestsPerMinute,
  apiKey,
  fetchImpl = fetch,
  sleep = (milliseconds) =>
    new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
}) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for --live");
  if (confirmCalls !== plan.expectedRequestCount) {
    throw new Error(
      `--confirm-calls must equal the preflight request count (${plan.expectedRequestCount})`,
    );
  }
  await mkdir(join(outputDir, "results"), { recursive: true });
  const frozen = new Map(Object.entries(plan.frozen));
  await writeCheckpoint(outputDir, plan, frozen);
  const pending = selectedSongs.filter((song) => !frozen.has(song.songId));
  const intervalMs = Math.ceil(60_000 / requestsPerMinute);
  for (const [index, song] of pending.entries()) {
    const { prompt, promptHash } = promptForSong(contracts, song);
    const assessment = await callInteraction(
      song,
      prompt,
      contracts.outputSchema,
      apiKey,
      fetchImpl,
    );
    const envelope = createEnvelope(
      song,
      assessment,
      promptHash,
      new Date().toISOString(),
    );
    validateEnvelope(envelope, song, promptHash);
    const path = resultPath(outputDir, song.songId);
    const text = await writeJsonAtomic(path, envelope);
    frozen.set(song.songId, {
      resultPath: `results/${song.songId}.json`,
      resultSha256: sha256(text),
      promptHash,
    });
    await writeCheckpoint(outputDir, plan, frozen);
    process.stdout.write(
      `frozen ${song.songId} (${index + 1}/${pending.length})\n`,
    );
    if (index + 1 < pending.length) await sleep(intervalMs);
  }
  return frozen;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const sourceMap = validateSourceMap(
    await readJson(options.sourceMapPath, "source map"),
  );
  const contracts = await loadContracts();
  const selectedSongs = selectSongs(sourceMap, options.smoke);
  const plan = await buildPlan(
    sourceMap,
    selectedSongs,
    contracts,
    options.outputDir,
  );
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (options.dryRun) return 0;
  await runLive({
    selectedSongs,
    contracts,
    outputDir: options.outputDir,
    plan,
    confirmCalls: options.confirmCalls,
    requestsPerMinute: options.requestsPerMinute,
    apiKey: process.env.GEMINI_API_KEY,
  });
  return 0;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  });
}
