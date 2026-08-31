import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const projectionPath = resolve(
  repositoryRoot,
  "apps/atlas/src/generated/public-atlas-projection.v1.json",
);
const outputPath = resolve(
  repositoryRoot,
  "apps/atlas/src/generated/canonical-mypick-links.v1.json",
);
const sources = {
  "equal-love": "src/projects/equal-love/live-experiences.json",
  "nearly-equal-joy": "src/projects/nearly-equal-joy/live-experiences.json",
  "not-equal-me": "src/projects/not-equal-me/live-experiences.json",
};

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function buildCanonicalMyPickLinks() {
  const projection = JSON.parse(await readFile(projectionPath, "utf8"));
  const acceptedIds = new Set(
    projection.groups.flatMap((group) => group.events.map((event) => event.id)),
  );
  const events = {};
  for (const [siteId, relativePath] of Object.entries(sources)) {
    const source = JSON.parse(
      await readFile(resolve(repositoryRoot, relativePath), "utf8"),
    );
    for (const event of source) {
      const entityId = `${siteId}:event:${event.id}`;
      if (!acceptedIds.has(entityId)) continue;
      if (event.canonicalPath !== `/live/${event.slug}/`) {
        throw new Error(`${relativePath}:${event.id} has no exact live route`);
      }
      events[entityId] = event.canonicalPath;
    }
  }
  if (Object.keys(events).length !== acceptedIds.size) {
    throw new Error(
      "Every accepted Event must have exactly one MyPick live route",
    );
  }
  return {
    schemaVersion: 1,
    sourceRevision: projection.sourceRevision,
    songPathPrefix: "/songs/",
    events: Object.fromEntries(
      Object.entries(events).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export async function generateCanonicalMyPickLinks() {
  const bytes = canonicalBytes(await buildCanonicalMyPickLinks());
  const temporary = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, outputPath);
  return { ok: true, outputPath };
}

export async function checkCanonicalMyPickLinks() {
  const expected = canonicalBytes(await buildCanonicalMyPickLinks());
  const actual = await readFile(outputPath);
  return {
    ok: actual.equals(expected),
    errors: actual.equals(expected)
      ? []
      : ["CANONICAL_LINK_DRIFT:regenerate canonical MyPick link projection"],
  };
}
