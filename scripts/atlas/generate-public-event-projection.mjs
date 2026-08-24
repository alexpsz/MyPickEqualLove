import { generateProjection } from "./public-event-projection.mjs";

const result = await generateProjection();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
