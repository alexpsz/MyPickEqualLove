import type {
  AtlasLifecycle,
  AtlasVerificationStatus,
  ProjectionCoverage,
} from "../contracts/public-atlas-projection.js";
import type {
  JourneyIntent,
  LocalCustomEventFallback,
} from "../contracts/journey-document.js";
import type {
  PublicEntityReference,
  ReadableFallbackSnapshot,
} from "../contracts/public-reference.js";

/** Shared by event discovery and the public-event Journey picker. */
export interface PublicEventSummaryViewModel {
  readonly reference: PublicEntityReference<"event">;
  readonly groupName: string;
  readonly eventName: string;
  readonly venueName: string;
  readonly dates: { readonly start: string; readonly end: string };
  readonly timezone: string;
  readonly lifecycle: AtlasLifecycle;
  readonly performanceCount: number;
  readonly verificationStatus: AtlasVerificationStatus;
  readonly coverage: ProjectionCoverage;
}

export type JourneyTimelineSubjectViewModel =
  | {
      readonly kind: "local-custom-event";
      readonly fallback: LocalCustomEventFallback;
    }
  | {
      readonly kind: "public-reference";
      readonly resolution: "resolved" | "missing";
      readonly reference: PublicEntityReference<"event" | "performance">;
      readonly fallback: ReadableFallbackSnapshot;
    };

/** Shared by Journey timeline and Memory-selection preview. */
export interface JourneyTimelineItemViewModel {
  readonly journeyId: string;
  readonly subject: JourneyTimelineSubjectViewModel;
  readonly intent: JourneyIntent;
  readonly experienceEntryCount: number;
  readonly updatedAt: string;
}
