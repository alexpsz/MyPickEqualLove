import type { ExperienceMode } from "../../contracts/journey-document.js";
import type { EventRecordAction } from "./event-presentation.js";

type PerformanceRecordAction = Extract<
  EventRecordAction,
  { readonly kind: "record-performance" }
>;

export type PerformanceOccurredAtResolution =
  | {
      readonly status: "resolved";
      readonly occurredAt: string;
      readonly source: "official" | "personal";
    }
  | { readonly status: "invalid-personal-time" };

export function usesOfficialPerformanceStart(
  action: PerformanceRecordAction,
  mode: ExperienceMode,
): boolean {
  return mode === "in-person" && action.officialStartAt !== null;
}

export function resolvePerformanceOccurredAt(
  action: PerformanceRecordAction,
  mode: ExperienceMode,
  personalOccurredAt: string,
): PerformanceOccurredAtResolution {
  if (mode === "in-person" && action.officialStartAt !== null) {
    return {
      status: "resolved",
      occurredAt: action.officialStartAt,
      source: "official",
    };
  }

  if (personalOccurredAt.trim() === "") {
    return { status: "invalid-personal-time" };
  }
  const parsed = new Date(personalOccurredAt);
  if (Number.isNaN(parsed.getTime())) {
    return { status: "invalid-personal-time" };
  }
  return {
    status: "resolved",
    occurredAt: parsed.toISOString(),
    source: "personal",
  };
}
