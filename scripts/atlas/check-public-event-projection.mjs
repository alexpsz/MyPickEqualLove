import { checkProjection } from "./public-event-projection.mjs";

const result = await checkProjection();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
