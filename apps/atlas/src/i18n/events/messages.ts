import type {
  AtlasLifecycle,
  ProjectionExcludedItem,
  ProjectionUnresolvedItem,
} from "../../contracts/public-atlas-projection.js";

export const EVENTS_LOCALES = ["zh-CN", "en", "ja", "ko"] as const;

export type EventsLocale = (typeof EVENTS_LOCALES)[number];

export interface EventsMessages {
  readonly events: string;
  readonly eventsDescription: string;
  readonly noEvents: string;
  readonly group: string;
  readonly venue: string;
  readonly dates: string;
  readonly date: string;
  readonly timezone: string;
  readonly lifecycle: string;
  readonly performances: string;
  readonly performance: string;
  readonly setlist: string;
  readonly setlistCount: string;
  readonly eventOnlyTitle: string;
  readonly eventOnlyDescription: string;
  readonly noSetlist: string;
  readonly recordEvent: string;
  readonly recordPerformance: string;
  readonly recordUnavailable: string;
  readonly evidence: string;
  readonly verification: string;
  readonly sources: string;
  readonly noSources: string;
  readonly coverage: string;
  readonly excluded: string;
  readonly noExcluded: string;
  readonly unresolved: string;
  readonly noUnresolved: string;
  readonly openOnMyPick: string;
  readonly noCanonicalSongLink: string;
  readonly verified: string;
  readonly partial: string;
  readonly unverified: string;
  readonly lifecycleScheduled: string;
  readonly lifecyclePostponed: string;
  readonly lifecycleCancelled: string;
  readonly lifecycleCompleted: string;
  readonly lifecycleUnknown: string;
  readonly excludedKindEvent: string;
  readonly excludedKindPerformance: string;
  readonly excludedKindSetlistEntry: string;
  readonly unresolvedKindVenue: string;
  readonly unresolvedKindSong: string;
  readonly unresolvedKindSource: string;
}

const MESSAGES: Readonly<Record<EventsLocale, EventsMessages>> = {
  "zh-CN": {
    events: "活动",
    eventsDescription: "仅显示已由公共投影接纳的活动记录。",
    noEvents: "当前接纳的公共投影中没有活动记录。",
    group: "团体",
    venue: "场馆",
    dates: "日期",
    date: "日期",
    timezone: "时区",
    lifecycle: "状态",
    performances: "场次",
    performance: "场次",
    setlist: "歌单",
    setlistCount: "歌单曲目",
    eventOnlyTitle: "这是仅含活动信息的记录",
    eventOnlyDescription: "此活动当前明确为零场次；没有生成或推测场次。",
    noSetlist: "该场次当前没有公开歌单；未生成或推测曲目。",
    recordEvent: "记录此活动",
    recordPerformance: "记录此场次",
    recordUnavailable: "记录功能将在 Journey 接线后可用。",
    evidence: "来源与覆盖情况",
    verification: "核验状态",
    sources: "来源链接",
    noSources: "没有提供来源链接。",
    coverage: "覆盖范围",
    excluded: "已排除项目",
    noExcluded: "没有已排除项目。",
    unresolved: "待解决项目",
    noUnresolved: "没有待解决项目。",
    openOnMyPick: "在 MyPick 中打开",
    noCanonicalSongLink: "尚未提供精确的 MyPick canonical 映射。",
    verified: "已核验",
    partial: "部分核验",
    unverified: "未核验",
    lifecycleScheduled: "已排期",
    lifecyclePostponed: "已延期",
    lifecycleCancelled: "已取消",
    lifecycleCompleted: "已完成",
    lifecycleUnknown: "未知",
    excludedKindEvent: "活动",
    excludedKindPerformance: "场次",
    excludedKindSetlistEntry: "歌单曲目",
    unresolvedKindVenue: "场馆",
    unresolvedKindSong: "歌曲",
    unresolvedKindSource: "来源",
  },
  en: {
    events: "Events",
    eventsDescription:
      "Only records accepted by the public projection are shown.",
    noEvents: "The accepted public projection has no event records.",
    group: "Group",
    venue: "Venue",
    dates: "Dates",
    date: "Date",
    timezone: "Timezone",
    lifecycle: "Lifecycle",
    performances: "Performances",
    performance: "Performance",
    setlist: "Setlist",
    setlistCount: "Setlist entries",
    eventOnlyTitle: "This is an event-only record",
    eventOnlyDescription:
      "This event explicitly has zero performances; none are generated or inferred.",
    noSetlist:
      "No public setlist is available for this performance; no songs are generated or inferred.",
    recordEvent: "Record this event",
    recordPerformance: "Record this performance",
    recordUnavailable:
      "Recording will be available after Journey wiring is connected.",
    evidence: "Sources and coverage",
    verification: "Verification",
    sources: "Source URLs",
    noSources: "No source URLs were provided.",
    coverage: "Coverage",
    excluded: "Excluded items",
    noExcluded: "No items are excluded.",
    unresolved: "Unresolved items",
    noUnresolved: "No items are unresolved.",
    openOnMyPick: "Open on MyPick",
    noCanonicalSongLink: "No exact MyPick canonical mapping was provided.",
    verified: "Verified",
    partial: "Partially verified",
    unverified: "Unverified",
    lifecycleScheduled: "Scheduled",
    lifecyclePostponed: "Postponed",
    lifecycleCancelled: "Cancelled",
    lifecycleCompleted: "Completed",
    lifecycleUnknown: "Unknown",
    excludedKindEvent: "Event",
    excludedKindPerformance: "Performance",
    excludedKindSetlistEntry: "Setlist entry",
    unresolvedKindVenue: "Venue",
    unresolvedKindSong: "Song",
    unresolvedKindSource: "Source",
  },
  ja: {
    events: "イベント",
    eventsDescription: "公開プロジェクションで受理された記録のみを表示します。",
    noEvents: "受理された公開プロジェクションにはイベント記録がありません。",
    group: "グループ",
    venue: "会場",
    dates: "日程",
    date: "日付",
    timezone: "タイムゾーン",
    lifecycle: "開催状況",
    performances: "公演",
    performance: "公演",
    setlist: "セットリスト",
    setlistCount: "セットリスト曲数",
    eventOnlyTitle: "これはイベントのみの記録です",
    eventOnlyDescription:
      "このイベントは公演数が 0 件として明示されています。公演を生成・推測していません。",
    noSetlist:
      "この公演には公開セットリストがありません。曲目を生成・推測していません。",
    recordEvent: "このイベントを記録",
    recordPerformance: "この公演を記録",
    recordUnavailable: "Journey 連携後に記録機能を利用できます。",
    evidence: "出典とカバレッジ",
    verification: "検証状態",
    sources: "出典 URL",
    noSources: "出典 URL はありません。",
    coverage: "カバレッジ",
    excluded: "除外項目",
    noExcluded: "除外項目はありません。",
    unresolved: "未解決項目",
    noUnresolved: "未解決項目はありません。",
    openOnMyPick: "MyPick で開く",
    noCanonicalSongLink: "正確な MyPick canonical マッピングがありません。",
    verified: "検証済み",
    partial: "一部検証済み",
    unverified: "未検証",
    lifecycleScheduled: "予定",
    lifecyclePostponed: "延期",
    lifecycleCancelled: "中止",
    lifecycleCompleted: "完了",
    lifecycleUnknown: "不明",
    excludedKindEvent: "イベント",
    excludedKindPerformance: "公演",
    excludedKindSetlistEntry: "セットリスト曲目",
    unresolvedKindVenue: "会場",
    unresolvedKindSong: "楽曲",
    unresolvedKindSource: "出典",
  },
  ko: {
    events: "이벤트",
    eventsDescription: "공개 프로젝션에서 수용된 기록만 표시합니다.",
    noEvents: "수용된 공개 프로젝션에 이벤트 기록이 없습니다.",
    group: "그룹",
    venue: "공연장",
    dates: "일정",
    date: "날짜",
    timezone: "시간대",
    lifecycle: "상태",
    performances: "공연",
    performance: "공연",
    setlist: "세트리스트",
    setlistCount: "세트리스트 곡 수",
    eventOnlyTitle: "이 기록에는 이벤트 정보만 있습니다",
    eventOnlyDescription:
      "이 이벤트는 공연이 0개임이 명시되어 있습니다. 공연을 생성하거나 추정하지 않습니다.",
    noSetlist:
      "이 공연의 공개 세트리스트가 없습니다. 곡을 생성하거나 추정하지 않습니다.",
    recordEvent: "이 이벤트 기록",
    recordPerformance: "이 공연 기록",
    recordUnavailable: "Journey 연결 후 기록 기능을 사용할 수 있습니다.",
    evidence: "출처 및 범위",
    verification: "검증 상태",
    sources: "출처 URL",
    noSources: "제공된 출처 URL이 없습니다.",
    coverage: "범위",
    excluded: "제외 항목",
    noExcluded: "제외된 항목이 없습니다.",
    unresolved: "미해결 항목",
    noUnresolved: "미해결 항목이 없습니다.",
    openOnMyPick: "MyPick에서 열기",
    noCanonicalSongLink: "정확한 MyPick canonical 매핑이 제공되지 않았습니다.",
    verified: "검증됨",
    partial: "부분 검증됨",
    unverified: "미검증",
    lifecycleScheduled: "예정",
    lifecyclePostponed: "연기됨",
    lifecycleCancelled: "취소됨",
    lifecycleCompleted: "완료됨",
    lifecycleUnknown: "알 수 없음",
    excludedKindEvent: "이벤트",
    excludedKindPerformance: "공연",
    excludedKindSetlistEntry: "세트리스트 곡목",
    unresolvedKindVenue: "공연장",
    unresolvedKindSong: "곡",
    unresolvedKindSource: "출처",
  },
};

export function getEventsMessages(locale: EventsLocale): EventsMessages {
  return MESSAGES[locale];
}

export function getLifecycleLabel(
  messages: EventsMessages,
  lifecycle: AtlasLifecycle,
): string {
  switch (lifecycle) {
    case "scheduled":
      return messages.lifecycleScheduled;
    case "postponed":
      return messages.lifecyclePostponed;
    case "cancelled":
      return messages.lifecycleCancelled;
    case "completed":
      return messages.lifecycleCompleted;
    case "unknown":
      return messages.lifecycleUnknown;
  }
}

export function getExcludedKindLabel(
  messages: EventsMessages,
  kind: ProjectionExcludedItem["kind"],
): string {
  switch (kind) {
    case "event":
      return messages.excludedKindEvent;
    case "performance":
      return messages.excludedKindPerformance;
    case "setlist-entry":
      return messages.excludedKindSetlistEntry;
  }
}

export function getUnresolvedKindLabel(
  messages: EventsMessages,
  kind: ProjectionUnresolvedItem["kind"],
): string {
  switch (kind) {
    case "venue":
      return messages.unresolvedKindVenue;
    case "song":
      return messages.unresolvedKindSong;
    case "source":
      return messages.unresolvedKindSource;
  }
}
