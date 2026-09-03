#!/usr/bin/env node

import { parseArgs } from "node:util";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_THINKING_LEVEL,
  MODEL_ID,
  RUBRIC_VERSION,
  canonicalJson,
  loadContracts,
  renderPrompt,
  sha256,
  validateEnvelope,
  validateSourceMap,
} from "./archetype-contract.mjs";
import { buildPlan } from "./label-archetypes.mjs";

const CAMPAIGN_ID = "equal-love-archetype-21";
const EXPECTED_SONG_COUNT = 87;

function usage() {
  return `Usage:
  node scripts/archetype/consolidate-archetypes.mjs --source-map <file> --input-dir <run-dir> --output <file> --write --confirm-count 87
  node scripts/archetype/consolidate-archetypes.mjs --source-map <file> --input-dir <run-dir> --output <file> --check`;
}

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      "source-map": { type: "string" },
      "input-dir": { type: "string" },
      output: { type: "string" },
      write: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      "confirm-count": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) return { help: true };
  if (!values["source-map"] || !values["input-dir"] || !values.output) {
    throw new Error("--source-map, --input-dir, and --output are required");
  }
  if (values.write === values.check) {
    throw new Error("choose exactly one of --write or --check");
  }
  const confirmCount =
    values["confirm-count"] === undefined
      ? null
      : Number(values["confirm-count"]);
  if (
    confirmCount !== null &&
    (!Number.isInteger(confirmCount) || confirmCount < 0)
  ) {
    throw new Error("--confirm-count must be a non-negative integer");
  }
  if (values.write && confirmCount !== EXPECTED_SONG_COUNT) {
    throw new Error(
      `--confirm-count must equal ${EXPECTED_SONG_COUNT} in --write mode`,
    );
  }
  return {
    help: false,
    sourceMapPath: resolve(values["source-map"]),
    inputDir: resolve(values["input-dir"]),
    outputPath: resolve(values.output),
    write: values.write,
    check: values.check,
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

async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, path);
}

export async function buildApprovedDocument({ sourceMapPath, inputDir }) {
  const sourceMap = validateSourceMap(
    await readJson(sourceMapPath, "source map"),
  );
  if (
    sourceMap.projectId !== "equal-love" ||
    sourceMap.experienceId !== "standard-top10" ||
    sourceMap.songs.length !== EXPECTED_SONG_COUNT
  ) {
    throw new Error("approved export requires the 87-song =LOVE standard map");
  }

  const repositorySongs = await readJson(
    new URL("../../src/projects/equal-love/songs.json", import.meta.url),
    "=LOVE song catalog",
  );
  if (!Array.isArray(repositorySongs)) {
    throw new Error("=LOVE song catalog must be an array");
  }
  const repositorySongIds = repositorySongs.map((song) => song?.id);
  const sourceMapSongIds = sourceMap.songs.map((song) => song.songId);
  if (
    repositorySongIds.length !== EXPECTED_SONG_COUNT ||
    canonicalJson(repositorySongIds) !== canonicalJson(sourceMapSongIds)
  ) {
    throw new Error("source map song IDs must exactly match the =LOVE catalog");
  }

  const resultDir = join(inputDir, "results");
  const resultFiles = (await readdir(resultDir))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const expectedFiles = sourceMap.songs
    .map((song) => `${song.songId}.json`)
    .sort();
  if (canonicalJson(resultFiles) !== canonicalJson(expectedFiles)) {
    throw new Error(
      "result directory must contain exactly the 87 source-map rows",
    );
  }

  const contracts = await loadContracts();
  const plan = await buildPlan(
    sourceMap,
    sourceMap.songs,
    contracts,
    inputDir,
    {
      thinkingLevel: DEFAULT_THINKING_LEVEL,
      selectionMode: "all",
      selectedSongId: null,
    },
  );
  if (
    plan.frozenSongCount !== EXPECTED_SONG_COUNT ||
    plan.expectedRequestCount !== 0
  ) {
    throw new Error("approved export requires a fully frozen 87-song run");
  }
  const checkpoint = await readJson(
    join(inputDir, "checkpoint.json"),
    "checkpoint",
  );
  if (canonicalJson(checkpoint.frozen) !== canonicalJson(plan.frozen)) {
    throw new Error("checkpoint must receipt every frozen result exactly");
  }
  const songAffinities = [];
  for (const song of sourceMap.songs) {
    const envelope = await readJson(
      join(resultDir, `${song.songId}.json`),
      `result ${song.songId}`,
    );
    const promptHash = sha256(renderPrompt(contracts.promptTemplate, song));
    validateEnvelope(envelope, song, promptHash, DEFAULT_THINKING_LEVEL);
    if (envelope.modelId !== MODEL_ID) {
      throw new Error(`result ${song.songId} uses an unexpected model`);
    }
    if (envelope.qaFlags.length !== 0) {
      throw new Error(`result ${song.songId} still has QA flags`);
    }
    if (envelope.confidence === "low") {
      throw new Error(`result ${song.songId} has low confidence`);
    }
    songAffinities.push({
      songId: song.songId,
      rubricVersion: RUBRIC_VERSION,
      status: "approved",
      scores: envelope.scores,
      confidence: envelope.confidence,
    });
  }

  return {
    schemaVersion: 1,
    campaignId: CAMPAIGN_ID,
    projectId: "equal-love",
    rubricVersion: RUBRIC_VERSION,
    songAffinities,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const document = await buildApprovedDocument(options);
  const text = `${JSON.stringify(document, null, 2)}\n`;
  const digest = sha256(text);
  if (options.check) {
    let current;
    try {
      current = await readFile(options.outputPath, "utf8");
    } catch (error) {
      throw new Error(
        `approved output cannot be read: ${error.code ?? error.name}`,
      );
    }
    if (current !== text) {
      throw new Error(
        "approved output differs from deterministic consolidation",
      );
    }
    process.stdout.write(
      `verified ${document.songAffinities.length} approved songs (${digest})\n`,
    );
    return 0;
  }
  await writeAtomic(options.outputPath, text);
  process.stdout.write(
    `wrote ${document.songAffinities.length} approved songs (${digest})\n`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  });
}
