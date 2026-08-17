import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function toDataModuleUrl(outputText) {
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

async function transpileDataOnlyTypeScript(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  const { outputText, diagnostics = [] } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
    reportDiagnostics: true,
  });

  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(errors, [], `Failed to transpile ${relativePath}`);

  return outputText;
}

async function importDataOnlyTypeScript(relativePath) {
  let outputText = await transpileDataOnlyTypeScript(relativePath);
  if (relativePath === "src/i18n/presentation.ts") {
    const projectSchemaUrl = toDataModuleUrl(
      await transpileDataOnlyTypeScript("src/schema/project.ts"),
    );
    outputText = outputText.replace(
      '"../schema/project"',
      JSON.stringify(projectSchemaUrl),
    );
  }

  return import(toDataModuleUrl(outputText));
}

const [messageModule, presentationModule] = await Promise.all([
  importDataOnlyTypeScript("src/i18n/messages.ts"),
  importDataOnlyTypeScript("src/i18n/presentation.ts"),
]);

const { messages } = messageModule;
const {
  LIVE_EXPERIENCE_PRESENTATION_KEYS,
  PROJECT_PRESENTATION_KEYS,
  localizeLiveExperiencePresentation,
  localizeProjectPresentation,
  presentationMessages,
} = presentationModule;

const locales = ["en", "ja", "zh-CN", "ko"];
const nonJapaneseLocales = ["en", "zh-CN", "ko"];
const liveDataPaths = [
  "src/projects/equal-love/live-experiences.json",
  "src/projects/nearly-equal-joy/live-experiences.json",
  "src/projects/not-equal-me/live-experiences.json",
];

const liveExperiences = (
  await Promise.all(
    liveDataPaths.map(async (relativePath) =>
      JSON.parse(
        await readFile(path.join(repositoryRoot, relativePath), "utf8"),
      ),
    ),
  )
).flat();

function sorted(values) {
  return [...values].sort();
}

function placeholders(value) {
  return sorted(value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []);
}

function translateCommon(locale) {
  return (key) => {
    const value = messages[locale][key];
    assert.equal(
      typeof value,
      "string",
      `${locale} is missing common key ${key}`,
    );
    return value;
  };
}

test("common catalog retains its four-locale key and placeholder closure", () => {
  const expectedKeys = sorted(Object.keys(messages.en));
  assert.equal(expectedKeys.length, 304);

  for (const locale of locales) {
    const localeKeys = sorted(Object.keys(messages[locale]));
    assert.deepEqual(localeKeys, expectedKeys);
    assert.equal(
      localeKeys.some(
        (key) => key.startsWith("project.") || key.startsWith("live."),
      ),
      false,
    );

    for (const key of expectedKeys) {
      assert.deepEqual(
        placeholders(messages[locale][key]),
        placeholders(messages.en[key]),
        `${locale} placeholder drift for ${key}`,
      );
    }
  }

  assert.deepEqual(
    sorted(expectedKeys.filter((key) => key.startsWith("context."))),
    sorted([
      "context.selectorLabel",
      "context.standardPreview",
      "context.livePreview",
      "context.day1",
      "context.day2",
      "context.both",
      "context.dayShow",
      "context.nightShow",
      "context.bothShows",
    ]),
  );
});

test("presentation catalogs have one complete typed non-Japanese owner", () => {
  const expectedKeys = sorted(Object.keys(presentationMessages.en));
  assert.equal(expectedKeys.length, 75);

  for (const locale of nonJapaneseLocales) {
    assert.deepEqual(
      sorted(Object.keys(presentationMessages[locale])),
      expectedKeys,
    );
    for (const key of expectedKeys) {
      assert.deepEqual(
        placeholders(presentationMessages[locale][key]),
        placeholders(presentationMessages.en[key]),
        `${locale} placeholder drift for ${key}`,
      );
    }
  }

  assert.deepEqual(sorted(Object.keys(presentationMessages.ja)), [
    "live.kokuritsu2026.badge.wayHomeOnly",
    "live.kokuritsu2026.hint",
  ]);
  for (const key of Object.keys(presentationMessages.ja)) {
    assert.deepEqual(
      placeholders(presentationMessages.ja[key]),
      placeholders(presentationMessages.en[key]),
      `ja override placeholder drift for ${key}`,
    );
  }
});

test("project presentation stays synchronous and Japanese stays canonical", () => {
  assert.deepEqual(sorted(Object.keys(PROJECT_PRESENTATION_KEYS)), [
    "equal-love",
    "nearly-equal-joy",
    "not-equal-me",
  ]);

  for (const projectId of Object.keys(PROJECT_PRESENTATION_KEYS)) {
    const project = {
      id: projectId,
      subtitle: `${projectId}:raw-subtitle`,
      description: `${projectId}:raw-description`,
      shareText: `${projectId}:raw-share`,
    };

    assert.deepEqual(localizeProjectPresentation(project, "ja"), {
      subtitle: project.subtitle,
      description: project.description,
      shareText: project.shareText,
    });

    for (const locale of nonJapaneseLocales) {
      const result = localizeProjectPresentation(project, locale);
      assert.equal(result instanceof Promise, false);
      const keys = PROJECT_PRESENTATION_KEYS[projectId];
      assert.deepEqual(result, {
        subtitle: presentationMessages[locale][keys.subtitle],
        description: presentationMessages[locale][keys.description],
        shareText: presentationMessages[locale][keys.shareText],
      });
    }
  }
});

test("repository Live JSON and presentation mappings have deterministic closure", () => {
  assert.deepEqual(
    sorted(Object.keys(LIVE_EXPERIENCE_PRESENTATION_KEYS)),
    sorted(liveExperiences.map((experience) => experience.id)),
  );

  for (const experience of liveExperiences) {
    const keys = LIVE_EXPERIENCE_PRESENTATION_KEYS[experience.id];
    assert.deepEqual(
      sorted(Object.keys(keys.slots)),
      sorted(experience.slots.map((slot) => slot.id)),
      `${experience.id} slot closure`,
    );

    const expectedContexts = [
      ...(experience.performances ?? []).map((performance) => performance.id),
      ...(experience.includeCombinedPerformance ? ["both"] : []),
    ];
    assert.deepEqual(
      sorted(Object.keys(keys.contexts ?? {})),
      sorted(expectedContexts),
      `${experience.id} context closure`,
    );
  }
});

test("four-locale Live presentation preserves canonical Japanese and overlays", () => {
  for (const experience of liveExperiences) {
    const keys = LIVE_EXPERIENCE_PRESENTATION_KEYS[experience.id];

    for (const locale of locales) {
      const result = localizeLiveExperiencePresentation(
        experience,
        locale,
        translateCommon(locale),
      );
      assert.equal(result instanceof Promise, false);
      assert.equal(result.eventName, experience.eventName);
      assert.equal(result.venue, experience.venue);
      assert.deepEqual(
        result.contextLabels,
        keys.contexts
          ? Object.fromEntries(
              Object.entries(keys.contexts).map(([id, key]) => [
                id,
                messages[locale][key],
              ]),
            )
          : undefined,
      );

      if (locale === "ja") {
        assert.equal(result.title, experience.title);
        assert.equal(result.subtitle, experience.subtitle);
        assert.equal(result.description, experience.description);
        assert.equal(result.shareText, experience.share.text);
        assert.deepEqual(result.slots, experience.slots);
      } else {
        assert.equal(result.title, presentationMessages[locale][keys.title]);
        assert.equal(
          result.subtitle,
          presentationMessages[locale][keys.subtitle],
        );
        assert.equal(
          result.description,
          presentationMessages[locale][keys.description],
        );
        assert.equal(
          result.shareText,
          presentationMessages[locale][keys.shareText],
        );
        for (const slot of result.slots) {
          const slotKeys = keys.slots[slot.id];
          assert.equal(
            slot.label,
            presentationMessages[locale][slotKeys.label],
          );
          assert.equal(
            slot.subtitle,
            presentationMessages[locale][slotKeys.subtitle],
          );
        }
      }
    }
  }

  const kokuritsu = liveExperiences.find(
    (experience) => experience.id === "kokuritsu_2026",
  );
  const jaCopy = localizeLiveExperiencePresentation(
    kokuritsu,
    "ja",
    translateCommon("ja"),
  );
  assert.equal(
    jaCopy.hint,
    "「帰り道に聴いた曲」は全楽曲から選べます。FREE PICKは国立で披露された楽曲から選べます。",
  );
  assert.equal(jaCopy.catalogOnlyBadge, "帰り道枠のみ");
});

test("unknown experiences and slot identity drift fail closed in every locale", () => {
  const source = liveExperiences[0];

  assert.throws(
    () =>
      localizeLiveExperiencePresentation(
        { ...source, id: "unknown_live" },
        "en",
        translateCommon("en"),
      ),
    /Missing presentation mapping/,
  );

  assert.throws(
    () =>
      localizeLiveExperiencePresentation(
        {
          ...source,
          slots: [
            ...source.slots,
            {
              ...source.slots[0],
              id: "unknown-slot",
            },
          ],
        },
        "ja",
        translateCommon("ja"),
      ),
    /slot identity closure mismatch.*unexpected: unknown-slot/,
  );

  assert.throws(
    () =>
      localizeLiveExperiencePresentation(
        {
          ...source,
          slots: source.slots.slice(0, -1),
        },
        "en",
        translateCommon("en"),
      ),
    /slot identity closure mismatch.*missing: free-pick/,
  );
});

test("performance and combined context identity drift fail closed", () => {
  const source = liveExperiences.find(
    (experience) => experience.id === "kokuritsu_2026",
  );

  assert.throws(
    () =>
      localizeLiveExperiencePresentation(
        {
          ...source,
          performances: source.performances.slice(0, -1),
        },
        "ja",
        translateCommon("ja"),
      ),
    /context identity closure mismatch.*missing: day2, both/,
  );

  assert.throws(
    () =>
      localizeLiveExperiencePresentation(
        {
          ...source,
          performances: [
            ...source.performances,
            {
              ...source.performances[0],
              id: "unexpected-performance",
            },
          ],
        },
        "en",
        translateCommon("en"),
      ),
    /context identity closure mismatch.*unexpected: unexpected-performance/,
  );

  assert.throws(
    () =>
      localizeLiveExperiencePresentation(
        {
          ...source,
          includeCombinedPerformance: false,
        },
        "ko",
        translateCommon("ko"),
      ),
    /context identity closure mismatch.*missing: both/,
  );
});
