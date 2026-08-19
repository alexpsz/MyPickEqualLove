import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { constants as osConstants } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";

const BARE_PACKAGE_SPECIFIER =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

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

function normalizeModuleAliases(moduleAliases) {
  if (
    moduleAliases === null ||
    Array.isArray(moduleAliases) ||
    typeof moduleAliases !== "object"
  ) {
    throw new TypeError("moduleAliases must be an object");
  }

  return Object.entries(moduleAliases).map(([specifier, emittedPath]) => {
    if (!BARE_PACKAGE_SPECIFIER.test(specifier)) {
      throw new TypeError(`Invalid bare module alias specifier: ${specifier}`);
    }
    if (
      typeof emittedPath !== "string" ||
      emittedPath.length === 0 ||
      isAbsolute(emittedPath)
    ) {
      throw new TypeError(
        `Module alias target must be a relative emitted path: ${specifier}`,
      );
    }
    return { emittedPath, specifier };
  });
}

function installModuleAliases(
  outputDirectory,
  aliases,
  { existsSyncImpl, mkdirSyncImpl, writeFileSyncImpl },
) {
  for (const { emittedPath, specifier } of aliases) {
    const targetPath = resolve(outputDirectory, emittedPath);
    const targetRelativePath = relative(outputDirectory, targetPath);
    if (
      targetRelativePath === "" ||
      targetRelativePath.startsWith(`..${sep}`) ||
      targetRelativePath === ".." ||
      isAbsolute(targetRelativePath)
    ) {
      throw new Error(
        `Module alias target escapes temporary output: ${specifier}`,
      );
    }
    if (!existsSyncImpl(targetPath)) {
      throw new Error(
        `Emitted module alias target not found for ${specifier}: ${emittedPath}`,
      );
    }

    const packageDirectory = resolve(
      outputDirectory,
      "node_modules",
      ...specifier.split("/"),
    );
    mkdirSyncImpl(packageDirectory, { recursive: true });
    const main = relative(packageDirectory, targetPath).replaceAll("\\", "/");
    writeFileSyncImpl(
      join(packageDirectory, "package.json"),
      `${JSON.stringify({ private: true, main })}\n`,
    );
  }
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
    moduleAliases = {},
    testStdio = "pipe",
    successMessage,
  },
  {
    spawnSyncImpl = spawnSync,
    existsSyncImpl = existsSync,
    mkdirSyncImpl = mkdirSync,
    mkdtempSyncImpl = mkdtempSync,
    rmSyncImpl = rmSync,
    writeFileSyncImpl = writeFileSync,
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
  if (testStdio !== "pipe" && testStdio !== "inherit") {
    throw new TypeError('testStdio must be either "pipe" or "inherit"');
  }
  const aliases = normalizeModuleAliases(moduleAliases);

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
      try {
        installModuleAliases(outputDirectory, aliases, {
          existsSyncImpl,
          mkdirSyncImpl,
          writeFileSyncImpl,
        });
      } catch (error) {
        write(stderr, `Module alias setup failed: ${error.message}\n`);
        outcome = {
          exitCode: 1,
          phase: "module-alias",
          signal: null,
          status: null,
          spawnError: error,
        };
      }
    }
    if (outcome.exitCode === 0) {
      const needsNodePath = aliases.length > 0 || includeRepositoryNodePath;
      const testEnvironment = needsNodePath
        ? {
            ...environment,
            NODE_PATH: [
              aliases.length > 0
                ? resolve(outputDirectory, "node_modules")
                : null,
              includeRepositoryNodePath
                ? resolve(resolvedRepositoryRoot, "node_modules")
                : null,
              environment.NODE_PATH,
            ]
              .filter(Boolean)
              .join(pathDelimiter),
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
          stdio: testStdio,
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
