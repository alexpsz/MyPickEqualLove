import type { ExperienceMode } from "../../contracts/journey-document.js";
import type { ShellLocale } from "../shell/messages.js";

export interface MemoryMessages {
  readonly backToJourney: string;
  readonly title: string;
  readonly description: string;
  readonly loading: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly unavailableTitle: string;
  readonly unavailableDescription: string;
  readonly selectionTitle: string;
  readonly candidateLabel: string;
  readonly candidatePlaceholder: string;
  readonly showTitle: string;
  readonly includePerformanceName: string;
  readonly includeMode: string;
  readonly nicknameLabel: string;
  readonly nicknamePlaceholder: string;
  readonly includeHighlight: string;
  readonly includeSong: string;
  readonly includeSummary: string;
  readonly summaryLabel: string;
  readonly summaryPlaceholder: string;
  readonly previewTitle: string;
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
  readonly makeMyPick: string;
  readonly privacyLine: string;
  readonly localGroupName: string;
  readonly card: {
    readonly dateLabel: string;
    readonly nickname: string;
    readonly performanceLabel: string;
    readonly modeLabel: string;
    readonly highlightsLabel: string;
    readonly songsLabel: string;
    readonly summaryLabel: string;
    readonly noOptionalDetails: string;
    readonly modes: Readonly<Record<ExperienceMode, string>>;
  };
}

export const MEMORY_MESSAGES: Readonly<Record<ShellLocale, MemoryMessages>> = {
  "zh-CN": {
    backToJourney: "返回我的 Journey",
    title: "制作一张 Memory",
    description: "从这次经历里，选出你愿意留下和分享的内容。",
    loading: "正在读取你的 Journey…",
    emptyTitle: "还没有可以制作的经历",
    emptyDescription: "先记录一次真实经历，再回来制作属于你的 Memory。",
    unavailableTitle: "暂时无法读取 Journey",
    unavailableDescription: "你的记录没有改变，请稍后重试。",
    selectionTitle: "已选择的经历",
    candidateLabel: "选择经历",
    candidatePlaceholder: "请选择一条经历",
    showTitle: "这张 Memory 里显示",
    includePerformanceName: "显示场次名称",
    includeMode: "参与方式",
    nicknameLabel: "显示昵称（选填）",
    nicknamePlaceholder: "输入会显示在图片上的昵称",
    includeHighlight: "最难忘的瞬间",
    includeSong: "最难忘的歌",
    includeSummary: "写一句分享的话",
    summaryLabel: "分享的话",
    summaryPlaceholder: "写下愿意出现在图片上的一句话",
    previewTitle: "预览",
    invalidSelection: "请补全已经打开的内容，或将它关闭。",
    contentTooLong: "内容放不下了，请少选一点。",
    generate: "生成图片",
    generating: "正在生成 PNG…",
    download: "下载 PNG",
    share: "分享 PNG",
    shareUnavailable: "当前浏览器不支持直接分享，请先下载图片。",
    generated: "图片已经准备好了。",
    generationCancelled: "已取消生成。",
    generationFailed: "图片生成失败，请再试一次。",
    downloadStarted: "已开始下载。",
    downloadFailed: "无法开始下载，请再试一次。",
    shareComplete: "已分享。",
    shareCancelled: "已取消分享。",
    shareRejected: "分享失败，你仍可下载图片。",
    makeMyPick: "制作这场 MyPick",
    privacyLine: "只有你勾选的内容会进入图片。",
    localGroupName: "本地事件",
    card: {
      dateLabel: "日期",
      nickname: "昵称 · {name}",
      performanceLabel: "场次",
      modeLabel: "参与方式",
      highlightsLabel: "最难忘的瞬间",
      songsLabel: "最难忘的歌",
      summaryLabel: "这一刻",
      noOptionalDetails: "为这一刻留一点空白。",
      modes: {
        "in-person": "现场参与",
        livestream: "直播观看",
        archive: "回看",
      },
    },
  },
  en: {
    backToJourney: "Back to My Journey",
    title: "Make a Memory",
    description: "Choose what you want to keep and share from this experience.",
    loading: "Loading your Journey…",
    emptyTitle: "No experience is ready yet",
    emptyDescription:
      "Record a real experience, then return to make your Memory.",
    unavailableTitle: "Journey is temporarily unavailable",
    unavailableDescription:
      "Your records are unchanged. Please try again later.",
    selectionTitle: "Selected experience",
    candidateLabel: "Choose an experience",
    candidatePlaceholder: "Choose an experience",
    showTitle: "Show in this Memory",
    includePerformanceName: "Show performance name",
    includeMode: "Participation mode",
    nicknameLabel: "Nickname (optional)",
    nicknamePlaceholder: "Enter the nickname to show on the image",
    includeHighlight: "Most memorable moment",
    includeSong: "Most memorable song",
    includeSummary: "Add one line to share",
    summaryLabel: "Your line",
    summaryPlaceholder: "Write one line you are happy to place on the image",
    previewTitle: "Preview",
    invalidSelection: "Complete the enabled item or turn it off.",
    contentTooLong: "There is too much content. Choose fewer details.",
    generate: "Generate image",
    generating: "Generating PNG…",
    download: "Download PNG",
    share: "Share PNG",
    shareUnavailable:
      "Direct sharing is unavailable. Download the image instead.",
    generated: "Your image is ready.",
    generationCancelled: "Image generation cancelled.",
    generationFailed: "The image could not be generated. Please try again.",
    downloadStarted: "Download started.",
    downloadFailed: "The download could not start. Please try again.",
    shareComplete: "Shared.",
    shareCancelled: "Sharing cancelled.",
    shareRejected: "Sharing failed. You can still download the image.",
    makeMyPick: "Make this event's MyPick",
    privacyLine: "Only the content you select enters the image.",
    localGroupName: "Local event",
    card: {
      dateLabel: "Date",
      nickname: "Selected by {name}",
      performanceLabel: "Performance",
      modeLabel: "Mode",
      highlightsLabel: "Most memorable moment",
      songsLabel: "Most memorable songs",
      summaryLabel: "This moment",
      noOptionalDetails: "Leave a little space for this moment.",
      modes: {
        "in-person": "In person",
        livestream: "Livestream",
        archive: "Archive",
      },
    },
  },
  ja: {
    backToJourney: "My Journey に戻る",
    title: "Memory を一枚つくる",
    description: "この体験から、残したいこと、伝えたいことを選びます。",
    loading: "Journey を読み込んでいます…",
    emptyTitle: "まだ Memory にできる体験がありません",
    emptyDescription: "実際の体験を記録してから、Memory をつくりましょう。",
    unavailableTitle: "Journey を一時的に読み込めません",
    unavailableDescription:
      "記録は変更されていません。しばらくしてからお試しください。",
    selectionTitle: "選択中の体験",
    candidateLabel: "体験を選ぶ",
    candidatePlaceholder: "体験を選択してください",
    showTitle: "この Memory に表示するもの",
    includePerformanceName: "公演名を表示",
    includeMode: "参加方法",
    nicknameLabel: "ニックネームを表示（任意）",
    nicknamePlaceholder: "画像に表示するニックネーム",
    includeHighlight: "いちばん忘れたくない瞬間",
    includeSong: "いちばん忘れたくない曲",
    includeSummary: "共有する一言を添える",
    summaryLabel: "共有する一言",
    summaryPlaceholder: "画像に載せたい一言を書いてください",
    previewTitle: "プレビュー",
    invalidSelection: "オンにした項目を入力するか、オフにしてください。",
    contentTooLong: "内容が多すぎます。選択を少し減らしてください。",
    generate: "画像を生成",
    generating: "PNG を生成しています…",
    download: "PNG をダウンロード",
    share: "PNG を共有",
    shareUnavailable:
      "このブラウザーでは直接共有できません。画像をダウンロードしてください。",
    generated: "画像の準備ができました。",
    generationCancelled: "画像の生成をキャンセルしました。",
    generationFailed: "画像を生成できませんでした。もう一度お試しください。",
    downloadStarted: "ダウンロードを開始しました。",
    downloadFailed:
      "ダウンロードを開始できませんでした。もう一度お試しください。",
    shareComplete: "共有しました。",
    shareCancelled: "共有をキャンセルしました。",
    shareRejected: "共有できませんでした。画像は引き続きダウンロードできます。",
    makeMyPick: "この公演の MyPick をつくる",
    privacyLine: "選んだ内容だけが画像に入ります。",
    localGroupName: "ローカルイベント",
    card: {
      dateLabel: "日付",
      nickname: "ニックネーム · {name}",
      performanceLabel: "公演",
      modeLabel: "参加方法",
      highlightsLabel: "いちばん忘れたくない瞬間",
      songsLabel: "いちばん忘れたくない曲",
      summaryLabel: "この瞬間",
      noOptionalDetails: "この瞬間のために、少し余白を残します。",
      modes: {
        "in-person": "現地参加",
        livestream: "配信視聴",
        archive: "アーカイブ視聴",
      },
    },
  },
  ko: {
    backToJourney: "My Journey로 돌아가기",
    title: "Memory 한 장 만들기",
    description: "이 경험에서 남기고 공유하고 싶은 내용을 골라 보세요.",
    loading: "Journey를 불러오는 중…",
    emptyTitle: "아직 만들 수 있는 경험이 없습니다",
    emptyDescription: "실제 경험을 기록한 뒤 나만의 Memory를 만들어 보세요.",
    unavailableTitle: "Journey를 잠시 불러올 수 없습니다",
    unavailableDescription:
      "기록은 변경되지 않았습니다. 잠시 후 다시 시도하세요.",
    selectionTitle: "선택한 경험",
    candidateLabel: "경험 선택",
    candidatePlaceholder: "경험을 선택하세요",
    showTitle: "이 Memory에 표시",
    includePerformanceName: "공연 이름 표시",
    includeMode: "참여 방식",
    nicknameLabel: "닉네임 표시 (선택)",
    nicknamePlaceholder: "이미지에 표시할 닉네임",
    includeHighlight: "가장 잊고 싶지 않은 순간",
    includeSong: "가장 잊고 싶지 않은 곡",
    includeSummary: "공유할 한마디 추가",
    summaryLabel: "공유할 한마디",
    summaryPlaceholder: "이미지에 담고 싶은 한마디를 적어 주세요",
    previewTitle: "미리보기",
    invalidSelection: "켠 항목을 입력하거나 꺼 주세요.",
    contentTooLong: "내용이 너무 많습니다. 선택을 조금 줄여 주세요.",
    generate: "이미지 생성",
    generating: "PNG 생성 중…",
    download: "PNG 다운로드",
    share: "PNG 공유",
    shareUnavailable:
      "이 브라우저에서는 바로 공유할 수 없습니다. 이미지를 다운로드해 주세요.",
    generated: "이미지가 준비되었습니다.",
    generationCancelled: "이미지 생성을 취소했습니다.",
    generationFailed: "이미지를 만들지 못했습니다. 다시 시도해 주세요.",
    downloadStarted: "다운로드를 시작했습니다.",
    downloadFailed: "다운로드를 시작하지 못했습니다. 다시 시도해 주세요.",
    shareComplete: "공유했습니다.",
    shareCancelled: "공유를 취소했습니다.",
    shareRejected: "공유하지 못했습니다. 이미지는 계속 다운로드할 수 있습니다.",
    makeMyPick: "이 공연의 MyPick 만들기",
    privacyLine: "선택한 내용만 이미지에 들어갑니다.",
    localGroupName: "로컬 이벤트",
    card: {
      dateLabel: "날짜",
      nickname: "닉네임 · {name}",
      performanceLabel: "공연",
      modeLabel: "참여 방식",
      highlightsLabel: "가장 잊고 싶지 않은 순간",
      songsLabel: "가장 잊고 싶지 않은 곡",
      summaryLabel: "이 순간",
      noOptionalDetails: "이 순간을 위해 여백을 남겨 둡니다.",
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
