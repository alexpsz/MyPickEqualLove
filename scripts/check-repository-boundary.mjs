import { spawnSync } from "node:child_process";
import { extname } from "node:path";
import { readFileSync } from "node:fs";

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

const ALLOWED_PUBLIC_DOCS = new Set([
  "docs/equal-love-kokuritsu-2026-afterglow-day1.png",
  "docs/equal-love-mypicks-preview.png",
]);

const BLOCKED_EXACT_PATHS = new Set([
  "agent.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/live-implementation-plan.md",
]);

const BLOCKED_PREFIXES = [
  ".agents/",
  ".claude/",
  ".codex/",
  ".internal/",
  "docs/internal/",
  "internal/",
  "memory/",
  "memories/",
];

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

function validatePath(path, violations) {
  if (BLOCKED_EXACT_PATHS.has(path)) {
    violations.push(`${path}: local-only workflow file must never be tracked`);
    return;
  }

  const blockedPrefix = BLOCKED_PREFIXES.find((prefix) =>
    path.startsWith(prefix),
  );
  if (blockedPrefix) {
    violations.push(`${path}: path is inside local-only ${blockedPrefix}`);
    return;
  }

  if (/(^|\/)[^/]+ 2\.[^/]+$/.test(path)) {
    violations.push(`${path}: looks like an accidental copy-suffix file`);
  }

  if (path.startsWith("docs/") && !ALLOWED_PUBLIC_DOCS.has(path)) {
    violations.push(
      `${path}: docs/ is public-only and uses an explicit allowlist`,
    );
    return;
  }

  const [root] = path.split("/", 1);
  if (!path.includes("/")) {
    if (!ALLOWED_ROOT_FILES.has(path)) {
      violations.push(
        `${path}: root file is not in the public repository allowlist`,
      );
    }
  } else if (!ALLOWED_ROOT_DIRECTORIES.has(root)) {
    violations.push(
      `${path}: top-level directory ${root}/ is not public-allowlisted`,
    );
  }
}

function validatePublicText(path, staged, violations) {
  const isRootDocument =
    !path.includes("/") && PUBLIC_TEXT_EXTENSIONS.has(extname(path));
  const isDocsDocument =
    path.startsWith("docs/") && PUBLIC_TEXT_EXTENSIONS.has(extname(path));

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

const staged = new Set(stagedPaths());
const candidates = [...new Set([...trackedPaths(), ...staged])].sort();
const violations = [];

for (const path of candidates) {
  validatePath(path, violations);
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
