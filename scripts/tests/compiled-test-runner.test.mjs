import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

import {
  mergeNodePath,
  runCompiledTestSuite,
} from "../lib/compiled-test-runner.mjs";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "mypick-runner-fixture-"));
  const tscPath = join(root, "node_modules", "typescript", "bin", "tsc");
  mkdirSync(join(root, "node_modules", "typescript", "bin"), {
    recursive: true,
  });
  writeFileSync(tscPath, "fixture");
  return root;
}

function capture() {
  let value = "";
  return {
    output: {
      write(chunk) {
        value += chunk;
      },
    },
    read: () => value,
  };
}

function runFixture(root, results, overrides = {}) {
  const calls = [];
  const stderr = capture();
  const stdout = capture();
  const outcome = runCompiledTestSuite(
    {
      repositoryRoot: root,
      tempPrefix: "compiled-test-",
      compilerArgs: ["--target", "ES2022"],
      sourceFiles: ["fixture.test.ts"],
      emittedTestFiles: ["fixture.test.js"],
      ...overrides,
    },
    {
      spawnSyncImpl(command, args, options) {
        calls.push({ command, args, options });
        return results[calls.length - 1];
      },
      stdout: stdout.output,
      stderr: stderr.output,
    },
  );
  return { calls, outcome, stderr: stderr.read(), stdout: stdout.read() };
}

test("compile failures are propagated, skip tests, and clean temporary output", () => {
  const root = createFixture();
  try {
    const result = runFixture(root, [
      {
        status: 2,
        signal: null,
        stdout: "compile out\n",
        stderr: "compile err\n",
      },
    ]);
    assert.equal(result.calls.length, 1);
    assert.equal(result.outcome.exitCode, 2);
    assert.equal(result.outcome.phase, "TypeScript compile");
    assert.match(result.stdout, /compile out/);
    assert.match(result.stderr, /compile err/);
    assert.equal(existsSync(result.outcome.outputDirectory), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("test failures and signals retain their distinct exit outcomes", () => {
  const root = createFixture();
  try {
    const failure = runFixture(root, [
      { status: 0, signal: null, stdout: "", stderr: "" },
      { status: 7, signal: null, stdout: "test out\n", stderr: "test err\n" },
    ]);
    assert.equal(failure.outcome.exitCode, 7);
    assert.equal(failure.outcome.phase, "Node test");
    assert.match(failure.stdout, /test out/);
    assert.match(failure.stderr, /test err/);

    const signaled = runFixture(root, [
      { status: 0, signal: null, stdout: "", stderr: "" },
      { status: null, signal: "SIGTERM", stdout: "", stderr: "" },
    ]);
    assert.equal(signaled.outcome.exitCode, 143);
    assert.equal(signaled.outcome.signal, "SIGTERM");
    assert.match(signaled.stderr, /terminated by SIGTERM/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("spawn errors are reported as environment failures", () => {
  const root = createFixture();
  try {
    const result = runFixture(root, [
      {
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("spawnSync EPERM"), { code: "EPERM" }),
      },
    ]);
    assert.equal(result.outcome.exitCode, 1);
    assert.equal(result.outcome.phase, "TypeScript compile");
    assert.equal(result.outcome.spawnError.code, "EPERM");
    assert.match(result.stderr, /could not start: spawnSync EPERM/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid checked-in compiler path fails before spawning", () => {
  const root = mkdtempSync(join(tmpdir(), "mypick-runner-missing-tsc-"));
  const stderr = capture();
  try {
    const outcome = runCompiledTestSuite(
      {
        repositoryRoot: root,
        tempPrefix: "compiled-test-",
        sourceFiles: ["fixture.test.ts"],
        emittedTestFiles: ["fixture.test.js"],
      },
      {
        spawnSyncImpl() {
          assert.fail("spawn must not run without the checked-in compiler");
        },
        stderr: stderr.output,
      },
    );
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.phase, "compiler-resolution");
    assert.match(stderr.read(), /TypeScript compiler not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NODE_PATH prepends repository modules and preserves the existing value", () => {
  assert.equal(
    mergeNodePath("repo-modules", "existing-modules", delimiter),
    ["repo-modules", "existing-modules"].join(delimiter),
  );

  const root = createFixture();
  try {
    const result = runFixture(
      root,
      [
        { status: 0, signal: null, stdout: "", stderr: "" },
        { status: 0, signal: null, stdout: "", stderr: "" },
      ],
      { includeRepositoryNodePath: true },
    );
    assert.equal(result.outcome.exitCode, 0);
    assert.equal(
      result.calls[1].options.env.NODE_PATH,
      [join(root, "node_modules"), process.env.NODE_PATH]
        .filter(Boolean)
        .join(delimiter),
    );
    assert.equal(result.calls[1].options.stdio, "pipe");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("test stdio can inherit from the parent process", () => {
  const root = createFixture();
  try {
    const result = runFixture(
      root,
      [
        { status: 0, signal: null, stdout: "", stderr: "" },
        { status: 0, signal: null, stdout: null, stderr: null },
      ],
      { testStdio: "inherit" },
    );
    assert.equal(result.outcome.exitCode, 0);
    assert.equal(result.calls[1].options.stdio, "inherit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup errors fail an otherwise successful run", () => {
  const root = createFixture();
  const stderr = capture();
  try {
    const outcome = runCompiledTestSuite(
      {
        repositoryRoot: root,
        tempPrefix: "compiled-test-",
        sourceFiles: ["fixture.test.ts"],
        emittedTestFiles: ["fixture.test.js"],
      },
      {
        spawnSyncImpl() {
          return { status: 0, signal: null, stdout: "", stderr: "" };
        },
        rmSyncImpl() {
          throw new Error("cleanup denied");
        },
        tmpdirImpl() {
          return root;
        },
        stderr: stderr.output,
      },
    );
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.phase, "cleanup");
    assert.match(
      stderr.read(),
      /Temporary test cleanup failed: cleanup denied/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
