import { spawn } from "node:child_process";

const PROJECT_IDS = new Set(["equal-love", "nearly-equal-joy", "not-equal-me"]);
const SCRIPT_NAMES = new Set(["dev", "build"]);

const [projectId, scriptName] = process.argv.slice(2);

if (!PROJECT_IDS.has(projectId) || !SCRIPT_NAMES.has(scriptName)) {
  console.error(
    "Usage: node scripts/run-project-command.mjs <equal-love|nearly-equal-joy|not-equal-me> <dev|build>",
  );
  process.exit(1);
}

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm" : "npm";
const child = spawn(npmCommand, ["run", scriptName], {
  env: {
    ...getSpawnEnv(),
    NEXT_PUBLIC_PROJECT_ID: projectId,
  },
  shell: isWindows,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

function getSpawnEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("="),
    ),
  );
}
