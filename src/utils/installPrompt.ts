export const INSTALL_HINT_SCHEMA_VERSION = 1;

export interface InstallHintState {
  schemaVersion: typeof INSTALL_HINT_SCHEMA_VERSION;
  hasCompletedPick: boolean;
  dismissed: boolean;
}

export interface InstallHintStorage {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  setItem(key: string, value: string): void;
}

export type InstallHintReadStatus =
  | "absent"
  | "valid"
  | "invalid"
  | "unsupported"
  | "unavailable";

export interface InstallHintReadResult {
  status: InstallHintReadStatus;
  state: InstallHintState | null;
}

export type InstallPromptMode = "native" | "ios";

export function readInstallHintState(
  storage: InstallHintStorage | null,
  storageKey: string,
): InstallHintReadResult {
  if (!storage) return { status: "unavailable", state: null };

  let serialized: string | null;
  try {
    serialized = storage.getItem(storageKey);
  } catch {
    return { status: "unavailable", state: null };
  }
  if (serialized === null) return { status: "absent", state: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return { status: "invalid", state: null };
  }
  if (!isRecord(parsed)) return { status: "invalid", state: null };
  if (parsed.schemaVersion !== INSTALL_HINT_SCHEMA_VERSION) {
    return { status: "unsupported", state: null };
  }
  if (
    typeof parsed.hasCompletedPick !== "boolean" ||
    typeof parsed.dismissed !== "boolean"
  ) {
    return { status: "invalid", state: null };
  }

  return {
    status: "valid",
    state: {
      schemaVersion: INSTALL_HINT_SCHEMA_VERSION,
      hasCompletedPick: parsed.hasCompletedPick,
      dismissed: parsed.dismissed,
    },
  };
}

export function markInstallHintPickCompleted(
  storage: InstallHintStorage | null,
  storageKey: string,
) {
  const current = readInstallHintState(storage, storageKey);
  if (!canMutateInstallHint(current.status)) return false;
  if (current.state?.hasCompletedPick) return true;

  return writeInstallHintState(storage, storageKey, {
    schemaVersion: INSTALL_HINT_SCHEMA_VERSION,
    hasCompletedPick: true,
    dismissed: current.state?.dismissed ?? false,
  });
}

export function dismissInstallHint(
  storage: InstallHintStorage | null,
  storageKey: string,
) {
  const current = readInstallHintState(storage, storageKey);
  if (!canMutateInstallHint(current.status)) return false;

  return writeInstallHintState(storage, storageKey, {
    schemaVersion: INSTALL_HINT_SCHEMA_VERSION,
    hasCompletedPick: current.state?.hasCompletedPick ?? false,
    dismissed: true,
  });
}

export function hasStoredPick(
  storage: InstallHintStorage | null,
  storagePrefix: string,
) {
  if (!storage) return false;
  const pickKeyPattern = new RegExp(
    `^${escapeRegExp(storagePrefix)}_(?:mypicks|live_.+_picks)_v([12])$`,
  );

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);
      if (!storageKey) continue;
      const match = storageKey.match(pickKeyPattern);
      if (!match) continue;

      const serialized = storage.getItem(storageKey);
      if (serialized && serializedHasPick(serialized, Number(match[1]))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function getInstallPromptMode({
  dismissed,
  hasCompletedPick,
  hasNativePrompt,
  isIosSafari,
  isStandalone,
}: {
  dismissed: boolean;
  hasCompletedPick: boolean;
  hasNativePrompt: boolean;
  isIosSafari: boolean;
  isStandalone: boolean;
}): InstallPromptMode | null {
  if (dismissed || !hasCompletedPick || isStandalone) return null;
  if (hasNativePrompt) return "native";
  return isIosSafari ? "ios" : null;
}

export function detectIosSafari({
  maxTouchPoints,
  platform,
  userAgent,
}: {
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
}) {
  const isIosDevice =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  if (!isIosDevice || !/AppleWebKit/.test(userAgent)) return false;

  return (
    /Safari/.test(userAgent) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA)/.test(userAgent)
  );
}

export function detectStandalone({
  displayModeStandalone,
  navigatorStandalone,
}: {
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
}) {
  return displayModeStandalone || navigatorStandalone;
}

export function shouldRegisterServiceWorker({
  isProduction,
  isSecureContext,
  isTopLevel,
  serviceWorkerSupported,
}: {
  isProduction: boolean;
  isSecureContext: boolean;
  isTopLevel: boolean;
  serviceWorkerSupported: boolean;
}) {
  return (
    isProduction && isSecureContext && isTopLevel && serviceWorkerSupported
  );
}

function writeInstallHintState(
  storage: InstallHintStorage | null,
  storageKey: string,
  state: InstallHintState,
) {
  if (!storage) return false;
  try {
    storage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function serializedHasPick(serialized: string, version: number) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return false;
  }

  const picks =
    version === 2 &&
    isRecord(parsed) &&
    parsed.schemaVersion === 2 &&
    isRecord(parsed.picks)
      ? parsed.picks
      : version === 1 && isRecord(parsed)
        ? parsed
        : null;
  return (
    picks !== null &&
    Object.entries(picks).some(
      ([slotId, songId]) =>
        slotId.length > 0 && typeof songId === "string" && songId.length > 0,
    )
  );
}

function canMutateInstallHint(status: InstallHintReadStatus) {
  return status === "absent" || status === "valid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
