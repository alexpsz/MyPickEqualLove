import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { constants as osConstants } from "node:os";
import { delimiter, join, resolve } from "node:path";

function write(output, value) {
  if (value) output.write(value);
}

function signalExitCode(signal) {
  const signalNumber = osConstants.signals?.[signal];
  return Number.isInteger(signalNumber) ? 128 + signalNumber : 1;
}

function childOutcome(result, phase, stdout, stderr) {
  write(stdout, result.stdout);
  write(stderr, result.stderr);

  if (result.error) {
    write(stderr, `${phase} could not start: ${result.error.message}\n`);
    return {
      exitCode: 1,
      phase,
      signal: result.signal ?? null,
      status: result.status ?? null,
      spawnError: result.error,
    };
  }

  if (Number.isInteger(result.status)) {
    return {
      exitCode: result.status,
      phase,
      signal: result.signal ?? null,
      status: result.status,
      spawnError: null,
    };
  }

  if (result.signal) {
    write(stderr, `${phase} terminated by ${result.signal}\n`);
    return {
      exitCode: signalExitCode(result.signal),
      phase,
      signal: result.signal,
      status: null,
      spawnError: null,
    };
  }

  write(stderr, `${phase} ended without an exit status\n`);
  return {
    exitCode: 1,
    phase,
    signal: null,
    status: null,
    spawnError: null,
  };
}

export function mergeNodePath(
  repositoryNodeModules,
  existingNodePath,
  pathDelimiter = delimiter,
) {
  return [repositoryNodeModules, existingNodePath]
    .filter(Boolean)
    .join(pathDelimiter);
}

export function runCompiledTestSuite(
  {
    repositoryRoot,
    tempPrefix,
    compilerArgs = [],
    project,
    sourceFiles = [],
    emittedTestFiles,
    includeRepositoryNodePath = false,
    successMessage,
  },
  {
    spawnSyncImpl = spawnSync,
    existsSyncImpl = existsSync,
    mkdtempSyncImpl = mkdtempSync,
    rmSyncImpl = rmSync,
    tmpdirImpl = tmpdir,
    stdout = process.stdout,
    stderr = process.stderr,
    environment = process.env,
    nodeExecutable = process.execPath,
    pathDelimiter = delimiter,
  } = {},
) {
  if (!repositoryRoot || !tempPrefix || !emittedTestFiles?.length) {
    throw new TypeError(
      "repositoryRoot, tempPrefix, and emittedTestFiles are required",
    );
  }
  if (project && sourceFiles.length > 0) {
    throw new TypeError("project and sourceFiles cannot be combined");
  }

  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const tscPath = resolve(
    resolvedRepositoryRoot,
    "node_modules/typescript/bin/tsc",
  );
  if (!existsSyncImpl(tscPath)) {
    write(stderr, `TypeScript compiler not found at ${tscPath}\n`);
    return {
      exitCode: 1,
      phase: "compiler-resolution",
      signal: null,
      status: null,
      spawnError: null,
      outputDirectory: null,
    };
  }

  const outputDirectory = mkdtempSyncImpl(join(tmpdirImpl(), tempPrefix));
  let outcome;

  try {
    const compileArguments = [tscPath];
    if (project) {
      compileArguments.push(
        "--project",
        resolve(resolvedRepositoryRoot, project),
      );
    } else {
      compileArguments.push(...compilerArgs);
    }
    compileArguments.push("--outDir", outputDirectory, ...sourceFiles);

    let compile;
    try {
      compile = spawnSyncImpl(nodeExecutable, compileArguments, {
        cwd: resolvedRepositoryRoot,
        encoding: "utf8",
        env: environment,
      });
    } catch (error) {
      compile = { error, status: null, signal: null, stdout: "", stderr: "" };
    }
    outcome = childOutcome(compile, "TypeScript compile", stdout, stderr);
    if (outcome.exitCode === 0) {
      const testEnvironment = includeRepositoryNodePath
        ? {
            ...environment,
            NODE_PATH: mergeNodePath(
              resolve(resolvedRepositoryRoot, "node_modules"),
              environment.NODE_PATH,
              pathDelimiter,
            ),
          }
        : environment;
      const testArguments = [
        "--test",
        ...emittedTestFiles.map((testFile) =>
          resolve(outputDirectory, testFile),
        ),
      ];

      let test;
      try {
        test = spawnSyncImpl(nodeExecutable, testArguments, {
          cwd: resolvedRepositoryRoot,
          encoding: "utf8",
          env: testEnvironment,
        });
      } catch (error) {
        test = {
          error,
          status: null,
          signal: null,
          stdout: "",
          stderr: "",
        };
      }
      outcome = childOutcome(test, "Node test", stdout, stderr);
      if (outcome.exitCode === 0 && successMessage) {
        write(stdout, `${successMessage}\n`);
      }
    }
  } finally {
    try {
      rmSyncImpl(outputDirectory, { recursive: true, force: true });
    } catch (error) {
      write(stderr, `Temporary test cleanup failed: ${error.message}\n`);
      if (!outcome || outcome.exitCode === 0) {
        outcome = {
          exitCode: 1,
          phase: "cleanup",
          signal: null,
          status: null,
          spawnError: error,
        };
      }
    }
  }

  return { ...outcome, outputDirectory };
}
