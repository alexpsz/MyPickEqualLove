import { spawnSync } from "node:child_process";

const probe = spawnSync("git", ["rev-parse", "--git-dir"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});

if (probe.status !== 0) {
  console.log("Skipping Git hook setup outside a repository checkout.");
  process.exit(0);
}

const configure = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (configure.status !== 0) {
  const detail = configure.stderr.trim() || configure.stdout.trim();
  console.error(
    `Unable to configure repository hooks${detail ? `: ${detail}` : ""}`,
  );
  process.exit(configure.status ?? 1);
}

console.log("Configured Git hooks from .githooks/.");
