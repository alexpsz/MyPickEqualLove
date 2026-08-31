import { generateProjection } from "./public-event-projection.mjs";
import { generateCanonicalMyPickLinks } from "./canonical-mypick-links.mjs";

const result = await generateProjection();
if (result.ok) await generateCanonicalMyPickLinks();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
