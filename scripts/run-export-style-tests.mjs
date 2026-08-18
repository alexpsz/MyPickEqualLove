import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-export-style-tests-",
  project: "scripts/tsconfig.export-style-tests.json",
  emittedTestFiles: ["scripts/tests/export-style-proxy.test.js"],
  testStdio: "inherit",
}).exitCode;
