import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PROJECT_CONTRACTS,
  verifyStaticExport,
} from "./verify-static-export.mjs";
import {
  createStaticExportServer,
  runNpmCommand,
} from "./run-project-command.mjs";

const PROJECT_ID = "equal-love";
const CONTRACT = PROJECT_CONTRACTS[PROJECT_ID];
const LIVE = {
  status: "published",
  slug: "kokuritsu-2026",
  title: "国立の余韻 My Pick",
  canonicalPath: "/live/kokuritsu-2026/",
};

test("valid three-site artifact contract passes", async () => {
  await withFixture(async ({ out, root }) => {
    const result = await verifyStaticExport({
      projectId: PROJECT_ID,
      outputDirectory: out,
      repositoryRoot: root,
    });
    assert.deepEqual(result, { projectId: PROJECT_ID, routes: 2 });
  });
});

for (const scenario of [
  {
    name: "wrong project title fails",
    mutate: ({ rootHtml }) =>
      rootHtml.replace(CONTRACT.title, PROJECT_CONTRACTS["not-equal-me"].title),
    expected: /title must be/,
  },
  {
    name: "missing expected Live route fails",
    mutate: ({ rootHtml }) => rootHtml,
    afterWrite: async ({ out }) =>
      rm(path.join(out, "live", LIVE.slug), { recursive: true }),
    expected: /missing required artifact/,
  },
  {
    name: "missing Live RSC artifact fails",
    mutate: ({ rootHtml }) => rootHtml,
    afterWrite: async ({ out }) =>
      rm(path.join(out, "live", LIVE.slug, "index.txt")),
    expected: /missing required artifact.*index\.txt/s,
  },
  {
    name: "corrupted root RSC artifact fails",
    mutate: ({ rootHtml }) => rootHtml,
    afterWrite: async ({ out }) =>
      writeFile(path.join(out, "index.txt"), "corrupted RSC\n"),
    expected: /not a valid static RSC payload/,
  },
  {
    name: "foreign Live route fails",
    mutate: ({ rootHtml }) => rootHtml,
    afterWrite: async ({ out }) => {
      const foreign = path.join(out, "live", "joy-4th-anniversary-2026");
      await mkdir(foreign, { recursive: true });
      await writeFile(path.join(foreign, "index.html"), "foreign");
    },
    expected: /foreign Live route/,
  },
  {
    name: "canonical mismatch fails",
    mutate: ({ rootHtml }) =>
      rootHtml.replace(`${CONTRACT.siteUrl}/`, `${CONTRACT.siteUrl}/wrong/`),
    expected: /exactly one canonical/,
  },
  {
    name: "sitemap mismatch fails",
    mutate: ({ rootHtml }) => rootHtml,
    afterWrite: async ({ out }) =>
      writeFile(
        path.join(out, "sitemap.xml"),
        `<urlset><url><loc>${CONTRACT.siteUrl}/wrong/</loc></url></urlset>`,
      ),
    expected: /sitemap\.xml locations differ/,
  },
  {
    name: "missing referenced asset fails",
    mutate: ({ rootHtml }) =>
      rootHtml.replace("/covers/example.jpg", "/covers/missing.jpg"),
    expected: /references missing asset/,
  },
  {
    name: "missing asset referenced from RSC fails",
    mutate: ({ rootHtml }) => rootHtml,
    afterWrite: async ({ out }) =>
      writeFile(
        path.join(out, "index.txt"),
        createRsc(["/_next/static/app.js", "/icons/missing.svg"]),
      ),
    expected: /index\.txt references missing asset \/icons\/missing\.svg/,
  },
  {
    name: "framework error artifact fails",
    mutate: ({ rootHtml }) => `${rootHtml}__next_error__`,
    expected: /framework error marker/,
  },
]) {
  test(scenario.name, async () => {
    await withFixture(async ({ out, root, rootHtml }) => {
      await writeFile(
        path.join(out, "index.html"),
        scenario.mutate({ rootHtml }),
      );
      await scenario.afterWrite?.({ out, root });
      await assert.rejects(
        verifyStaticExport({
          projectId: PROJECT_ID,
          outputDirectory: out,
          repositoryRoot: root,
        }),
        scenario.expected,
      );
    });
  });
}

test("dependency-free static server serves directory routes and assets", async () => {
  await withFixture(async ({ out }) => {
    const server = createStaticExportServer(out);
    await listen(server);
    const address = server.address();
    assert.equal(typeof address, "object");
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      const rootResponse = await fetch(`${origin}/`);
      assert.equal(rootResponse.status, 200);
      assert.match(await rootResponse.text(), /MY PICK =LOVE/);

      const redirect = await fetch(`${origin}/live/${LIVE.slug}`, {
        redirect: "manual",
      });
      assert.equal(redirect.status, 308);
      assert.equal(redirect.headers.get("location"), `/live/${LIVE.slug}/`);

      const liveResponse = await fetch(`${origin}/live/${LIVE.slug}/`);
      assert.equal(liveResponse.status, 200);
      assert.match(await liveResponse.text(), new RegExp(LIVE.title));

      const assetResponse = await fetch(`${origin}/covers/example.jpg`);
      assert.equal(assetResponse.status, 200);
      assert.equal(await assetResponse.text(), "cover");

      const missingResponse = await fetch(`${origin}/missing`);
      assert.equal(missingResponse.status, 404);
    } finally {
      await close(server);
    }
  });
});

test("Windows-compatible npm invocation spawns a harmless command", async () => {
  const result = await runNpmCommand(["--version"], { stdio: "pipe" });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});

async function withFixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mypick-static-export-"));
  const out = path.join(root, "out");
  const rootHtml = createHtml({
    canonical: `${CONTRACT.siteUrl}/`,
    identity: CONTRACT.displayName,
    title: CONTRACT.title,
  });
  try {
    await createRepositorySources(root);
    await writeFixtureFile(path.join(out, "index.html"), rootHtml);
    await writeFixtureFile(
      path.join(out, "index.txt"),
      createRsc(["/_next/static/app.js", "/icons/equal-love.svg"]),
    );
    await writeFixtureFile(
      path.join(out, "live", LIVE.slug, "index.html"),
      createHtml({
        canonical: `${CONTRACT.siteUrl}${LIVE.canonicalPath}`,
        identity: CONTRACT.displayName,
        openGraphTitle: LIVE.title,
        title: `${LIVE.title} | ${CONTRACT.displayName}`,
      }),
    );
    await writeFixtureFile(
      path.join(out, "live", LIVE.slug, "index.txt"),
      createRsc(["/_next/static/app.js", "/covers/example.jpg"]),
    );
    await writeFixtureFile(
      path.join(out, "sitemap.xml"),
      `<urlset><url><loc>${CONTRACT.siteUrl}/</loc></url><url><loc>${CONTRACT.siteUrl}${LIVE.canonicalPath}</loc></url></urlset>`,
    );
    await writeFixtureFile(
      path.join(out, "_next", "static", "app.css"),
      "body{}\n",
    );
    await writeFixtureFile(
      path.join(out, "_next", "static", "app.js"),
      "export {};\n",
    );
    await writeFixtureFile(path.join(out, "covers", "example.jpg"), "cover");
    await writeFixtureFile(
      path.join(out, "icons", "equal-love.svg"),
      "<svg/>\n",
    );
    await callback({ out, root, rootHtml });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

function createRsc(references) {
  return `1:"$Sreact.fragment"\n2:${JSON.stringify(references)}\n`;
}

async function createRepositorySources(root) {
  const experiences = {
    "equal-love": [LIVE],
    "nearly-equal-joy": [
      {
        status: "published",
        slug: "joy-4th-anniversary-2026",
        title: "4周年の余韻 My Pick",
        canonicalPath: "/live/joy-4th-anniversary-2026/",
      },
    ],
    "not-equal-me": [
      {
        status: "published",
        slug: "not-equal-me-7th-anniversary-2026",
        title: "7周年の余韻 My Pick",
        canonicalPath: "/live/not-equal-me-7th-anniversary-2026/",
      },
    ],
  };
  for (const [projectId, projectExperiences] of Object.entries(experiences)) {
    await writeFixtureFile(
      path.join(root, "src", "projects", projectId, "live-experiences.json"),
      JSON.stringify(projectExperiences),
    );
  }
}

function createHtml({ canonical, identity, openGraphTitle, title }) {
  const titleMeta = openGraphTitle
    ? `<meta property="og:title" content="${openGraphTitle}">`
    : "";
  return `<!doctype html><html><head><title>${title}</title><link rel="canonical" href="${canonical}"><meta property="og:site_name" content="${identity}">${titleMeta}<link rel="icon" href="/icons/equal-love.svg"><link rel="stylesheet" href="/_next/static/app.css"><script src="/_next/static/app.js"></script></head><body><h1>${identity}</h1><img src="/covers/example.jpg"></body></html>`;
}

async function writeFixtureFile(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
