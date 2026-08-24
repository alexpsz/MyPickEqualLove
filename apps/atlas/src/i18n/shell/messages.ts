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
        "从本地自定义事件开始；保存后可在“我的 Journey”中回顾和继续编辑。",
      emptyStateLabel: "我的 Journey",
      emptyStateTitle: "你的记录由你保管",
      emptyStateDescription:
        "先写下一次只属于你的时刻；保存的记录可在“我的 Journey”中回顾和编辑。",
      localEventTitle: "本地自定义事件",
      localEventDescription:
        "这是一个私有记录入口，不会创建公共活动，也不会使用示例或演示数据。",
      localEventAction: "本地记录已可用",
      localEventStatus: "记录只保存在此浏览器，可随时在 Journey 中继续编辑。",
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
        "Start with a local custom event, then review and continue editing it in My Journey.",
      emptyStateLabel: "My Journey",
      emptyStateTitle: "Your records stay in your hands",
      emptyStateDescription:
        "Begin with a moment that matters to you. Saved records can be reviewed and edited in My Journey.",
      localEventTitle: "Local custom event",
      localEventDescription:
        "This is a private-recording entry point. It creates no public activity and uses no sample or demo data.",
      localEventAction: "Local recording is ready",
      localEventStatus:
        "The record stays in this browser and remains editable from Journey.",
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
        "まずはローカルのカスタムイベントから。保存後は「わたしの Journey」で振り返り、編集を続けられます。",
      emptyStateLabel: "わたしの Journey",
      emptyStateTitle: "記録はあなた自身が管理します",
      emptyStateDescription:
        "大切にしたい瞬間を書き留めましょう。保存した記録は「わたしの Journey」で振り返り、編集できます。",
      localEventTitle: "ローカルのカスタムイベント",
      localEventDescription:
        "これはプライベート記録の入口です。公開アクティビティを作成せず、サンプルやデモのデータも使いません。",
      localEventAction: "ローカル記録を利用できます",
      localEventStatus:
        "記録はこのブラウザー内だけに保存され、Journey からいつでも編集できます。",
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
        "로컬 맞춤 이벤트부터 시작하세요. 저장한 뒤에는 '나의 Journey'에서 돌아보고 계속 수정할 수 있습니다.",
      emptyStateLabel: "나의 Journey",
      emptyStateTitle: "내 기록은 내가 관리합니다",
      emptyStateDescription:
        "나에게 중요한 순간부터 남겨 보세요. 저장한 기록은 '나의 Journey'에서 돌아보고 수정할 수 있습니다.",
      localEventTitle: "로컬 맞춤 이벤트",
      localEventDescription:
        "이곳은 비공개 기록의 시작점입니다. 공개 활동을 만들지 않으며 샘플이나 데모 데이터를 사용하지 않습니다.",
      localEventAction: "로컬 기록을 사용할 수 있습니다",
      localEventStatus:
        "기록은 이 브라우저에만 저장되며 Journey에서 언제든 수정할 수 있습니다.",
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
