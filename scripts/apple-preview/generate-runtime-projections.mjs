import { readFile, writeFile } from "node:fs/promises";

const PROJECTS = ["equal-love", "nearly-equal-joy", "not-equal-me"];
const checkOnly = process.argv.slice(2).includes("--check");

for (const projectId of PROJECTS) {
  const sourcePath = new URL(`./${projectId}-source-map.json`, import.meta.url);
  const outputPath = new URL(
    `../../src/projects/${projectId}/preview-media.json`,
    import.meta.url,
  );
  const sourceMap = JSON.parse(await readFile(sourcePath, "utf8"));
  if (sourceMap.projectId !== projectId || !Array.isArray(sourceMap.songs)) {
    throw new Error(`${projectId} source map is invalid`);
  }

  const projection = sourceMap.songs.flatMap((entry) =>
    entry.needsReview === false
      ? [
          {
            songId: entry.songId,
            previewUrl: entry.previewUrl,
            trackViewUrl: entry.trackViewUrl,
          },
        ]
      : [],
  );
  const serialized = `${JSON.stringify(projection, null, 2)}\n`;

  if (checkOnly) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current !== serialized) {
      throw new Error(
        `${projectId} runtime projection is stale; run npm run generate:apple-preview-runtime`,
      );
    }
  } else {
    await writeFile(outputPath, serialized, "utf8");
  }
}

console.log(
  checkOnly
    ? "Apple preview runtime projections are current."
    : "Apple preview runtime projections updated.",
);
