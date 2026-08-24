export const SHELL_LOCALES = ["zh-CN", "en", "ja", "ko"] as const;

export type ShellLocale = (typeof SHELL_LOCALES)[number];

type ProductFamilyLabels = Record<
  "equal-love" | "nearly-equal-joy" | "not-equal-me",
  string
>;

export interface ShellMessages {
  languageName: string;
  navigation: {
    label: string;
    skipToMain: string;
    home: string;
    journey: string;
    localEvent: string;
    productFamily: string;
    externalLinkSuffix: string;
  };
  preferences: {
    languageLabel: string;
    themeLabel: string;
    useLightTheme: string;
    useDarkTheme: string;
  };
  home: {
    eyebrow: string;
    title: string;
    description: string;
    primaryAction: string;
    primaryActionHint: string;
    emptyStateLabel: string;
    emptyStateTitle: string;
    emptyStateDescription: string;
    localEventTitle: string;
    localEventDescription: string;
    localEventAction: string;
    localEventStatus: string;
    privacyTitle: string;
    privacyDescription: string;
    sourceStatusTitle: string;
    sourceStatusDescription: string;
  };
  footer: {
    privacy: string;
  };
  productFamily: ProductFamilyLabels;
}

export const SHELL_MESSAGES: Record<ShellLocale, ShellMessages> = {
  "zh-CN": {
    languageName: "简体中文",
    navigation: {
      label: "Atlas 导航",
      skipToMain: "跳到主要内容",
      home: "首页",
      journey: "我的 Journey",
      localEvent: "本地自定义记录",
      productFamily: "MyPick 产品系列",
      externalLinkSuffix: "（在新标签页打开）",
    },
    preferences: {
      languageLabel: "语言",
      themeLabel: "主题",
      useLightTheme: "切换为浅色主题",
      useDarkTheme: "切换为深色主题",
    },
    home: {
      eyebrow: "私人、本地优先的记录空间",
      title: "让你的 Journey 从一个真正属于你的时刻开始。",
      description:
        "Atlas 用于保存你自己的回忆与选择；它不复制 MyPick 的歌曲浏览器或榜单。",
      primaryAction: "记录本地自定义事件",
      primaryActionHint:
        "从本地自定义事件开始；有记录后，这里会成为继续 Journey 的入口。",
      emptyStateLabel: "我的 Journey",
      emptyStateTitle: "还没有本地记录",
      emptyStateDescription:
        "先写下一次只属于你的时刻。连接私有 Journey 存储后，本卡片会展示并继续你的本地记录。",
      localEventTitle: "本地自定义事件",
      localEventDescription:
        "这是一个私有记录入口，不会创建公共活动，也不会使用示例或演示数据。",
      localEventAction: "等待私有 Journey 操作接线",
      localEventStatus: "该操作会在本地 Journey 存储接入后启用。",
      privacyTitle: "数据仅留在 Atlas",
      privacyDescription:
        "你的个人 Journey 数据只保存在此 Atlas origin 的本地浏览器存储中，绝不会上传，也不会发送给 MyPick。",
      sourceStatusTitle: "共享活动保持关闭",
      sourceStatusDescription:
        "在独立来源证据解除 HOLD 前，Atlas 不显示公共活动或近期活动。",
    },
    footer: {
      privacy: "Atlas 仅在此 origin 本地保存你的个人 Journey；不会上传。",
    },
    productFamily: {
      "equal-love": "MY PICK =LOVE",
      "nearly-equal-joy": "MY PICK ≒JOY",
      "not-equal-me": "MY PICK ≠ME",
    },
  },
  en: {
    languageName: "English",
    navigation: {
      label: "Atlas navigation",
      skipToMain: "Skip to main content",
      home: "Home",
      journey: "My Journey",
      localEvent: "Local custom event",
      productFamily: "MyPick family",
      externalLinkSuffix: "(opens in a new tab)",
    },
    preferences: {
      languageLabel: "Language",
      themeLabel: "Theme",
      useLightTheme: "Use light theme",
      useDarkTheme: "Use dark theme",
    },
    home: {
      eyebrow: "A private, local-first place to keep your story",
      title: "Let your Journey begin with a moment that is actually yours.",
      description:
        "Atlas keeps your own memories and choices. It does not copy MyPick song browsers or rankings.",
      primaryAction: "Record a local custom event",
      primaryActionHint:
        "Start with a local custom event; once you have entries, this becomes where you continue your Journey.",
      emptyStateLabel: "My Journey",
      emptyStateTitle: "No local entries yet",
      emptyStateDescription:
        "Begin with a moment that matters to you. Once private Journey storage is connected, this card will show and continue only your local record.",
      localEventTitle: "Local custom event",
      localEventDescription:
        "This is a private-recording entry point. It creates no public activity and uses no sample or demo data.",
      localEventAction: "Private Journey action is waiting to be connected",
      localEventStatus:
        "This action becomes available when local Journey storage is wired in.",
      privacyTitle: "Your data stays in Atlas",
      privacyDescription:
        "Your personal Journey data is stored only in this Atlas origin's local browser storage. It is never uploaded or sent to MyPick.",
      sourceStatusTitle: "Shared activity remains off",
      sourceStatusDescription:
        "Atlas does not show public or recent activity while independently sourced evidence is on HOLD.",
    },
    footer: {
      privacy:
        "Atlas keeps your personal Journey only in this origin's local storage. Nothing is uploaded.",
    },
    productFamily: {
      "equal-love": "MY PICK =LOVE",
      "nearly-equal-joy": "MY PICK ≒JOY",
      "not-equal-me": "MY PICK ≠ME",
    },
  },
  ja: {
    languageName: "日本語",
    navigation: {
      label: "Atlas ナビゲーション",
      skipToMain: "メインコンテンツへ移動",
      home: "ホーム",
      journey: "わたしの Journey",
      localEvent: "ローカルのカスタム記録",
      productFamily: "MyPick ファミリー",
      externalLinkSuffix: "（新しいタブで開きます）",
    },
    preferences: {
      languageLabel: "言語",
      themeLabel: "テーマ",
      useLightTheme: "ライトテーマにする",
      useDarkTheme: "ダークテーマにする",
    },
    home: {
      eyebrow: "自分だけの記録を、ローカルに残す場所",
      title: "あなた自身の瞬間から Journey を始めよう。",
      description:
        "Atlas はあなたの思い出と選択を記録します。MyPick の楽曲ブラウザーやランキングを複製しません。",
      primaryAction: "ローカルのカスタムイベントを記録する",
      primaryActionHint:
        "まずはローカルのカスタムイベントから。記録ができたら、ここが Journey を続ける入口になります。",
      emptyStateLabel: "わたしの Journey",
      emptyStateTitle: "ローカルの記録はまだありません",
      emptyStateDescription:
        "大切にしたい瞬間を書き留めましょう。プライベート Journey ストレージ接続後、このカードには自分のローカル記録だけが表示され、続きから始められます。",
      localEventTitle: "ローカルのカスタムイベント",
      localEventDescription:
        "これはプライベート記録の入口です。公開アクティビティを作成せず、サンプルやデモのデータも使いません。",
      localEventAction: "プライベート Journey 操作の接続待ち",
      localEventStatus:
        "ローカル Journey ストレージが接続されると、この操作を利用できます。",
      privacyTitle: "データは Atlas にだけ残ります",
      privacyDescription:
        "個人の Journey データは、この Atlas origin のローカルブラウザーストレージにのみ保存されます。アップロードも MyPick への送信も行いません。",
      sourceStatusTitle: "共有アクティビティは無効のままです",
      sourceStatusDescription:
        "独立した根拠の HOLD が解除されるまで、Atlas は公開または最近のアクティビティを表示しません。",
    },
    footer: {
      privacy:
        "Atlas は個人の Journey をこの origin のローカルストレージにのみ保存します。アップロードしません。",
    },
    productFamily: {
      "equal-love": "MY PICK =LOVE",
      "nearly-equal-joy": "MY PICK ≒JOY",
      "not-equal-me": "MY PICK ≠ME",
    },
  },
  ko: {
    languageName: "한국어",
    navigation: {
      label: "Atlas 탐색",
      skipToMain: "본문으로 건너뛰기",
      home: "홈",
      journey: "나의 Journey",
      localEvent: "로컬 맞춤 기록",
      productFamily: "MyPick 제품군",
      externalLinkSuffix: "(새 탭에서 열기)",
    },
    preferences: {
      languageLabel: "언어",
      themeLabel: "테마",
      useLightTheme: "라이트 테마 사용",
      useDarkTheme: "다크 테마 사용",
    },
    home: {
      eyebrow: "나만의 이야기를 로컬에 남기는 비공개 공간",
      title: "진짜 나만의 순간으로 Journey를 시작하세요.",
      description:
        "Atlas는 나의 기억과 선택을 보관합니다. MyPick의 곡 탐색기나 순위를 복제하지 않습니다.",
      primaryAction: "로컬 맞춤 이벤트 기록하기",
      primaryActionHint:
        "로컬 맞춤 이벤트부터 시작하세요. 기록이 생기면 이곳에서 Journey를 이어갈 수 있습니다.",
      emptyStateLabel: "나의 Journey",
      emptyStateTitle: "아직 로컬 기록이 없습니다",
      emptyStateDescription:
        "나에게 중요한 순간부터 남겨 보세요. 비공개 Journey 저장소가 연결되면 이 카드에는 내 로컬 기록만 표시되고 이어서 사용할 수 있습니다.",
      localEventTitle: "로컬 맞춤 이벤트",
      localEventDescription:
        "이곳은 비공개 기록의 시작점입니다. 공개 활동을 만들지 않으며 샘플이나 데모 데이터를 사용하지 않습니다.",
      localEventAction: "비공개 Journey 동작 연결 대기 중",
      localEventStatus:
        "로컬 Journey 저장소가 연결되면 이 동작을 사용할 수 있습니다.",
      privacyTitle: "데이터는 Atlas 안에만 남습니다",
      privacyDescription:
        "개인 Journey 데이터는 이 Atlas origin의 로컬 브라우저 저장소에만 보관됩니다. 업로드하거나 MyPick에 보내지 않습니다.",
      sourceStatusTitle: "공유 활동은 계속 꺼져 있습니다",
      sourceStatusDescription:
        "독립 출처 증거의 HOLD가 해제되기 전까지 Atlas는 공개 또는 최근 활동을 표시하지 않습니다.",
    },
    footer: {
      privacy:
        "Atlas는 개인 Journey를 이 origin의 로컬 저장소에만 보관합니다. 아무것도 업로드하지 않습니다.",
    },
    productFamily: {
      "equal-love": "MY PICK =LOVE",
      "nearly-equal-joy": "MY PICK ≒JOY",
      "not-equal-me": "MY PICK ≠ME",
    },
  },
};
