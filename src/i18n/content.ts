import { PROJECTS } from "../projects/registry";
import type { ExportTemplateId } from "../schema/export";
import type { ProjectId } from "../schema/project";
import type { PickExperience } from "../schema/pick-experience";
import type { AppLocale } from "./locales";
import type { MessageKey } from "./messages";
import {
  localizeLiveExperiencePresentation,
  localizeProjectPresentation,
} from "./presentation";
import type { ExperienceUiCopy } from "./presentation";
import { translate } from "./translate";

export type { ExperienceUiCopy } from "./presentation";

const EXPORT_TEMPLATE_MESSAGE_KEYS: Record<ExportTemplateId, MessageKey> = {
  classic: "preview.template.classic",
  spotlight: "preview.template.spotlight",
};

export function getExportTemplateMessageKey(templateId: ExportTemplateId) {
  return EXPORT_TEMPLATE_MESSAGE_KEYS[templateId];
}

export function localizeProjectCopy(projectId: ProjectId, locale: AppLocale) {
  return localizeProjectPresentation(PROJECTS[projectId].config, locale);
}

export function localizeExperienceUi(
  experience: PickExperience,
  locale: AppLocale,
): ExperienceUiCopy {
  if (experience.kind === "standard") {
    const project = PROJECTS[experience.projectId].config;
    const projectCopy = localizeProjectPresentation(project, locale);

    return {
      title: project.displayName,
      subtitle: projectCopy.subtitle,
      description: projectCopy.description,
      slots: experience.slots,
      shareText: projectCopy.shareText,
    };
  }

  return localizeLiveExperiencePresentation(experience, locale, (key) =>
    translate(locale, key),
  );
}
