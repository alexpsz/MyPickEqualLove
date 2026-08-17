import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const projectSchemaUrl = new URL("../src/schema/project.ts", import.meta.url);
const projectSchemaSource = await readFile(projectSchemaUrl, "utf8");
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

test("project ids and combined context have one neutral owner", async () => {
  assert.deepEqual(projectIdentity.PROJECT_IDS, [
    "equal-love",
    "nearly-equal-joy",
    "not-equal-me",
  ]);
  assert.equal(projectIdentity.DEFAULT_PROJECT_ID, "equal-love");
  assert.equal(projectIdentity.COMBINED_CONTEXT_ID, "both");

  const registrySource = await readFile(
    new URL("../src/projects/registry.ts", import.meta.url),
    "utf8",
  );
  const pickExperienceSchemaSource = await readFile(
    new URL("../src/schema/pick-experience.ts", import.meta.url),
    "utf8",
  );
  const pickExperiencesSource = await readFile(
    new URL("../src/data/pickExperiences.ts", import.meta.url),
    "utf8",
  );
  const eligibilitySource = await readFile(
    new URL("../src/utils/experienceEligibility.ts", import.meta.url),
    "utf8",
  );

  assert.match(registrySource, /from "\.\.\/schema\/project"/u);
  assert.match(
    registrySource,
    /CURRENT_PROJECT_ID\s*=\s*resolveProjectId\(\s*process\.env\.NEXT_PUBLIC_PROJECT_ID/u,
  );
  assert.doesNotMatch(projectSchemaSource, /projects\/registry/u);
  assert.doesNotMatch(pickExperienceSchemaSource, /projects\/registry/u);
  assert.doesNotMatch(
    `${pickExperiencesSource}\n${eligibilitySource}`,
    /(?:COMBINED_CONTEXT_ID|COMBINED_EXPERIENCE_CONTEXT_ID)\s*=\s*"both"/u,
  );
});

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
