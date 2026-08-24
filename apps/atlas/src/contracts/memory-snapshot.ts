import type { ExperienceMode } from "./journey-document.js";
import {
  expectArray,
  expectExactKeys,
  expectIsoDate,
  expectLiteral,
  expectRecord,
  expectString,
  issueFrom,
  type ContractIssue,
} from "./strict.js";

export const MEMORY_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export interface MemoryPublicEventSnapshot {
  readonly groupName: string;
  readonly eventName: string;
  readonly date: string;
  readonly performanceName: string | null;
}

export interface ExplicitMemoryField<T> {
  readonly consent: true;
  readonly value: T;
}

export interface MemorySongSnapshot {
  readonly groupName: string;
  readonly title: string;
}

export interface MemorySnapshotV1 {
  readonly schemaVersion: typeof MEMORY_SNAPSHOT_SCHEMA_VERSION;
  readonly event: MemoryPublicEventSnapshot;
  readonly selected: {
    readonly mode: ExplicitMemoryField<ExperienceMode> | null;
    readonly highlights: readonly ExplicitMemoryField<string>[];
    readonly songs: readonly ExplicitMemoryField<MemorySongSnapshot>[];
    readonly summary: ExplicitMemoryField<string> | null;
  };
}

export type MemorySnapshotParseResult =
  | { readonly ok: true; readonly value: MemorySnapshotV1 }
  | { readonly ok: false; readonly issue: ContractIssue };

const EXPERIENCE_MODES = ["in-person", "livestream", "archive"] as const;

function parseExplicit<T>(
  value: unknown,
  path: string,
  parseValue: (selectedValue: unknown, selectedPath: string) => T,
): ExplicitMemoryField<T> {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["consent", "value"]);
  return {
    consent: expectLiteral(record.consent, `${path}.consent`, [true]),
    value: parseValue(record.value, `${path}.value`),
  };
}

function parseEvent(value: unknown, path: string): MemoryPublicEventSnapshot {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, [
    "groupName",
    "eventName",
    "date",
    "performanceName",
  ]);
  return {
    groupName: expectString(record.groupName, `${path}.groupName`, {
      max: 128,
    }),
    eventName: expectString(record.eventName, `${path}.eventName`, {
      max: 256,
    }),
    date: expectIsoDate(record.date, `${path}.date`),
    performanceName:
      record.performanceName === null
        ? null
        : expectString(record.performanceName, `${path}.performanceName`, {
            max: 256,
          }),
  };
}

function parseSong(value: unknown, path: string): MemorySongSnapshot {
  const record = expectRecord(value, path);
  expectExactKeys(record, path, ["groupName", "title"]);
  return {
    groupName: expectString(record.groupName, `${path}.groupName`, {
      max: 128,
    }),
    title: expectString(record.title, `${path}.title`, { max: 256 }),
  };
}

export function parseMemorySnapshotValue(value: unknown): MemorySnapshotV1 {
  const record = expectRecord(value, "$");
  expectExactKeys(record, "$", ["schemaVersion", "event", "selected"]);
  const selectedRecord = expectRecord(record.selected, "$.selected");
  expectExactKeys(selectedRecord, "$.selected", [
    "mode",
    "highlights",
    "songs",
    "summary",
  ]);
  return {
    schemaVersion: expectLiteral(record.schemaVersion, "$.schemaVersion", [
      MEMORY_SNAPSHOT_SCHEMA_VERSION,
    ]),
    event: parseEvent(record.event, "$.event"),
    selected: {
      mode:
        selectedRecord.mode === null
          ? null
          : parseExplicit(
              selectedRecord.mode,
              "$.selected.mode",
              (mode, path) => expectLiteral(mode, path, EXPERIENCE_MODES),
            ),
      highlights: expectArray(
        selectedRecord.highlights,
        "$.selected.highlights",
      ).map((highlight, index) =>
        parseExplicit(
          highlight,
          `$.selected.highlights[${index}]`,
          (text, path) => expectString(text, path, { max: 256 }),
        ),
      ),
      songs: expectArray(selectedRecord.songs, "$.selected.songs").map(
        (song, index) =>
          parseExplicit(song, `$.selected.songs[${index}]`, parseSong),
      ),
      summary:
        selectedRecord.summary === null
          ? null
          : parseExplicit(
              selectedRecord.summary,
              "$.selected.summary",
              (summary, path) => expectString(summary, path, { max: 280 }),
            ),
    },
  };
}

export function parseMemorySnapshot(value: unknown): MemorySnapshotParseResult {
  try {
    return { ok: true, value: parseMemorySnapshotValue(value) };
  } catch (error) {
    return { ok: false, issue: issueFrom(error) };
  }
}
