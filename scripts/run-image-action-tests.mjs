import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = mkdtempSync(
  join(tmpdir(), "mypick-image-actions-tests-"),
);
const tscPath = resolve(repositoryRoot, "node_modules/typescript/bin/tsc");

try {
  const compile = spawnSync(
    process.execPath,
    [
      tscPath,
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
      "--outDir",
      outputDirectory,
      "scripts/tests/image-actions.test.ts",
      "src/utils/imageActions.ts",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout ?? "");
    process.stderr.write(compile.stderr ?? "");
    process.exitCode = compile.status ?? 1;
  } else {
    const test = spawnSync(
      process.execPath,
      [
        "--test",
        resolve(outputDirectory, "scripts/tests/image-actions.test.js"),
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    process.stdout.write(test.stdout ?? "");
    process.stderr.write(test.stderr ?? "");
    process.exitCode = test.status ?? 1;
    if (test.status === 0) console.log("Image action tests passed.");
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
