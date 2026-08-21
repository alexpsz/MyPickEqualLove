import { readFile, writeFile } from "node:fs/promises";

const PROJECTS = [
  {
    projectId: "equal-love",
    sourcePath: new URL("../archetype/source-map.json", import.meta.url),
    outputPath: new URL(
      "../../src/projects/equal-love/official-media.json",
      import.meta.url,
    ),
  },
  {
    projectId: "nearly-equal-joy",
    sourcePath: new URL("./nearly-equal-joy-source-map.json", import.meta.url),
    outputPath: new URL(
      "../../src/projects/nearly-equal-joy/official-media.json",
      import.meta.url,
    ),
  },
  {
    projectId: "not-equal-me",
    sourcePath: new URL("./not-equal-me-source-map.json", import.meta.url),
    outputPath: new URL(
      "../../src/projects/not-equal-me/official-media.json",
      import.meta.url,
    ),
  },
];

const checkOnly = process.argv.slice(2).includes("--check");

for (const project of PROJECTS) {
  const sourceMap = JSON.parse(await readFile(project.sourcePath, "utf8"));
  if (
    sourceMap.projectId !== project.projectId ||
    !Array.isArray(sourceMap.songs)
  ) {
    throw new Error(`${project.projectId} source map is invalid`);
  }

  const projection = sourceMap.songs.map(
    ({ songId, sourceMode, sourceUrl }) => ({
      songId,
      sourceMode,
      sourceUrl,
    }),
  );
  const serialized = `${JSON.stringify(projection, null, 2)}\n`;

  if (checkOnly) {
    const current = await readFile(project.outputPath, "utf8").catch(() => "");
    if (current !== serialized) {
      throw new Error(
        `${project.projectId} runtime projection is stale; run npm run generate:official-media-runtime`,
      );
    }
  } else {
    await writeFile(project.outputPath, serialized, "utf8");
  }
}

console.log(
  checkOnly
    ? "Official media runtime projections are current."
    : "Official media runtime projections updated.",
);
