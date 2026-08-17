import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-archetype-tests-",
  project: "scripts/tsconfig.archetype-affinity-tests.json",
  emittedTestFiles: ["scripts/archetype-affinity.test.js"],
}).exitCode;
