import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const projectSchemaSource = await readFile(
  new URL("../src/schema/project.ts", import.meta.url),
  "utf8",
);
const compiledProjectSchema = ts.transpileModule(projectSchemaSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "project.ts",
  reportDiagnostics: true,
});

assert.deepEqual(compiledProjectSchema.diagnostics, []);

const projectIdentity = await import(
  `data:text/javascript;base64,${Buffer.from(compiledProjectSchema.outputText).toString("base64")}`
);

test("missing project id defaults while valid ids remain exact", () => {
  assert.equal(projectIdentity.resolveProjectId(undefined), "equal-love");
  assert.equal(projectIdentity.resolveProjectId(""), "equal-love");

  for (const projectId of projectIdentity.PROJECT_IDS) {
    assert.equal(projectIdentity.resolveProjectId(projectId), projectId);
  }
});

test("a non-empty unsupported project id fails clearly", () => {
  assert.throws(
    () => projectIdentity.resolveProjectId("equal_love"),
    (error) =>
      error instanceof Error &&
      error.message.includes("Unsupported NEXT_PUBLIC_PROJECT_ID") &&
      error.message.includes('"equal_love"') &&
      projectIdentity.PROJECT_IDS.every((projectId) =>
        error.message.includes(projectId),
      ),
  );
  assert.throws(() => projectIdentity.resolveProjectId(" equal-love"));
});
