import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyStaticExport } from "./verify-static-export.mjs";

const PROJECT_IDS = new Set(["equal-love", "nearly-equal-joy", "not-equal-me"]);
const SCRIPT_NAMES = new Set(["dev", "build", "build-and-verify"]);
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [firstArgument, secondArgument] = process.argv.slice(2);

export function createStaticExportServer(outputDirectory) {
  const out = path.resolve(outputDirectory);
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      respondText(response, 400, "Bad request");
      return;
    }

    const resolution = resolveStaticRequest(out, pathname);
    if (resolution.type === "redirect") {
      response.writeHead(308, { Location: resolution.location });
      response.end();
      return;
    }
    if (resolution.type === "file") {
      response.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES.get(path.extname(resolution.filePath).toLowerCase()) ??
          "application/octet-stream",
      });
      createReadStream(resolution.filePath).pipe(response);
      return;
    }

    const fallback = path.join(out, "404.html");
    if (existsSync(fallback)) {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      createReadStream(fallback).pipe(response);
      return;
    }
    respondText(response, 404, "Not found");
  });
}

function resolveStaticRequest(out, pathname) {
  const relativePath = pathname.replace(/^\/+/, "");
  const candidate = path.resolve(out, relativePath);
  const relative = path.relative(out, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { type: "not-found" };
  }

  if (pathname.endsWith("/")) {
    const indexPath = path.join(candidate, "index.html");
    return isFile(indexPath)
      ? { type: "file", filePath: indexPath }
      : { type: "not-found" };
  }
  if (isFile(candidate)) return { type: "file", filePath: candidate };

  const directoryIndex = path.join(candidate, "index.html");
  if (isFile(directoryIndex)) {
    return { type: "redirect", location: `${pathname}/` };
  }
  return { type: "not-found" };
}

function isFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function respondText(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

async function run() {
  if (firstArgument === "serve") {
    const port = parsePort(process.env.PORT ?? "3000");
    const server = createStaticExportServer(path.join(repositoryRoot, "out"));
    server.listen(port, "127.0.0.1", () => {
      console.log(`Serving static export at http://127.0.0.1:${port}`);
    });
    return;
  }

  const projectId = firstArgument;
  const scriptName = secondArgument;
  if (!PROJECT_IDS.has(projectId) || !SCRIPT_NAMES.has(scriptName)) {
    throw new Error(
      "Usage: node scripts/run-project-command.mjs <equal-love|nearly-equal-joy|not-equal-me> <dev|build|build-and-verify>\n       node scripts/run-project-command.mjs serve",
    );
  }

  const npmScript = scriptName === "build-and-verify" ? "build" : scriptName;
  const code = await runNpmScript(npmScript, projectId);
  if (code !== 0) process.exit(code);

  if (scriptName === "build-and-verify") {
    const result = await verifyStaticExport({
      projectId,
      outputDirectory: path.join(repositoryRoot, "out"),
      repositoryRoot,
    });
    console.log(
      `Static export verification passed for ${result.projectId} (${result.routes} routes).`,
    );
  }
}

function runNpmScript(scriptName, projectId) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", scriptName], {
      env: {
        ...getSpawnEnv(),
        NEXT_PUBLIC_PROJECT_ID: projectId,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function getSpawnEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("="),
    ),
  );
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
