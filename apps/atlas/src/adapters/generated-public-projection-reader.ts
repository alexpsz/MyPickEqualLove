import generatedProjection from "../generated/public-atlas-projection.v1.json";
import {
  parsePublicAtlasProjectionValue,
  type PublicAtlasProjectionV1,
} from "../contracts/public-atlas-projection";
import type { PublicProjectionReader } from "../ports/public-projection-reader";

export const GENERATED_PUBLIC_ATLAS_PROJECTION: PublicAtlasProjectionV1 =
  parsePublicAtlasProjectionValue(generatedProjection);

export const generatedPublicProjectionReader: PublicProjectionReader = {
  async read() {
    return { status: "valid", value: GENERATED_PUBLIC_ATLAS_PROJECTION };
  },
};
