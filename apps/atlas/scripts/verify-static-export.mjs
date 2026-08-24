import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ATLAS_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const EXPECTED_OUTPUT = path.join(ATLAS_ROOT, "out");
const REQUIRED_FILES = ["index.html"];
const REQUIRED_PREFIXES = ["_next/static/"];
const ALLOWED_HTML_FILES = new Set([
  "404.html",
  "404/index.html",
  "_not-found.html",
  "_not-found/index.html",
  "index.html",
]);
const FORBIDDEN_EXACT_FILES = new Set([
  "manifest.json",
  "manifest.webmanifest",
  "sw.js",
]);
const FORBIDDEN_ROUTE_SEGMENTS = new Set(["covers", "live", "og", "songs"]);
const MY_PICK_RUNTIME_MARKERS = [
  "@current-project/runtime",
  "NEXT_PUBLIC_PROJECT_ID",
];
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".txt"]);
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

function listFiles(directory, prefix = "") {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

export function inspectStaticExport(outputDirectory) {
  const output = path.resolve(outputDirectory);
  const violations = [];

  if (!existsSync(output) || !statSync(output).isDirectory()) {
    return {
      files: [],
      violations: [`missing static export directory: ${output}`],
    };
  }

  const files = listFiles(output);

  for (const requiredFile of REQUIRED_FILES) {
    if (!files.includes(requiredFile)) {
      violations.push(`missing required export file: ${requiredFile}`);
    }
  }

  for (const requiredPrefix of REQUIRED_PREFIXES) {
    if (!files.some((file) => file.startsWith(requiredPrefix))) {
      violations.push(`missing required export assets: ${requiredPrefix}`);
    }
  }

  for (const file of files) {
    const segments = file.split("/");

    if (FORBIDDEN_EXACT_FILES.has(file)) {
      violations.push(`Atlas must not emit ${file}`);
    }

    const forbiddenSegment = segments.find((segment) =>
      FORBIDDEN_ROUTE_SEGMENTS.has(segment),
    );
    if (forbiddenSegment) {
      violations.push(`foreign MyPick output segment found: ${file}`);
    }

    if (file.endsWith(".html") && !ALLOWED_HTML_FILES.has(file)) {
      violations.push(`unexpected Foundation route found: ${file}`);
    }

    const absolutePath = path.join(output, ...segments);
    const extension = path.extname(file);
    if (
      TEXT_EXTENSIONS.has(extension) &&
      statSync(absolutePath).size <= MAX_TEXT_FILE_BYTES
    ) {
      const content = readFileSync(absolutePath, "utf8");
      for (const marker of MY_PICK_RUNTIME_MARKERS) {
        if (content.includes(marker)) {
          violations.push(`MyPick runtime marker ${marker} found in ${file}`);
        }
      }
    }
  }

  return { files, violations };
}

export function verifyStaticExport(outputDirectory) {
  const result = inspectStaticExport(outputDirectory);

  if (result.violations.length > 0) {
    throw new Error(
      `Atlas static export verification failed:\n- ${result.violations.join("\n- ")}`,
    );
  }

  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyStaticExport(EXPECTED_OUTPUT);
    console.log(
      `Atlas static export verification passed (${result.files.length} files).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
