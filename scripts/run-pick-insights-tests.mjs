import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = mkdtempSync(join(tmpdir(), "mypick-insights-tests-"));
const tscPath = resolve(repositoryRoot, "node_modules/typescript/bin/tsc");

try {
  const compile = spawnSync(
    process.execPath,
    [
      tscPath,
      "--project",
      resolve(repositoryRoot, "scripts/tsconfig.pick-insights-tests.json"),
      "--outDir",
      outputDirectory,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout ?? "");
    process.stderr.write(compile.stderr ?? "");
    if (compile.error) process.stderr.write(`${compile.error.message}\n`);
    process.exitCode = compile.status ?? 1;
  } else {
    const testFile = resolve(
      outputDirectory,
      "scripts/tests/pick-insights.test.js",
    );
    const test = spawnSync(process.execPath, ["--test", testFile], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    process.stdout.write(test.stdout ?? "");
    process.stderr.write(test.stderr ?? "");
    if (test.error) process.stderr.write(`${test.error.message}\n`);
    process.exitCode = test.status ?? 1;
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
