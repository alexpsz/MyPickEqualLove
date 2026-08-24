import "server-only";

import { MY_PICK_SITE_URLS } from "../../../../src/projects/product-family-sites";
import { PUBLIC_ATLAS_SITE_IDS } from "../contracts/identity";

export type ProductFamilyDestination = Readonly<{
  siteId: (typeof PUBLIC_ATLAS_SITE_IDS)[number];
  href: string;
}>;

// Keep the URL-only product-family facts as the sole deployment URL source.
// Atlas only projects the public product IDs into links for its own shell.
export const PRODUCT_FAMILY_NAVIGATION: readonly ProductFamilyDestination[] =
  PUBLIC_ATLAS_SITE_IDS.map((siteId) => ({
    siteId,
    href: MY_PICK_SITE_URLS[siteId],
  }));
