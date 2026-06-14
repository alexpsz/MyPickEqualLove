import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "out");

const nextStaticSource = path.join(root, ".next", "static");
const nextStaticDestination = path.join(outDir, "_next", "static");

if (fs.existsSync(nextStaticSource)) {
  fs.rmSync(nextStaticDestination, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(nextStaticDestination), { recursive: true });
  fs.cpSync(nextStaticSource, nextStaticDestination, { recursive: true });
}

const publicDir = path.join(root, "public");

if (fs.existsSync(publicDir)) {
  for (const assetName of fs.readdirSync(publicDir)) {
    const source = path.join(publicDir, assetName);
    const destination = path.join(outDir, assetName);

    fs.rmSync(destination, { force: true, recursive: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
  }
}

console.log(`Synced static export assets to ${outDir}.`);
