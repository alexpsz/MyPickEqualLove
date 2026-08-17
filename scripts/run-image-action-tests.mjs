import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-image-actions-tests-",
  compilerArgs: [
    "--ignoreConfig",
    "--module",
    "node16",
    "--moduleResolution",
    "node16",
    "--target",
    "ES2022",
    "--lib",
    "ES2022,DOM",
    "--types",
    "node",
    "--esModuleInterop",
    "--skipLibCheck",
  ],
  sourceFiles: [
    "scripts/tests/image-actions.test.ts",
    "src/utils/imageActions.ts",
  ],
  emittedTestFiles: ["scripts/tests/image-actions.test.js"],
  successMessage: "Image action tests passed.",
}).exitCode;
