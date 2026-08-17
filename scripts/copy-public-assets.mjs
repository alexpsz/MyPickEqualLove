import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "out");
const projectsDir = path.join(root, "src", "projects");
const currentProjectId = process.env.NEXT_PUBLIC_PROJECT_ID || "equal-love";

const nextStaticSource = path.join(root, ".next", "static");
const nextStaticDestination = path.join(outDir, "_next", "static");

if (fs.existsSync(nextStaticSource)) {
  fs.rmSync(nextStaticDestination, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(nextStaticDestination), { recursive: true });
  fs.cpSync(nextStaticSource, nextStaticDestination, { recursive: true });
}

const publicDir = path.join(root, "public");

if (fs.existsSync(publicDir)) {
  for (const assetName of fs.readdirSync(publicDir)) {
    const source = path.join(publicDir, assetName);
    const destination = path.join(outDir, assetName);

    fs.rmSync(destination, { force: true, recursive: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
  }
}

removeExportedLiveRoute("__empty-live__");

for (const slug of getInactiveLiveSlugs()) {
  removeExportedLiveRoute(slug);
}

const liveDir = path.join(outDir, "live");
if (fs.existsSync(liveDir) && fs.readdirSync(liveDir).length === 0) {
  fs.rmSync(liveDir, { force: true, recursive: true });
}

console.log(`Synced static export assets to ${outDir}.`);

function removeExportedLiveRoute(slug) {
  fs.rmSync(path.join(outDir, "live", slug), { force: true, recursive: true });

  for (const extension of [".html", ".txt"]) {
    fs.rmSync(path.join(outDir, "live", `${slug}${extension}`), {
      force: true,
    });
  }
}

function getInactiveLiveSlugs() {
  const allSlugs = new Set();
  const currentSlugs = new Set();

  for (const projectId of fs.readdirSync(projectsDir)) {
    const liveExperiencesPath = path.join(
      projectsDir,
      projectId,
      "live-experiences.json",
    );
    if (!fs.existsSync(liveExperiencesPath)) continue;

    const experiences = JSON.parse(
      fs.readFileSync(liveExperiencesPath, "utf8"),
    );
    if (!Array.isArray(experiences)) continue;

    for (const experience of experiences) {
      if (
        experience?.status !== "published" &&
        experience?.status !== "archived"
      ) {
        continue;
      }

      allSlugs.add(experience.slug);
      if (projectId === currentProjectId) {
        currentSlugs.add(experience.slug);
      }
    }
  }

  return Array.from(allSlugs).filter((slug) => !currentSlugs.has(slug));
}
