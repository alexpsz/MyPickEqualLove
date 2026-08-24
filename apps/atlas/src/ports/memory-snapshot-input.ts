import type { MemorySnapshotV1 } from "../contracts/memory-snapshot.js";

export type MemorySnapshotInputResult =
  | { readonly status: "ready"; readonly snapshot: MemorySnapshotV1 }
  | { readonly status: "cancelled"; readonly journeyMutation: "none" }
  | {
      readonly status: "failed";
      readonly error: string;
      readonly journeyMutation: "none";
    };

/**
 * The renderer receives only the enumerated, consent-bearing snapshot. This
 * port has no JourneyRepository dependency and cannot mutate personal state.
 */
export interface MemorySnapshotInputPort {
  request(): Promise<MemorySnapshotInputResult>;
}
