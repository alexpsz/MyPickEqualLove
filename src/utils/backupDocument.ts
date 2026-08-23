import { BACKUP_CONFIG, getProjectBackupConfig } from "../config/project";
import { isAppLocale, LOCALE_STORAGE_KEY } from "../i18n/locales";
import { isProjectId, type ProjectId } from "../schema/project";
import {
  BOARD_LIBRARY_SCHEMA_VERSION,
  CURRENT_BOARD_SCHEMA_VERSION,
  parseBoardLibrary,
  type BoardSnapshot,
} from "./boardStorage";
import {
  parseCurrentExportOptions,
  parseLegacyExportOptions,
} from "./exportOptions";
import { isThemePreference } from "./themePreference";

export const BACKUP_FORMAT = "mypick.backup" as const;
export const BACKUP_VERSION = 1 as const;
export const BACKUP_MAX_ENTRIES = 256;
export const BACKUP_MAX_ENTRY_CHARACTERS = 5 * 1024 * 1024;
export const BACKUP_MAX_DOCUMENT_CHARACTERS = 8 * 1024 * 1024;

export interface BackupDocument {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  projectId: ProjectId;
  exportedAt: string;
  entries: Record<string, string>;
}

export interface BackupStorageReader {
  exportedAt: string;
  keys: readonly string[];
  getItem(key: string): string | null;
}

export interface BackupCurrentStorage {
  keys: readonly string[];
  getItem(key: string): string | null;
}

export type BackupFailureCode =
  | "invalid-json"
  | "invalid-document"
  | "unsupported-format"
  | "unsupported-version"
  | "project-mismatch"
  | "invalid-entry"
  | "limit-exceeded"
  | "storage-unavailable";

export interface BackupFailure {
  code: BackupFailureCode;
  key?: string;
}

export interface ParsedBackup {
  ok: true;
  document: BackupDocument;
}

export interface BackupParseFailure {
  ok: false;
  error: BackupFailure;
}

export type BackupParseResult = ParsedBackup | BackupParseFailure;

export type RestoreEntryAction = "add" | "overwrite" | "remove" | "skip";

export interface RestorePlanEntry {
  key: string;
  currentValue: string | null;
  backupValue: string | null;
  action: RestoreEntryAction;
}

export interface RestorePlanSummary {
  add: number;
  overwrite: number;
  remove: number;
  skip: number;
}

export interface RestoreBoardSummary {
  add: number;
  overwrite: number;
  skip: number;
  remove: number;
}

export interface RestorePlanSuccess {
  ok: true;
  document: BackupDocument;
  entries: RestorePlanEntry[];
  summary: RestorePlanSummary;
  boardSummary: RestoreBoardSummary | null;
  localeIncluded: boolean;
  observedKeys: string[];
}

export interface BackupPlanFailure {
  ok: false;
  error: BackupFailure;
}

export type RestorePlan = RestorePlanSuccess | BackupPlanFailure;

export class BackupDocumentError extends Error {
  readonly code: BackupFailureCode;
  readonly key?: string;

  constructor(code: BackupFailureCode, key?: string) {
    super(key ? `${code}: ${key}` : code);
    this.name = "BackupDocumentError";
    this.code = code;
    this.key = key;
  }
}

/**
 * Creates a deterministic snapshot without changing storage. The timestamp and
 * key list are inputs so the function stays pure and is straightforward to
 * exercise outside a browser.
 */
export function createBackupDocument(
  readStorage: BackupStorageReader,
  projectId: ProjectId = BACKUP_CONFIG.projectId,
): BackupDocument {
  if (!isIsoTimestamp(readStorage.exportedAt)) {
    throw new BackupDocumentError("invalid-document");
  }

  const config = getProjectBackupConfig(projectId);
  const entries: Record<string, string> = {};
  const keys = Array.from(new Set(readStorage.keys)).sort();

  for (const key of keys) {
    if (isAssistantJournalKey(key, config.storagePrefix)) continue;

    const kind = getBackupEntryKind(key, config.storagePrefix);
    if (kind === null) {
      if (key.startsWith(`${config.storagePrefix}_`)) {
        throw new BackupDocumentError("invalid-entry", key);
      }
      continue;
    }

    let value: string | null;
    try {
      value = readStorage.getItem(key);
    } catch {
      throw new BackupDocumentError("storage-unavailable", key);
    }
    if (value === null) continue;
    validateEntryValue(key, value, kind, projectId);
    entries[key] = value;
  }

  validateEntryLimits(entries);
  const document: BackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    projectId,
    exportedAt: readStorage.exportedAt,
    entries,
  };
  validateDocumentSize(document);
  return document;
}

export function parseBackupDocument(
  text: string,
  expectedProjectId: ProjectId = BACKUP_CONFIG.projectId,
): BackupParseResult {
  if (text.length > BACKUP_MAX_DOCUMENT_CHARACTERS) {
    return failure("limit-exceeded");
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return failure("invalid-json");
  }
  return validateBackupDocument(value, expectedProjectId);
}

/** Builds an immutable dry-run. No write method is accepted or invoked. */
export function planBackupRestore(
  document: BackupDocument,
  currentStorage: BackupCurrentStorage,
  expectedProjectId: ProjectId = BACKUP_CONFIG.projectId,
): RestorePlan {
  const validation = validateBackupDocument(document, expectedProjectId);
  if (!validation.ok) return validation;

  const config = getProjectBackupConfig(expectedProjectId);
  const entryKeys = new Set(Object.keys(validation.document.entries));
  for (const key of currentStorage.keys) {
    if (isAssistantJournalKey(key, config.storagePrefix)) {
      entryKeys.add(key);
      continue;
    }
    if (getBackupEntryKind(key, config.storagePrefix) !== null) {
      entryKeys.add(key);
      continue;
    }
    if (key.startsWith(`${config.storagePrefix}_`)) {
      return failure("invalid-entry", key);
    }
  }

  const entries: RestorePlanEntry[] = [];
  try {
    for (const key of [...entryKeys].sort((left, right) =>
      left.localeCompare(right),
    )) {
      const backupValue = validation.document.entries[key] ?? null;
      const currentValue = currentStorage.getItem(key);
      entries.push({
        key,
        currentValue,
        backupValue,
        action:
          backupValue === null
            ? currentValue === null
              ? "skip"
              : "remove"
            : currentValue === null
              ? "add"
              : currentValue === backupValue
                ? "skip"
                : "overwrite",
      });
    }
  } catch {
    return failure("storage-unavailable");
  }

  const summary = entries.reduce<RestorePlanSummary>(
    (counts, entry) => ({
      ...counts,
      [entry.action]: counts[entry.action] + 1,
    }),
    { add: 0, overwrite: 0, remove: 0, skip: 0 },
  );

  return {
    ok: true,
    document: validation.document,
    entries,
    summary,
    boardSummary: summarizeBoardRestore(entries, expectedProjectId),
    localeIncluded: Object.hasOwn(
      validation.document.entries,
      LOCALE_STORAGE_KEY,
    ),
    observedKeys: Array.from(new Set(currentStorage.keys)).sort(),
  };
}

type BackupEntryKind =
  | "picks-v1"
  | "picks-v2"
  | "options-v1"
  | "options-v2"
  | "theme"
  | "board-library"
  | "song-discovery-v1"
  | "song-discovery-v2"
  | "assistant-v1"
  | "assistant-v2"
  | "context"
  | "locale";

function validateBackupDocument(
  value: unknown,
  expectedProjectId: ProjectId,
): BackupParseResult {
  if (!isPlainRecord(value)) return failure("invalid-document");
  if (value.format !== BACKUP_FORMAT) return failure("unsupported-format");
  if (value.version !== BACKUP_VERSION) {
    return failure("unsupported-version");
  }
  if (
    !hasExactKeys(value, [
      "format",
      "version",
      "projectId",
      "exportedAt",
      "entries",
    ])
  ) {
    return failure("invalid-document");
  }
  if (
    typeof value.projectId !== "string" ||
    !isProjectId(value.projectId) ||
    value.projectId !== expectedProjectId
  ) {
    return failure("project-mismatch");
  }
  if (
    typeof value.exportedAt !== "string" ||
    !isIsoTimestamp(value.exportedAt)
  ) {
    return failure("invalid-document");
  }
  if (!isPlainRecord(value.entries)) return failure("invalid-entry");

  const config = getProjectBackupConfig(expectedProjectId);
  const entries: Record<string, string> = {};
  try {
    validateEntryLimits(value.entries);
    for (const [key, rawValue] of Object.entries(value.entries)) {
      if (typeof rawValue !== "string") {
        throw new BackupDocumentError("invalid-entry", key);
      }
      const kind = getBackupEntryKind(key, config.storagePrefix);
      if (kind === null || isAssistantJournalKey(key, config.storagePrefix)) {
        throw new BackupDocumentError("invalid-entry", key);
      }
      validateEntryValue(key, rawValue, kind, expectedProjectId);
      entries[key] = rawValue;
    }
  } catch (error) {
    return toFailure(error);
  }

  const document: BackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    projectId: expectedProjectId,
    exportedAt: value.exportedAt,
    entries,
  };
  try {
    validateDocumentSize(document);
  } catch (error) {
    return toFailure(error);
  }
  return { ok: true, document };
}

function getBackupEntryKind(
  key: string,
  storagePrefix: string,
): BackupEntryKind | null {
  if (key === LOCALE_STORAGE_KEY) return "locale";

  const standardEntries: Record<string, BackupEntryKind> = {
    [`${storagePrefix}_mypicks_v1`]: "picks-v1",
    [`${storagePrefix}_mypicks_v2`]: "picks-v2",
    [`${storagePrefix}_options_v1`]: "options-v1",
    [`${storagePrefix}_options_v2`]: "options-v2",
    [`${storagePrefix}_theme_preference_v1`]: "theme",
    [`${storagePrefix}_board_library_v1`]: "board-library",
    [`${storagePrefix}_song_discovery_v1`]: "song-discovery-v1",
    [`${storagePrefix}_song_discovery_v2`]: "song-discovery-v2",
    [`${storagePrefix}_standard_pick_assistant_v1`]: "assistant-v1",
    [`${storagePrefix}_standard_pick_assistant_v2`]: "assistant-v2",
  };
  const standardKind = standardEntries[key];
  if (standardKind) return standardKind;

  const escapedPrefix = escapeRegExp(storagePrefix);
  const storageSegments = "[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*";
  const liveBase = `${escapedPrefix}_live_${storageSegments}`;
  if (new RegExp(`^${liveBase}_picks_v1$`).test(key)) return "picks-v1";
  if (new RegExp(`^${liveBase}_picks_v2$`).test(key)) return "picks-v2";
  if (new RegExp(`^${liveBase}_options_v1$`).test(key)) return "options-v1";
  if (new RegExp(`^${liveBase}_options_v2$`).test(key)) return "options-v2";
  if (new RegExp(`^${liveBase}_pick_assistant_v1$`).test(key)) {
    return "assistant-v1";
  }
  if (new RegExp(`^${liveBase}_pick_assistant_v2$`).test(key)) {
    return "assistant-v2";
  }
  if (new RegExp(`^${liveBase}_context_v1$`).test(key)) return "context";
  return null;
}

function validateEntryValue(
  key: string,
  rawValue: string,
  kind: BackupEntryKind,
  projectId: ProjectId,
) {
  if (rawValue.length > BACKUP_MAX_ENTRY_CHARACTERS) {
    throw new BackupDocumentError("limit-exceeded", key);
  }

  switch (kind) {
    case "theme":
      if (!isThemePreference(rawValue)) invalidEntry(key);
      return;
    case "locale":
      // "auto" is represented by an absent key in the existing locale contract.
      if (!isAppLocale(rawValue)) invalidEntry(key);
      return;
    case "context":
      if (!isStorageIdentifier(rawValue)) invalidEntry(key);
      return;
    case "picks-v1":
      validateLegacyPicks(key, rawValue);
      return;
    case "picks-v2":
      validateCurrentPicks(key, rawValue);
      return;
    case "options-v1":
      validateLegacyOptions(key, rawValue);
      return;
    case "options-v2":
      validateCurrentOptions(key, rawValue);
      return;
    case "board-library":
      validateBoardLibraryEntry(key, rawValue, projectId);
      return;
    case "song-discovery-v1":
      validateSongDiscovery(key, rawValue, 1);
      return;
    case "song-discovery-v2":
      validateSongDiscovery(key, rawValue, 2);
      return;
    case "assistant-v1":
      validateAssistant(key, rawValue, 1);
      return;
    case "assistant-v2":
      validateAssistant(key, rawValue, 2);
  }
}

function validateLegacyPicks(key: string, rawValue: string) {
  const value = parseJsonRecord(key, rawValue);
  if (!isStrictPicks(value)) invalidEntry(key);
}

function validateCurrentPicks(key: string, rawValue: string) {
  const value = parseJsonRecord(key, rawValue);
  if (
    !hasExactKeys(value, ["schemaVersion", "picks"]) ||
    value.schemaVersion !== CURRENT_BOARD_SCHEMA_VERSION ||
    !isStrictPicks(value.picks)
  ) {
    invalidEntry(key);
  }
}

function validateLegacyOptions(key: string, rawValue: string) {
  const value = parseJsonRecord(key, rawValue);
  if (
    !hasExactOptionalKeys(
      value,
      ["showTitles", "transparentBg"],
      ["showQrCode"],
    ) ||
    parseLegacyExportOptions(rawValue) === null
  ) {
    invalidEntry(key);
  }
}

function validateCurrentOptions(key: string, rawValue: string) {
  const value = parseJsonRecord(key, rawValue);
  const hasVersion = Object.hasOwn(value, "version");
  const exact = hasVersion
    ? hasExactOptionalKeys(
        value,
        [
          "version",
          "showTitles",
          "transparentBg",
          "templateId",
          "sizePresetId",
        ],
        ["showQrCode"],
      )
    : hasExactOptionalKeys(
        value,
        ["schemaVersion", "showTitles", "transparentBg"],
        ["showQrCode"],
      );
  const parsed = parseCurrentExportOptions(rawValue);
  if (
    !exact ||
    parsed.status === "invalid" ||
    parsed.status === "unsupported"
  ) {
    invalidEntry(key);
  }
}

function validateBoardLibraryEntry(
  key: string,
  rawValue: string,
  projectId: ProjectId,
) {
  const value = parseJsonRecord(key, rawValue);
  if (
    !hasExactKeys(value, ["schemaVersion", "snapshots"]) ||
    value.schemaVersion !== BOARD_LIBRARY_SCHEMA_VERSION ||
    !Array.isArray(value.snapshots)
  ) {
    invalidEntry(key);
  }
  for (const snapshot of value.snapshots) {
    if (
      !isPlainRecord(snapshot) ||
      !hasExactKeys(snapshot, [
        "id",
        "name",
        "createdAt",
        "updatedAt",
        "projectId",
        "experienceId",
        "contextId",
        "picks",
      ]) ||
      !isStrictPicks(snapshot.picks)
    ) {
      invalidEntry(key);
    }
  }
  if (parseBoardLibrary(rawValue, projectId).status !== "loaded") {
    invalidEntry(key);
  }
}

function validateSongDiscovery(key: string, rawValue: string, version: 1 | 2) {
  const value = parseJsonRecord(key, rawValue);
  const expectedKeys =
    version === 1
      ? ["version", "favoriteSongIds", "recentSongIds"]
      : ["version", "favoriteSongIds", "recentSongIds", "seenSongIds"];
  if (
    !hasExactKeys(value, expectedKeys) ||
    value.version !== version ||
    !isStringArray(value.favoriteSongIds) ||
    !isStringArray(value.recentSongIds) ||
    (version === 2 && !isStringArray(value.seenSongIds))
  ) {
    invalidEntry(key);
  }
}

function validateAssistant(
  key: string,
  rawValue: string,
  schemaVersion: 1 | 2,
) {
  const value = parseJsonRecord(key, rawValue);
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "revision",
      "updatedAt",
      "mutationId",
      "shortlistIds",
      "session",
    ]) ||
    value.schemaVersion !== schemaVersion ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0 ||
    typeof value.mutationId !== "string" ||
    value.mutationId.length === 0 ||
    !isUniqueStringArray(value.shortlistIds)
  ) {
    invalidEntry(key);
  }
  if (value.session === null) return;
  if (!isPlainRecord(value.session)) invalidEntry(key);

  const requiredSessionKeys =
    schemaVersion === 1
      ? ["candidateIds", "decisions"]
      : ["candidateIds", "targetCount", "decisions"];
  if (
    !hasExactOptionalKeys(value.session, requiredSessionKeys, [
      "activePairKey",
    ]) ||
    !isUniqueStringArray(value.session.candidateIds) ||
    !sameStringArray(value.session.candidateIds, value.shortlistIds) ||
    !Array.isArray(value.session.decisions) ||
    (schemaVersion === 2 &&
      (!Number.isInteger(value.session.targetCount) ||
        (value.session.targetCount as number) < 1)) ||
    (Object.hasOwn(value.session, "activePairKey") &&
      typeof value.session.activePairKey !== "string")
  ) {
    invalidEntry(key);
  }
  for (const decision of value.session.decisions) {
    if (
      !isPlainRecord(decision) ||
      !hasExactKeys(decision, ["leftId", "rightId", "outcome"]) ||
      typeof decision.leftId !== "string" ||
      typeof decision.rightId !== "string" ||
      (decision.outcome !== "left" &&
        decision.outcome !== "right" &&
        decision.outcome !== "tie")
    ) {
      invalidEntry(key);
    }
  }
}

function summarizeBoardRestore(
  entries: readonly RestorePlanEntry[],
  projectId: ProjectId,
): RestoreBoardSummary | null {
  const boardEntry = entries.find((entry) =>
    entry.key.endsWith("_board_library_v1"),
  );
  if (!boardEntry) return null;

  const backup =
    boardEntry.backupValue === null
      ? { status: "loaded" as const, document: { snapshots: [] } }
      : parseBoardLibrary(boardEntry.backupValue, projectId);
  if (backup.status !== "loaded") return null;
  const current =
    boardEntry.currentValue === null
      ? { status: "loaded" as const, document: { snapshots: [] } }
      : parseBoardLibrary(boardEntry.currentValue, projectId);
  if (current.status !== "loaded") return null;

  const currentById = new Map(
    current.document.snapshots.map((snapshot) => [snapshot.id, snapshot]),
  );
  const backupIds = new Set<string>();
  const summary: RestoreBoardSummary = {
    add: 0,
    overwrite: 0,
    skip: 0,
    remove: 0,
  };
  for (const snapshot of backup.document.snapshots) {
    backupIds.add(snapshot.id);
    const existing = currentById.get(snapshot.id);
    if (!existing) summary.add += 1;
    else if (sameBoardSnapshot(existing, snapshot)) summary.skip += 1;
    else summary.overwrite += 1;
  }
  summary.remove = current.document.snapshots.filter(
    (snapshot) => !backupIds.has(snapshot.id),
  ).length;
  return summary;
}

function sameBoardSnapshot(left: BoardSnapshot, right: BoardSnapshot) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.projectId === right.projectId &&
    left.experienceId === right.experienceId &&
    left.contextId === right.contextId &&
    sameRecord(left.picks, right.picks)
  );
}

function validateEntryLimits(entries: Record<string, unknown>) {
  const values = Object.entries(entries);
  if (values.length > BACKUP_MAX_ENTRIES) {
    throw new BackupDocumentError("limit-exceeded");
  }
  for (const [key, value] of values) {
    if (
      typeof value === "string" &&
      value.length > BACKUP_MAX_ENTRY_CHARACTERS
    ) {
      throw new BackupDocumentError("limit-exceeded", key);
    }
  }
}

function validateDocumentSize(document: BackupDocument) {
  if (JSON.stringify(document).length > BACKUP_MAX_DOCUMENT_CHARACTERS) {
    throw new BackupDocumentError("limit-exceeded");
  }
}

function parseJsonRecord(key: string, rawValue: string) {
  let value: unknown;
  try {
    value = JSON.parse(rawValue) as unknown;
  } catch {
    invalidEntry(key);
  }
  if (!isPlainRecord(value)) invalidEntry(key);
  return value;
}

function isStrictPicks(value: unknown) {
  return (
    isPlainRecord(value) &&
    Object.entries(value).every(
      ([slotId, songId]) =>
        slotId.length > 0 && typeof songId === "string" && songId.length > 0,
    )
  );
}

function isStorageIdentifier(value: string) {
  return /^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$/.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isUniqueStringArray(value: unknown): value is string[] {
  return isStringArray(value) && new Set(value).size === value.length;
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
) {
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  return (
    Object.keys(value).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function hasExactOptionalKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
) {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIsoTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isAssistantJournalKey(key: string, storagePrefix: string) {
  if (!key.includes(".__mutation__.")) return false;
  const baseKey = key.slice(0, key.indexOf(".__mutation__."));
  const kind = getBackupEntryKind(baseKey, storagePrefix);
  return kind === "assistant-v1" || kind === "assistant-v2";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function invalidEntry(key: string): never {
  throw new BackupDocumentError("invalid-entry", key);
}

function failure(code: BackupFailureCode, key?: string): BackupParseFailure {
  return { ok: false, error: { code, key } };
}

function toFailure(error: unknown): BackupParseFailure {
  return error instanceof BackupDocumentError
    ? failure(error.code, error.key)
    : failure("invalid-entry");
}
