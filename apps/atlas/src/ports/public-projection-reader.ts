import type { PublicAtlasProjectionParseResult } from "../contracts/public-atlas-projection.js";

export type PublicProjectionReadResult =
  | PublicAtlasProjectionParseResult
  | {
      readonly status: "read-failed";
      readonly raw: string | null;
      readonly error: string;
    };

/** Read-only boundary; projection generation and authoring live elsewhere. */
export interface PublicProjectionReader {
  read(): Promise<PublicProjectionReadResult>;
}
