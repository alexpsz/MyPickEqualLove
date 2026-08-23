import {
  BACKUP_CONFIG,
  DEFAULT_PICK_SLOTS,
  getProjectBackupConfig,
  getProjectExperienceStorageKeys,
  getProjectStorageKeys,
  PICK_ASSISTANT_CONFIG,
  STANDARD_EXPERIENCE_ID,
} from "../config/project";
import { isAppLocale, LOCALE_STORAGE_KEY } from "../i18n/locales";
import {
  getShareValidationProject,
  type ShareValidationExperience,
} from "../projects/shareValidation";
import {
  COMBINED_CONTEXT_ID,
  isProjectId,
  type ProjectId,
} from "../schema/project";
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
import {
  deriveTournament,
  parsePickAssistantSnapshot,
  type ComparisonDecision,
  type PickAssistantSession,
} from "./pickAssistant";
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
  now: number;
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

  const facts = getProjectValidationFacts(projectId);
  const entries: Record<string, string> = {};
  const keys = Array.from(new Set(readStorage.keys)).sort();
  const validationNow = Date.parse(readStorage.exportedAt);

  for (const key of keys) {
    if (isAssistantJournalKey(key, facts)) continue;

    const contract = facts.entries.get(key);
    if (!contract) {
      if (key.startsWith(`${facts.storagePrefix}_`)) {
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
    validateEntryValue(key, value, contract, facts, validationNow);
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
  if (!Number.isFinite(currentStorage.now)) {
    return failure("storage-unavailable");
  }
  const validation = validateBackupDocument(
    document,
    expectedProjectId,
    currentStorage.now,
  );
  if (!validation.ok) return validation;

  const facts = getProjectValidationFacts(expectedProjectId);
  const entryKeys = new Set(Object.keys(validation.document.entries));
  for (const key of currentStorage.keys) {
    if (isAssistantJournalKey(key, facts)) {
      entryKeys.add(key);
      continue;
    }
    if (facts.entries.has(key)) {
      entryKeys.add(key);
      continue;
    }
    if (key.startsWith(`${facts.storagePrefix}_`)) {
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

interface BackupEntryContract {
  kind: BackupEntryKind;
  scope?: ExperienceValidationScope;
  allowedContextIds?: ReadonlySet<string>;
}

interface StoredPickValidationRules {
  songIds: Set<string>;
  slots: Array<{ id: string; eligibleSongIds: Set<string> }>;
}

interface ExperienceValidationScope {
  projectId: ProjectId;
  experienceId: string;
  contextId: string | null;
  rules: StoredPickValidationRules;
  assistantSongIds: ReadonlySet<string>;
}

interface ProjectValidationFacts {
  projectId: ProjectId;
  storagePrefix: string;
  catalogSongIds: ReadonlySet<string>;
  entries: ReadonlyMap<string, BackupEntryContract>;
  scopes: ReadonlyMap<string, ExperienceValidationScope>;
}

interface ExperienceSource {
  slots: ShareValidationExperience["slots"];
  performances: ShareValidationExperience["performances"];
  includeCombinedPerformance: boolean;
}

function getProjectValidationFacts(projectId: ProjectId) {
  const project = getShareValidationProject(projectId);
  const storagePrefix = getProjectBackupConfig(projectId).storagePrefix;
  const catalogSongIds = new Set(project.songIds);
  const entries = new Map<string, BackupEntryContract>();
  const scopes = new Map<string, ExperienceValidationScope>();
  const projectKeys = getProjectStorageKeys(projectId);

  addEntry(entries, projectKeys.theme, { kind: "theme" });
  addEntry(entries, projectKeys.boardLibrary, { kind: "board-library" });
  addEntry(entries, projectKeys.songDiscovery, {
    kind: "song-discovery-v1",
  });
  addEntry(entries, projectKeys.songDiscoveryV2, {
    kind: "song-discovery-v2",
  });
  addEntry(entries, LOCALE_STORAGE_KEY, { kind: "locale" });

  const standardSource: ExperienceSource = {
    slots: DEFAULT_PICK_SLOTS.map((slot) => ({
      id: slot.id,
      eligibility: "catalog" as const,
    })),
    performances: [],
    includeCombinedPerformance: false,
  };
  const standardScope = createExperienceScope(
    projectId,
    STANDARD_EXPERIENCE_ID,
    null,
    standardSource,
    catalogSongIds,
  );
  addScope(scopes, standardScope);
  addExperienceEntries(entries, projectKeys, standardScope);

  for (const [experienceId, experience] of Object.entries(
    project.experiences,
  )) {
    const source: ExperienceSource = {
      slots: experience.slots,
      performances: experience.performances,
      includeCombinedPerformance: experience.includeCombinedPerformance,
    };
    const contextIds = getRealContextIds(source);
    const baseKeys = getProjectExperienceStorageKeys(projectId, experienceId);
    addEntry(entries, baseKeys.options, { kind: "options-v1" });
    addEntry(entries, baseKeys.optionsV2, { kind: "options-v2" });
    if (contextIds.length > 0 && baseKeys.context) {
      addEntry(entries, baseKeys.context, {
        kind: "context",
        allowedContextIds: new Set(contextIds),
      });
    }

    for (const contextId of contextIds.length > 0 ? contextIds : [null]) {
      const scope = createExperienceScope(
        projectId,
        experienceId,
        contextId,
        source,
        catalogSongIds,
      );
      addScope(scopes, scope);
      addExperienceEntries(
        entries,
        getProjectExperienceStorageKeys(
          projectId,
          experienceId,
          contextId ?? undefined,
        ),
        scope,
        false,
      );
    }
  }

  return {
    projectId,
    storagePrefix,
    catalogSongIds,
    entries,
    scopes,
  };
}

function addExperienceEntries(
  entries: Map<string, BackupEntryContract>,
  keys: ReturnType<typeof getProjectExperienceStorageKeys>,
  scope: ExperienceValidationScope,
  includeOptions = true,
) {
  addEntry(entries, keys.picks, { kind: "picks-v1", scope });
  addEntry(entries, keys.picksV2, { kind: "picks-v2", scope });
  addEntry(entries, keys.assistantLegacy, { kind: "assistant-v1", scope });
  addEntry(entries, keys.assistant, { kind: "assistant-v2", scope });
  if (includeOptions) {
    addEntry(entries, keys.options, { kind: "options-v1" });
    addEntry(entries, keys.optionsV2, { kind: "options-v2" });
  }
}

function addEntry(
  entries: Map<string, BackupEntryContract>,
  key: string,
  contract: BackupEntryContract,
) {
  if (entries.has(key)) {
    throw new Error(`Duplicate backup storage contract: ${key}`);
  }
  entries.set(key, contract);
}

function addScope(
  scopes: Map<string, ExperienceValidationScope>,
  scope: ExperienceValidationScope,
) {
  const key = getExperienceScopeKey(scope.experienceId, scope.contextId);
  if (scopes.has(key)) {
    throw new Error(`Duplicate backup experience scope: ${key}`);
  }
  scopes.set(key, scope);
}

function createExperienceScope(
  projectId: ProjectId,
  experienceId: string,
  contextId: string | null,
  source: ExperienceSource,
  catalogSongIds: ReadonlySet<string>,
): ExperienceValidationScope {
  const performances = source.performances;
  const selectedPerformances =
    contextId === COMBINED_CONTEXT_ID && source.includeCombinedPerformance
      ? performances
      : performances.filter((performance) => performance.id === contextId);
  const selectedPerformanceSongIds = new Set(
    selectedPerformances
      .flatMap((performance) => performance.songIds)
      .filter((songId) => catalogSongIds.has(songId)),
  );
  const eventSongIds = new Set(
    performances
      .flatMap((performance) => performance.songIds)
      .filter((songId) => catalogSongIds.has(songId)),
  );
  const rules: StoredPickValidationRules = {
    songIds: new Set(catalogSongIds),
    slots: source.slots.map((slot) => ({
      id: slot.id,
      eligibleSongIds:
        slot.eligibility === "catalog"
          ? new Set(catalogSongIds)
          : slot.eligibility === "event-union"
            ? eventSongIds
            : selectedPerformanceSongIds,
    })),
  };
  const strictSlotIds = new Set(
    source.slots
      .filter((slot) => slot.eligibility !== "catalog")
      .map((slot) => slot.id),
  );
  const assistantSongIds =
    strictSlotIds.size === 0
      ? contextId === null
        ? new Set(catalogSongIds)
        : new Set<string>()
      : new Set(
          rules.slots
            .filter((slot) => strictSlotIds.has(slot.id))
            .flatMap((slot) => [...slot.eligibleSongIds]),
        );

  return {
    projectId,
    experienceId,
    contextId,
    rules,
    assistantSongIds,
  };
}

function getRealContextIds(source: ExperienceSource) {
  const contextIds = source.performances.map((performance) => performance.id);
  if (source.includeCombinedPerformance && source.performances.length > 1) {
    contextIds.push(COMBINED_CONTEXT_ID);
  }
  return contextIds;
}

function getExperienceScopeKey(experienceId: string, contextId: string | null) {
  return JSON.stringify([experienceId, contextId]);
}

function validateBackupDocument(
  value: unknown,
  expectedProjectId: ProjectId,
  validationNow?: number,
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

  const semanticNow = validationNow ?? Date.parse(value.exportedAt);
  if (!Number.isFinite(semanticNow)) return failure("invalid-document");
  const facts = getProjectValidationFacts(expectedProjectId);
  const entries: Record<string, string> = {};
  try {
    validateEntryLimits(value.entries);
    for (const [key, rawValue] of Object.entries(value.entries)) {
      if (typeof rawValue !== "string") {
        throw new BackupDocumentError("invalid-entry", key);
      }
      const contract = facts.entries.get(key);
      if (!contract || isAssistantJournalKey(key, facts)) {
        throw new BackupDocumentError("invalid-entry", key);
      }
      validateEntryValue(key, rawValue, contract, facts, semanticNow);
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

function validateEntryValue(
  key: string,
  rawValue: string,
  contract: BackupEntryContract,
  facts: ProjectValidationFacts,
  validationNow: number,
) {
  if (rawValue.length > BACKUP_MAX_ENTRY_CHARACTERS) {
    throw new BackupDocumentError("limit-exceeded", key);
  }

  switch (contract.kind) {
    case "theme":
      if (!isThemePreference(rawValue)) invalidEntry(key);
      return;
    case "locale":
      // "auto" is represented by an absent key in the existing locale contract.
      if (!isAppLocale(rawValue)) invalidEntry(key);
      return;
    case "context":
      if (!contract.allowedContextIds?.has(rawValue)) invalidEntry(key);
      return;
    case "picks-v1":
      validateLegacyPicks(key, rawValue, requireScope(key, contract));
      return;
    case "picks-v2":
      validateCurrentPicks(key, rawValue, requireScope(key, contract));
      return;
    case "options-v1":
      validateLegacyOptions(key, rawValue);
      return;
    case "options-v2":
      validateCurrentOptions(key, rawValue);
      return;
    case "board-library":
      validateBoardLibraryEntry(key, rawValue, facts);
      return;
    case "song-discovery-v1":
      validateSongDiscovery(key, rawValue, 1, facts.catalogSongIds);
      return;
    case "song-discovery-v2":
      validateSongDiscovery(key, rawValue, 2, facts.catalogSongIds);
      return;
    case "assistant-v1":
      validateAssistant(
        key,
        rawValue,
        1,
        requireScope(key, contract),
        validationNow,
      );
      return;
    case "assistant-v2":
      validateAssistant(
        key,
        rawValue,
        2,
        requireScope(key, contract),
        validationNow,
      );
  }
}

function requireScope(key: string, contract: BackupEntryContract) {
  if (!contract.scope) invalidEntry(key);
  return contract.scope;
}

function validateLegacyPicks(
  key: string,
  rawValue: string,
  scope: ExperienceValidationScope,
) {
  validateStoredPicks(key, parseJsonRecord(key, rawValue), scope);
}

function validateCurrentPicks(
  key: string,
  rawValue: string,
  scope: ExperienceValidationScope,
) {
  const value = parseJsonRecord(key, rawValue);
  if (
    !hasExactKeys(value, ["schemaVersion", "picks"]) ||
    value.schemaVersion !== CURRENT_BOARD_SCHEMA_VERSION
  ) {
    invalidEntry(key);
  }
  validateStoredPicks(key, value.picks, scope);
}

function validateStoredPicks(
  key: string,
  value: unknown,
  scope: ExperienceValidationScope,
) {
  if (!isStrictPicks(value)) invalidEntry(key);
  const pairs = Object.entries(value);
  if (new Set(pairs.map(([, songId]) => songId)).size !== pairs.length) {
    invalidEntry(key);
  }

  if (pairs.length > scope.rules.slots.length) invalidEntry(key);
  const slots = new Map(scope.rules.slots.map((slot) => [slot.id, slot]));
  for (const [slotId, songId] of pairs) {
    const slot = slots.get(slotId);
    if (
      !slot ||
      !scope.rules.songIds.has(songId) ||
      !slot.eligibleSongIds.has(songId)
    ) {
      invalidEntry(key);
    }
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
  facts: ProjectValidationFacts,
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
      snapshot.projectId !== facts.projectId ||
      typeof snapshot.experienceId !== "string" ||
      (snapshot.contextId !== null && typeof snapshot.contextId !== "string")
    ) {
      invalidEntry(key);
    }
    const scope = facts.scopes.get(
      getExperienceScopeKey(snapshot.experienceId, snapshot.contextId),
    );
    if (!scope) invalidEntry(key);
    validateStoredPicks(key, snapshot.picks, scope);
  }
  if (parseBoardLibrary(rawValue, facts.projectId).status !== "loaded") {
    invalidEntry(key);
  }
}

function validateSongDiscovery(
  key: string,
  rawValue: string,
  version: 1 | 2,
  catalogSongIds: ReadonlySet<string>,
) {
  const value = parseJsonRecord(key, rawValue);
  const expectedKeys =
    version === 1
      ? ["version", "favoriteSongIds", "recentSongIds"]
      : ["version", "favoriteSongIds", "recentSongIds", "seenSongIds"];
  if (
    !hasExactKeys(value, expectedKeys) ||
    value.version !== version ||
    !isLosslessSongIdArray(value.favoriteSongIds, catalogSongIds) ||
    !isLosslessSongIdArray(value.recentSongIds, catalogSongIds) ||
    (version === 2 && !isLosslessSongIdArray(value.seenSongIds, catalogSongIds))
  ) {
    invalidEntry(key);
  }
}

function isLosslessSongIdArray(
  value: unknown,
  catalogSongIds: ReadonlySet<string>,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (songId) => typeof songId === "string" && catalogSongIds.has(songId),
    ) &&
    new Set(value).size === value.length
  );
}

function validateAssistant(
  key: string,
  rawValue: string,
  schemaVersion: 1 | 2,
  scope: ExperienceValidationScope,
  validationNow: number,
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
    !isLosslessSongIdArray(value.shortlistIds, scope.assistantSongIds)
  ) {
    invalidEntry(key);
  }

  const session = parseRawAssistantSession(
    key,
    value.session,
    value.shortlistIds,
    schemaVersion,
  );
  const maximumCandidates = scope.assistantSongIds.size;
  if (schemaVersion === 1) {
    if (
      value.shortlistIds.length === 0 ||
      value.shortlistIds.length > maximumCandidates ||
      validationNow - value.updatedAt > PICK_ASSISTANT_CONFIG.expiresAfterMs
    ) {
      invalidEntry(key);
    }
    if (session) {
      validateTournamentActivePair(key, {
        ...session,
        targetCount: session.candidateIds.length,
      });
    }
    return;
  }

  const parsed = parsePickAssistantSnapshot(rawValue, {
    schemaVersion: PICK_ASSISTANT_CONFIG.schemaVersion,
    expiresAfterMs: PICK_ASSISTANT_CONFIG.expiresAfterMs,
    maximumCandidates,
    now: validationNow,
    validSongIds: scope.assistantSongIds,
  });
  if (parsed.status !== "valid") invalidEntry(key);
  if (parsed.snapshot.session) {
    validateTournamentActivePair(key, parsed.snapshot.session);
  }
}

interface RawAssistantSession {
  candidateIds: string[];
  decisions: ComparisonDecision[];
  activePairKey?: string;
  targetCount?: number;
}

function parseRawAssistantSession(
  key: string,
  value: unknown,
  shortlistIds: readonly string[],
  schemaVersion: 1 | 2,
): RawAssistantSession | null {
  if (value === null) return null;
  if (!isPlainRecord(value)) invalidEntry(key);
  const requiredKeys =
    schemaVersion === 1
      ? ["candidateIds", "decisions"]
      : ["candidateIds", "targetCount", "decisions"];
  if (
    !hasExactOptionalKeys(value, requiredKeys, ["activePairKey"]) ||
    !Array.isArray(value.candidateIds) ||
    !value.candidateIds.every(
      (candidateId) => typeof candidateId === "string",
    ) ||
    !sameStringArray(value.candidateIds, shortlistIds) ||
    !Array.isArray(value.decisions) ||
    (schemaVersion === 2 &&
      (!Number.isInteger(value.targetCount) ||
        (value.targetCount as number) < 1)) ||
    (Object.hasOwn(value, "activePairKey") &&
      typeof value.activePairKey !== "string")
  ) {
    invalidEntry(key);
  }

  const decisions: ComparisonDecision[] = value.decisions.map((decision) => {
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
    return {
      leftId: decision.leftId,
      rightId: decision.rightId,
      outcome: decision.outcome,
    };
  });

  return {
    candidateIds: value.candidateIds.slice(),
    decisions,
    activePairKey: value.activePairKey as string | undefined,
    targetCount:
      schemaVersion === 2 ? (value.targetCount as number) : undefined,
  };
}

function validateTournamentActivePair(
  key: string,
  session: PickAssistantSession,
) {
  let state: ReturnType<typeof deriveTournament>;
  try {
    state = deriveTournament(session);
  } catch {
    invalidEntry(key);
  }
  if (state.status === "complete") {
    if (session.activePairKey !== undefined) invalidEntry(key);
    return;
  }
  if (
    session.activePairKey !== undefined &&
    session.activePairKey !==
      JSON.stringify([state.pair.leftId, state.pair.rightId])
  ) {
    invalidEntry(key);
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

function isStrictPicks(value: unknown): value is Record<string, string> {
  return (
    isPlainRecord(value) &&
    Object.entries(value).every(
      ([slotId, songId]) =>
        slotId.length > 0 && typeof songId === "string" && songId.length > 0,
    )
  );
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

function isAssistantJournalKey(key: string, facts: ProjectValidationFacts) {
  const marker = ".__mutation__.";
  const markerIndex = key.indexOf(marker);
  if (markerIndex < 0 || markerIndex + marker.length === key.length) {
    return false;
  }
  const contract = facts.entries.get(key.slice(0, markerIndex));
  return contract?.kind === "assistant-v1" || contract?.kind === "assistant-v2";
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
