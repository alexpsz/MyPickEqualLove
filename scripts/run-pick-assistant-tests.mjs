import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-assistant-tests-",
  project: "scripts/tsconfig.pick-assistant-tests.json",
  emittedTestFiles: ["scripts/pick-assistant.test.js"],
  moduleAliases: {
    "@current-project/runtime": "src/projects/equal-love/runtime.js",
  },
}).exitCode;
