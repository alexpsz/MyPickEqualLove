import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_CONTRACTS = Object.freeze({
  "equal-love": Object.freeze({
    displayName: "MY PICK =LOVE",
    siteUrl: "https://mypick.kozueginko.com",
    title: "MY PICK =LOVE | Choose your favorite ＝LOVE songs!",
  }),
  "nearly-equal-joy": Object.freeze({
    displayName: "MY PICK ≒JOY",
    siteUrl: "https://mypick-nearly-equal-joy.kozueginko.com",
    title: "MY PICK ≒JOY | Choose your favorite ≒JOY songs!",
  }),
  "not-equal-me": Object.freeze({
    displayName: "MY PICK ≠ME",
    siteUrl: "https://mypick-not-equal-me.kozueginko.com",
    title: "MY PICK ≠ME | Choose your favorite ≠ME songs!",
  }),
});

const ROUTABLE_STATUSES = new Set(["published", "archived"]);
const SONG_CATALOG_PATH = "/songs/";
const FRAMEWORK_ERROR_MARKERS = [
  "__next_error__",
  "NEXT_HTTP_ERROR_FALLBACK",
  "Application error: a client-side exception has occurred",
  '"page":"/_error"',
];
const ASSET_PATH_PREFIXES = ["/_next/static/", "/covers/", "/icons/", "/og/"];
const ASSET_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".mjs",
  ".otf",
  ".png",
  ".svg",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
]);

export async function verifyStaticExport({
  projectId,
  outputDirectory,
  repositoryRoot,
}) {
  const contract = PROJECT_CONTRACTS[projectId];
  if (!contract) {
    throw new Error(`Unknown project id: ${projectId}`);
  }

  const root = path.resolve(repositoryRoot);
  const out = path.resolve(outputDirectory);
  const projects = await loadProjectExperiences(root);
  const expectedExperiences = projects.get(projectId) ?? [];
  const songIds = await loadProjectSongIds(root, projectId);
  const foreignExperiences = Array.from(projects.entries())
    .filter(([candidateId]) => candidateId !== projectId)
    .flatMap(([, experiences]) => experiences);
  const violations = [];

  const rootHtmlPath = path.join(out, "index.html");
  const rootHtml = await readRequiredText(rootHtmlPath, violations);
  if (rootHtml !== null) {
    verifyRootIdentity(rootHtml, contract, violations);
    verifyCanonical(rootHtml, `${contract.siteUrl}/`, "index.html", violations);
    verifyNoFrameworkError(rootHtml, "index.html", violations);
    await verifySocialCard({
      html: rootHtml,
      out,
      contract,
      assetPath: `/og/${projectId}/home.png`,
      label: "index.html",
      violations,
    });
  }
  await verifyManifest(out, contract, projectId, violations);
  await verifyRscArtifact(path.join(out, "index.txt"), "index.txt", violations);
  await verifySongCatalog(out, contract, songIds, violations);

  for (const experience of expectedExperiences) {
    const routeDirectory = path.join("live", experience.slug);
    const relativePath = path.join(routeDirectory, "index.html");
    const routeHtmlPath = path.join(out, relativePath);
    const routeHtml = await readRequiredText(routeHtmlPath, violations);
    if (routeHtml !== null) {
      verifyLiveIdentity(routeHtml, experience, contract, violations);
      verifyCanonical(
        routeHtml,
        `${contract.siteUrl}${experience.canonicalPath}`,
        relativePath,
        violations,
      );
      verifyNoFrameworkError(routeHtml, relativePath, violations);
      if (experience.status === "published") {
        await verifySocialCard({
          html: routeHtml,
          out,
          contract,
          assetPath: `/og/${projectId}/live/${experience.slug}.png`,
          label: relativePath,
          violations,
        });
      }
    }
    const rscRelativePath = path.join(routeDirectory, "index.txt");
    await verifyRscArtifact(
      path.join(out, rscRelativePath),
      rscRelativePath,
      violations,
    );
    verifyAbsent(
      path.join(out, "live", `${experience.slug}.html`),
      `live/${experience.slug}.html must not replace the trailing-slash route`,
      violations,
    );
  }

  for (const experience of foreignExperiences) {
    for (const candidate of [
      path.join(out, "live", experience.slug),
      path.join(out, "live", `${experience.slug}.html`),
      path.join(out, "live", `${experience.slug}.txt`),
    ]) {
      verifyAbsent(
        candidate,
        `foreign Live route ${experience.slug} leaked into ${projectId}`,
        violations,
      );
    }
  }
  verifyAbsent(
    path.join(out, "live", "__empty-live__"),
    "the internal empty Live route leaked into the export",
    violations,
  );

  await verifySitemap(out, contract, expectedExperiences, songIds, violations);
  await verifyReferencedAssets(out, contract.siteUrl, violations);

  if (violations.length > 0) {
    throw new Error(
      `Static export verification failed for ${projectId}:\n${violations
        .map((violation) => `- ${violation}`)
        .join("\n")}`,
    );
  }

  return {
    projectId,
    routes: 2 + songIds.length + expectedExperiences.length,
  };
}

async function verifyRscArtifact(filePath, label, violations) {
  const rsc = await readRequiredText(filePath, violations);
  if (rsc === null) return;
  if (!rsc.trimStart().startsWith('1:"$Sreact.fragment"')) {
    violations.push(`${label} is not a valid static RSC payload`);
  }
  verifyNoFrameworkErrorMarkers(rsc, label, violations);
}

async function verifySongCatalog(out, contract, songIds, violations) {
  const catalogRelativePath = path.join("songs", "index.html");
  const catalogHtml = await readRequiredText(
    path.join(out, catalogRelativePath),
    violations,
  );
  if (catalogHtml !== null) {
    verifyCanonical(
      catalogHtml,
      `${contract.siteUrl}${SONG_CATALOG_PATH}`,
      catalogRelativePath,
      violations,
    );
    verifyNoFrameworkError(catalogHtml, catalogRelativePath, violations);
  }

  for (const songId of songIds) {
    const relativePath = path.join(
      "songs",
      encodeURIComponent(songId),
      "index.html",
    );
    const songHtml = await readRequiredText(
      path.join(out, relativePath),
      violations,
    );
    if (songHtml !== null) {
      verifyCanonical(
        songHtml,
        `${contract.siteUrl}${getSongCanonicalPath(songId)}`,
        relativePath,
        violations,
      );
      verifyNoFrameworkError(songHtml, relativePath, violations);
    }
  }
}

async function loadProjectExperiences(repositoryRoot) {
  const projectsDirectory = path.join(repositoryRoot, "src", "projects");
  const projects = new Map();

  for (const projectId of Object.keys(PROJECT_CONTRACTS)) {
    const sourcePath = path.join(
      projectsDirectory,
      projectId,
      "live-experiences.json",
    );
    let parsed;
    try {
      parsed = JSON.parse(await readFile(sourcePath, "utf8"));
    } catch (error) {
      throw new Error(`Unable to read ${sourcePath}: ${error.message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${sourcePath} must contain an array`);
    }
    projects.set(
      projectId,
      parsed.filter((experience) => ROUTABLE_STATUSES.has(experience?.status)),
    );
  }

  return projects;
}

async function loadProjectSongIds(repositoryRoot, projectId) {
  const sourcePath = path.join(
    repositoryRoot,
    "src",
    "projects",
    projectId,
    "songs.json",
  );
  let parsed;
  try {
    parsed = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${sourcePath}: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${sourcePath} must contain an array`);
  }

  const songIds = parsed.map((song) => song?.id);
  if (!songIds.every((songId) => typeof songId === "string" && songId)) {
    throw new Error(
      `${sourcePath} must contain songs with non-empty string ids`,
    );
  }
  return songIds;
}

function verifyRootIdentity(html, contract, violations) {
  const title = extractTitle(html);
  if (title !== contract.title) {
    violations.push(
      `index.html title must be ${JSON.stringify(contract.title)} (received ${JSON.stringify(title)})`,
    );
  }
  if (!html.includes(contract.displayName)) {
    violations.push(
      `index.html is missing project identity ${contract.displayName}`,
    );
  }
  const siteName = extractMetaContent(html, "property", "og:site_name");
  if (siteName !== contract.displayName) {
    violations.push(
      `index.html og:site_name must be ${JSON.stringify(contract.displayName)}`,
    );
  }
}

function verifyLiveIdentity(html, experience, contract, violations) {
  const title = extractTitle(html);
  const openGraphTitle = extractMetaContent(html, "property", "og:title");
  if (
    !openGraphTitle ||
    title !== `${openGraphTitle} | ${contract.displayName}`
  ) {
    violations.push(
      `live/${experience.slug}/index.html title must equal its localized og:title plus ${contract.displayName}`,
    );
  }
}

function verifyCanonical(html, expected, label, violations) {
  const canonicals = extractTags(html, "link")
    .map(parseAttributes)
    .filter((attributes) =>
      (attributes.rel ?? "").split(/\s+/).includes("canonical"),
    )
    .map((attributes) => decodeEntities(attributes.href ?? ""));
  if (canonicals.length !== 1 || canonicals[0] !== expected) {
    violations.push(
      `${label} must contain exactly one canonical ${expected} (received ${JSON.stringify(canonicals)})`,
    );
  }
}

function verifyNoFrameworkError(html, label, violations) {
  verifyNoFrameworkErrorMarkers(html, label, violations);
  const robots = extractMetaContent(html, "name", "robots");
  if (robots?.split(/\s*,\s*/).includes("noindex")) {
    violations.push(`${label} is unexpectedly marked noindex`);
  }
}

function verifyNoFrameworkErrorMarkers(content, label, violations) {
  for (const marker of FRAMEWORK_ERROR_MARKERS) {
    if (content.includes(marker)) {
      violations.push(`${label} contains framework error marker ${marker}`);
    }
  }
}

async function verifyManifest(out, contract, projectId, violations) {
  const manifestPath = path.join(out, "manifest.webmanifest");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    violations.push(
      `manifest.webmanifest is missing or invalid: ${error.message}`,
    );
    return;
  }

  for (const [field, expected] of Object.entries({
    id: "/",
    name: contract.displayName,
    start_url: "/",
    scope: "/",
    display: "standalone",
  })) {
    if (manifest[field] !== expected) {
      violations.push(
        `manifest.webmanifest ${field} must be ${JSON.stringify(expected)}`,
      );
    }
  }

  for (const size of [192, 512]) {
    const expectedSource = `/icons/install/${projectId}-${size}.png`;
    const icon = manifest.icons?.find(
      (candidate) => candidate?.src === expectedSource,
    );
    if (
      !icon ||
      icon.sizes !== `${size}x${size}` ||
      icon.type !== "image/png"
    ) {
      violations.push(
        `manifest.webmanifest must declare ${expectedSource} as a ${size}x${size} PNG`,
      );
    }
  }
}

async function verifySocialCard({
  html,
  out,
  contract,
  assetPath,
  label,
  violations,
}) {
  const expectedUrl = `${contract.siteUrl}${assetPath}`;
  const expectedMetadata = [
    ["property", "og:image", expectedUrl],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:image", expectedUrl],
    ["name", "twitter:image:width", "1200"],
    ["name", "twitter:image:height", "630"],
  ];
  for (const [attribute, key, expected] of expectedMetadata) {
    const actual = extractMetaContent(html, attribute, key);
    if (actual !== expected) {
      violations.push(
        `${label} ${key} must be ${JSON.stringify(expected)} (received ${JSON.stringify(actual)})`,
      );
    }
  }

  const imagePath = path.join(out, ...assetPath.split("/").filter(Boolean));
  let image;
  try {
    image = await readFile(imagePath);
  } catch {
    violations.push(`${label} references missing social card ${assetPath}`);
    return;
  }
  const isPng =
    image.length >= 24 &&
    image
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    image.toString("ascii", 12, 16) === "IHDR";
  if (!isPng) {
    violations.push(`${assetPath} must be a valid PNG with an IHDR header`);
    return;
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== 1200 || height !== 630) {
    violations.push(
      `${assetPath} must be 1200x630 (received ${width}x${height})`,
    );
  }
}

async function verifySitemap(out, contract, experiences, songIds, violations) {
  const sitemapPath = path.join(out, "sitemap.xml");
  const sitemap = await readRequiredText(sitemapPath, violations);
  if (sitemap === null) return;

  const actual = Array.from(
    sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/g),
    (match) => decodeEntities(match[1].trim()),
  ).sort();
  const expected = [
    `${contract.siteUrl}/`,
    `${contract.siteUrl}${SONG_CATALOG_PATH}`,
    ...songIds.map(
      (songId) => `${contract.siteUrl}${getSongCanonicalPath(songId)}`,
    ),
    ...experiences.map(
      (experience) => `${contract.siteUrl}${experience.canonicalPath}`,
    ),
  ].sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    violations.push(
      `sitemap.xml locations differ: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function getSongCanonicalPath(songId) {
  return `${SONG_CATALOG_PATH}${encodeURIComponent(songId)}/`;
}

async function verifyReferencedAssets(out, siteUrl, violations) {
  if (!existsSync(out)) return;
  const files = await walkFiles(out);
  const htmlFiles = files.filter((file) => file.endsWith(".html"));
  const cssFiles = files.filter((file) => file.endsWith(".css"));
  const literalReferenceFiles = files.filter((file) =>
    [".css", ".html", ".js", ".mjs", ".txt"].includes(
      path.extname(file).toLowerCase(),
    ),
  );
  const references = [];

  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, "utf8");
    for (const tagName of ["link", "script", "img", "source", "video"]) {
      for (const tag of extractTags(html, tagName)) {
        const attributes = parseAttributes(tag);
        for (const attributeName of ["href", "src", "poster"]) {
          if (attributes[attributeName]) {
            references.push({
              basePath: htmlPath,
              source: path.relative(out, htmlPath),
              value: attributes[attributeName],
            });
          }
        }
        for (const value of (attributes.srcset ?? "").split(",")) {
          const candidate = value.trim().split(/\s+/, 1)[0];
          if (candidate) {
            references.push({
              basePath: htmlPath,
              source: path.relative(out, htmlPath),
              value: candidate,
            });
          }
        }
      }
    }
  }

  for (const cssPath of cssFiles) {
    const css = await readFile(cssPath, "utf8");
    for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)) {
      references.push({
        basePath: cssPath,
        source: path.relative(out, cssPath),
        value: match[2],
      });
    }
  }

  for (const sourcePath of literalReferenceFiles) {
    const content = await readFile(sourcePath, "utf8");
    for (const match of content.matchAll(
      /\/(?:_next\/static|covers|icons|og)\/[^\s"'`<>()[\]{}\\]+/g,
    )) {
      references.push({
        basePath: sourcePath,
        source: path.relative(out, sourcePath),
        value: match[0],
      });
    }
  }

  for (const reference of references) {
    const assetPath = resolveAssetReference(
      reference.value,
      reference.basePath,
      out,
      siteUrl,
    );
    if (assetPath && !existsSync(assetPath)) {
      violations.push(
        `${reference.source} references missing asset ${reference.value}`,
      );
    }
  }
}

function resolveAssetReference(value, basePath, out, siteUrl) {
  const decodedValue = decodeEntities(value.trim());
  if (
    !decodedValue ||
    decodedValue.startsWith("data:") ||
    decodedValue.startsWith("blob:") ||
    decodedValue.startsWith("#")
  ) {
    return null;
  }

  let pathname;
  try {
    if (/^https?:\/\//i.test(decodedValue)) {
      const url = new URL(decodedValue);
      if (url.origin !== new URL(siteUrl).origin) return null;
      pathname = url.pathname;
    } else {
      pathname = decodedValue.split(/[?#]/, 1)[0];
    }
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const extension = path.extname(pathname).toLowerCase();
  const assetLike =
    ASSET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    ASSET_EXTENSIONS.has(extension);
  if (!assetLike) return null;

  const candidate = pathname.startsWith("/")
    ? path.resolve(out, `.${pathname}`)
    : path.resolve(path.dirname(basePath), pathname);
  const relative = path.relative(out, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.join(out, "__invalid_outside_reference__");
  }
  return candidate;
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readRequiredText(filePath, violations) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    violations.push(`missing required artifact ${filePath}`);
    return null;
  }
}

function verifyAbsent(candidate, message, violations) {
  if (existsSync(candidate)) violations.push(message);
}

function extractTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : "";
}

function extractMetaContent(html, identityAttribute, identityValue) {
  const tag = extractTags(html, "meta")
    .map(parseAttributes)
    .find(
      (attributes) =>
        attributes[identityAttribute]?.toLowerCase() ===
        identityValue.toLowerCase(),
    );
  return tag ? decodeEntities(tag.content ?? "") : undefined;
}

function extractTags(html, tagName) {
  return Array.from(
    html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi")),
    (match) => match[0],
  );
}

function parseAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(
    /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    attributes[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function runCli() {
  const options = parseCliOptions(process.argv.slice(2));
  const repositoryRoot = path.resolve(options.root ?? process.cwd());
  const outputDirectory = path.resolve(repositoryRoot, options.out ?? "out");
  const result = await verifyStaticExport({
    projectId: options.project,
    outputDirectory,
    repositoryRoot,
  });
  console.log(
    `Static export verification passed for ${result.projectId} (${result.routes} routes).`,
  );
}

function parseCliOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!["--project", "--out", "--root"].includes(argument)) {
      throw new Error(
        "Usage: node scripts/verify-static-export.mjs --project <project-id> [--out out] [--root repository-root]",
      );
    }
    options[argument.slice(2)] = args[index + 1];
    index += 1;
  }
  if (!options.project) {
    throw new Error("--project is required");
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
