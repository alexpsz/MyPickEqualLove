import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  inspectAtlasBuild,
  MAX_TEXT_FILE_BYTES,
  verifyAtlasBuild,
} from "./verify-static-export.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER_PATH = path.join(SCRIPT_DIRECTORY, "verify-static-export.mjs");
const PUBLIC_PROJECTION = JSON.parse(
  readFileSync(
    path.resolve(
      SCRIPT_DIRECTORY,
      "../src/generated/public-atlas-projection.v1.json",
    ),
    "utf8",
  ),
);
const EVENT_ROUTES = [
  "events",
  ...PUBLIC_PROJECTION.groups.flatMap((group) =>
    group.events.flatMap((event) => {
      const eventId = event.id.split(":")[2];
      return [
        `events/${group.siteId}/${eventId}`,
        ...event.performances.map(
          (performance) =>
            `events/${group.siteId}/${eventId}/${performance.id.split(":")[3]}`,
        ),
      ];
    }),
  ),
];
const ISO = "2026-08-25T01:02:03.000Z";
const PRODUCT_HTML = new Map([
  [
    "index.html",
    '<!doctype html><html><head><META CONTENT="nofollow, noindex, noarchive" NAME="ROBOTS"></head><body><a href="https://mypick.kozueginko.com">MyPick</a></body></html>',
  ],
  [
    "journey/index.html",
    '<!doctype html><html><head><meta name="robots" content="noindex nofollow nocache"></head><body>Journey</body></html>',
  ],
  [
    "local-event/index.html",
    '<!doctype html><html><head><meta content="nofollow,noimageindex,noindex" name="robots"></head><body>Local event</body></html>',
  ],
  [
    "memory/index.html",
    '<!doctype html><html><head><meta name="robots" content="noindex; nofollow; noarchive"></head><body>Memory memo intent evidence plan @mypick/atlas</body></html>',
  ],
  ...EVENT_ROUTES.map((route) => [
    `${route}/index.html`,
    `<!doctype html><html><head><meta name="robots" content="noindex,nofollow,noarchive"></head><body>${route}</body></html>`,
  ]),
]);
const APP_ROUTE_MANIFEST = {
  "/_global-error/page": "/_global-error",
  "/_not-found/page": "/_not-found",
  "/page": "/",
  "/events/page": "/events",
  "/events/[siteId]/[eventLocalId]/page": "/events/[siteId]/[eventLocalId]",
  "/events/[siteId]/[eventLocalId]/[performanceLocalId]/page":
    "/events/[siteId]/[eventLocalId]/[performanceLocalId]",
  "/journey/page": "/journey",
  "/local-event/page": "/local-event",
  "/memory/page": "/memory",
  "/robots.txt/route": "/robots.txt",
};
const PUBLIC_ROUTES = [
  "/",
  "/_global-error",
  "/_not-found",
  ...EVENT_ROUTES.map((route) => `/${route}`),
  "/journey",
  "/local-event",
  "/memory",
  "/robots.txt",
];
const STATIC_PUBLIC_ROUTES = [
  "/",
  "/_global-error",
  "/_not-found",
  "/events",
  "/journey",
  "/local-event",
  "/memory",
  "/robots.txt",
];
const DYNAMIC_ROUTE_MANIFEST = [
  {
    page: "/events/[siteId]/[eventLocalId]",
    regex: "^/events/([^/]+?)/([^/]+?)(?:/)?$",
    routeKeys: {
      nxtPsiteId: "nxtPsiteId",
      nxtPeventLocalId: "nxtPeventLocalId",
    },
    namedRegex:
      "^/events/(?<nxtPsiteId>[^/]+?)/(?<nxtPeventLocalId>[^/]+?)(?:/)?$",
  },
  {
    page: "/events/[siteId]/[eventLocalId]/[performanceLocalId]",
    regex: "^/events/([^/]+?)/([^/]+?)/([^/]+?)(?:/)?$",
    routeKeys: {
      nxtPsiteId: "nxtPsiteId",
      nxtPeventLocalId: "nxtPeventLocalId",
      nxtPperformanceLocalId: "nxtPperformanceLocalId",
    },
    namedRegex:
      "^/events/(?<nxtPsiteId>[^/]+?)/(?<nxtPeventLocalId>[^/]+?)/(?<nxtPperformanceLocalId>[^/]+?)(?:/)?$",
  },
];
const PRERENDER_DYNAMIC_ROUTES = {
  "/events/[siteId]/[eventLocalId]": {
    routeRegex: "^/events/([^/]+?)/([^/]+?)(?:/)?$",
    dataRoute: "/events/[siteId]/[eventLocalId].rsc",
    fallback: false,
    fallbackRootParams: [],
    fallbackRouteParams: [],
    dataRouteRegex: "^/events/([^/]+?)/([^/]+?)\\.rsc$",
    prefetchDataRoute: null,
  },
  "/events/[siteId]/[eventLocalId]/[performanceLocalId]": {
    routeRegex: "^/events/([^/]+?)/([^/]+?)/([^/]+?)(?:/)?$",
    dataRoute: "/events/[siteId]/[eventLocalId]/[performanceLocalId].rsc",
    fallback: false,
    fallbackRootParams: [],
    fallbackRouteParams: [],
    dataRouteRegex: "^/events/([^/]+?)/([^/]+?)/([^/]+?)\\.rsc$",
    prefetchDataRoute: null,
  },
};

function writeFixtureFile(root, relativePath, content = "") {
  const filePath = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

function createValidFixture(atlasRoot) {
  const outputDirectory = path.join(atlasRoot, "out");
  const nextDirectory = path.join(atlasRoot, ".next");

  writeFixtureFile(
    atlasRoot,
    "src/generated/public-atlas-projection.v1.json",
    JSON.stringify(PUBLIC_PROJECTION),
  );

  for (const [file, html] of PRODUCT_HTML) {
    writeFixtureFile(outputDirectory, file, html);
  }
  for (const route of ["journey", "local-event", "memory", "events"]) {
    writeFixtureFile(outputDirectory, `${route}/index.txt`, "route payload");
    writeFixtureFile(outputDirectory, `${route}/__next._tree.txt`, "tree");
    writeFixtureFile(
      outputDirectory,
      `${route}/__next.${route}/__PAGE__.txt`,
      "page payload",
    );
  }
  for (const route of EVENT_ROUTES.slice(1)) {
    writeFixtureFile(outputDirectory, `${route}/index.txt`, "route payload");
    writeFixtureFile(outputDirectory, `${route}/__next._tree.txt`, "tree");
    writeFixtureFile(outputDirectory, `${route}/__next.events.txt`, "events");
    const routeParameters = ["$d$siteId", "$d$eventLocalId"];
    if (route.split("/").length === 4) {
      routeParameters.push("$d$performanceLocalId");
    }
    let segmentPath = `${route}/__next.events`;
    for (const parameter of routeParameters) {
      segmentPath = `${segmentPath}/${parameter}`;
      writeFixtureFile(outputDirectory, `${segmentPath}.txt`, "segment");
    }
    writeFixtureFile(
      outputDirectory,
      `${segmentPath}/__PAGE__.txt`,
      "page payload",
    );
  }
  writeFixtureFile(outputDirectory, "index.txt", "root payload");
  writeFixtureFile(outputDirectory, "__next.__PAGE__.txt", "root page");
  writeFixtureFile(
    outputDirectory,
    "404.html",
    "<!doctype html><title>Not found</title>",
  );
  writeFixtureFile(
    outputDirectory,
    "404/index.html",
    "<!doctype html><title>Not found</title>",
  );
  writeFixtureFile(
    outputDirectory,
    "_not-found/index.html",
    "<!doctype html><title>Not found</title>",
  );
  writeFixtureFile(outputDirectory, "_not-found/index.txt", "not found");
  writeFixtureFile(
    outputDirectory,
    "_not-found/__next._tree.txt",
    "not found tree",
  );
  writeFixtureFile(
    outputDirectory,
    "_not-found/__next._not-found/__PAGE__.txt",
    "not found page",
  );
  writeFixtureFile(
    outputDirectory,
    "_next/static/chunks/app/page-fixture.js",
    "export const atlas = true;",
  );
  writeFixtureFile(
    outputDirectory,
    "_next/static/chunks/app/memory/page-fixture.js",
    'export const fields = ["Memory", "memo", "intent", "plan", "evidence"];',
  );
  writeFixtureFile(
    outputDirectory,
    "_next/static/media/atlas.png",
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  writeFixtureFile(
    outputDirectory,
    "robots.txt",
    "# private preview\nUser-Agent: *\nDisallow: /\n",
  );

  writeFixtureFile(nextDirectory, "BUILD_ID", "fixture-build-id");
  writeFixtureFile(nextDirectory, "build-manifest.json", "{}");
  writeFixtureFile(
    nextDirectory,
    "routes-manifest.json",
    JSON.stringify({
      staticRoutes: STATIC_PUBLIC_ROUTES.map((page) => ({ page })),
      dynamicRoutes: DYNAMIC_ROUTE_MANIFEST,
      dataRoutes: [],
    }),
  );
  writeFixtureFile(
    nextDirectory,
    "prerender-manifest.json",
    JSON.stringify({
      routes: Object.fromEntries(PUBLIC_ROUTES.map((route) => [route, {}])),
      dynamicRoutes: PRERENDER_DYNAMIC_ROUTES,
      notFoundRoutes: [],
    }),
  );
  writeFixtureFile(
    nextDirectory,
    "app-path-routes-manifest.json",
    JSON.stringify(APP_ROUTE_MANIFEST),
  );
  writeFixtureFile(
    nextDirectory,
    "server/app-paths-manifest.json",
    JSON.stringify({
      "/page": "app/page.js",
      "/events/page": "app/events/page.js",
      "/events/[siteId]/[eventLocalId]/page":
        "app/events/[siteId]/[eventLocalId]/page.js",
      "/events/[siteId]/[eventLocalId]/[performanceLocalId]/page":
        "app/events/[siteId]/[eventLocalId]/[performanceLocalId]/page.js",
      "/journey/page": "app/journey/page.js",
      "/local-event/page": "app/local-event/page.js",
      "/memory/page": "app/memory/page.js",
      "/robots.txt/route": "app/robots.txt/route.js",
    }),
  );
  writeFixtureFile(nextDirectory, "server/app/page.js", "root page");
  writeFixtureFile(nextDirectory, "server/app/events/page.js", "events page");
  writeFixtureFile(nextDirectory, "server/app/events.html", "events html");
  writeFixtureFile(
    nextDirectory,
    "server/app/events.segments/events/__PAGE__.segment.rsc",
    "events segment",
  );
  writeFixtureFile(
    nextDirectory,
    "server/app/events/[siteId]/[eventLocalId]/page.js",
    "event detail page",
  );
  writeFixtureFile(
    nextDirectory,
    "server/app/events/[siteId]/[eventLocalId]/[performanceLocalId]/page.js",
    "performance detail page",
  );
  writeFixtureFile(
    nextDirectory,
    "server/app/journey/page.js",
    'export const fieldNames = ["journeys", "experienceEntries", "memo", "intent"];',
  );
  writeFixtureFile(
    nextDirectory,
    "server/app/local-event/page.js",
    "local event page",
  );
  writeFixtureFile(
    nextDirectory,
    "server/app/memory/page.js",
    'export const product = "Memory"; export const packageName = "@mypick/atlas";',
  );
  writeFixtureFile(
    nextDirectory,
    "server/app/robots.txt/route.js",
    "robots route",
  );
  writeFixtureFile(
    nextDirectory,
    "static/chunks/app/page-fixture.js",
    "root client chunk",
  );
  writeFixtureFile(
    nextDirectory,
    "static/chunks/app/memory/page-fixture.js",
    "Memory module",
  );
  writeFixtureFile(
    nextDirectory,
    "trace",
    JSON.stringify({ cwd: "C:\\repo\\.codex\\worktrees\\atlas" }),
  );
  writeFixtureFile(
    nextDirectory,
    "cache/.previewinfo",
    JSON.stringify({ previewModeId: "normal-next-build-metadata" }),
  );

  return { atlasRoot, outputDirectory, nextDirectory };
}

function makeFixture() {
  const atlasRoot = mkdtempSync(path.join(tmpdir(), "atlas-verifier-"));
  return createValidFixture(atlasRoot);
}

function cleanFixture(fixture) {
  rmSync(fixture.atlasRoot, { recursive: true, force: true });
}

function inspectFixture(fixture) {
  return inspectAtlasBuild({
    outputDirectory: fixture.outputDirectory,
    nextDirectory: fixture.nextDirectory,
  });
}

function assertViolation(result, pattern) {
  assert.ok(
    result.violations.some((violation) => pattern.test(violation)),
    `${pattern} did not match:\n${result.violations.join("\n")}`,
  );
}

function snapshotTree(root) {
  const rows = [];
  function walk(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const relativePath = path.posix.join(prefix, entry.name);
      const absolutePath = path.join(directory, entry.name);
      const stats = lstatSync(absolutePath);
      if (stats.isDirectory() && !stats.isSymbolicLink()) {
        walk(absolutePath, relativePath);
      } else if (stats.isFile()) {
        rows.push({
          path: relativePath,
          size: stats.size,
          hash: createHash("sha256")
            .update(readFileSync(absolutePath))
            .digest("hex"),
        });
      } else {
        rows.push({ path: relativePath, type: "special" });
      }
    }
  }
  walk(root);
  return rows;
}

function replaceProductHtml(
  fixture,
  file,
  headMarkup,
  robots = "noindex,nofollow",
) {
  writeFixtureFile(
    fixture.outputDirectory,
    file,
    `<!doctype html><html><head><meta name="robots" content="${robots}">${headMarkup}</head><body>Atlas</body></html>`,
  );
}

function withFixture(run) {
  const fixture = makeFixture();
  try {
    return run(fixture);
  } finally {
    cleanFixture(fixture);
  }
}

test("strict verifier accepts the bounded personal build and remains read-only", () => {
  withFixture((fixture) => {
    const before = snapshotTree(fixture.atlasRoot);
    const first = verifyAtlasBuild({
      outputDirectory: fixture.outputDirectory.replaceAll("\\", "/"),
      nextDirectory: fixture.nextDirectory.replaceAll("\\", "/"),
    });
    const second = inspectFixture(fixture);
    const after = snapshotTree(fixture.atlasRoot);

    assert.deepEqual(first.violations, []);
    assert.deepEqual(second, first);
    assert.deepEqual(after, before);
    assert.deepEqual(first.outputFiles, [...first.outputFiles].sort());
    assert.deepEqual(first.nextFiles, [...first.nextFiles].sort());
    assert.ok(first.outputFiles.every((file) => !file.includes("\\")));
    assert.ok(first.nextFiles.every((file) => !file.includes("\\")));
  });
});

test("missing out and .next fail together with deterministic labels", () => {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-missing-"));
  try {
    const result = inspectAtlasBuild({
      outputDirectory: path.join(root, "out"),
      nextDirectory: path.join(root, ".next"),
    });
    assert.deepEqual(result.violations, [
      ".next: missing directory",
      "out: missing directory",
    ]);
    assert.throws(
      () =>
        verifyAtlasBuild({
          outputDirectory: path.join(root, "out"),
          nextDirectory: path.join(root, ".next"),
        }),
      /Atlas static boundary verification failed/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every personal HTML route and static assets are required", () => {
  withFixture((fixture) => {
    rmSync(path.join(fixture.outputDirectory, "journey", "index.html"));
    rmSync(path.join(fixture.outputDirectory, "_next"), {
      recursive: true,
      force: true,
    });
    const result = inspectFixture(fixture);
    assertViolation(result, /missing required file: journey\/index\.html/);
    assertViolation(result, /missing required assets: _next\/static\//);
  });
});

test("only the expected product HTML routes and fixed fallbacks are allowed", () => {
  withFixture((fixture) => {
    writeFixtureFile(
      fixture.outputDirectory,
      "calendar/index.html",
      '<meta name="robots" content="noindex,nofollow">',
    );
    const result = inspectFixture(fixture);
    assertViolation(
      result,
      /unexpected export artifact: calendar\/index\.html/,
    );
    assertViolation(result, /unexpected HTML route: calendar\/index\.html/);
  });
});

test("all foreign public route segments fail in out and .next", () => {
  for (const route of [
    "event",
    "performance",
    "performances",
    "songs",
    "live",
    "covers",
    "og",
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(
        fixture.outputDirectory,
        `${route}/__next.${route}.txt`,
        "foreign payload",
      );
      writeFixtureFile(
        fixture.nextDirectory,
        `server/app/${route}/page.js`,
        "foreign route",
      );
      const result = inspectFixture(fixture);
      assertViolation(result, new RegExp(`foreign route segment ${route}`));
      assertViolation(
        result,
        new RegExp(`unexpected app route artifact: .*${route}`),
      );
    });
  }
});

test("app route artifacts require exact route directory names", () => {
  for (const file of [
    "server/app/journey-old/page.js",
    "server/app/memory-private/page.js",
    "static/chunks/app/robots.txt.backup/route-fixture.js",
    "types/app/local-event-copy/page.ts",
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(fixture.nextDirectory, file, "stale route");
      assertViolation(inspectFixture(fixture), /unexpected app route artifact/);
    });
  }
});

test("sitemap, manifest and service worker files fail at any output depth", () => {
  for (const [file, pattern] of [
    ["sitemap.xml", /sitemap\.xml must be absent/],
    ["manifest.json", /forbidden output file: manifest\.json/],
    ["nested/manifest.webmanifest", /forbidden output file/],
    ["_next/static/sw.js", /forbidden output file/],
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(fixture.outputDirectory, file, "forbidden");
      assertViolation(inspectFixture(fixture), pattern);
    });
  }
});

test("stale PWA artifacts also fail inside .next", () => {
  for (const file of [
    "static/sw.js",
    "server/chunks/manifest.json",
    "cache/manifest.webmanifest",
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(fixture.nextDirectory, file, "stale PWA");
      assertViolation(inspectFixture(fixture), /stale PWA artifact/);
    });
  }
});

test("robots.txt is exactly deny-all with no Host, Sitemap or Allow", () => {
  for (const content of [
    "User-agent: *\nDisallow:",
    "User-agent: *\nDisallow: /\nAllow: /health",
    "User-agent: *\nDisallow: /\nHost: atlas.example",
    "User-agent: *\nDisallow: /\nSitemap: https://atlas.example/sitemap.xml",
    "User-agent: Googlebot\nDisallow: /",
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(fixture.outputDirectory, "robots.txt", content);
      assertViolation(inspectFixture(fixture), /robots\.txt must contain only/);
    });
  }
});

test("product robots metadata requires explicit noindex and nofollow", () => {
  for (const [tokens, pattern] of [
    ["noindex", /must contain noindex and nofollow/],
    ["none", /must contain noindex and nofollow/],
    ["noindex,nofollow,index", /conflicting robots tokens/],
    ["noindex,nofollow,follow", /conflicting robots tokens/],
    ["noindex,nofollowish", /must contain noindex and nofollow/],
  ]) {
    withFixture((fixture) => {
      replaceProductHtml(fixture, "index.html", "", tokens);
      assertViolation(inspectFixture(fixture), pattern);
    });
  }
});

test("unapproved publication metadata fails closed", () => {
  for (const [markup, pattern] of [
    ['<link rel="canonical" href="https://atlas.example/">', /canonical/],
    ['<base href="https://atlas.example/">', /metadataBase/],
    [
      '<meta name="metadataBase" content="https://atlas.example">',
      /metadataBase/,
    ],
    ['<meta property="og:url" content="https://atlas.example/">', /og:url/],
    [
      '<meta name="twitter:url" content="https://atlas.example/">',
      /Twitter URL/,
    ],
    [
      '<script type="application/ld+json">{"url":"https://atlas.example"}</script>',
      /JSON-LD/,
    ],
    ['<link href="/manifest.webmanifest" rel="manifest">', /manifest metadata/],
  ]) {
    withFixture((fixture) => {
      replaceProductHtml(fixture, "index.html", markup);
      assertViolation(inspectFixture(fixture), pattern);
    });
  }
});

test("sitemap routes are rejected from .next metadata and paths", () => {
  withFixture((fixture) => {
    const manifest = {
      ...APP_ROUTE_MANIFEST,
      "/sitemap.xml/route": "/sitemap.xml",
    };
    writeFixtureFile(
      fixture.nextDirectory,
      "app-path-routes-manifest.json",
      JSON.stringify(manifest),
    );
    writeFixtureFile(
      fixture.nextDirectory,
      "server/app/sitemap.xml/route.js",
      "sitemap route",
    );
    const result = inspectFixture(fixture);
    assertViolation(result, /unexpected route manifest entry: \/sitemap\.xml/);
    assertViolation(result, /sitemap route must be absent/);
  });
});

test("the exact route manifests reject an unexpected route", () => {
  for (const [file, mutate, pattern] of [
    [
      "app-path-routes-manifest.json",
      (manifest) => {
        manifest["/calendar/page"] = "/calendar";
      },
      /unexpected route manifest entry: \/calendar\/page/,
    ],
    [
      "server/app-paths-manifest.json",
      (manifest) => {
        manifest["/calendar/page"] = "app/calendar/page.js";
      },
      /unexpected server app path entry: \/calendar\/page/,
    ],
    [
      "routes-manifest.json",
      (manifest) => {
        manifest.staticRoutes.push({ page: "/calendar" });
      },
      /routes-manifest\.json static routes do not match/,
    ],
    [
      "prerender-manifest.json",
      (manifest) => {
        manifest.routes["/calendar"] = {};
      },
      /prerender-manifest\.json routes do not match/,
    ],
  ]) {
    withFixture((fixture) => {
      const manifestPath = path.join(fixture.nextDirectory, ...file.split("/"));
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      mutate(manifest);
      writeFixtureFile(fixture.nextDirectory, file, JSON.stringify(manifest));
      assertViolation(inspectFixture(fixture), pattern);
    });
  }
});

test("routes manifest rejects one duplicate replacing one omitted route", () => {
  withFixture((fixture) => {
    const file = "routes-manifest.json";
    const manifestPath = path.join(fixture.nextDirectory, file);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.staticRoutes = manifest.staticRoutes.map((route) =>
      route.page === "/memory" ? { page: "/journey" } : route,
    );
    writeFixtureFile(fixture.nextDirectory, file, JSON.stringify(manifest));
    assertViolation(
      inspectFixture(fixture),
      /routes-manifest\.json static routes do not match/,
    );
  });
});

test("dynamic route manifests require only the two closed static-param templates", () => {
  withFixture((fixture) => {
    const file = "routes-manifest.json";
    const manifestPath = path.join(fixture.nextDirectory, file);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dynamicRoutes[0].routeKeys.nxtPsiteId = "wrong";
    writeFixtureFile(fixture.nextDirectory, file, JSON.stringify(manifest));
    assertViolation(
      inspectFixture(fixture),
      /dynamic route metadata is not exact/,
    );
  });

  withFixture((fixture) => {
    const file = "prerender-manifest.json";
    const manifestPath = path.join(fixture.nextDirectory, file);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dynamicRoutes["/events/[siteId]/[eventLocalId]"].fallback = true;
    writeFixtureFile(fixture.nextDirectory, file, JSON.stringify(manifest));
    assertViolation(
      inspectFixture(fixture),
      /dynamic route is not a closed static-param route/,
    );
  });
});

test("build manifests restrict route keys when a route map is present", () => {
  for (const [file, pages] of [
    ["build-manifest.json", { "/_app": [], "/calendar": [] }],
    ["app-build-manifest.json", { "/page": [], "/calendar/page": [] }],
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(fixture.nextDirectory, file, JSON.stringify({ pages }));
      assertViolation(
        inspectFixture(fixture),
        new RegExp(`unexpected build manifest route key in ${file}`),
      );
    });
  }
});

test("internal documents, provider state and hidden agent paths are rejected", () => {
  for (const file of [
    ".CoDeX/private.txt",
    ".agents/private.json",
    "memory/progress.md",
    "AGENTS.md",
    "plan/atlas.json",
    "plans/atlas.json",
    "receipt/e1.json",
    "receipts/e1.json",
    ".vercel/project.json",
    "provider-state.json",
    "architecture.md",
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(fixture.nextDirectory, file, "private");
      assert.ok(inspectFixture(fixture).violations.length > 0, file);
    });
  }
});

test("renamed internal and provider content remains detectable", () => {
  for (const [content, pattern] of [
    ["copied from memory\\progress.md", /internal memory document/],
    ["# AGENTS.md", /AGENTS\.md/],
    ["atlas-portal-implementation-plan.md", /Atlas internal plan/],
    ["atlas-public-event-source-go-hold-v1", /E1 source-use receipt/],
    ["ATLAS_C0_BASELINE_RECEIPT", /C0 baseline receipt/],
    [".vercel/project.json", /Vercel project state/],
    [
      '{"terraform_version":"1","lineage":"x","resources":[]}',
      /Terraform state/,
    ],
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(
        fixture.nextDirectory,
        "server/chunks/renamed.js",
        content,
      );
      assertViolation(inspectFixture(fixture), pattern);
    });
  }
});

test("binary-looking filenames cannot hide internal text", () => {
  withFixture((fixture) => {
    writeFixtureFile(
      fixture.outputDirectory,
      "_next/static/media/disguised.png",
      "# AGENTS.md\ninternal instructions",
    );
    writeFixtureFile(
      fixture.nextDirectory,
      "cache/disguised.zip",
      "ATLAS_C0_BASELINE_RECEIPT",
    );
    const result = inspectFixture(fixture);
    assertViolation(
      result,
      /AGENTS\.md found in _next\/static\/media\/disguised\.png/,
    );
    assertViolation(
      result,
      /C0 baseline receipt found in cache\/disguised\.zip/,
    );
    assertViolation(result, /binary file does not match \.png magic/);
    assertViolation(result, /archive or compressed artifact is not allowed/);
  });
});

test("MyPick runtime and registry markers remain strict failures", () => {
  for (const [content, pattern] of [
    ["NEXT_PUBLIC_PROJECT_ID", /NEXT_PUBLIC_PROJECT_ID/],
    ["@current-project/runtime", /@current-project\/runtime/],
    ["EqualLove_MyPicks.png", /MyPick project image/],
    ["PickExperienceClient", /PickExperienceClient/],
    ["ExportBoard", /ExportBoard/],
    ["equal_love_mypicks_v2", /MyPick storage key/],
    ["src/projects/equal-love/songs.json", /MyPick project source artifact/],
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(
        fixture.nextDirectory,
        "server/chunks/mypick.js",
        content,
      );
      assertViolation(inspectFixture(fixture), pattern);
    });
  }

  withFixture((fixture) => {
    writeFixtureFile(
      fixture.outputDirectory,
      "_next/static/media/eQuAlLoVe_MyPiCkS.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    assertViolation(inspectFixture(fixture), /MyPick artifact marker/);
  });
});

test("ordinary MyPick links, Atlas package text and field names are allowed", () => {
  withFixture((fixture) => {
    writeFixtureFile(
      fixture.nextDirectory,
      "server/chunks/allowed.js",
      [
        "https://mypick.kozueginko.com",
        "https://mypick-nearly-equal-joy.kozueginko.com",
        "https://mypick-not-equal-me.kozueginko.com",
        "@mypick/atlas",
        "equal-love nearly-equal-joy not-equal-me",
        "memo intent plan evidence Memory",
        "const empty = { schemaVersion: 1, journeys: [] };",
        "const record = { subject, experienceEntries: [{ occurredAt, memo }] };",
      ].join("\n"),
    );
    assert.deepEqual(inspectFixture(fixture).violations, []);
  });
});

function concreteJourneyDocument() {
  return {
    schemaVersion: 1,
    revision: 2,
    updatedAt: ISO,
    journeys: [
      {
        id: "journey-private",
        subject: {
          kind: "local-custom-event",
          localId: "private-event",
          fallback: {
            title: "My private event",
            date: "2026-08-25",
            venueName: "Private venue",
          },
        },
        intent: "planned",
        experienceEntries: [
          {
            id: "entry-private",
            mode: "in-person",
            occurredAt: ISO,
            memo: "A private memo",
            highlights: [],
            songRefs: [],
            createdAt: ISO,
            updatedAt: ISO,
          },
        ],
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
  };
}

test("serialized and escaped concrete Journey instances are rejected", () => {
  for (const content of [
    JSON.stringify(concreteJourneyDocument()),
    `const fixture = ${JSON.stringify(JSON.stringify(concreteJourneyDocument()))};`,
  ]) {
    withFixture((fixture) => {
      writeFixtureFile(
        fixture.nextDirectory,
        "server/chunks/private-journey.js",
        content,
      );
      assertViolation(
        inspectFixture(fixture),
        /concrete personal Journey instance/,
      );
    });
  }
});

test("detached local custom Journey fixtures are rejected", () => {
  withFixture((fixture) => {
    writeFixtureFile(
      fixture.nextDirectory,
      "server/chunks/detached.js",
      `const fixture = { id: "journey-one", subject: { kind: "local-custom-event", localId: "private-one", fallback: { title: "Private show", date: "2026-08-25", venueName: "Private venue" } }, intent: "interested", experienceEntries: [], createdAt: "${ISO}", updatedAt: "${ISO}" };`,
    );
    assertViolation(
      inspectFixture(fixture),
      /concrete personal Journey instance/,
    );
  });
});

test("oversized and invalid UTF-8 text fail while large binary packs are allowed", () => {
  withFixture((fixture) => {
    const exact = writeFixtureFile(
      fixture.nextDirectory,
      "server/chunks/exact-limit.js",
      Buffer.alloc(MAX_TEXT_FILE_BYTES, 0x20),
    );
    const binaryPack = writeFixtureFile(
      fixture.nextDirectory,
      "cache/webpack/client-production/index.pack",
      Buffer.from([0x77, 0x70, 0x63, 0x01, 0x00]),
    );
    truncateSync(binaryPack, MAX_TEXT_FILE_BYTES + 4096);
    assert.deepEqual(inspectFixture(fixture).violations, []);

    truncateSync(exact, MAX_TEXT_FILE_BYTES + 1);
    let result = inspectFixture(fixture);
    assertViolation(result, /text file exceeds .*exact-limit\.js/);

    truncateSync(exact, MAX_TEXT_FILE_BYTES);
    writeFixtureFile(
      fixture.nextDirectory,
      "server/chunks/invalid.js",
      Buffer.from([0xc3, 0x28]),
    );
    result = inspectFixture(fixture);
    assertViolation(
      result,
      /text file is not valid UTF-8: server\/chunks\/invalid\.js/,
    );
  });
});

test("unknown-extension text is sniffed and remains size bounded", () => {
  withFixture((fixture) => {
    writeFixtureFile(
      fixture.nextDirectory,
      "server/chunks/renamed.data",
      Buffer.alloc(MAX_TEXT_FILE_BYTES + 1, 0x20),
    );
    assertViolation(
      inspectFixture(fixture),
      /text file exceeds .*renamed\.data/,
    );

    writeFixtureFile(
      fixture.nextDirectory,
      "server/chunks/utf8-boundary.data",
      Buffer.concat([
        Buffer.alloc(4095, 0x61),
        Buffer.from("界NEXT_PUBLIC_PROJECT_ID", "utf8"),
      ]),
    );
    assertViolation(inspectFixture(fixture), /NEXT_PUBLIC_PROJECT_ID/);

    writeFixtureFile(
      fixture.nextDirectory,
      "server/chunks/opaque.data",
      Buffer.from([0x00, 0x01, 0x02]),
    );
    assertViolation(inspectFixture(fixture), /unrecognized binary file type/);
  });
});

test("junctions are rejected without traversal", (context) => {
  withFixture((fixture) => {
    const target = path.join(fixture.atlasRoot, "junction-target");
    mkdirSync(target);
    writeFixtureFile(target, "private.txt", "private");
    const link = path.join(
      fixture.outputDirectory,
      "_next",
      "static",
      "linked",
    );
    try {
      symlinkSync(target, link, "junction");
    } catch (error) {
      context.skip(`junction creation unavailable: ${String(error)}`);
      return;
    }
    const result = inspectFixture(fixture);
    assertViolation(
      result,
      /symbolic link is not allowed: _next\/static\/linked/,
    );
    assert.ok(!result.outputFiles.some((file) => file.includes("private.txt")));
  });
});

test("violation order is stable regardless of filesystem creation order", () => {
  withFixture((fixture) => {
    for (const file of [
      "zeta/index.html",
      ".agents/private.txt",
      "alpha/index.html",
    ]) {
      writeFixtureFile(fixture.nextDirectory, file, "AGENTS.md");
    }
    writeFixtureFile(fixture.outputDirectory, "sitemap.xml", "forbidden");
    const first = inspectFixture(fixture);
    const second = inspectFixture(fixture);
    assert.deepEqual(second, first);
    assert.deepEqual(first.violations, [...first.violations].sort());
  });
});

test("CLI uses only sibling out/.next, returns 0/1, and rejects path arguments", () => {
  const atlasRoot = mkdtempSync(path.join(tmpdir(), "atlas-cli-"));
  const fixture = createValidFixture(atlasRoot);
  try {
    const script = writeFixtureFile(
      atlasRoot,
      "scripts/verify-static-export.mjs",
      "",
    );
    copyFileSync(VERIFIER_PATH, script);

    let result = spawnSync(process.execPath, [script], {
      cwd: atlasRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /verification passed/);

    result = spawnSync(process.execPath, [script, fixture.outputDirectory], {
      cwd: atlasRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not accept path arguments/);

    writeFixtureFile(fixture.outputDirectory, "sitemap.xml", "forbidden");
    result = spawnSync(process.execPath, [script], {
      cwd: atlasRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sitemap\.xml must be absent/);
  } finally {
    cleanFixture(fixture);
  }
});
