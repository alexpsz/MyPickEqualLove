import type { ExperienceMode } from "../../contracts/journey-document.js";
import type { ShellLocale } from "../shell/messages.js";

export interface MemoryMessages {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly loading: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly unavailableTitle: string;
  readonly unavailableDescription: string;
  readonly selectionTitle: string;
  readonly selectionDescription: string;
  readonly candidateLabel: string;
  readonly candidatePlaceholder: string;
  readonly requiredTitle: string;
  readonly requiredDescription: string;
  readonly optionalTitle: string;
  readonly optionalDescription: string;
  readonly includePerformanceName: string;
  readonly includeMode: string;
  readonly includeHighlight: string;
  readonly includeSong: string;
  readonly includeSummary: string;
  readonly summaryLabel: string;
  readonly summaryPlaceholder: string;
  readonly summaryPrivacy: string;
  readonly previewTitle: string;
  readonly previewDescription: string;
  readonly invalidSelection: string;
  readonly contentTooLong: string;
  readonly generate: string;
  readonly generating: string;
  readonly download: string;
  readonly share: string;
  readonly shareUnavailable: string;
  readonly generated: string;
  readonly generationCancelled: string;
  readonly generationFailed: string;
  readonly downloadStarted: string;
  readonly downloadFailed: string;
  readonly shareComplete: string;
  readonly shareCancelled: string;
  readonly shareRejected: string;
  readonly localGroupName: string;
  readonly card: {
    readonly dateLabel: string;
    readonly performanceLabel: string;
    readonly modeLabel: string;
    readonly highlightsLabel: string;
    readonly songsLabel: string;
    readonly summaryLabel: string;
    readonly noOptionalDetails: string;
    readonly privacyLine: string;
    readonly modes: Readonly<Record<ExperienceMode, string>>;
  };
}

export const MEMORY_MESSAGES: Readonly<Record<ShellLocale, MemoryMessages>> = {
  "zh-CN": {
    eyebrow: "Memory · 隐私预览",
    title: "把一段 Journey 变成一张由你决定内容的图片。",
    description:
      "先从此浏览器的本地 Journey 中选择一条真实经历，再逐项决定哪些允许展示。不会上传或改写 Journey。",
    loading: "正在只读检查本地 Journey…",
    emptyTitle: "没有可生成 Memory 的本地经历",
    emptyDescription:
      "请先在 Atlas 中记录至少一条真实经历。直接打开此固定页面不会创建示例数据。",
    unavailableTitle: "本地 Journey 暂时不可读取",
    unavailableDescription:
      "数据保持原样。Atlas 不会用损坏、未来版本或读取失败的内容生成图片。",
    selectionTitle: "选择一条经历",
    selectionDescription:
      "候选仅显示活动名称、组合与日期；私人 ID、memo、intent 和 revision 不会进入预览。",
    candidateLabel: "本地 Journey 经历",
    candidatePlaceholder: "请选择一条经历",
    requiredTitle: "始终包含",
    requiredDescription: "组合或本地事件、活动名称与日期。",
    optionalTitle: "可选披露",
    optionalDescription: "默认全部关闭；只有勾选项才进入预览和 PNG。",
    includePerformanceName: "显示场次名称",
    includeMode: "显示参与方式",
    includeHighlight: "显示亮点：",
    includeSong: "显示歌曲：",
    includeSummary: "添加新的分享摘要",
    summaryLabel: "分享摘要",
    summaryPlaceholder: "只写你愿意公开在这张图片上的内容",
    summaryPrivacy: "不会读取或复制 Journey 中的私人 memo。",
    previewTitle: "隐私白名单预览",
    previewDescription: "下面的事实与最终画布使用同一份 draw plan。",
    invalidSelection: "请完成已勾选字段，或取消该字段。",
    contentTooLong: "所选内容超出唯一模板容量；请减少勾选项。",
    generate: "生成 1200 × 630 PNG",
    generating: "正在生成 PNG…",
    download: "下载 PNG",
    share: "分享 PNG",
    shareUnavailable: "此浏览器不支持文件分享；仅提供本地下载。",
    generated: "PNG 已在本地生成；Journey 未发生变化。",
    generationCancelled: "生成已取消；Journey 未发生变化。",
    generationFailed: "PNG 生成失败；Journey 未发生变化。",
    downloadStarted: "已发起本地下载。",
    downloadFailed: "无法发起下载；图片仍保留在此页面内存中。",
    shareComplete: "系统分享已完成。",
    shareCancelled: "你取消了系统分享；Journey 未发生变化。",
    shareRejected: "系统分享失败；你仍可下载 PNG。",
    localGroupName: "本地事件",
    card: {
      dateLabel: "日期",
      performanceLabel: "场次",
      modeLabel: "参与方式",
      highlightsLabel: "亮点",
      songsLabel: "歌曲",
      summaryLabel: "分享摘要",
      noOptionalDetails: "没有添加可选详情。",
      privacyLine: "仅包含你在本页明确允许展示的字段",
      modes: {
        "in-person": "现场参与",
        livestream: "直播观看",
        archive: "回看",
      },
    },
  },
  en: {
    eyebrow: "Memory · privacy preview",
    title: "Turn one Journey moment into an image you control.",
    description:
      "Choose one real experience from this browser's local Journey, then allow each optional field explicitly. Nothing is uploaded or written back.",
    loading: "Checking the local Journey read-only…",
    emptyTitle: "No local experience is ready for Memory",
    emptyDescription:
      "Record at least one real experience in Atlas first. Opening this fixed page never creates sample data.",
    unavailableTitle: "The local Journey cannot be read safely",
    unavailableDescription:
      "Your data is unchanged. Atlas will not render corrupt, future-version, or unreadable content.",
    selectionTitle: "Choose one experience",
    selectionDescription:
      "Choices show only event, group, and date. Private IDs, memo, intent, and revision never enter the preview.",
    candidateLabel: "Local Journey experience",
    candidatePlaceholder: "Choose an experience",
    requiredTitle: "Always included",
    requiredDescription: "Group or local event, event name, and date.",
    optionalTitle: "Optional disclosure",
    optionalDescription:
      "Everything starts off. Only checked fields enter the preview and PNG.",
    includePerformanceName: "Show performance name",
    includeMode: "Show participation mode",
    includeHighlight: "Show highlight:",
    includeSong: "Show song:",
    includeSummary: "Add a new share summary",
    summaryLabel: "Share summary",
    summaryPlaceholder: "Write only what you want to publish on this image",
    summaryPrivacy: "Your private Journey memo is never read or copied.",
    previewTitle: "Privacy allowlist preview",
    previewDescription:
      "These facts and the final canvas use the same draw plan.",
    invalidSelection: "Complete the checked field or turn it off.",
    contentTooLong:
      "The selected content exceeds the one template; select fewer details.",
    generate: "Generate 1200 × 630 PNG",
    generating: "Generating PNG…",
    download: "Download PNG",
    share: "Share PNG",
    shareUnavailable:
      "File sharing is unavailable in this browser; local download only.",
    generated: "PNG generated locally. Your Journey was not changed.",
    generationCancelled:
      "Generation was cancelled. Your Journey was not changed.",
    generationFailed: "PNG generation failed. Your Journey was not changed.",
    downloadStarted: "Local download started.",
    downloadFailed:
      "Download could not start. The image remains in page memory.",
    shareComplete: "System sharing completed.",
    shareCancelled:
      "You cancelled system sharing. Your Journey was not changed.",
    shareRejected: "System sharing failed. You can still download the PNG.",
    localGroupName: "Local event",
    card: {
      dateLabel: "Date",
      performanceLabel: "Performance",
      modeLabel: "Mode",
      highlightsLabel: "Highlights",
      songsLabel: "Songs",
      summaryLabel: "Share summary",
      noOptionalDetails: "No optional details were added.",
      privacyLine: "Only fields you explicitly allowed on this page",
      modes: {
        "in-person": "In person",
        livestream: "Livestream",
        archive: "Archive",
      },
    },
  },
  ja: {
    eyebrow: "Memory · プライバシープレビュー",
    title: "Journey のひとときを、自分で内容を選べる一枚に。",
    description:
      "このブラウザーのローカル Journey から実際の体験を一つ選び、表示してよい項目だけを指定します。アップロードや Journey の書き換えは行いません。",
    loading: "ローカル Journey を読み取り専用で確認しています…",
    emptyTitle: "Memory にできるローカル体験がありません",
    emptyDescription:
      "まず Atlas に実際の体験を一件以上記録してください。この固定ページを開いてもサンプルデータは作られません。",
    unavailableTitle: "ローカル Journey を安全に読み取れません",
    unavailableDescription:
      "データは変更されません。破損、将来版、読み取り失敗の内容から画像を作ることはありません。",
    selectionTitle: "体験を一つ選ぶ",
    selectionDescription:
      "候補に表示するのはイベント、グループ、日付だけです。非公開 ID、memo、intent、revision はプレビューに入りません。",
    candidateLabel: "ローカル Journey の体験",
    candidatePlaceholder: "体験を選択してください",
    requiredTitle: "常に含まれる項目",
    requiredDescription: "グループまたはローカルイベント、イベント名、日付。",
    optionalTitle: "任意で公開する項目",
    optionalDescription:
      "初期状態はすべてオフです。選択した項目だけがプレビューと PNG に入ります。",
    includePerformanceName: "公演名を表示",
    includeMode: "参加方法を表示",
    includeHighlight: "ハイライトを表示：",
    includeSong: "楽曲を表示：",
    includeSummary: "新しい共有用まとめを追加",
    summaryLabel: "共有用まとめ",
    summaryPlaceholder: "この画像で公開してよい内容だけを書いてください",
    summaryPrivacy: "Journey の非公開 memo は読み取りもコピーもしません。",
    previewTitle: "プライバシー許可リストのプレビュー",
    previewDescription: "以下の事実と最終 canvas は同じ draw plan を使います。",
    invalidSelection: "選択した項目を入力するか、選択を解除してください。",
    contentTooLong:
      "選択内容が一つのテンプレートに収まりません。項目を減らしてください。",
    generate: "1200 × 630 PNG を生成",
    generating: "PNG を生成しています…",
    download: "PNG をダウンロード",
    share: "PNG を共有",
    shareUnavailable:
      "このブラウザーはファイル共有に未対応です。ローカル保存のみ利用できます。",
    generated: "PNG をローカルで生成しました。Journey は変更されていません。",
    generationCancelled:
      "生成をキャンセルしました。Journey は変更されていません。",
    generationFailed:
      "PNG の生成に失敗しました。Journey は変更されていません。",
    downloadStarted: "ローカルダウンロードを開始しました。",
    downloadFailed:
      "ダウンロードを開始できませんでした。画像はページのメモリー内に残っています。",
    shareComplete: "システム共有が完了しました。",
    shareCancelled:
      "システム共有をキャンセルしました。Journey は変更されていません。",
    shareRejected:
      "システム共有に失敗しました。PNG は引き続きダウンロードできます。",
    localGroupName: "ローカルイベント",
    card: {
      dateLabel: "日付",
      performanceLabel: "公演",
      modeLabel: "参加方法",
      highlightsLabel: "ハイライト",
      songsLabel: "楽曲",
      summaryLabel: "共有用まとめ",
      noOptionalDetails: "任意の詳細は追加されていません。",
      privacyLine: "このページで明示的に許可した項目のみ",
      modes: {
        "in-person": "現地参加",
        livestream: "配信視聴",
        archive: "アーカイブ視聴",
      },
    },
  },
  ko: {
    eyebrow: "Memory · 개인정보 미리보기",
    title: "Journey의 한 순간을 내가 공개 범위를 정하는 이미지로 만드세요.",
    description:
      "이 브라우저의 로컬 Journey에서 실제 경험 하나를 선택하고 공개할 항목만 직접 허용합니다. 업로드하거나 Journey를 수정하지 않습니다.",
    loading: "로컬 Journey를 읽기 전용으로 확인하는 중…",
    emptyTitle: "Memory로 만들 로컬 경험이 없습니다",
    emptyDescription:
      "먼저 Atlas에 실제 경험을 하나 이상 기록하세요. 이 고정 페이지는 샘플 데이터를 만들지 않습니다.",
    unavailableTitle: "로컬 Journey를 안전하게 읽을 수 없습니다",
    unavailableDescription:
      "데이터는 그대로 유지됩니다. 손상되었거나 미래 버전이거나 읽지 못한 내용으로 이미지를 만들지 않습니다.",
    selectionTitle: "경험 하나 선택",
    selectionDescription:
      "후보에는 이벤트, 그룹, 날짜만 표시합니다. 비공개 ID, memo, intent, revision은 미리보기에 들어가지 않습니다.",
    candidateLabel: "로컬 Journey 경험",
    candidatePlaceholder: "경험을 선택하세요",
    requiredTitle: "항상 포함",
    requiredDescription: "그룹 또는 로컬 이벤트, 이벤트 이름, 날짜.",
    optionalTitle: "선택 공개",
    optionalDescription:
      "기본값은 모두 꺼짐입니다. 체크한 항목만 미리보기와 PNG에 들어갑니다.",
    includePerformanceName: "공연 이름 표시",
    includeMode: "참여 방식 표시",
    includeHighlight: "하이라이트 표시:",
    includeSong: "곡 표시:",
    includeSummary: "새 공유 요약 추가",
    summaryLabel: "공유 요약",
    summaryPlaceholder: "이 이미지에 공개해도 되는 내용만 작성하세요",
    summaryPrivacy: "Journey의 비공개 memo는 읽거나 복사하지 않습니다.",
    previewTitle: "개인정보 허용 목록 미리보기",
    previewDescription:
      "아래 사실과 최종 canvas는 같은 draw plan을 사용합니다.",
    invalidSelection: "체크한 항목을 입력하거나 체크를 해제하세요.",
    contentTooLong:
      "선택한 내용이 단일 템플릿 용량을 넘습니다. 항목을 줄이세요.",
    generate: "1200 × 630 PNG 생성",
    generating: "PNG 생성 중…",
    download: "PNG 다운로드",
    share: "PNG 공유",
    shareUnavailable:
      "이 브라우저는 파일 공유를 지원하지 않습니다. 로컬 다운로드만 제공합니다.",
    generated: "PNG를 로컬에서 생성했습니다. Journey는 변경되지 않았습니다.",
    generationCancelled: "생성을 취소했습니다. Journey는 변경되지 않았습니다.",
    generationFailed: "PNG 생성에 실패했습니다. Journey는 변경되지 않았습니다.",
    downloadStarted: "로컬 다운로드를 시작했습니다.",
    downloadFailed:
      "다운로드를 시작하지 못했습니다. 이미지는 페이지 메모리에 남아 있습니다.",
    shareComplete: "시스템 공유를 완료했습니다.",
    shareCancelled:
      "시스템 공유를 취소했습니다. Journey는 변경되지 않았습니다.",
    shareRejected:
      "시스템 공유에 실패했습니다. PNG는 계속 다운로드할 수 있습니다.",
    localGroupName: "로컬 이벤트",
    card: {
      dateLabel: "날짜",
      performanceLabel: "공연",
      modeLabel: "참여 방식",
      highlightsLabel: "하이라이트",
      songsLabel: "곡",
      summaryLabel: "공유 요약",
      noOptionalDetails: "선택 공개한 세부 정보가 없습니다.",
      privacyLine: "이 페이지에서 명시적으로 허용한 항목만 포함",
      modes: {
        "in-person": "현장 참여",
        livestream: "라이브 스트림",
        archive: "다시 보기",
      },
    },
  },
};

export function getMemoryMessages(locale: ShellLocale) {
  return MEMORY_MESSAGES[locale];
}
