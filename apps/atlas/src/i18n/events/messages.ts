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
  readonly discoveryTitle: string;
  readonly discoveryDescription: string;
  readonly allGroups: string;
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
  readonly backToEvents: string;
  readonly backToEvent: string;
  readonly eventDetails: string;
  readonly choosePerformance: string;
  readonly openEventOnMyPick: string;
  readonly localEventPrompt: string;
  readonly createLocalEvent: string;
  readonly recordMomentTitle: string;
  readonly recordMomentDescription: string;
  readonly mode: string;
  readonly modeInPerson: string;
  readonly modeLivestream: string;
  readonly modeArchive: string;
  readonly time: string;
  readonly experienceTime: string;
  readonly experienceTimeRequired: string;
  readonly officialStartTime: string;
  readonly officialStartTimeHint: string;
  readonly highlight: string;
  readonly highlightPlaceholder: string;
  readonly highlightHint: string;
  readonly favoriteSongs: string;
  readonly favoriteSongsHint: string;
  readonly saveMoment: string;
  readonly saving: string;
  readonly saved: string;
  readonly openJourney: string;
  readonly createMemory: string;
  readonly saveFailed: string;
  readonly planEventTitle: string;
  readonly planEventDescription: string;
  readonly interested: string;
  readonly planned: string;
  readonly savePlan: string;
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
    discoveryTitle: "找到那场活动",
    discoveryDescription: "选择一场真实活动，再记录你的计划或经历。",
    allGroups: "全部",
    noEvents: "这个团体暂时没有可浏览的活动。",
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
    recordUnavailable: "此视图暂不提供记录功能。",
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
    backToEvents: "返回活动",
    backToEvent: "返回活动详情",
    eventDetails: "查看活动",
    choosePerformance: "选择你参加的场次",
    openEventOnMyPick: "在 MyPick 查看活动",
    localEventPrompt: "找不到你参加的活动？",
    createLocalEvent: "创建本地活动",
    recordMomentTitle: "记录这一刻",
    recordMomentDescription:
      "选择参与方式和时间；也可以选填一个最难忘的瞬间和最多三首歌。",
    mode: "参与方式",
    modeInPerson: "现场参与",
    modeLivestream: "直播观看",
    modeArchive: "回看录像",
    time: "时间",
    experienceTime: "你实际参与的时间",
    experienceTimeRequired: "请选择这次经历发生的日期和时间。",
    officialStartTime: "官方开演时间",
    officialStartTimeHint: "现场记录将使用此场次的官方开演时间。",
    highlight: "最难忘的一刻（选填）",
    highlightPlaceholder: "那一刻发生了什么？",
    highlightHint: "留空时不会创建高光条目。",
    favoriteSongs: "最难忘的歌",
    favoriteSongsHint: "最多选择 3 首",
    saveMoment: "保存到 Journey",
    saving: "正在保存…",
    saved: "已保存到 Journey。",
    openJourney: "打开 Journey",
    createMemory: "制作 Memory",
    saveFailed: "暂时无法保存，请重试。",
    planEventTitle: "把它加入 Journey",
    planEventDescription: "这场活动尚未举行，你可以先标记为感兴趣或计划参加。",
    interested: "感兴趣",
    planned: "计划参加",
    savePlan: "保存计划",
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
    discoveryTitle: "Find that event",
    discoveryDescription:
      "Choose a real event, then record your plan or experience.",
    allGroups: "All",
    noEvents: "There are no events to browse for this group yet.",
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
    recordUnavailable: "Recording is unavailable in this view.",
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
    backToEvents: "Back to events",
    backToEvent: "Back to event",
    eventDetails: "View event",
    choosePerformance: "Choose your performance",
    openEventOnMyPick: "View event on MyPick",
    localEventPrompt: "Can't find your event?",
    createLocalEvent: "Create a local event",
    recordMomentTitle: "Record this moment",
    recordMomentDescription:
      "Choose how and when you joined, then optionally add one standout moment and up to three songs.",
    mode: "How you joined",
    modeInPerson: "In person",
    modeLivestream: "Livestream",
    modeArchive: "Archive",
    time: "Time",
    experienceTime: "Your experience time",
    experienceTimeRequired: "Choose the date and time for this experience.",
    officialStartTime: "Official start time",
    officialStartTimeHint:
      "In-person records use this performance’s official start time.",
    highlight: "One standout moment (optional)",
    highlightPlaceholder: "What stayed with you?",
    highlightHint: "Leave this blank to save without a highlight.",
    favoriteSongs: "Standout songs",
    favoriteSongsHint: "Choose up to 3",
    saveMoment: "Save to Journey",
    saving: "Saving…",
    saved: "Saved to Journey.",
    openJourney: "Open Journey",
    createMemory: "Create a Memory",
    saveFailed: "Could not save yet. Please try again.",
    planEventTitle: "Add it to your Journey",
    planEventDescription:
      "This event is still ahead. Mark whether you are interested or planning to go.",
    interested: "Interested",
    planned: "Planning to go",
    savePlan: "Save plan",
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
    discoveryTitle: "あのイベントを見つける",
    discoveryDescription: "実際のイベントを選び、予定や体験を記録しましょう。",
    allGroups: "すべて",
    noEvents: "このグループには表示できるイベントがまだありません。",
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
    recordUnavailable: "この画面では記録できません。",
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
    backToEvents: "イベント一覧へ",
    backToEvent: "イベント詳細へ",
    eventDetails: "イベントを見る",
    choosePerformance: "参加した公演を選ぶ",
    openEventOnMyPick: "MyPick でイベントを見る",
    localEventPrompt: "参加したイベントが見つかりませんか？",
    createLocalEvent: "ローカルイベントを作成",
    recordMomentTitle: "この瞬間を記録",
    recordMomentDescription:
      "参加方法と時間を選び、任意で心に残った瞬間と曲を3曲まで追加できます。",
    mode: "参加方法",
    modeInPerson: "現地参加",
    modeLivestream: "配信視聴",
    modeArchive: "アーカイブ視聴",
    time: "時刻",
    experienceTime: "あなたが体験した日時",
    experienceTimeRequired: "体験した日時を選んでください。",
    officialStartTime: "公式開演時刻",
    officialStartTimeHint:
      "現地参加の記録には、この公演の公式開演時刻を使用します。",
    highlight: "心に残った瞬間（任意）",
    highlightPlaceholder: "どんな瞬間でしたか？",
    highlightHint: "空欄のまま保存すると、ハイライトは作成されません。",
    favoriteSongs: "心に残った曲",
    favoriteSongsHint: "3曲まで選択",
    saveMoment: "Journey に保存",
    saving: "保存中…",
    saved: "Journey に保存しました。",
    openJourney: "Journey を開く",
    createMemory: "Memory を作る",
    saveFailed: "保存できませんでした。もう一度お試しください。",
    planEventTitle: "Journey に追加",
    planEventDescription:
      "これからのイベントです。興味あり、または参加予定として保存できます。",
    interested: "興味あり",
    planned: "参加予定",
    savePlan: "予定を保存",
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
    discoveryTitle: "그 이벤트 찾기",
    discoveryDescription: "실제 이벤트를 선택하고 계획이나 경험을 기록하세요.",
    allGroups: "전체",
    noEvents: "이 그룹에는 아직 둘러볼 이벤트가 없습니다.",
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
    recordUnavailable: "이 화면에서는 기록할 수 없습니다.",
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
    backToEvents: "이벤트 목록으로",
    backToEvent: "이벤트 상세로",
    eventDetails: "이벤트 보기",
    choosePerformance: "참여한 공연 선택",
    openEventOnMyPick: "MyPick에서 이벤트 보기",
    localEventPrompt: "참여한 이벤트를 찾을 수 없나요?",
    createLocalEvent: "로컬 이벤트 만들기",
    recordMomentTitle: "이 순간 기록하기",
    recordMomentDescription:
      "참여 방식과 시간을 선택하고, 기억에 남은 순간과 곡을 최대 3곡까지 선택 사항으로 추가하세요.",
    mode: "참여 방식",
    modeInPerson: "현장 참여",
    modeLivestream: "라이브 스트리밍",
    modeArchive: "다시 보기",
    time: "시간",
    experienceTime: "내가 경험한 일시",
    experienceTimeRequired: "이 경험의 날짜와 시간을 선택해 주세요.",
    officialStartTime: "공식 공연 시작 시간",
    officialStartTimeHint:
      "현장 참여 기록에는 이 공연의 공식 시작 시간을 사용합니다.",
    highlight: "기억에 남은 순간 (선택 사항)",
    highlightPlaceholder: "어떤 순간이 남았나요?",
    highlightHint: "비워 두면 하이라이트 없이 저장됩니다.",
    favoriteSongs: "기억에 남은 곡",
    favoriteSongsHint: "최대 3곡",
    saveMoment: "Journey에 저장",
    saving: "저장 중…",
    saved: "Journey에 저장했습니다.",
    openJourney: "Journey 열기",
    createMemory: "Memory 만들기",
    saveFailed: "저장하지 못했습니다. 다시 시도해 주세요.",
    planEventTitle: "Journey에 추가",
    planEventDescription:
      "아직 열리지 않은 이벤트입니다. 관심 또는 참여 예정으로 저장하세요.",
    interested: "관심 있음",
    planned: "참여 예정",
    savePlan: "계획 저장",
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
