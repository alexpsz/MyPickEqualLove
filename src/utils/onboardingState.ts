export const ONBOARDING_STATE_VERSION = 1;

interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type OnboardingStateLoadResult =
  | { status: "missing" }
  | { status: "completed" }
  | { status: "blocked"; reason: "invalid" | "unavailable" };

const COMPLETED_DOCUMENT = {
  version: ONBOARDING_STATE_VERSION,
  completed: true,
} as const;

export function loadOnboardingState(
  storage: OnboardingStorage,
  key: string,
): OnboardingStateLoadResult {
  let raw: string | null;

  try {
    raw = storage.getItem(key);
  } catch {
    return { status: "blocked", reason: "unavailable" };
  }

  if (raw === null) return { status: "missing" };

  try {
    const parsed: unknown = JSON.parse(raw);
    return isCompletedDocument(parsed)
      ? { status: "completed" }
      : { status: "blocked", reason: "invalid" };
  } catch {
    return { status: "blocked", reason: "invalid" };
  }
}

export function completeOnboarding(
  storage: OnboardingStorage,
  key: string,
): OnboardingStateLoadResult {
  const current = loadOnboardingState(storage, key);
  if (current.status !== "missing") return current;

  try {
    storage.setItem(key, JSON.stringify(COMPLETED_DOCUMENT));
    return { status: "completed" };
  } catch {
    return { status: "blocked", reason: "unavailable" };
  }
}

function isCompletedDocument(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const document = value as Record<string, unknown>;
  const keys = Object.keys(document).sort();
  return (
    keys.length === 2 &&
    keys[0] === "completed" &&
    keys[1] === "version" &&
    document.version === ONBOARDING_STATE_VERSION &&
    document.completed === true
  );
}
