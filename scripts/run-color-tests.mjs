import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = mkdtempSync(join(tmpdir(), "mypick-color-tests-"));
const nodeModulesDirectory = process.env.COLOR_TEST_NODE_MODULES
  ? resolve(process.env.COLOR_TEST_NODE_MODULES)
  : resolve(repositoryRoot, "node_modules");
const tscPath = resolve(nodeModulesDirectory, "typescript/bin/tsc");

try {
  const compile = spawnSync(
    process.execPath,
    [
      tscPath,
      "--project",
      resolve(repositoryRoot, "scripts/tsconfig.color-tests.json"),
      "--outDir",
      outputDirectory,
      "--typeRoots",
      resolve(nodeModulesDirectory, "@types"),
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    if (compile.error) process.stderr.write(`${compile.error.message}\n`);
    process.stderr.write(compile.stdout ?? "");
    process.stderr.write(compile.stderr ?? "");
    process.exitCode = compile.status ?? 1;
  } else {
    const testFile = resolve(
      outputDirectory,
      "scripts/color-conversion.test.js",
    );
    const tests = spawnSync(process.execPath, ["--test", testFile], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (tests.error) process.stderr.write(`${tests.error.message}\n`);
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
