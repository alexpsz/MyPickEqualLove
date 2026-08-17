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
  sourceFiles: [
    "src/projects/current-runtime.d.ts",
    "src/projects/equal-love/runtime.ts",
    "scripts/tests/export-board-visibility.test.ts",
  ],
  emittedTestFiles: ["scripts/tests/export-board-visibility.test.js"],
  includeRepositoryNodePath: true,
  moduleAliases: {
    "@current-project/runtime": "src/projects/equal-love/runtime.js",
  },
  testStdio: "inherit",
}).exitCode;
