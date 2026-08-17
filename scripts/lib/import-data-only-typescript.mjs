import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const toDataModuleUrl = (text) =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function transpile(relativePath) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  const { outputText, diagnostics = [] } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
    reportDiagnostics: true,
  });

  if (
    diagnostics.some(({ category }) => category === ts.DiagnosticCategory.Error)
  )
    throw new Error(`Failed to transpile ${relativePath}`);

  return outputText;
}

export async function importDataOnlyTypeScript(
  relativePath,
  importSpecifiers = {},
) {
  let outputText = await transpile(relativePath);
  for (const [specifier, dependencyPath] of Object.entries(importSpecifiers)) {
    const dependencyUrl = toDataModuleUrl(await transpile(dependencyPath));
    const importPattern = RegExp(`(["'])${escapeRegExp(specifier)}\\1`, "g");
    if ((outputText.match(importPattern) ?? []).length !== 1)
      throw new Error(
        `Expected one \"${specifier}\" import in ${relativePath}`,
      );
    outputText = outputText.replace(
      importPattern,
      JSON.stringify(dependencyUrl),
    );
  }

  return import(toDataModuleUrl(outputText));
}
