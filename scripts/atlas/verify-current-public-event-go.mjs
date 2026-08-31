import { checkProjection } from "./public-event-projection.mjs";
import { checkCanonicalMyPickLinks } from "./canonical-mypick-links.mjs";

const result = await checkProjection();
const links = result.ok
  ? await checkCanonicalMyPickLinks()
  : { ok: false, errors: [] };

if (!result.ok || result.status !== "GO" || !links.ok) {
  throw new Error(
    `Expected the current public Event projection to be GO, received ${JSON.stringify({ result, links })}.`,
  );
}

if (!/^sha256:[0-9a-f]{64}$/.test(result.sourceRevision ?? "")) {
  throw new Error("The GO audit did not return a canonical source revision.");
}

if (!/^sha256:[0-9a-f]{64}$/.test(result.artifactHash ?? "")) {
  throw new Error("The GO audit did not return a canonical artifact hash.");
}

console.log(
  `Atlas public Event projection is GO (${result.sourceRevision}, ${result.artifactHash}).`,
);
