import type { NextConfig } from "next";
import path from "node:path";
import { resolveProjectId } from "./src/schema/project";

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_PROJECT_ID);
const currentProjectRuntime = path.resolve(
  process.cwd(),
  "src",
  "projects",
  projectId,
  "runtime.ts",
);

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    resolveAlias: {
      "@current-project/runtime": currentProjectRuntime,
    },
  },
  webpack(config) {
    config.resolve.alias["@current-project/runtime"] = currentProjectRuntime;
    return config;
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
