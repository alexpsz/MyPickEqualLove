import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompiledTestSuite } from "./lib/compiled-test-runner.mjs";

/**
 * Single entry point for every TypeScript test suite.
 *
 * Usage: node scripts/run-ts-tests.mjs <suite>
 *
 * Each suite previously had its own near-identical wrapper file. The only real
 * differences are the tsconfig (or compiler flags) and which emitted files to
 * run, so they live in one table here instead of eight scripts.
 */

const NODE16_ARGS = [
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
];

const SUITES = {
  board: {
    tempPrefix: "mypick-board-tests-",
    project: "scripts/tsconfig.board-tests.json",
    emittedTestFiles: ["scripts/tests/board-state.test.js"],
  },
  "pick-assistant": {
    tempPrefix: "mypick-assistant-tests-",
    project: "scripts/tsconfig.pick-assistant-tests.json",
    emittedTestFiles: ["scripts/pick-assistant.test.js"],
    moduleAliases: {
      "@current-project/runtime": "src/projects/equal-love/runtime.js",
    },
  },
  "archetype-affinity": {
    tempPrefix: "mypick-archetype-tests-",
    project: "scripts/tsconfig.archetype-affinity-tests.json",
    emittedTestFiles: ["scripts/archetype-affinity.test.js"],
  },
  orchestrator: {
    tempPrefix: "mypick-orchestrator-tests-",
    project: "scripts/tsconfig.orchestrator-tests.json",
    emittedTestFiles: [
      "scripts/tests/board-share-import.test.js",
      "scripts/tests/board-comparison.test.js",
      "scripts/tests/export-realm-request.test.js",
      "scripts/tests/storage-sync-policy.test.js",
      "scripts/tests/export-style-proxy.test.js",
      "scripts/tests/board-insights.test.js",
      "scripts/color-conversion.test.js",
    ],
  },
  theme: {
    tempPrefix: "mypick-theme-tests-",
    project: "scripts/tsconfig.orchestrator-tests.json",
    emittedTestFiles: ["scripts/tests/theme-preference.test.js"],
    successMessage: "Theme preference tests passed.",
  },
  oshimen: {
    tempPrefix: "mypick-oshimen-tests-",
    project: "scripts/tsconfig.orchestrator-tests.json",
    emittedTestFiles: ["scripts/tests/oshimen-preference.test.js"],
    successMessage: "Oshimen preference tests passed.",
  },
  "keyboard-shortcuts": {
    tempPrefix: "mypick-keyboard-shortcuts-tests-",
    project: "scripts/tsconfig.orchestrator-tests.json",
    emittedTestFiles: ["scripts/tests/keyboard-shortcuts.test.js"],
    successMessage: "Keyboard shortcut tests passed.",
  },
  "export-presets": {
    tempPrefix: "mypick-export-tests-",
    compilerArgs: [...NODE16_ARGS, "--resolveJsonModule"],
    sourceFiles: [
      "scripts/test-export-presets.ts",
      "src/projects/current-runtime.d.ts",
      "src/projects/equal-love/runtime.ts",
      "src/schema/export.ts",
      "src/schema/music.ts",
      "src/schema/project.ts",
      "src/config/exportPresets.ts",
      "src/data/coverTonePilot.ts",
      "src/utils/exportOptions.ts",
      "src/utils/exportFileName.ts",
      "src/utils/exportQr.ts",
    ],
    emittedTestFiles: ["scripts/test-export-presets.js"],
    moduleAliases: {
      "@current-project/runtime": "src/projects/equal-love/runtime.js",
    },
  },
  "cover-tone": {
    tempPrefix: "mypick-cover-tone-tests-",
    compilerArgs: [...NODE16_ARGS, "--resolveJsonModule"],
    sourceFiles: [
      "scripts/test-cover-tone.ts",
      "src/projects/current-runtime.d.ts",
      "src/projects/equal-love/runtime.ts",
      "src/schema/export.ts",
      "src/schema/music.ts",
      "src/schema/project.ts",
      "src/data/coverTonePilot.ts",
    ],
    emittedTestFiles: ["scripts/test-cover-tone.js"],
    moduleAliases: {
      "@current-project/runtime": "src/projects/equal-love/runtime.js",
    },
  },
  "image-actions": {
    tempPrefix: "mypick-image-actions-tests-",
    compilerArgs: [...NODE16_ARGS, "--lib", "ES2022,DOM"],
    sourceFiles: [
      "scripts/tests/image-actions.test.ts",
      "src/utils/imageActions.ts",
    ],
    emittedTestFiles: ["scripts/tests/image-actions.test.js"],
    successMessage: "Image action tests passed.",
  },
  backup: {
    tempPrefix: "mypick-backup-tests-",
    compilerArgs: [...NODE16_ARGS, "--resolveJsonModule"],
    sourceFiles: ["scripts/tests/backup-document.test.ts"],
    emittedTestFiles: ["scripts/tests/backup-document.test.js"],
    successMessage: "Backup document tests passed.",
  },
  onboarding: {
    tempPrefix: "mypick-onboarding-tests-",
    compilerArgs: [...NODE16_ARGS, "--jsx", "react-jsx", "--lib", "ES2022,DOM"],
    sourceFiles: [
      "scripts/tests/onboarding-empty-state.test.ts",
      "src/components/OnboardingEmptyState.tsx",
      "src/components/AppIcon.tsx",
      "src/i18n/messages.ts",
      "src/utils/onboardingState.ts",
    ],
    emittedTestFiles: ["scripts/tests/onboarding-empty-state.test.js"],
    includeRepositoryNodePath: true,
    successMessage: "Onboarding empty-state tests passed.",
  },
  motion: {
    tempPrefix: "mypick-motion-tests-",
    compilerArgs: [...NODE16_ARGS],
    sourceFiles: ["scripts/tests/motion.test.ts", "src/config/motion.ts"],
    emittedTestFiles: ["scripts/tests/motion.test.js"],
    successMessage: "Motion tests passed.",
  },
  "export-readiness": {
    tempPrefix: "mypick-export-readiness-tests-",
    compilerArgs: [...NODE16_ARGS, "--lib", "ES2022,DOM"],
    sourceFiles: [
      "scripts/tests/export-readiness.test.ts",
      "src/utils/exportImageReadiness.ts",
    ],
    emittedTestFiles: ["scripts/tests/export-readiness.test.js"],
    successMessage: "Export readiness tests passed.",
  },
  "preview-media": {
    tempPrefix: "mypick-preview-media-tests-",
    compilerArgs: [...NODE16_ARGS, "--resolveJsonModule"],
    sourceFiles: [
      "src/projects/current-runtime.d.ts",
      "src/projects/equal-love/runtime.ts",
      "src/utils/previewMedia.ts",
      "scripts/tests/preview-media.test.ts",
    ],
    emittedTestFiles: ["scripts/tests/preview-media.test.js"],
    moduleAliases: {
      "@current-project/runtime": "src/projects/equal-love/runtime.js",
    },
  },
  "export-board": {
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
  },
};

const suiteName = process.argv[2];
const suite = SUITES[suiteName];

if (!suite) {
  console.error(`Unknown test suite: ${suiteName ?? "(none given)"}`);
  console.error(`Expected one of: ${Object.keys(SUITES).join(", ")}`);
  process.exit(1);
}

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.exitCode = runCompiledTestSuite({
  repositoryRoot,
  testStdio: "inherit",
  ...suite,
}).exitCode;
