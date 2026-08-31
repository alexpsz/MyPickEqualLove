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
    events: string;
    journey: string;
    memory: string;
    localEvent: string;
    productFamily: string;
    productMenuLabel: string;
    externalLinkSuffix: string;
  };
  preferences: {
    languageLabel: string;
    languageMenuLabel: string;
    followBrowser: string;
    themeLabel: string;
    useLightTheme: string;
    useDarkTheme: string;
  };
  home: {
    title: string;
    description: string;
    primaryAction: string;
    secondaryAction: string;
    quickActionsLabel: string;
    journeyTitle: string;
    journeyDescription: string;
    memoryTitle: string;
    memoryDescription: string;
    eventsTitle: string;
    eventsDescription: string;
    localEventTitle: string;
    localEventDescription: string;
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
      events: "活动",
      journey: "Journey",
      memory: "Memory",
      localEvent: "记录一个时刻",
      productFamily: "MyPick 产品家族",
      productMenuLabel: "打开 MyPick 产品家族菜单",
      externalLinkSuffix: "（在新标签页打开）",
    },
    preferences: {
      languageLabel: "语言",
      languageMenuLabel: "选择语言",
      followBrowser: "跟随浏览器",
      themeLabel: "主题",
      useLightTheme: "切换为浅色主题",
      useDarkTheme: "切换为深色主题",
    },
    home: {
      title: "把现场，留给以后回看。",
      description: "记录一次活动、一段经历，或一个只属于你的瞬间。",
      primaryAction: "找到一场活动",
      secondaryAction: "打开我的 Journey",
      quickActionsLabel: "继续使用 Atlas",
      journeyTitle: "我的 Journey",
      journeyDescription: "回看、补写或整理已保存的记录。",
      memoryTitle: "制作 Memory",
      memoryDescription: "从一段经历生成一张属于你的纪念卡。",
      eventsTitle: "发现活动",
      eventsDescription: "从真实活动与场次开始记录。",
      localEventTitle: "没有找到活动？",
      localEventDescription: "创建一条仅保存在此浏览器的自定义活动。",
    },
    footer: {
      privacy: "记录保存在此浏览器；你决定何时导出或分享。",
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
      events: "Events",
      journey: "Journey",
      memory: "Memory",
      localEvent: "Record a moment",
      productFamily: "MyPick family",
      productMenuLabel: "Open the MyPick family menu",
      externalLinkSuffix: "(opens in a new tab)",
    },
    preferences: {
      languageLabel: "Language",
      languageMenuLabel: "Choose a language",
      followBrowser: "Follow browser",
      themeLabel: "Theme",
      useLightTheme: "Use light theme",
      useDarkTheme: "Use dark theme",
    },
    home: {
      title: "Keep the moment. Return to it later.",
      description:
        "Record an event, an experience, or one moment that belongs to you.",
      primaryAction: "Find an event",
      secondaryAction: "Open My Journey",
      quickActionsLabel: "Continue with Atlas",
      journeyTitle: "My Journey",
      journeyDescription: "Review, continue, or organise your saved records.",
      memoryTitle: "Create a Memory",
      memoryDescription:
        "Turn one experience into a card made from the details you choose.",
      eventsTitle: "Discover events",
      eventsDescription: "Start from a real event and performance.",
      localEventTitle: "Can’t find the event?",
      localEventDescription:
        "Create a custom event that stays in this browser.",
    },
    footer: {
      privacy:
        "Records stay in this browser. You decide when to export or share.",
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
      events: "イベント",
      journey: "Journey",
      memory: "Memory",
      localEvent: "ひとつの瞬間を記録",
      productFamily: "MyPick ファミリー",
      productMenuLabel: "MyPick ファミリーメニューを開く",
      externalLinkSuffix: "（新しいタブで開きます）",
    },
    preferences: {
      languageLabel: "言語",
      languageMenuLabel: "言語を選択",
      followBrowser: "ブラウザーに合わせる",
      themeLabel: "テーマ",
      useLightTheme: "ライトテーマにする",
      useDarkTheme: "ダークテーマにする",
    },
    home: {
      title: "あの瞬間を、あとから振り返れるように。",
      description: "イベントや体験、自分だけのひとときを記録しましょう。",
      primaryAction: "イベントを探す",
      secondaryAction: "Journey を開く",
      quickActionsLabel: "Atlas を続ける",
      journeyTitle: "わたしの Journey",
      journeyDescription: "保存した記録を振り返り、続きを書き、整えます。",
      memoryTitle: "Memory を作る",
      memoryDescription: "体験から、選んだ内容だけで記念のカードを作ります。",
      eventsTitle: "イベントを探す",
      eventsDescription: "実際のイベントや公演から記録を始めます。",
      localEventTitle: "イベントが見つからない場合",
      localEventDescription:
        "このブラウザーだけに保存するカスタムイベントを作ります。",
    },
    footer: {
      privacy:
        "記録はこのブラウザーに保存されます。書き出すか共有するかは、あなたが決めます。",
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
      events: "이벤트",
      journey: "Journey",
      memory: "Memory",
      localEvent: "한 순간 기록하기",
      productFamily: "MyPick 제품군",
      productMenuLabel: "MyPick 제품군 메뉴 열기",
      externalLinkSuffix: "(새 탭에서 열기)",
    },
    preferences: {
      languageLabel: "언어",
      languageMenuLabel: "언어 선택",
      followBrowser: "브라우저 설정 따르기",
      themeLabel: "테마",
      useLightTheme: "라이트 테마 사용",
      useDarkTheme: "다크 테마 사용",
    },
    home: {
      title: "그 순간을, 나중에도 다시 볼 수 있게.",
      description: "한 번의 이벤트, 하나의 경험, 나만의 순간을 기록하세요.",
      primaryAction: "이벤트 찾기",
      secondaryAction: "Journey 열기",
      quickActionsLabel: "Atlas 계속 사용하기",
      journeyTitle: "나의 Journey",
      journeyDescription: "저장한 기록을 돌아보고, 이어 쓰고, 정리합니다.",
      memoryTitle: "Memory 만들기",
      memoryDescription: "경험 하나를 선택한 내용만 담은 기념 카드로 만듭니다.",
      eventsTitle: "이벤트 찾기",
      eventsDescription: "실제 이벤트와 공연에서 기록을 시작하세요.",
      localEventTitle: "이벤트를 찾지 못했나요?",
      localEventDescription:
        "이 브라우저에만 저장되는 사용자 이벤트를 만드세요.",
    },
    footer: {
      privacy:
        "기록은 이 브라우저에 저장됩니다. 내보내거나 공유할 시점은 내가 정합니다.",
    },
    productFamily: {
      "equal-love": "MY PICK =LOVE",
      "nearly-equal-joy": "MY PICK ≒JOY",
      "not-equal-me": "MY PICK ≠ME",
    },
  },
};
