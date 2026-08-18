import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-orchestrator-tests-",
  project: "scripts/tsconfig.orchestrator-tests.json",
  emittedTestFiles: [
    "scripts/tests/board-share-import.test.js",
    "scripts/tests/export-realm-request.test.js",
  ],
  testStdio: "inherit",
}).exitCode;
