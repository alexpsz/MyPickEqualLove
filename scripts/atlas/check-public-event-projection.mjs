import { checkProjection } from "./public-event-projection.mjs";
import { checkCanonicalMyPickLinks } from "./canonical-mypick-links.mjs";

const result = await checkProjection();
if (result.ok) {
  const links = await checkCanonicalMyPickLinks();
  if (!links.ok) {
    result.ok = false;
    result.status = "HOLD";
    result.errors.push(...links.errors);
  }
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
