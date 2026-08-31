import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ATLAS_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const EXPECTED_OUTPUT = path.join(ATLAS_ROOT, "out");
const EXPECTED_NEXT = path.join(ATLAS_ROOT, ".next");

const PUBLIC_PROJECTION = JSON.parse(
  readFileSync(
    path.join(ATLAS_ROOT, "src/generated/public-atlas-projection.v1.json"),
    "utf8",
  ),
);
const EVENT_DETAIL_ROUTES = PUBLIC_PROJECTION.groups.flatMap((group) =>
  group.events.flatMap((event) => {
    const eventLocalId = event.id.split(":")[2];
    return [
      `events/${group.siteId}/${eventLocalId}`,
      ...event.performances.map(
        (performance) =>
          `events/${group.siteId}/${eventLocalId}/${performance.id.split(":")[3]}`,
      ),
    ];
  }),
);
const PRODUCT_ROUTES = [
  "",
  "events",
  ...EVENT_DETAIL_ROUTES,
  "journey",
  "local-event",
  "memory",
];
const STATIC_PRODUCT_ROUTES = [
  "",
  "events",
  "journey",
  "local-event",
  "memory",
];
const PRODUCT_HTML_FILES = PRODUCT_ROUTES.map((route) =>
  route ? `${route}/index.html` : "index.html",
);
const FALLBACK_ROUTES = ["404", "_not-found"];
const REQUIRED_NEXT_FILES = [
  "BUILD_ID",
  "app-path-routes-manifest.json",
  "build-manifest.json",
  "prerender-manifest.json",
  "routes-manifest.json",
  "server/app-paths-manifest.json",
];
const REQUIRED_NEXT_ROUTE_ENTRIES = new Map([
  ["/page", "/"],
  ["/events/page", "/events"],
  ["/events/[siteId]/[eventLocalId]/page", "/events/[siteId]/[eventLocalId]"],
  [
    "/events/[siteId]/[eventLocalId]/[performanceLocalId]/page",
    "/events/[siteId]/[eventLocalId]/[performanceLocalId]",
  ],
  ["/journey/page", "/journey"],
  ["/local-event/page", "/local-event"],
  ["/memory/page", "/memory"],
  ["/robots.txt/route", "/robots.txt"],
]);
const OPTIONAL_NEXT_ROUTE_ENTRIES = new Map([
  ["/_global-error/page", "/_global-error"],
  ["/_not-found/page", "/_not-found"],
]);
const REQUIRED_NEXT_APP_PATH_ENTRIES = new Map([
  ["/page", "app/page.js"],
  ["/events/page", "app/events/page.js"],
  [
    "/events/[siteId]/[eventLocalId]/page",
    "app/events/[siteId]/[eventLocalId]/page.js",
  ],
  [
    "/events/[siteId]/[eventLocalId]/[performanceLocalId]/page",
    "app/events/[siteId]/[eventLocalId]/[performanceLocalId]/page.js",
  ],
  ["/journey/page", "app/journey/page.js"],
  ["/local-event/page", "app/local-event/page.js"],
  ["/memory/page", "app/memory/page.js"],
  ["/robots.txt/route", "app/robots.txt/route.js"],
]);
const OPTIONAL_NEXT_APP_PATH_ENTRIES = new Map([
  ["/_global-error/page", "app/_global-error/page.js"],
  ["/_not-found/page", "app/_not-found/page.js"],
]);
const ALLOWED_BUILD_MANIFEST_ROUTE_KEYS = new Set([
  "/_app",
  "/_error",
  "/layout",
  ...REQUIRED_NEXT_ROUTE_ENTRIES.keys(),
  ...OPTIONAL_NEXT_ROUTE_ENTRIES.keys(),
]);
const EXPECTED_PUBLIC_ROUTES = new Set([
  "/",
  "/_global-error",
  "/_not-found",
  "/events",
  ...EVENT_DETAIL_ROUTES.map((route) => `/${route}`),
  "/journey",
  "/local-event",
  "/memory",
  "/robots.txt",
]);
const EXPECTED_STATIC_MANIFEST_ROUTES = new Set([
  "/",
  "/_global-error",
  "/_not-found",
  "/events",
  "/journey",
  "/local-event",
  "/memory",
  "/robots.txt",
]);
const EXPECTED_DYNAMIC_ROUTE_PROFILES = new Map([
  [
    "/events/[siteId]/[eventLocalId]",
    {
      routeKeys: ["nxtPsiteId", "nxtPeventLocalId"],
      regex: "^/events/([^/]+?)/([^/]+?)(?:/)?$",
      namedRegex:
        "^/events/(?<nxtPsiteId>[^/]+?)/(?<nxtPeventLocalId>[^/]+?)(?:/)?$",
      dataRoute: "/events/[siteId]/[eventLocalId].rsc",
      dataRouteRegex: "^/events/([^/]+?)/([^/]+?)\\.rsc$",
    },
  ],
  [
    "/events/[siteId]/[eventLocalId]/[performanceLocalId]",
    {
      routeKeys: ["nxtPsiteId", "nxtPeventLocalId", "nxtPperformanceLocalId"],
      regex: "^/events/([^/]+?)/([^/]+?)/([^/]+?)(?:/)?$",
      namedRegex:
        "^/events/(?<nxtPsiteId>[^/]+?)/(?<nxtPeventLocalId>[^/]+?)/(?<nxtPperformanceLocalId>[^/]+?)(?:/)?$",
      dataRoute: "/events/[siteId]/[eventLocalId]/[performanceLocalId].rsc",
      dataRouteRegex: "^/events/([^/]+?)/([^/]+?)/([^/]+?)\\.rsc$",
    },
  ],
]);
const FORBIDDEN_ROUTE_SEGMENTS = new Set([
  "covers",
  "event",
  "live",
  "og",
  "performance",
  "performances",
  "songs",
]);
const FORBIDDEN_OUTPUT_BASENAMES = new Set([
  "manifest.json",
  "manifest.webmanifest",
  "sitemap.xml",
  "sw.js",
]);
const INTERNAL_DOCUMENT_BASENAMES = new Set([
  "agents.md",
  "app-design-document.md",
  "architecture.md",
  "claude.md",
  "handoff.md",
  "progress.md",
  "tech-stack.md",
]);
const INTERNAL_PATH_SEGMENTS = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".internal",
  "audits",
  "evidence",
  "evidences",
  "internal",
  "memories",
  "plan",
  "plans",
  "receipt",
  "receipts",
]);
const PROVIDER_PATH_SEGMENTS = new Set([
  ".amplify",
  ".cloudflare",
  ".netlify",
  ".sst",
  ".terraform",
  ".vercel",
  ".wrangler",
]);
const PROVIDER_STATE_BASENAMES = new Set([
  ".dev.vars",
  "netlify.toml",
  "provider-state.json",
  "terraform.tfstate",
  "vercel.json",
  "wrangler.toml",
]);
const DOCUMENT_DATA_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".log",
  ".md",
  ".mdx",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
]);
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".map",
  ".md",
  ".mdx",
  ".meta",
  ".mjs",
  ".rsc",
  ".svg",
  ".toml",
  ".ts",
  ".tsbuildinfo",
  ".tsx",
  ".txt",
  ".webmanifest",
  ".xml",
  ".yaml",
  ".yml",
]);
const TEXT_BASENAMES = new Set([
  ".previewinfo",
  ".rscinfo",
  "build_id",
  "trace",
  "trace-build",
]);
const KNOWN_BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".br",
  ".eot",
  ".gif",
  ".gz",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".node",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);
const FORBIDDEN_ARCHIVE_EXTENSIONS = new Set([".br", ".gz", ".zip"]);
const INTERNAL_CONTENT_MARKERS = [
  { label: "AGENTS.md", pattern: /\bAGENTS\.md\b/i },
  {
    label: "internal memory document",
    pattern:
      /\bmemory[\\/]+(?:progress|architecture|app-design-document|tech-stack)\.md\b/i,
  },
  {
    label: "Atlas internal plan",
    pattern: /\batlas-portal-(?:adr|implementation-plan)\.md\b/i,
  },
  {
    label: "E1 source-use receipt",
    pattern: /\batlas-public-event-source-go-hold-v1\b/i,
  },
  {
    label: "C0 baseline receipt",
    pattern: /\bATLAS_C0_BASELINE_RECEIPT\b/,
  },
];
const PROVIDER_CONTENT_MARKERS = [
  {
    label: "Vercel project state",
    pattern: /\.vercel[\\/]+project\.json\b/i,
  },
  {
    label: "Wrangler local state",
    pattern: /\.wrangler[\\/]+state(?:[\\/]|\b)/i,
  },
  { label: "Terraform state", pattern: /\bterraform\.tfstate\b/i },
  {
    label: "Vercel provider identifier",
    pattern: /\bVERCEL_(?:ORG|PROJECT)_ID\b/,
  },
  {
    label: "Cloudflare provider credential",
    pattern: /\bCLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN)\b/,
  },
];
const MY_PICK_CONTENT_MARKERS = [
  {
    label: "@current-project/runtime",
    pattern: /@current-project\/runtime/,
  },
  {
    label: "NEXT_PUBLIC_PROJECT_ID",
    pattern: /\bNEXT_PUBLIC_PROJECT_ID\b/,
  },
  {
    label: "CURRENT_PROJECT_RUNTIME",
    pattern: /\bCURRENT_PROJECT_RUNTIME\b/,
  },
  { label: "MyPick export realm", pattern: /#__mypick_/i },
  { label: "MyPick export protocol", pattern: /\bmypick-export:/i },
  { label: "PickExperienceClient", pattern: /\bPickExperienceClient\b/ },
  { label: "ExportBoard", pattern: /\bExportBoard\b/ },
  {
    label: "MyPick project image",
    pattern: /\b(?:EqualLove|NearlyEqualJoy|NotEqualMe)_MyPicks\.png\b/i,
  },
  {
    label: "MyPick project source artifact",
    pattern:
      /src[\\/]+projects[\\/]+(?:equal-love|nearly-equal-joy|not-equal-me)[\\/]+(?:live-experiences|members|runtime|songs)(?:\.[a-z0-9_-]+)?\b/i,
  },
  {
    label: "MyPick storage key",
    pattern:
      /\b(?:equal_love|nearly_equal_joy|not_equal_me)_(?:board_library|install_hint|mypicks|onboarding|options|oshimen|song_discovery|standard_pick_assistant|theme_preference)(?:_[a-z0-9_-]+)?\b/i,
  },
];

export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function stable(values) {
  return [...new Set(values)].sort();
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function relativeFilePath(directory, relativePath) {
  return path.join(directory, ...relativePath.split("/"));
}

function inspectDirectory(directory, label, violations) {
  const root = path.resolve(directory);
  const files = [];

  if (!existsSync(root)) {
    violations.push(`${label}: missing directory`);
    return { directory: root, exists: false, files };
  }

  try {
    const rootStats = lstatSync(root);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      violations.push(`${label}: root must be a real directory`);
      return { directory: root, exists: false, files };
    }
  } catch {
    violations.push(`${label}: unable to inspect directory`);
    return { directory: root, exists: false, files };
  }

  function walk(absoluteDirectory, prefix = "") {
    let entries;
    try {
      entries = readdirSync(absoluteDirectory, { withFileTypes: true }).sort(
        (left, right) =>
          left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
    } catch {
      violations.push(`${label}: unable to read directory: ${prefix || "."}`);
      return;
    }

    for (const entry of entries) {
      const relativePath = normalizeRelativePath(path.join(prefix, entry.name));
      const absolutePath = path.join(absoluteDirectory, entry.name);
      let stats;
      try {
        stats = lstatSync(absolutePath);
      } catch {
        violations.push(`${label}: unable to inspect entry: ${relativePath}`);
        continue;
      }

      if (stats.isSymbolicLink()) {
        violations.push(
          `${label}: symbolic link is not allowed: ${relativePath}`,
        );
      } else if (stats.isDirectory()) {
        walk(absolutePath, relativePath);
      } else if (stats.isFile()) {
        files.push(relativePath);
      } else {
        violations.push(
          `${label}: special filesystem entry is not allowed: ${relativePath}`,
        );
      }
    }
  }

  walk(root);
  return { directory: root, exists: true, files: stable(files) };
}

function isKnownTextPath(relativePath) {
  const basename = path.posix.basename(relativePath).toLowerCase();
  return (
    TEXT_BASENAMES.has(basename) ||
    TEXT_EXTENSIONS.has(path.posix.extname(basename))
  );
}

function isKnownBinaryPath(relativePath) {
  const lowerPath = relativePath.toLowerCase();
  const extension = path.posix.extname(lowerPath);
  return (
    KNOWN_BINARY_EXTENSIONS.has(extension) ||
    lowerPath.endsWith(".pack") ||
    lowerPath.endsWith(".pack.old")
  );
}

function binaryExtension(relativePath) {
  const lowerPath = relativePath.toLowerCase();
  if (lowerPath.endsWith(".pack.old")) return ".pack.old";
  if (lowerPath.endsWith(".pack")) return ".pack";
  return path.posix.extname(lowerPath);
}

function startsWithBytes(buffer, bytes) {
  return (
    buffer.length >= bytes.length &&
    bytes.every((byte, index) => buffer[index] === byte)
  );
}

function startsWithAscii(buffer, value, offset = 0) {
  return (
    buffer.length >= offset + value.length &&
    buffer.subarray(offset, offset + value.length).toString("ascii") === value
  );
}

function hasIsoBaseMediaMagic(buffer, brands = null) {
  if (!startsWithAscii(buffer, "ftyp", 4)) return false;
  if (brands === null) return true;
  const limit = Math.min(buffer.length - 3, 64);
  for (let offset = 8; offset < limit; offset += 4) {
    if (brands.has(buffer.subarray(offset, offset + 4).toString("ascii"))) {
      return true;
    }
  }
  return false;
}

function hasBinaryMagic(relativePath, buffer) {
  switch (binaryExtension(relativePath)) {
    case ".avif":
      return hasIsoBaseMediaMagic(buffer, new Set(["avif", "avis"]));
    case ".bmp":
      return startsWithAscii(buffer, "BM");
    case ".eot":
      return buffer.length >= 36 && buffer[34] === 0x4c && buffer[35] === 0x50;
    case ".gif":
      return (
        startsWithAscii(buffer, "GIF87a") || startsWithAscii(buffer, "GIF89a")
      );
    case ".heic":
      return hasIsoBaseMediaMagic(
        buffer,
        new Set(["heic", "heix", "hevc", "hevx", "mif1"]),
      );
    case ".heif":
      return hasIsoBaseMediaMagic(buffer, new Set(["heif", "mif1", "msf1"]));
    case ".ico":
      return startsWithBytes(buffer, [0x00, 0x00, 0x01, 0x00]);
    case ".jpeg":
    case ".jpg":
      return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
    case ".mov":
    case ".mp4":
      return hasIsoBaseMediaMagic(buffer);
    case ".mp3":
      return (
        startsWithAscii(buffer, "ID3") ||
        (buffer.length >= 2 &&
          buffer[0] === 0xff &&
          (buffer[1] & 0xe0) === 0xe0)
      );
    case ".mpeg":
      return (
        startsWithBytes(buffer, [0x00, 0x00, 0x01, 0xba]) ||
        startsWithBytes(buffer, [0x00, 0x00, 0x01, 0xb3])
      );
    case ".node":
      return (
        startsWithAscii(buffer, "MZ") ||
        startsWithBytes(buffer, [0x7f, 0x45, 0x4c, 0x46]) ||
        [
          [0xfe, 0xed, 0xfa, 0xce],
          [0xfe, 0xed, 0xfa, 0xcf],
          [0xce, 0xfa, 0xed, 0xfe],
          [0xcf, 0xfa, 0xed, 0xfe],
        ].some((magic) => startsWithBytes(buffer, magic))
      );
    case ".ogg":
      return startsWithAscii(buffer, "OggS");
    case ".otf":
      return startsWithAscii(buffer, "OTTO");
    case ".pack":
    case ".pack.old":
      return startsWithAscii(buffer, "wpc");
    case ".pdf":
      return startsWithAscii(buffer, "%PDF-");
    case ".png":
      return startsWithBytes(
        buffer,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case ".ttf":
      return (
        startsWithBytes(buffer, [0x00, 0x01, 0x00, 0x00]) ||
        startsWithAscii(buffer, "true") ||
        startsWithAscii(buffer, "typ1") ||
        startsWithAscii(buffer, "ttcf")
      );
    case ".wasm":
      return startsWithBytes(buffer, [0x00, 0x61, 0x73, 0x6d]);
    case ".wav":
      return (
        startsWithAscii(buffer, "RIFF") && startsWithAscii(buffer, "WAVE", 8)
      );
    case ".webm":
      return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
    case ".webp":
      return (
        startsWithAscii(buffer, "RIFF") && startsWithAscii(buffer, "WEBP", 8)
      );
    case ".woff":
      return startsWithAscii(buffer, "wOFF");
    case ".woff2":
      return startsWithAscii(buffer, "wOF2");
    default:
      return false;
  }
}

function readPrefix(filePath, byteCount) {
  const descriptor = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(byteCount);
    const bytesRead = readSync(descriptor, buffer, 0, byteCount, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

function looksLikeUtf8Text(buffer) {
  if (buffer.includes(0)) return false;
  for (let trimmedBytes = 0; trimmedBytes <= 3; trimmedBytes += 1) {
    if (trimmedBytes > buffer.length) break;
    let decoded;
    try {
      decoded = UTF8_DECODER.decode(
        buffer.subarray(0, buffer.length - trimmedBytes),
      );
    } catch {
      continue;
    }
    let containsBinaryControl = false;
    for (const character of decoded) {
      const code = character.codePointAt(0);
      if (code !== undefined && code < 32 && !"\t\n\r".includes(character)) {
        containsBinaryControl = true;
        break;
      }
    }
    if (!containsBinaryControl) return true;
  }
  return false;
}

function readTextArtifacts(inspection, label, violations) {
  const textFiles = new Map();
  if (!inspection.exists) return textFiles;

  for (const relativePath of inspection.files) {
    const absolutePath = relativeFilePath(inspection.directory, relativePath);
    let stats;
    try {
      stats = lstatSync(absolutePath);
    } catch {
      violations.push(`${label}: unable to inspect file: ${relativePath}`);
      continue;
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      violations.push(
        `${label}: file changed during inspection: ${relativePath}`,
      );
      continue;
    }

    let prefix;
    try {
      prefix = readPrefix(absolutePath, Math.min(stats.size, 4096));
    } catch {
      violations.push(`${label}: unable to sniff file: ${relativePath}`);
      continue;
    }

    const prefixLooksText = looksLikeUtf8Text(prefix);
    const shouldRead = isKnownTextPath(relativePath) || prefixLooksText;
    const knownBinary = isKnownBinaryPath(relativePath);
    const extension = binaryExtension(relativePath);
    if (FORBIDDEN_ARCHIVE_EXTENSIONS.has(extension)) {
      violations.push(
        `${label}: archive or compressed artifact is not allowed: ${relativePath}`,
      );
      if (!prefixLooksText) continue;
    } else if (knownBinary) {
      if (hasBinaryMagic(relativePath, prefix)) continue;
      violations.push(
        `${label}: binary file does not match ${extension} magic: ${relativePath}`,
      );
      if (!prefixLooksText) continue;
    } else if (!shouldRead) {
      violations.push(
        `${label}: unrecognized binary file type is not allowed: ${relativePath}`,
      );
      continue;
    }
    if (stats.size > MAX_TEXT_FILE_BYTES) {
      violations.push(
        `${label}: text file exceeds ${MAX_TEXT_FILE_BYTES} bytes: ${relativePath}`,
      );
      continue;
    }

    try {
      const buffer = readFileSync(absolutePath);
      if (buffer.length > MAX_TEXT_FILE_BYTES) {
        violations.push(
          `${label}: text file exceeds ${MAX_TEXT_FILE_BYTES} bytes: ${relativePath}`,
        );
        continue;
      }
      const content = UTF8_DECODER.decode(buffer);
      if (content.includes("\u0000")) {
        violations.push(`${label}: text file contains NUL: ${relativePath}`);
        continue;
      }
      textFiles.set(relativePath, content);
    } catch {
      violations.push(
        `${label}: text file is not valid UTF-8: ${relativePath}`,
      );
    }
  }
  return textFiles;
}

function isAllowedProductMemoryPath(label, lowerPath) {
  if (label === "out") {
    return (
      lowerPath.startsWith("memory/") ||
      lowerPath.startsWith("_next/static/chunks/app/memory/")
    );
  }
  return (
    lowerPath.startsWith("server/app/memory/") ||
    lowerPath.startsWith("server/app/memory.") ||
    lowerPath.startsWith("static/chunks/app/memory/") ||
    lowerPath.startsWith("types/app/memory/")
  );
}

function inspectArtifactPath(relativePath, label, violations) {
  const lowerPath = relativePath.toLowerCase();
  const segments = lowerPath.split("/");
  const basename = segments.at(-1) ?? "";
  const extension = path.posix.extname(basename);
  const stem = basename.slice(0, basename.length - extension.length);

  if (INTERNAL_DOCUMENT_BASENAMES.has(basename)) {
    violations.push(
      `${label}: internal document path is not allowed: ${relativePath}`,
    );
  }
  if (extension === ".md" || extension === ".mdx") {
    violations.push(
      `${label}: Markdown artifact is not allowed: ${relativePath}`,
    );
  }
  if (segments.some((segment) => INTERNAL_PATH_SEGMENTS.has(segment))) {
    violations.push(`${label}: internal path is not allowed: ${relativePath}`);
  }
  if (
    segments.includes("memory") &&
    !isAllowedProductMemoryPath(label, lowerPath)
  ) {
    violations.push(
      `${label}: internal memory path is not allowed: ${relativePath}`,
    );
  }
  if (segments.some((segment) => PROVIDER_PATH_SEGMENTS.has(segment))) {
    violations.push(
      `${label}: provider state path is not allowed: ${relativePath}`,
    );
  }
  if (
    PROVIDER_STATE_BASENAMES.has(basename) ||
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename.endsWith(".tfstate")
  ) {
    violations.push(
      `${label}: provider state file is not allowed: ${relativePath}`,
    );
  }
  if (/(?:^|[-_.])receipts?(?:$|[-_.])/.test(stem)) {
    violations.push(
      `${label}: receipt artifact is not allowed: ${relativePath}`,
    );
  }
  if (
    DOCUMENT_DATA_EXTENSIONS.has(extension) &&
    (/(?:^|[-_.])evidence(?:$|[-_.])/.test(stem) ||
      /(?:^|[-_.])plans?(?:$|[-_.])/.test(stem))
  ) {
    violations.push(
      `${label}: internal planning artifact is not allowed: ${relativePath}`,
    );
  }
  if (
    label === ".next" &&
    ["manifest.json", "manifest.webmanifest", "sw.js"].includes(basename)
  ) {
    violations.push(
      `${label}: stale PWA artifact is not allowed: ${relativePath}`,
    );
  }
  for (const marker of MY_PICK_CONTENT_MARKERS) {
    if (marker.pattern.test(relativePath)) {
      violations.push(
        `${label}: MyPick artifact marker ${marker.label} found in path: ${relativePath}`,
      );
    }
  }
  const forbiddenRouteSegment = segments.find((segment) =>
    FORBIDDEN_ROUTE_SEGMENTS.has(segment),
  );
  if (forbiddenRouteSegment) {
    violations.push(
      `${label}: foreign route segment ${forbiddenRouteSegment} is not allowed: ${relativePath}`,
    );
  }
}

function routeArtifactPaths(route) {
  const prefix = route ? `${route}/` : "";
  const paths = new Set([
    `${prefix}index.html`,
    `${prefix}index.txt`,
    `${prefix}__next._full.txt`,
    `${prefix}__next._head.txt`,
    `${prefix}__next._index.txt`,
    `${prefix}__next._tree.txt`,
  ]);
  if (route) {
    paths.add(`${prefix}__next.${route}.txt`);
    paths.add(`${prefix}__next.${route}/__PAGE__.txt`);
  } else {
    paths.add("__next.__PAGE__.txt");
  }
  return paths;
}

function dynamicEventRouteArtifactPaths(route) {
  const prefix = `${route}/`;
  const paths = new Set([
    `${prefix}index.html`,
    `${prefix}index.txt`,
    `${prefix}__next._full.txt`,
    `${prefix}__next._head.txt`,
    `${prefix}__next._index.txt`,
    `${prefix}__next._tree.txt`,
    `${prefix}__next.events.txt`,
  ]);
  const routeParameters = ["$d$siteId", "$d$eventLocalId"];
  if (route.split("/").length === 4) {
    routeParameters.push("$d$performanceLocalId");
  }
  let segmentPath = `${prefix}__next.events`;
  for (const parameter of routeParameters) {
    segmentPath = `${segmentPath}/${parameter}`;
    paths.add(`${segmentPath}.txt`);
  }
  paths.add(`${segmentPath}/__PAGE__.txt`);
  return paths;
}

const ALLOWED_OUTPUT_ROUTE_ARTIFACTS = new Set([
  ...STATIC_PRODUCT_ROUTES.flatMap((route) => [...routeArtifactPaths(route)]),
  ...EVENT_DETAIL_ROUTES.flatMap((route) => [
    ...dynamicEventRouteArtifactPaths(route),
  ]),
  ...FALLBACK_ROUTES.flatMap((route) => [...routeArtifactPaths(route)]),
]);
ALLOWED_OUTPUT_ROUTE_ARTIFACTS.add("404.html");
ALLOWED_OUTPUT_ROUTE_ARTIFACTS.add("_not-found.html");
ALLOWED_OUTPUT_ROUTE_ARTIFACTS.add("robots.txt");

const PAGE_ROUTE_DIRECTORIES = new Set([
  "_global-error",
  "_not-found",
  "events",
  "journey",
  "local-event",
  "memory",
]);

const EVENT_APP_PAGE_PATTERN =
  /^events(?:\/\[siteId\]\/\[eventLocalId\](?:\/\[performanceLocalId\])?)?\/page/;

function isAcceptedConcreteEventArtifact(remainder) {
  return EVENT_DETAIL_ROUTES.some(
    (route) =>
      (/\.(?:html|meta|rsc)$/.test(remainder) &&
        remainder === `${route}.html`) ||
      remainder === `${route}.meta` ||
      remainder === `${route}.rsc` ||
      remainder.startsWith(`${route}.segments/`),
  );
}

function isAllowedStaticAppArtifact(remainder) {
  if (EVENT_APP_PAGE_PATTERN.test(remainder)) {
    return /page(?:[-._][a-z0-9_-]+)?\.js(?:\.map)?$/i.test(remainder);
  }
  const segments = remainder.split("/");
  if (segments.length === 1) {
    return /^(?:layout|page)(?:[-._][a-z0-9_-]+)?\.js(?:\.map)?$/i.test(
      segments[0],
    );
  }
  if (segments.length !== 2) return false;
  const [route, file] = segments;
  if (PAGE_ROUTE_DIRECTORIES.has(route)) {
    return /^page(?:[-._][a-z0-9_-]+)?\.js(?:\.map)?$/i.test(file);
  }
  if (route === "robots.txt") {
    return /^route(?:[-._][a-z0-9_-]+)?\.js(?:\.map)?$/i.test(file);
  }
  return false;
}

function isAllowedServerAppArtifact(remainder) {
  if (EVENT_APP_PAGE_PATTERN.test(remainder)) {
    return /page(?:\.js(?:\.nft\.json)?|_client-reference-manifest\.js)$/i.test(
      remainder,
    );
  }
  if (isAcceptedConcreteEventArtifact(remainder)) return true;
  const segments = remainder.split("/");
  if (segments.length === 1) {
    return (
      /^(?:layout|page)(?:\.js(?:\.nft\.json)?|_client-reference-manifest\.js)$/i.test(
        segments[0],
      ) ||
      /^(?:index|events|journey|local-event|memory|_global-error|_not-found)\.(?:html|meta|rsc)$/i.test(
        segments[0],
      ) ||
      /^robots\.txt\.(?:body|meta)$/i.test(segments[0])
    );
  }

  const [first, ...rest] = segments;
  if (PAGE_ROUTE_DIRECTORIES.has(first) && rest.length === 1) {
    return /^page(?:\.js(?:\.nft\.json)?|_client-reference-manifest\.js)$/i.test(
      rest[0],
    );
  }
  if (first === "robots.txt" && rest.length === 1) {
    return /^route(?:\.js(?:\.nft\.json)?|_client-reference-manifest\.js)$/i.test(
      rest[0],
    );
  }

  const segmentRoute =
    /^(index|events|journey|local-event|memory|_global-error|_not-found)\.segments$/i.exec(
      first,
    );
  return (
    segmentRoute !== null &&
    rest.length > 0 &&
    rest.at(-1)?.endsWith(".segment.rsc") === true
  );
}

function isAllowedTypesAppArtifact(remainder) {
  if (EVENT_APP_PAGE_PATTERN.test(remainder))
    return remainder.endsWith("/page.ts");
  const segments = remainder.split("/");
  if (segments.length === 1) return /^(?:layout|page)\.ts$/i.test(segments[0]);
  if (segments.length !== 2) return false;
  const [route, file] = segments;
  if (PAGE_ROUTE_DIRECTORIES.has(route)) return file === "page.ts";
  return route === "robots.txt" && file === "route.ts";
}

function isAllowedOutputFile(relativePath) {
  if (ALLOWED_OUTPUT_ROUTE_ARTIFACTS.has(relativePath)) return true;
  if (!relativePath.startsWith("_next/static/")) return false;
  const appPrefix = "_next/static/chunks/app/";
  return (
    !relativePath.startsWith(appPrefix) ||
    isAllowedStaticAppArtifact(relativePath.slice(appPrefix.length))
  );
}

function inspectOutputFiles(files, violations) {
  for (const requiredFile of [...PRODUCT_HTML_FILES, "robots.txt"]) {
    if (!files.includes(requiredFile)) {
      violations.push(`out: missing required file: ${requiredFile}`);
    }
  }
  if (!files.some((file) => file.startsWith("_next/static/"))) {
    violations.push("out: missing required assets: _next/static/");
  }

  for (const file of files) {
    const basename = path.posix.basename(file).toLowerCase();
    if (FORBIDDEN_OUTPUT_BASENAMES.has(basename)) {
      if (basename === "sitemap.xml") {
        violations.push(
          `out: sitemap.xml must be absent until a production domain is authorized: ${file}`,
        );
      } else {
        violations.push(`out: forbidden output file: ${file}`);
      }
    } else if (!isAllowedOutputFile(file)) {
      violations.push(`out: unexpected export artifact: ${file}`);
    }

    if (file.endsWith(".html") && !PRODUCT_HTML_FILES.includes(file)) {
      const allowedFallback =
        file === "404.html" ||
        file === "_not-found.html" ||
        FALLBACK_ROUTES.some((route) => file === `${route}/index.html`);
      if (!allowedFallback) {
        violations.push(`out: unexpected HTML route: ${file}`);
      }
    }
  }
}

function parseHtmlAttributes(tag) {
  const attributes = new Map();
  const source = tag.replace(/^<\/?[a-z0-9:-]+/i, "").replace(/>$/, "");
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
}

function robotsMetaTokens(html) {
  const tokens = new Set();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseHtmlAttributes(tag);
    if (attributes.get("name")?.toLowerCase() !== "robots") continue;
    for (const token of (attributes.get("content") ?? "")
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter(Boolean)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function inspectHtmlMetadata(file, html, violations) {
  const robots = robotsMetaTokens(html);
  if (PRODUCT_HTML_FILES.includes(file)) {
    if (!robots.has("noindex") || !robots.has("nofollow")) {
      violations.push(
        `out: product HTML must contain noindex and nofollow: ${file}`,
      );
    }
    if (robots.has("index") || robots.has("follow")) {
      violations.push(
        `out: product HTML has conflicting robots tokens: ${file}`,
      );
    }
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = parseHtmlAttributes(tag);
    const relTokens = new Set(
      (attributes.get("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean),
    );
    if (relTokens.has("canonical")) {
      violations.push(`out: canonical metadata is not authorized: ${file}`);
    }
    if (relTokens.has("manifest")) {
      violations.push(`out: manifest metadata is not authorized: ${file}`);
    }
  }
  if (/<base\b[^>]*>/i.test(html) || /\bmetadataBase\b/i.test(html)) {
    violations.push(`out: metadataBase output is not authorized: ${file}`);
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseHtmlAttributes(tag);
    const key = (
      attributes.get("property") ??
      attributes.get("name") ??
      ""
    ).toLowerCase();
    if (key === "og:url") {
      violations.push(`out: og:url metadata is not authorized: ${file}`);
    }
    if (key === "twitter:url") {
      violations.push(`out: Twitter URL metadata is not authorized: ${file}`);
    }
  }
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    const attributes = parseHtmlAttributes(tag);
    if (attributes.get("type")?.toLowerCase() === "application/ld+json") {
      violations.push(`out: JSON-LD metadata is not authorized: ${file}`);
    }
  }
}

function inspectRobotsFile(content, violations) {
  const directives = [];
  for (const line of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const withoutComment = line.split("#", 1)[0].trim();
    if (!withoutComment) continue;
    const match = /^([^:]+):(.*)$/.exec(withoutComment);
    if (!match) {
      violations.push(
        "out: robots.txt must contain only User-agent: * and Disallow: /",
      );
      return;
    }
    directives.push([match[1].trim().toLowerCase(), match[2].trim()]);
  }
  const valid =
    directives.length === 2 &&
    directives[0][0] === "user-agent" &&
    directives[0][1] === "*" &&
    directives[1][0] === "disallow" &&
    directives[1][1] === "/";
  if (!valid) {
    violations.push(
      "out: robots.txt must contain only User-agent: * and Disallow: /",
    );
  }
}

function inspectBuildRouteManifest(textFiles, violations) {
  const file = "app-path-routes-manifest.json";
  const content = textFiles.get(file);
  if (content === undefined) return;
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    violations.push(`.next: invalid JSON: ${file}`);
    return;
  }
  if (
    manifest === null ||
    Array.isArray(manifest) ||
    typeof manifest !== "object"
  ) {
    violations.push(`.next: invalid route manifest shape: ${file}`);
    return;
  }

  const allowedEntries = new Map([
    ...REQUIRED_NEXT_ROUTE_ENTRIES,
    ...OPTIONAL_NEXT_ROUTE_ENTRIES,
  ]);
  for (const [routeKey, outputRoute] of REQUIRED_NEXT_ROUTE_ENTRIES) {
    if (manifest[routeKey] !== outputRoute) {
      violations.push(
        `.next: missing required route manifest entry: ${routeKey} -> ${outputRoute}`,
      );
    }
  }
  for (const [routeKey, outputRoute] of Object.entries(manifest)) {
    if (allowedEntries.get(routeKey) !== outputRoute) {
      violations.push(
        `.next: unexpected route manifest entry: ${routeKey} -> ${String(outputRoute)}`,
      );
    }
  }
}

function inspectServerAppPathsManifest(textFiles, violations) {
  const file = "server/app-paths-manifest.json";
  const content = textFiles.get(file);
  if (content === undefined) return;
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    violations.push(`.next: invalid JSON: ${file}`);
    return;
  }
  if (
    manifest === null ||
    Array.isArray(manifest) ||
    typeof manifest !== "object"
  ) {
    violations.push(`.next: invalid route manifest shape: ${file}`);
    return;
  }

  const allowedEntries = new Map([
    ...REQUIRED_NEXT_APP_PATH_ENTRIES,
    ...OPTIONAL_NEXT_APP_PATH_ENTRIES,
  ]);
  for (const [routeKey, artifactPath] of REQUIRED_NEXT_APP_PATH_ENTRIES) {
    if (manifest[routeKey] !== artifactPath) {
      violations.push(
        `.next: missing required server app path entry: ${routeKey} -> ${artifactPath}`,
      );
    }
  }
  for (const [routeKey, artifactPath] of Object.entries(manifest)) {
    if (allowedEntries.get(routeKey) !== artifactPath) {
      violations.push(
        `.next: unexpected server app path entry: ${routeKey} -> ${String(artifactPath)}`,
      );
    }
  }
}

function exactStringSet(values, expected) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string")
  ) {
    return false;
  }
  const actual = new Set(values);
  return (
    actual.size === values.length &&
    values.length === expected.size &&
    actual.size === expected.size &&
    [...actual].every((value) => expected.has(value))
  );
}

function inspectRoutesManifest(textFiles, violations) {
  const file = "routes-manifest.json";
  const content = textFiles.get(file);
  if (content === undefined) return;
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    violations.push(`.next: invalid JSON: ${file}`);
    return;
  }
  if (
    manifest === null ||
    Array.isArray(manifest) ||
    typeof manifest !== "object"
  ) {
    violations.push(`.next: invalid route manifest shape: ${file}`);
    return;
  }

  const staticRoutePages = Array.isArray(manifest.staticRoutes)
    ? manifest.staticRoutes.map((route) => route?.page)
    : null;
  if (!exactStringSet(staticRoutePages, EXPECTED_STATIC_MANIFEST_ROUTES)) {
    violations.push(
      `.next: ${file} static routes do not match the exact Atlas profile`,
    );
  }
  const dynamicRoutePages = Array.isArray(manifest.dynamicRoutes)
    ? manifest.dynamicRoutes.map((route) => route?.page)
    : null;
  if (
    !exactStringSet(
      dynamicRoutePages,
      new Set(EXPECTED_DYNAMIC_ROUTE_PROFILES.keys()),
    )
  ) {
    violations.push(
      `.next: ${file} dynamic routes do not match the exact static-param Atlas profile`,
    );
  } else {
    for (const route of manifest.dynamicRoutes) {
      const profile = EXPECTED_DYNAMIC_ROUTE_PROFILES.get(route.page);
      const routeKeys =
        route.routeKeys !== null &&
        !Array.isArray(route.routeKeys) &&
        typeof route.routeKeys === "object"
          ? Object.keys(route.routeKeys)
          : null;
      if (
        profile === undefined ||
        !exactStringSet(routeKeys, new Set(profile.routeKeys)) ||
        Object.entries(route.routeKeys).some(([key, value]) => value !== key) ||
        route.regex !== profile.regex ||
        route.namedRegex !== profile.namedRegex
      ) {
        violations.push(
          `.next: ${file} dynamic route metadata is not exact for ${String(route.page)}`,
        );
      }
    }
  }
  if (!Array.isArray(manifest.dataRoutes) || manifest.dataRoutes.length) {
    violations.push(`.next: ${file} must not contain data routes`);
  }
}

function inspectPrerenderManifest(textFiles, violations) {
  const file = "prerender-manifest.json";
  const content = textFiles.get(file);
  if (content === undefined) return;
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    violations.push(`.next: invalid JSON: ${file}`);
    return;
  }
  if (
    manifest === null ||
    Array.isArray(manifest) ||
    typeof manifest !== "object"
  ) {
    violations.push(`.next: invalid route manifest shape: ${file}`);
    return;
  }

  const routeKeys =
    manifest.routes !== null &&
    !Array.isArray(manifest.routes) &&
    typeof manifest.routes === "object"
      ? Object.keys(manifest.routes)
      : null;
  if (!exactStringSet(routeKeys, EXPECTED_PUBLIC_ROUTES)) {
    violations.push(
      `.next: ${file} routes do not match the exact Atlas profile`,
    );
  }
  const dynamicRouteKeys =
    manifest.dynamicRoutes !== null &&
    !Array.isArray(manifest.dynamicRoutes) &&
    typeof manifest.dynamicRoutes === "object"
      ? Object.keys(manifest.dynamicRoutes)
      : null;
  if (
    !exactStringSet(
      dynamicRouteKeys,
      new Set(EXPECTED_DYNAMIC_ROUTE_PROFILES.keys()),
    )
  ) {
    violations.push(
      `.next: ${file} dynamic routes do not match the exact static-param Atlas profile`,
    );
  } else {
    for (const [route, profile] of EXPECTED_DYNAMIC_ROUTE_PROFILES) {
      const entry = manifest.dynamicRoutes[route];
      if (
        entry === null ||
        Array.isArray(entry) ||
        typeof entry !== "object" ||
        entry.fallback !== false ||
        !Array.isArray(entry.fallbackRootParams) ||
        entry.fallbackRootParams.length !== 0 ||
        !Array.isArray(entry.fallbackRouteParams) ||
        entry.fallbackRouteParams.length !== 0 ||
        entry.routeRegex !== profile.regex ||
        entry.dataRoute !== profile.dataRoute ||
        entry.dataRouteRegex !== profile.dataRouteRegex ||
        entry.prefetchDataRoute !== null
      ) {
        violations.push(
          `.next: ${file} dynamic route is not a closed static-param route: ${route}`,
        );
      }
    }
  }
  if (
    !Array.isArray(manifest.notFoundRoutes) ||
    manifest.notFoundRoutes.length
  ) {
    violations.push(`.next: ${file} must not contain not-found route entries`);
  }
}

function inspectBuildManifestRouteKeys(textFiles, violations) {
  for (const file of ["build-manifest.json", "app-build-manifest.json"]) {
    const content = textFiles.get(file);
    if (content === undefined) continue;
    let manifest;
    try {
      manifest = JSON.parse(content);
    } catch {
      violations.push(`.next: invalid JSON: ${file}`);
      continue;
    }
    if (
      manifest === null ||
      Array.isArray(manifest) ||
      typeof manifest !== "object"
    ) {
      violations.push(`.next: invalid build manifest shape: ${file}`);
      continue;
    }

    const routeKeys = Object.keys(manifest).filter((key) =>
      key.startsWith("/"),
    );
    if (Object.hasOwn(manifest, "pages")) {
      if (
        manifest.pages === null ||
        Array.isArray(manifest.pages) ||
        typeof manifest.pages !== "object"
      ) {
        violations.push(`.next: invalid build manifest pages map: ${file}`);
        continue;
      }
      routeKeys.push(...Object.keys(manifest.pages));
    }
    for (const routeKey of stable(routeKeys)) {
      if (!ALLOWED_BUILD_MANIFEST_ROUTE_KEYS.has(routeKey)) {
        violations.push(
          `.next: unexpected build manifest route key in ${file}: ${routeKey}`,
        );
      }
    }
  }
}

function allowedBuildRouteArtifact(relativePath) {
  const serverPrefix = "server/app/";
  if (relativePath.startsWith(serverPrefix)) {
    return isAllowedServerAppArtifact(relativePath.slice(serverPrefix.length));
  }
  const staticPrefix = "static/chunks/app/";
  if (relativePath.startsWith(staticPrefix)) {
    return isAllowedStaticAppArtifact(relativePath.slice(staticPrefix.length));
  }
  const typesPrefix = "types/app/";
  if (relativePath.startsWith(typesPrefix)) {
    return isAllowedTypesAppArtifact(relativePath.slice(typesPrefix.length));
  }
  return true;
}

function inspectNextFiles(files, textFiles, violations) {
  for (const requiredFile of REQUIRED_NEXT_FILES) {
    if (!files.includes(requiredFile)) {
      violations.push(`.next: missing required file: ${requiredFile}`);
    }
  }
  if (!files.some((file) => file.startsWith("static/"))) {
    violations.push(".next: missing required assets: static/");
  }
  for (const file of files) {
    if (!allowedBuildRouteArtifact(file)) {
      violations.push(`.next: unexpected app route artifact: ${file}`);
    }
    const lowerFile = file.toLowerCase();
    if (
      path.posix.basename(lowerFile) === "sitemap.xml" ||
      lowerFile.includes("/sitemap.xml")
    ) {
      violations.push(
        `.next: sitemap route must be absent until a production domain is authorized: ${file}`,
      );
    }
  }
  inspectBuildRouteManifest(textFiles, violations);
  inspectServerAppPathsManifest(textFiles, violations);
  inspectRoutesManifest(textFiles, violations);
  inspectPrerenderManifest(textFiles, violations);
  inspectBuildManifestRouteKeys(textFiles, violations);
}

function normalizeContentForScan(content) {
  return content
    .replace(/\\u0022/gi, '"')
    .replace(/&quot;/gi, '"')
    .replace(/\\"/g, '"')
    .replace(/%2f|%5c/gi, "/")
    .replace(/\\\\/g, "\\");
}

function concreteIsoTimestampPattern() {
  return /["'](?:19|20)\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z["']/;
}

function containsConcreteJourneyInstance(content) {
  const normalized = normalizeContentForScan(content);
  const windowSize = 32 * 1024;

  for (const match of normalized.matchAll(
    /\bjourneys\b["']?\s*:\s*\[\s*\{/gi,
  )) {
    const window = normalized.slice(
      Math.max(0, match.index - 4096),
      match.index + windowSize,
    );
    if (
      /\bschemaVersion\b["']?\s*:\s*1\b/i.test(window) &&
      /\bid\b["']?\s*:\s*["'][a-z0-9][a-z0-9_-]*["']/i.test(window) &&
      /\bsubject\b["']?\s*:\s*\{/i.test(window) &&
      /\b(?:intent|experienceEntries)\b["']?\s*:/i.test(window) &&
      concreteIsoTimestampPattern().test(window)
    ) {
      return true;
    }
  }
  for (const match of normalized.matchAll(
    /\bexperienceEntries\b["']?\s*:\s*\[\s*\{/gi,
  )) {
    const window = normalized.slice(
      Math.max(0, match.index - 4096),
      match.index + windowSize,
    );
    if (
      /\bsubject\b["']?\s*:\s*\{/i.test(window) &&
      /\boccurredAt\b["']?\s*:\s*["'](?:19|20)\d{2}-/i.test(window) &&
      /\bmemo\b["']?\s*:\s*["'][^"']+["']/i.test(window) &&
      concreteIsoTimestampPattern().test(window)
    ) {
      return true;
    }
  }
  for (const match of normalized.matchAll(
    /\bkind\b["']?\s*:\s*["']local-custom-event["']/gi,
  )) {
    const window = normalized.slice(
      Math.max(0, match.index - 4096),
      match.index + windowSize,
    );
    if (
      /\blocalId\b["']?\s*:\s*["'][a-z0-9][a-z0-9_-]*["']/i.test(window) &&
      /\bfallback\b["']?\s*:\s*\{/i.test(window) &&
      /\btitle\b["']?\s*:\s*["'][^"']+["']/i.test(window) &&
      /\bintent\b["']?\s*:\s*(?:["'](?:interested|planned)["']|null)/i.test(
        window,
      ) &&
      concreteIsoTimestampPattern().test(window)
    ) {
      return true;
    }
  }
  return false;
}

function inspectTextContent(label, textFiles, violations) {
  for (const [file, rawContent] of textFiles) {
    const content = normalizeContentForScan(rawContent);
    for (const marker of INTERNAL_CONTENT_MARKERS) {
      if (marker.pattern.test(content)) {
        violations.push(
          `${label}: internal content marker ${marker.label} found in ${file}`,
        );
      }
    }
    for (const marker of PROVIDER_CONTENT_MARKERS) {
      if (marker.pattern.test(content)) {
        violations.push(
          `${label}: provider state marker ${marker.label} found in ${file}`,
        );
      }
    }
    if (
      /["']terraform_version["']\s*:/.test(content) &&
      /["']lineage["']\s*:/.test(content) &&
      /["']resources["']\s*:/.test(content)
    ) {
      violations.push(
        `${label}: provider state marker Terraform state found in ${file}`,
      );
    }
    for (const marker of MY_PICK_CONTENT_MARKERS) {
      if (marker.pattern.test(content)) {
        violations.push(
          `${label}: MyPick runtime marker ${marker.label} found in ${file}`,
        );
      }
    }
    if (containsConcreteJourneyInstance(rawContent)) {
      violations.push(
        `${label}: concrete personal Journey instance found in ${file}`,
      );
    }
  }
}

export function inspectAtlasBuild({ outputDirectory, nextDirectory }) {
  const violations = [];
  const output = inspectDirectory(outputDirectory, "out", violations);
  const next = inspectDirectory(nextDirectory, ".next", violations);

  for (const file of output.files) inspectArtifactPath(file, "out", violations);
  for (const file of next.files) inspectArtifactPath(file, ".next", violations);

  const outputTextFiles = readTextArtifacts(output, "out", violations);
  const nextTextFiles = readTextArtifacts(next, ".next", violations);

  if (output.exists) {
    inspectOutputFiles(output.files, violations);
    for (const file of output.files.filter((candidate) =>
      candidate.endsWith(".html"),
    )) {
      const html = outputTextFiles.get(file);
      if (html !== undefined) inspectHtmlMetadata(file, html, violations);
    }
    const robots = outputTextFiles.get("robots.txt");
    if (robots !== undefined) inspectRobotsFile(robots, violations);
  }
  if (next.exists) inspectNextFiles(next.files, nextTextFiles, violations);

  inspectTextContent("out", outputTextFiles, violations);
  inspectTextContent(".next", nextTextFiles, violations);

  return {
    outputFiles: output.files,
    nextFiles: next.files,
    violations: stable(violations),
  };
}

export function verifyAtlasBuild(options) {
  const result = inspectAtlasBuild(options);
  if (result.violations.length > 0) {
    throw new Error(
      `Atlas static boundary verification failed:\n- ${result.violations.join("\n- ")}`,
    );
  }
  return result;
}

// Foundation compatibility only. The cumulative/release gate is verifyAtlasBuild.
const LEGACY_REQUIRED_FILES = ["index.html"];
const LEGACY_REQUIRED_PREFIXES = ["_next/static/"];
const LEGACY_ALLOWED_HTML_FILES = new Set([
  "404.html",
  "404/index.html",
  "_not-found.html",
  "_not-found/index.html",
  "index.html",
]);
const LEGACY_FORBIDDEN_EXACT_FILES = new Set([
  "manifest.json",
  "manifest.webmanifest",
  "sw.js",
]);
const LEGACY_FORBIDDEN_ROUTE_SEGMENTS = new Set([
  "covers",
  "live",
  "og",
  "songs",
]);
const LEGACY_MY_PICK_RUNTIME_MARKERS = [
  "@current-project/runtime",
  "NEXT_PUBLIC_PROJECT_ID",
];
const LEGACY_TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".txt",
]);

function listLegacyFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listLegacyFiles(absolutePath, relativePath));
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

  const files = listLegacyFiles(output);
  for (const requiredFile of LEGACY_REQUIRED_FILES) {
    if (!files.includes(requiredFile)) {
      violations.push(`missing required export file: ${requiredFile}`);
    }
  }
  for (const requiredPrefix of LEGACY_REQUIRED_PREFIXES) {
    if (!files.some((file) => file.startsWith(requiredPrefix))) {
      violations.push(`missing required export assets: ${requiredPrefix}`);
    }
  }
  for (const file of files) {
    const segments = file.split("/");
    if (LEGACY_FORBIDDEN_EXACT_FILES.has(file)) {
      violations.push(`Atlas must not emit ${file}`);
    }
    const forbiddenSegment = segments.find((segment) =>
      LEGACY_FORBIDDEN_ROUTE_SEGMENTS.has(segment),
    );
    if (forbiddenSegment) {
      violations.push(`foreign MyPick output segment found: ${file}`);
    }
    if (file.endsWith(".html") && !LEGACY_ALLOWED_HTML_FILES.has(file)) {
      violations.push(`unexpected Foundation route found: ${file}`);
    }

    const absolutePath = path.join(output, ...segments);
    const extension = path.extname(file);
    if (
      LEGACY_TEXT_EXTENSIONS.has(extension) &&
      statSync(absolutePath).size <= MAX_TEXT_FILE_BYTES
    ) {
      const content = readFileSync(absolutePath, "utf8");
      for (const marker of LEGACY_MY_PICK_RUNTIME_MARKERS) {
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
  if (process.argv.length > 2) {
    console.error(
      "Atlas static boundary verifier does not accept path arguments.",
    );
    process.exitCode = 1;
  } else {
    try {
      const result = verifyAtlasBuild({
        outputDirectory: EXPECTED_OUTPUT,
        nextDirectory: EXPECTED_NEXT,
      });
      console.log(
        `Atlas static boundary verification passed (${result.outputFiles.length} output files, ${result.nextFiles.length} .next files).`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
