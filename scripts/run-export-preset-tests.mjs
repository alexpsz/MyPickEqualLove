import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  tempPrefix: "mypick-export-tests-",
  compilerArgs: [
    "--ignoreConfig",
    "--module",
    "node16",
    "--moduleResolution",
    "node16",
    "--target",
    "ES2022",
    "--types",
    "node",
    "--esModuleInterop",
    "--skipLibCheck",
  ],
  sourceFiles: [
    "scripts/test-export-presets.ts",
    "src/schema/export.ts",
    "src/config/exportPresets.ts",
    "src/utils/exportOptions.ts",
    "src/utils/exportFileName.ts",
    "src/utils/exportQr.ts",
  ],
  emittedTestFiles: ["scripts/test-export-presets.js"],
  testStdio: "inherit",
}).exitCode;
