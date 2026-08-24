import { lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkProjection } from "./public-event-projection.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..", "..");
const GENERATED_ARTIFACT = path.join(
  REPOSITORY_ROOT,
  "apps",
  "atlas",
  "src",
  "generated",
  "public-atlas-projection.v1.json",
);
const EXPECTED_HOLD_ERROR_KEYS = [
  "COVERAGE_HOLD:equal-love",
  "SEED_HOLD:equal-love",
  "SEED_WITHDRAWAL:equal-love",
  "SEED_HOLD:nearly-equal-joy",
  "SEED_WITHDRAWAL:nearly-equal-joy",
  "SEED_HOLD:not-equal-me",
  "SEED_WITHDRAWAL:not-equal-me",
];

function errorKey(error) {
  const firstSeparator = error.indexOf(":");
  const secondSeparator = error.indexOf(":", firstSeparator + 1);
  return secondSeparator === -1 ? error : error.slice(0, secondSeparator);
}

async function assertArtifactAbsent() {
  try {
    await lstat(GENERATED_ARTIFACT);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  throw new Error(
    "The public Atlas projection artifact must remain absent while publication is HOLD.",
  );
}

const result = await checkProjection();
if (result.ok || result.status !== "HOLD") {
  throw new Error(
    `Expected the current public Event projection to be HOLD, received ${JSON.stringify(result)}.`,
  );
}

const actualErrorKeys = result.errors.map(errorKey);
if (
  actualErrorKeys.length !== EXPECTED_HOLD_ERROR_KEYS.length ||
  actualErrorKeys.some(
    (error, index) => error !== EXPECTED_HOLD_ERROR_KEYS[index],
  )
) {
  throw new Error(
    `Public Event projection did not match the reviewed HOLD boundary. Expected ${JSON.stringify(EXPECTED_HOLD_ERROR_KEYS)}, received ${JSON.stringify(actualErrorKeys)}.`,
  );
}

if (!/^sha256:[0-9a-f]{64}$/.test(result.sourceRevision ?? "")) {
  throw new Error("The HOLD audit did not return a canonical source revision.");
}

await assertArtifactAbsent();
console.log(
  "Atlas public Event projection is the reviewed three-seed HOLD; no artifact is present.",
);
