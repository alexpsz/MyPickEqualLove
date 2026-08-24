import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_ROOT_FILES = new Set([
  ".env.example",
  ".gitattributes",
  ".gitignore",
  ".prettierignore",
  ".node-version",
  ".npmrc",
  ".prettierrc.json",
  "LICENSE",
  "README.md",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "requirements-discography.txt",
  "tsconfig.json",
]);

const ALLOWED_ROOT_DIRECTORIES = new Set([
  ".github",
  ".githooks",
  "docs",
  "public",
  "scripts",
  "src",
]);

const ALLOWED_APP_PREFIXES = ["apps/atlas/"];

const ALLOWED_ATLAS_PRODUCT_MEMORY_PREFIXES = [
  "apps/atlas/src/app/memory/",
  "apps/atlas/src/components/memory/",
  "apps/atlas/src/i18n/memory/",
];

const ALLOWED_PUBLIC_DOCS = new Set([
  "docs/equal-love-kokuritsu-2026-afterglow-day1.png",
  "docs/equal-love-mypicks-preview.png",
]);

const BLOCKED_BASENAMES = new Set([
  "agent.md",
  "agents.md",
  "claude.md",
  "live-implementation-plan.md",
]);

const BLOCKED_DIRECTORY_SEGMENTS = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".internal",
  "internal",
  "memory",
  "memories",
  ".vercel",
  ".wrangler",
]);

const PUBLIC_TEXT_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);
const LOCAL_PATH_PATTERNS = [
  { label: "Windows user-home path", pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/ },
  { label: "macOS user-home path", pattern: /\/Users\/[^/\s]+\// },
  { label: "Linux user-home path", pattern: /\/home\/[^/\s]+\// },
];

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(
      `Unable to start git ${args.join(" ")}: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    throw new Error(
      `git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`,
    );
  }

  return result.stdout;
}

function parseNullSeparated(value) {
  return value
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"));
}

function trackedPaths() {
  return parseNullSeparated(runGit(["ls-files", "-z"]));
}

function stagedPaths() {
  return parseNullSeparated(
    runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]),
  );
}

function normalizeRepositoryPath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function validateRepositoryPath(repositoryPath) {
  const path = normalizeRepositoryPath(repositoryPath);
  const lowercasePath = path.toLowerCase();
  const segments = lowercasePath.split("/");
  const basename = segments.at(-1) ?? "";
  const directorySegments = segments.slice(0, -1);
  const violations = [];

  if (BLOCKED_BASENAMES.has(basename)) {
    violations.push(
      `${path}: local-only workflow basename must never be tracked`,
    );
    return violations;
  }

  const atlasProductMemoryPrefix = ALLOWED_ATLAS_PRODUCT_MEMORY_PREFIXES.find(
    (prefix) => path.startsWith(prefix),
  );
  const atlasProductMemorySegmentIndex = atlasProductMemoryPrefix
    ? atlasProductMemoryPrefix.slice(0, -1).split("/").length - 1
    : -1;
  const blockedDirectorySegment = directorySegments.find(
    (segment, index) =>
      BLOCKED_DIRECTORY_SEGMENTS.has(segment) &&
      !(segment === "memory" && index === atlasProductMemorySegmentIndex),
  );
  if (blockedDirectorySegment) {
    violations.push(
      `${path}: path contains local-only directory ${blockedDirectorySegment}/`,
    );
    return violations;
  }

  const isEnvironmentFile = basename === ".env" || basename.startsWith(".env.");
  if (isEnvironmentFile && path !== ".env.example") {
    violations.push(
      `${path}: environment files are local-only except root .env.example`,
    );
    return violations;
  }

  if (/(^|\/)[^/]+ 2\.[^/]+$/.test(path)) {
    violations.push(`${path}: looks like an accidental copy-suffix file`);
  }

  if (path.startsWith("docs/") && !ALLOWED_PUBLIC_DOCS.has(path)) {
    violations.push(
      `${path}: docs/ is public-only and uses an explicit allowlist`,
    );
    return violations;
  }

  const [root] = path.split("/", 1);
  if (!path.includes("/")) {
    if (!ALLOWED_ROOT_FILES.has(path)) {
      violations.push(
        `${path}: root file is not in the public repository allowlist`,
      );
    }
  } else if (
    !ALLOWED_ROOT_DIRECTORIES.has(root) &&
    !ALLOWED_APP_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    violations.push(
      `${path}: top-level directory ${root}/ is not public-allowlisted`,
    );
  }

  return violations;
}

function validatePublicText(path, staged, violations) {
  const normalizedPath = normalizeRepositoryPath(path);
  const isRootDocument =
    !normalizedPath.includes("/") &&
    PUBLIC_TEXT_EXTENSIONS.has(extname(normalizedPath));
  const isDocsDocument =
    normalizedPath.startsWith("docs/") &&
    PUBLIC_TEXT_EXTENSIONS.has(extname(normalizedPath));

  if (!isRootDocument && !isDocsDocument) {
    return;
  }

  let content;
  try {
    content = staged.has(path)
      ? runGit(["show", `:${path}`])
      : readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const { label, pattern } of LOCAL_PATH_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`${path}: contains a ${label}`);
    }
  }
}

function runRepositoryBoundaryCheck() {
  const staged = new Set(stagedPaths());
  const candidates = [...new Set([...trackedPaths(), ...staged])].sort();
  const violations = [];

  for (const path of candidates) {
    violations.push(...validateRepositoryPath(path));
    validatePublicText(path, staged, violations);
  }

  if (violations.length > 0) {
    console.error("Public repository boundary check failed:\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    console.error(
      "\nKeep internal records under ignored memory/ and update the explicit public allowlist only after review.",
    );
    process.exit(1);
  }

  console.log(
    `Public repository boundary check passed (${candidates.length} tracked/staged paths).`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  runRepositoryBoundaryCheck();
}
