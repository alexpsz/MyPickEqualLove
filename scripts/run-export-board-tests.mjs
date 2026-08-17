import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-export-board-tests-",
  compilerArgs: [
    "--ignoreConfig",
    "--module",
    "node16",
    "--moduleResolution",
    "node16",
    "--target",
    "ES2022",
    "--jsx",
    "react-jsx",
    "--resolveJsonModule",
    "--types",
    "node",
    "--esModuleInterop",
    "--skipLibCheck",
  ],
  sourceFiles: ["scripts/tests/export-board-visibility.test.ts"],
  emittedTestFiles: ["scripts/tests/export-board-visibility.test.js"],
  includeRepositoryNodePath: true,
  testStdio: "inherit",
}).exitCode;
