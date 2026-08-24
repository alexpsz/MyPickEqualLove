import "server-only";

import {
  PROJECTS,
  PROJECT_IDS,
  type ProjectId,
} from "../../../../src/projects/registry";

export type ProductFamilyDestination = Readonly<{
  siteId: ProjectId;
  href: string;
}>;

// Keep the MyPick registry as the only source of deployment URLs. Atlas only
// projects the public product IDs into links for its own shell.
export const PRODUCT_FAMILY_NAVIGATION: readonly ProductFamilyDestination[] =
  PROJECT_IDS.map((siteId) => ({
    siteId,
    href: PROJECTS[siteId].config.siteUrl,
  }));
