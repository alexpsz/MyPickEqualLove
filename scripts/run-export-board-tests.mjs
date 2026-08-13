import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = mkdtempSync(
  join(tmpdir(), "mypick-export-board-tests-"),
);
const tscPath = resolve(repositoryRoot, "node_modules/typescript/bin/tsc");
const testEnvironment = {
  ...process.env,
  NODE_PATH: [resolve(repositoryRoot, "node_modules"), process.env.NODE_PATH]
    .filter(Boolean)
    .join(delimiter),
};

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
      "--jsx",
      "react-jsx",
      "--resolveJsonModule",
      "--types",
      "node",
      "--esModuleInterop",
      "--skipLibCheck",
      "--outDir",
      outputDirectory,
      "scripts/tests/export-board-visibility.test.ts",
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
        resolve(
          outputDirectory,
          "scripts/tests/export-board-visibility.test.js",
        ),
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: testEnvironment,
        stdio: "inherit",
      },
    );
    process.exitCode = test.status ?? 1;
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
