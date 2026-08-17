import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_IDS = ["equal-love", "nearly-equal-joy", "not-equal-me"];
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifestPath = path.join(
  repositoryRoot,
  "src",
  "projects",
  "share-validation-manifest.json",
);

function unique(values) {
  return [...new Set(values)];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function buildManifest() {
  const projects = {};

  for (const projectId of PROJECT_IDS) {
    const projectDirectory = path.join(
      repositoryRoot,
      "src",
      "projects",
      projectId,
    );
    const [songs, liveExperiences] = await Promise.all([
      readJson(path.join(projectDirectory, "songs.json")),
      readJson(path.join(projectDirectory, "live-experiences.json")),
    ]);

    projects[projectId] = {
      songIds: songs.map((song) => song.id),
      experiences: Object.fromEntries(
        liveExperiences
          .filter(
            (experience) =>
              experience.status === "published" ||
              experience.status === "archived",
          )
          .map((experience) => [
            experience.id,
            {
              title: experience.title,
              canonicalPath: experience.canonicalPath,
              slots: experience.slots.map((slot) => ({
                id: slot.id,
                eligibility: slot.eligibility,
              })),
              performances: (experience.performances ?? []).map(
                (performance) => ({
                  id: performance.id,
                  songIds: unique(
                    performance.setlist
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((entry) => entry.songId),
                  ),
                }),
              ),
              includeCombinedPerformance: Boolean(
                experience.includeCombinedPerformance,
              ),
            },
          ]),
      ),
    };
  }

  return `${JSON.stringify({ schemaVersion: 1, projects })}\n`;
}

const generated = await buildManifest();
if (process.argv.includes("--check")) {
  const existing = await readFile(manifestPath, "utf8").catch(() => "");
  if (existing !== generated) {
    console.error(
      "share-validation-manifest.json is stale; run scripts/generate-share-validation-manifest.mjs",
    );
    process.exitCode = 1;
  } else {
    console.log("share validation manifest is current");
  }
} else {
  await writeFile(manifestPath, generated, "utf8");
  console.log(`wrote ${path.relative(repositoryRoot, manifestPath)}`);
}
