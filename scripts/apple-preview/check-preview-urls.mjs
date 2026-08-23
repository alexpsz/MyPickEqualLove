import { readFile } from "node:fs/promises";

const PROJECTS = ["equal-love", "nearly-equal-joy", "not-equal-me"];
const REQUEST_DELAY_MS = 1_000;
const MAX_ATTEMPTS = 3;
const failures = [];
let previousRequestStartedAt = 0;

for (const projectId of PROJECTS) {
  const entries = JSON.parse(
    await readFile(
      new URL(
        `../../src/projects/${projectId}/preview-media.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const entry of entries) {
    assertPreviewUrl(entry.previewUrl, `${projectId}/${entry.songId}`);
    const result = await checkUrl(entry.previewUrl);
    if (!result.ok) {
      failures.push({
        projectId,
        songId: entry.songId,
        previewUrl: entry.previewUrl,
        status: result.status,
      });
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      `${failure.projectId}/${failure.songId}: ${failure.status} ${failure.previewUrl}`,
    );
  }
  throw new Error(
    `${failures.length} Apple preview URL(s) failed HEAD validation`,
  );
}

console.log("All published Apple preview URLs returned HTTP 200 to HEAD.");

async function checkUrl(url) {
  let lastStatus = "request failed";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await throttle();
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow" });
      lastStatus = `${response.status} ${response.statusText}`.trim();
      if (response.status === 200) return { ok: true, status: lastStatus };
      if (attempt < MAX_ATTEMPTS) {
        await wait(
          parseRetryAfter(response.headers.get("retry-after")) ??
            attempt * 2_000,
        );
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTEMPTS) await wait(attempt * 2_000);
    }
  }
  return { ok: false, status: lastStatus };
}

async function throttle() {
  const remaining = previousRequestStartedAt + REQUEST_DELAY_MS - Date.now();
  if (remaining > 0) await wait(remaining);
  previousRequestStartedAt = Date.now();
}

function assertPreviewUrl(value, label) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "audio-ssl.itunes.apple.com"
  ) {
    throw new Error(`${label} has an invalid preview URL`);
  }
}

function parseRetryAfter(value) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}
