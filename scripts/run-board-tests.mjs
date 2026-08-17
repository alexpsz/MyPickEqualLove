import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-board-tests-",
  project: "scripts/tsconfig.board-tests.json",
  emittedTestFiles: ["scripts/tests/board-state.test.js"],
}).exitCode;
