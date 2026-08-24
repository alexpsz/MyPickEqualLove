import "server-only";

import { PROJECTS } from "../../../../src/projects/registry";
import { PUBLIC_ATLAS_SITE_IDS } from "../contracts/identity";

export type ProductFamilyDestination = Readonly<{
  siteId: (typeof PUBLIC_ATLAS_SITE_IDS)[number];
  href: string;
}>;

// Keep the MyPick registry as the only source of deployment URLs. Atlas only
// projects the public product IDs into links for its own shell.
export const PRODUCT_FAMILY_NAVIGATION: readonly ProductFamilyDestination[] =
  PUBLIC_ATLAS_SITE_IDS.map((siteId) => ({
    siteId,
    href: PROJECTS[siteId].config.siteUrl,
  }));
