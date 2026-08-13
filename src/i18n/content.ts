import { getExperienceContexts } from "../data/pickExperiences";
import type { ExportTemplateId } from "../schema/export";
import { PROJECTS, type ProjectId } from "../projects/registry";
import type {
  ExperiencePickSlot,
  PickExperience,
} from "../schema/pick-experience";
import type { AppLocale } from "./locales";
import type { MessageKey } from "./messages";
import { translate } from "./translate";

interface ProjectMessageKeys {
  subtitle: MessageKey;
  description: MessageKey;
  shareText: MessageKey;
}

interface LiveExperienceMessageKeys {
  title: MessageKey;
  subtitle: MessageKey;
  description: MessageKey;
  slots: Readonly<
    Record<string, Readonly<{ label: MessageKey; subtitle: MessageKey }>>
  >;
  contexts?: Readonly<Record<string, MessageKey>>;
  shareText: MessageKey;
  hint?: MessageKey;
  catalogOnlyBadge?: MessageKey;
}

export interface ExperienceUiCopy {
  title: string;
  subtitle: string;
  description: string;
  eventName?: string;
  venue?: string;
  slots: ExperiencePickSlot[];
  contextLabels?: Readonly<Record<string, string>>;
  shareText: string;
  hint?: string;
  catalogOnlyBadge?: string;
}

const PROJECT_MESSAGE_KEYS: Record<ProjectId, ProjectMessageKeys> = {
  "equal-love": {
    subtitle: "project.equalLove.subtitle",
    description: "project.equalLove.description",
    shareText: "project.equalLove.shareText",
  },
  "nearly-equal-joy": {
    subtitle: "project.nearlyEqualJoy.subtitle",
    description: "project.nearlyEqualJoy.description",
    shareText: "project.nearlyEqualJoy.shareText",
  },
  "not-equal-me": {
    subtitle: "project.notEqualMe.subtitle",
    description: "project.notEqualMe.description",
    shareText: "project.notEqualMe.shareText",
  },
};

const EXPORT_TEMPLATE_MESSAGE_KEYS: Record<ExportTemplateId, MessageKey> = {
  classic: "preview.template.classic",
  spotlight: "preview.template.spotlight",
};

const LIVE_EXPERIENCE_MESSAGE_KEYS: Readonly<
  Record<string, LiveExperienceMessageKeys>
> = {
  kokuritsu_2026: {
    title: "live.kokuritsu2026.title",
    subtitle: "live.kokuritsu2026.subtitle",
    description: "live.kokuritsu2026.description",
    slots: {
      unforgettable: {
        label: "live.kokuritsu2026.slot.unforgettable.label",
        subtitle: "live.kokuritsu2026.slot.unforgettable.subtitle",
      },
      "heated-up": {
        label: "live.kokuritsu2026.slot.heatedUp.label",
        subtitle: "live.kokuritsu2026.slot.heatedUp.subtitle",
      },
      tears: {
        label: "live.kokuritsu2026.slot.tears.label",
        subtitle: "live.kokuritsu2026.slot.tears.subtitle",
      },
      "oshi-shined": {
        label: "live.kokuritsu2026.slot.oshiShined.label",
        subtitle: "live.kokuritsu2026.slot.oshiShined.subtitle",
      },
      "way-home": {
        label: "live.kokuritsu2026.slot.wayHome.label",
        subtitle: "live.kokuritsu2026.slot.wayHome.subtitle",
      },
      "free-pick": {
        label: "live.kokuritsu2026.slot.freePick.label",
        subtitle: "live.kokuritsu2026.slot.freePick.subtitle",
      },
    },
    contexts: {
      day1: "context.day1",
      day2: "context.day2",
      both: "context.both",
    },
    shareText: "live.kokuritsu2026.shareText",
    hint: "live.kokuritsu2026.hint",
    catalogOnlyBadge: "live.kokuritsu2026.badge.wayHomeOnly",
  },
  tokyo_dome_2027: {
    title: "live.tokyoDome2027.title",
    subtitle: "live.tokyoDome2027.subtitle",
    description: "live.tokyoDome2027.description",
    slots: {
      opening: {
        label: "live.tokyoDome2027.slot.opening.label",
        subtitle: "live.tokyoDome2027.slot.opening.subtitle",
      },
      hype: {
        label: "live.tokyoDome2027.slot.hype.label",
        subtitle: "live.tokyoDome2027.slot.hype.subtitle",
      },
      cry: {
        label: "live.tokyoDome2027.slot.cry.label",
        subtitle: "live.tokyoDome2027.slot.cry.subtitle",
      },
      oshi: {
        label: "live.tokyoDome2027.slot.oshi.label",
        subtitle: "live.tokyoDome2027.slot.oshi.subtitle",
      },
      finale: {
        label: "live.tokyoDome2027.slot.finale.label",
        subtitle: "live.tokyoDome2027.slot.finale.subtitle",
      },
      "free-pick": {
        label: "live.tokyoDome2027.slot.freePick.label",
        subtitle: "live.tokyoDome2027.slot.freePick.subtitle",
      },
    },
    shareText: "live.tokyoDome2027.shareText",
  },
  joy_4th_anniversary_2026: {
    title: "live.joy4th2026.title",
    subtitle: "live.joy4th2026.subtitle",
    description: "live.joy4th2026.description",
    slots: {
      "dream-opening": {
        label: "live.joy4th2026.slot.dreamOpening.label",
        subtitle: "live.joy4th2026.slot.dreamOpening.subtitle",
      },
      journey: {
        label: "live.joy4th2026.slot.journey.label",
        subtitle: "live.joy4th2026.slot.journey.subtitle",
      },
      "venue-energy": {
        label: "live.joy4th2026.slot.venueEnergy.label",
        subtitle: "live.joy4th2026.slot.venueEnergy.subtitle",
      },
      "oshi-spotlight": {
        label: "live.joy4th2026.slot.oshiSpotlight.label",
        subtitle: "live.joy4th2026.slot.oshiSpotlight.subtitle",
      },
      gratitude: {
        label: "live.joy4th2026.slot.gratitude.label",
        subtitle: "live.joy4th2026.slot.gratitude.subtitle",
      },
      "next-chapter": {
        label: "live.joy4th2026.slot.nextChapter.label",
        subtitle: "live.joy4th2026.slot.nextChapter.subtitle",
      },
    },
    shareText: "live.joy4th2026.shareText",
  },
  not_equal_me_7th_anniversary_2026: {
    title: "live.notEqualMe7th2026.title",
    subtitle: "live.notEqualMe7th2026.subtitle",
    description: "live.notEqualMe7th2026.description",
    slots: {
      "dream-opening": {
        label: "live.notEqualMe7th2026.slot.dreamOpening.label",
        subtitle: "live.notEqualMe7th2026.slot.dreamOpening.subtitle",
      },
      journey: {
        label: "live.notEqualMe7th2026.slot.journey.label",
        subtitle: "live.notEqualMe7th2026.slot.journey.subtitle",
      },
      "venue-energy": {
        label: "live.notEqualMe7th2026.slot.venueEnergy.label",
        subtitle: "live.notEqualMe7th2026.slot.venueEnergy.subtitle",
      },
      "oshi-spotlight": {
        label: "live.notEqualMe7th2026.slot.oshiSpotlight.label",
        subtitle: "live.notEqualMe7th2026.slot.oshiSpotlight.subtitle",
      },
      gratitude: {
        label: "live.notEqualMe7th2026.slot.gratitude.label",
        subtitle: "live.notEqualMe7th2026.slot.gratitude.subtitle",
      },
      "next-chapter": {
        label: "live.notEqualMe7th2026.slot.nextChapter.label",
        subtitle: "live.notEqualMe7th2026.slot.nextChapter.subtitle",
      },
    },
    shareText: "live.notEqualMe7th2026.shareText",
  },
};

assertLiveExperienceMessageCoverage();

export function getExportTemplateMessageKey(templateId: ExportTemplateId) {
  return EXPORT_TEMPLATE_MESSAGE_KEYS[templateId];
}

export function localizeProjectCopy(projectId: ProjectId, locale: AppLocale) {
  const project = PROJECTS[projectId].config;
  if (locale === "ja") {
    return {
      subtitle: project.subtitle,
      description: project.description,
      shareText: project.shareText,
    } as const;
  }

  const keys = PROJECT_MESSAGE_KEYS[projectId];

  return {
    subtitle: translate(locale, keys.subtitle),
    description: translate(locale, keys.description),
    shareText: translate(locale, keys.shareText),
  } as const;
}

export function localizeExperienceUi(
  experience: PickExperience,
  locale: AppLocale,
): ExperienceUiCopy {
  if (experience.kind === "standard") {
    const project = PROJECTS[experience.projectId].config;
    const projectCopy = localizeProjectCopy(experience.projectId, locale);

    return {
      title: project.displayName,
      subtitle: projectCopy.subtitle,
      description: projectCopy.description,
      slots: experience.slots,
      shareText: projectCopy.shareText,
    };
  }

  const keys = LIVE_EXPERIENCE_MESSAGE_KEYS[experience.id];
  if (!keys) {
    throw new Error(
      `[i18n] Missing message mapping for live experience "${experience.id}".`,
    );
  }

  if (locale === "ja") {
    return {
      title: experience.title,
      subtitle: experience.subtitle,
      description: experience.description,
      eventName: experience.eventName,
      venue: experience.venue,
      slots: experience.slots,
      contextLabels: keys?.contexts
        ? localizeContextLabels(keys.contexts, locale)
        : undefined,
      shareText: experience.share.text,
      hint: keys?.hint ? translate(locale, keys.hint) : undefined,
      catalogOnlyBadge: keys?.catalogOnlyBadge
        ? translate(locale, keys.catalogOnlyBadge)
        : undefined,
    };
  }

  return {
    title: translate(locale, keys.title),
    subtitle: translate(locale, keys.subtitle),
    description: translate(locale, keys.description),
    eventName: experience.eventName,
    venue: experience.venue,
    slots: experience.slots.map((slot) => localizeSlot(slot, keys, locale)),
    contextLabels: keys.contexts
      ? localizeContextLabels(keys.contexts, locale)
      : undefined,
    shareText: translate(locale, keys.shareText),
    hint: keys.hint ? translate(locale, keys.hint) : undefined,
    catalogOnlyBadge: keys.catalogOnlyBadge
      ? translate(locale, keys.catalogOnlyBadge)
      : undefined,
  };
}

function localizeContextLabels(
  contextKeys: Readonly<Record<string, MessageKey>>,
  locale: AppLocale,
) {
  return Object.fromEntries(
    Object.entries(contextKeys).map(([id, key]) => [
      id,
      translate(locale, key),
    ]),
  );
}

function localizeSlot(
  slot: ExperiencePickSlot,
  keys: LiveExperienceMessageKeys,
  locale: AppLocale,
) {
  const slotKeys = keys.slots[slot.id];
  if (!slotKeys) {
    throw new Error(`[i18n] Missing slot message mapping for "${slot.id}".`);
  }

  return {
    ...slot,
    label: translate(locale, slotKeys.label),
    subtitle: translate(locale, slotKeys.subtitle),
  };
}

function assertLiveExperienceMessageCoverage() {
  const routableExperiences = Object.entries(PROJECTS).flatMap(
    ([projectId, project]) =>
      project.liveExperiences
        .filter((experience) => experience.status !== "draft")
        .map((experience) => ({ projectId, experience })),
  );

  assertExactKeyCoverage(
    "live experiences",
    routableExperiences.map(({ experience }) => experience.id),
    Object.keys(LIVE_EXPERIENCE_MESSAGE_KEYS),
  );

  for (const { projectId, experience } of routableExperiences) {
    const keys = LIVE_EXPERIENCE_MESSAGE_KEYS[experience.id];
    if (!keys) {
      throw new Error(
        `[i18n] Missing message mapping for ${projectId}/${experience.id}.`,
      );
    }

    assertExactKeyCoverage(
      `${projectId}/${experience.id} slots`,
      experience.slots.map((slot) => slot.id),
      Object.keys(keys.slots),
    );
    assertExactKeyCoverage(
      `${projectId}/${experience.id} contexts`,
      getExperienceContexts(experience).map((context) => context.id),
      Object.keys(keys.contexts ?? {}),
    );
  }
}

function assertExactKeyCoverage(
  label: string,
  expectedKeys: readonly string[],
  actualKeys: readonly string[],
) {
  const expected = new Set(expectedKeys);
  const actual = new Set(actualKeys);
  const missing = expectedKeys.filter((key) => !actual.has(key));
  const unexpected = actualKeys.filter((key) => !expected.has(key));

  if (missing.length === 0 && unexpected.length === 0) return;

  const details = [
    missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
    unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  throw new Error(`[i18n] ${label} mapping mismatch (${details}).`);
}
