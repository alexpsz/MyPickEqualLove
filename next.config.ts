import type { NextConfig } from "next";
import path from "node:path";
import { resolveProjectId } from "./src/schema/project";

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_PROJECT_ID);

// Webpack resolves an absolute path fine. Turbopack does not: an absolute
// Windows path reaches its resolver as a `D:\...` specifier and fails with
// "windows imports are not implemented yet", which breaks `next build` on
// Windows entirely. Turbopack accepts a repository-relative specifier, so give
// each bundler the form it can resolve.
const currentProjectRuntimePath = path.resolve(
  process.cwd(),
  "src",
  "projects",
  projectId,
  "runtime.ts",
);
const currentProjectRuntimeRelative = `./src/projects/${projectId}/runtime.ts`;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    resolveAlias: {
      "@current-project/runtime": currentProjectRuntimeRelative,
    },
  },
  webpack(config) {
    config.resolve.alias["@current-project/runtime"] =
      currentProjectRuntimePath;
    return config;
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
