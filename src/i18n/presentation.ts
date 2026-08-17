import type { ProjectConfig } from "../projects/registry";
import type { ProjectId } from "../schema/project";
import type {
  ExperiencePickSlot,
  PickExperience,
} from "../schema/pick-experience";
import type { AppLocale } from "./locales";
import type { MessageKey } from "./messages";

const enPresentation = {
  "project.equalLove.subtitle": "Choose your favorite ＝LOVE songs!",
  "project.equalLove.description":
    "A fan-made tool for choosing your favorite ＝LOVE songs and creating an original pick image to share.",
  "project.equalLove.shareText":
    "I made my ＝LOVE favorite-song My Pick!\n(Please attach the image you downloaded.)",

  "project.nearlyEqualJoy.subtitle": "Choose your favorite ≒JOY songs!",
  "project.nearlyEqualJoy.description":
    "A fan-made tool for choosing your favorite ≒JOY songs and creating an original pick image to share.",
  "project.nearlyEqualJoy.shareText":
    "I made my ≒JOY favorite-song My Pick!\n(Please attach the image you downloaded.)",

  "project.notEqualMe.subtitle": "Choose your favorite ≠ME songs!",
  "project.notEqualMe.description":
    "A fan-made tool for choosing your favorite ≠ME songs and creating an original pick image to share.",
  "project.notEqualMe.shareText":
    "I made my ≠ME favorite-song My Pick!\n(Please attach the image you downloaded.)",

  "live.kokuritsu2026.title": "Kokuritsu Afterglow My Pick",
  "live.kokuritsu2026.subtitle":
    "Capture the afterglow of ＝LOVE STADIUM LIVE in six memories.",
  "live.kokuritsu2026.description":
    "Revisit ＝LOVE STADIUM LIVE at 国立競技場 through six picks: the unforgettable song, the song that raised the roof, the song that brought tears, the song where your oshi shone, the song you played on the way home, and a FREE PICK.",
  "live.kokuritsu2026.slot.unforgettable.label": "The unforgettable song",
  "live.kokuritsu2026.slot.unforgettable.subtitle":
    "The one song from Kokuritsu that stayed with you most",
  "live.kokuritsu2026.slot.heatedUp.label": "The song that raised the roof",
  "live.kokuritsu2026.slot.heatedUp.subtitle":
    "The song that set the calls, staging, and whole venue alight",
  "live.kokuritsu2026.slot.tears.label": "The song that brought tears",
  "live.kokuritsu2026.slot.tears.subtitle":
    "The one song that made the tears come",
  "live.kokuritsu2026.slot.oshiShined.label": "The song where my oshi shone",
  "live.kokuritsu2026.slot.oshiShined.subtitle":
    "The song that captured a moment with your oshi you never want to forget",
  "live.kokuritsu2026.slot.wayHome.label": "The song I played on the way home",
  "live.kokuritsu2026.slot.wayHome.subtitle":
    "The one song you returned to after the show",
  "live.kokuritsu2026.slot.freePick.label": "FREE PICK",
  "live.kokuritsu2026.slot.freePick.subtitle":
    "One more song from the Kokuritsu setlists, freely chosen",
  "live.kokuritsu2026.shareText":
    "I made my ＝LOVE STADIUM LIVE Kokuritsu Afterglow My Pick!\n(Please attach the image you downloaded.)",
  "live.kokuritsu2026.hint":
    "Choose “The song I played on the way home” from the full catalog. Choose FREE PICK from songs performed at Kokuritsu.",
  "live.kokuritsu2026.badge.wayHomeOnly": "Way Home slot only",

  "live.tokyoDome2027.title": "Tokyo Dome Wishlist My Pick",
  "live.tokyoDome2027.subtitle":
    "Choose six moments you hope to see come true at ＝LOVE in TOKYO DOME.",
  "live.tokyoDome2027.description":
    "Build a six-song ＝LOVE wishlist for Tokyo Dome: the opener, the song that lifts the whole venue, the song that brings tears, the song where your oshi shines, the finale, and a FREE PICK.",
  "live.tokyoDome2027.slot.opening.label": "The song I want as the opener",
  "live.tokyoDome2027.slot.opening.subtitle":
    "The song I want to hear from the very first note at Tokyo Dome",
  "live.tokyoDome2027.slot.hype.label": "The song I want to raise the roof",
  "live.tokyoDome2027.slot.hype.subtitle":
    "The song I want the whole dome to get fired up for",
  "live.tokyoDome2027.slot.cry.label":
    "The song I want to cry to at Tokyo Dome",
  "live.tokyoDome2027.slot.cry.subtitle":
    "The song that would bring tears if I heard it there",
  "live.tokyoDome2027.slot.oshi.label":
    "The song where I want my oshi to shine",
  "live.tokyoDome2027.slot.oshi.subtitle":
    "The song I want my oshi to deliver at Tokyo Dome",
  "live.tokyoDome2027.slot.finale.label": "The song I want as the finale",
  "live.tokyoDome2027.slot.finale.subtitle":
    "The song I want to carry the afterglow of the show",
  "live.tokyoDome2027.slot.freePick.label": "FREE PICK",
  "live.tokyoDome2027.slot.freePick.subtitle":
    "Any other song I want to hear at Tokyo Dome",
  "live.tokyoDome2027.shareText":
    "I made my ＝LOVE in TOKYO DOME Wishlist My Pick!\n(Please attach the image you downloaded.)",

  "live.joy4th2026.title": "4th Anniversary Afterglow My Pick",
  "live.joy4th2026.subtitle":
    "Keep the afterglow of ≒JOY 4th ANNIVERSARY PREMIUM CONCERT in six memories.",
  "live.joy4th2026.description":
    "Revisit the 日本武道館 concert through six picks: the unforgettable song, the song that raised the roof, the song that brought tears, the song where your oshi shone, the song that stayed with you, and a FREE PICK. Choose from the verified day show, night show, or both.",
  "live.joy4th2026.slot.dreamOpening.label": "The unforgettable song",
  "live.joy4th2026.slot.dreamOpening.subtitle":
    "The 4th-anniversary song that stayed with you most",
  "live.joy4th2026.slot.journey.label": "The song that raised the roof",
  "live.joy4th2026.slot.journey.subtitle":
    "The song that set the calls, staging, and whole venue alight",
  "live.joy4th2026.slot.venueEnergy.label": "The song that brought tears",
  "live.joy4th2026.slot.venueEnergy.subtitle":
    "The song that made the tears come at 日本武道館",
  "live.joy4th2026.slot.oshiSpotlight.label": "The song where my oshi shone",
  "live.joy4th2026.slot.oshiSpotlight.subtitle":
    "The song that captured an oshi moment you never want to forget",
  "live.joy4th2026.slot.gratitude.label": "The song that stayed with me",
  "live.joy4th2026.slot.gratitude.subtitle":
    "The song that kept playing in your heart after the show",
  "live.joy4th2026.slot.nextChapter.label": "FREE PICK",
  "live.joy4th2026.slot.nextChapter.subtitle":
    "One more song from the 4th-anniversary setlists, freely chosen",
  "live.joy4th2026.shareText":
    "I made my ≒JOY 4th ANNIVERSARY PREMIUM CONCERT Afterglow My Pick!\n(Please attach the image you downloaded.)",

  "live.notEqualMe7th2026.title": "7th Anniversary Afterglow My Pick",
  "live.notEqualMe7th2026.subtitle":
    "Keep the afterglow of ≠ME 7th ANNIVERSARY PREMIUM CONCERT in six memories.",
  "live.notEqualMe7th2026.description":
    "Revisit the Ｋアリーナ横浜 concert through six picks: the unforgettable song, the song that raised the roof, the song that brought tears, the song where your oshi shone, the song that stayed with you, and a FREE PICK. Choose from the verified day show, night show, or both.",
  "live.notEqualMe7th2026.slot.dreamOpening.label": "The unforgettable song",
  "live.notEqualMe7th2026.slot.dreamOpening.subtitle":
    "The 7th-anniversary song that stayed with you most",
  "live.notEqualMe7th2026.slot.journey.label": "The song that raised the roof",
  "live.notEqualMe7th2026.slot.journey.subtitle":
    "The song that set the calls, staging, and whole venue alight",
  "live.notEqualMe7th2026.slot.venueEnergy.label":
    "The song that brought tears",
  "live.notEqualMe7th2026.slot.venueEnergy.subtitle":
    "The song that made the tears come at Ｋアリーナ横浜",
  "live.notEqualMe7th2026.slot.oshiSpotlight.label":
    "The song where my oshi shone",
  "live.notEqualMe7th2026.slot.oshiSpotlight.subtitle":
    "The song that captured an oshi moment you never want to forget",
  "live.notEqualMe7th2026.slot.gratitude.label": "The song that stayed with me",
  "live.notEqualMe7th2026.slot.gratitude.subtitle":
    "The song that kept playing in your heart after the show",
  "live.notEqualMe7th2026.slot.nextChapter.label": "FREE PICK",
  "live.notEqualMe7th2026.slot.nextChapter.subtitle":
    "One more song from the 7th-anniversary setlists, freely chosen",
  "live.notEqualMe7th2026.shareText":
    "I made my ≠ME 7th ANNIVERSARY PREMIUM CONCERT Afterglow My Pick!\n(Please attach the image you downloaded.)",
} as const;

export type PresentationMessageKey = keyof typeof enPresentation;
type PresentationCatalog = Readonly<Record<PresentationMessageKey, string>>;

const zhCnPresentation = {
  "project.equalLove.subtitle": "选出你最喜欢的＝LOVE歌曲吧！",
  "project.equalLove.description":
    "选择你最喜欢的＝LOVE歌曲，生成并分享专属 Pick 图片的粉丝工具。",
  "project.equalLove.shareText":
    "我制作了＝LOVE心选歌曲 My Pick！\n（请附上已下载的图片）",

  "project.nearlyEqualJoy.subtitle": "选出你最喜欢的≒JOY歌曲吧！",
  "project.nearlyEqualJoy.description":
    "选择你最喜欢的≒JOY歌曲，生成并分享专属 Pick 图片的粉丝工具。",
  "project.nearlyEqualJoy.shareText":
    "我制作了≒JOY心选歌曲 My Pick！\n（请附上已下载的图片）",

  "project.notEqualMe.subtitle": "选出你最喜欢的≠ME歌曲吧！",
  "project.notEqualMe.description":
    "选择你最喜欢的≠ME歌曲，生成并分享专属 Pick 图片的粉丝工具。",
  "project.notEqualMe.shareText":
    "我制作了≠ME心选歌曲 My Pick！\n（请附上已下载的图片）",

  "live.kokuritsu2026.title": "国立余韵 My Pick",
  "live.kokuritsu2026.subtitle": "用六段回忆珍藏＝LOVE STADIUM LIVE的余韵。",
  "live.kokuritsu2026.description":
    "通过最难忘、全场沸腾、让人落泪、我推最闪耀、归途重听和FREE PICK六个选择，回顾在国立競技場举行的＝LOVE STADIUM LIVE。",
  "live.kokuritsu2026.slot.unforgettable.label": "最难忘的歌",
  "live.kokuritsu2026.slot.unforgettable.subtitle":
    "在国立最让你念念不忘的一首歌",
  "live.kokuritsu2026.slot.heatedUp.label": "让全场沸腾的歌",
  "live.kokuritsu2026.slot.heatedUp.subtitle":
    "让应援、舞台演出与现场气氛一同升温的一首歌",
  "live.kokuritsu2026.slot.tears.label": "让我落泪的歌",
  "live.kokuritsu2026.slot.tears.subtitle": "让眼泪不由自主落下的一首歌",
  "live.kokuritsu2026.slot.oshiShined.label": "我推最闪耀的歌",
  "live.kokuritsu2026.slot.oshiShined.subtitle":
    "想永远记住我推闪耀瞬间的一首歌",
  "live.kokuritsu2026.slot.wayHome.label": "归途重听的歌",
  "live.kokuritsu2026.slot.wayHome.subtitle":
    "演出结束后忍不住再次播放的一首歌",
  "live.kokuritsu2026.slot.freePick.label": "FREE PICK",
  "live.kokuritsu2026.slot.freePick.subtitle":
    "从国立演唱过的歌曲中，再自由选择一首",
  "live.kokuritsu2026.shareText":
    "我制作了＝LOVE STADIUM LIVE 国立余韵 My Pick！\n（请附上已下载的图片）",
  "live.kokuritsu2026.hint":
    "“归途重听的歌”可从全部歌曲中选择；FREE PICK仅可选择国立演唱过的歌曲。",
  "live.kokuritsu2026.badge.wayHomeOnly": "仅限归途槽位",

  "live.tokyoDome2027.title": "TOKYO DOME心愿 My Pick",
  "live.tokyoDome2027.subtitle":
    "选择你希望在＝LOVE in TOKYO DOME实现的六个瞬间。",
  "live.tokyoDome2027.description":
    "从开场、全场沸腾、落泪、我推的高光、收尾和FREE PICK六个心愿中，选出你想在东京巨蛋听到的＝LOVE歌曲。",
  "live.tokyoDome2027.slot.opening.label": "开场想听的歌",
  "live.tokyoDome2027.slot.opening.subtitle":
    "想让它成为东京巨蛋响起的第一个音符",
  "live.tokyoDome2027.slot.hype.label": "想让全场沸腾的歌",
  "live.tokyoDome2027.slot.hype.subtitle": "想和整个巨蛋一起热烈应援的一首歌",
  "live.tokyoDome2027.slot.cry.label": "想在东京巨蛋听哭的歌",
  "live.tokyoDome2027.slot.cry.subtitle":
    "如果能在这里听到，仿佛会忍不住落泪的一首歌",
  "live.tokyoDome2027.slot.oshi.label": "想看我推闪耀的歌",
  "live.tokyoDome2027.slot.oshi.subtitle": "想看我推在东京巨蛋演绎的一首歌",
  "live.tokyoDome2027.slot.finale.label": "最后想听的歌",
  "live.tokyoDome2027.slot.finale.subtitle":
    "想把整场演出的余韵托付给它的一首歌",
  "live.tokyoDome2027.slot.freePick.label": "FREE PICK",
  "live.tokyoDome2027.slot.freePick.subtitle":
    "自由选择一首想在东京巨蛋听到的歌",
  "live.tokyoDome2027.shareText":
    "我制作了＝LOVE in TOKYO DOME心愿 My Pick！\n（请附上已下载的图片）",

  "live.joy4th2026.title": "四周年余韵 My Pick",
  "live.joy4th2026.subtitle":
    "用六段记忆，留下≒JOY 4th ANNIVERSARY PREMIUM CONCERT的余韵。",
  "live.joy4th2026.description":
    "从最难忘、最沸腾、最催泪、我推最闪耀、余韵最深与FREE PICK六个角度，回顾日本武道館的四周年公演。可按已确认的午场、夜场或两场歌单选择。",
  "live.joy4th2026.slot.dreamOpening.label": "最难忘的歌",
  "live.joy4th2026.slot.dreamOpening.subtitle":
    "四周年公演中最留在心里的一首歌",
  "live.joy4th2026.slot.journey.label": "现场最沸腾的歌",
  "live.joy4th2026.slot.journey.subtitle":
    "连应援、舞台与全场气氛都一起点燃的一首歌",
  "live.joy4th2026.slot.venueEnergy.label": "让我落泪的歌",
  "live.joy4th2026.slot.venueEnergy.subtitle":
    "在日本武道館让眼泪不由自主落下的一首歌",
  "live.joy4th2026.slot.oshiSpotlight.label": "我推闪耀的歌",
  "live.joy4th2026.slot.oshiSpotlight.subtitle":
    "想一直记住四周年公演中我推的这一瞬间",
  "live.joy4th2026.slot.gratitude.label": "余韵最深的歌",
  "live.joy4th2026.slot.gratitude.subtitle": "散场后仍在心里不断响起的一首歌",
  "live.joy4th2026.slot.nextChapter.label": "FREE PICK",
  "live.joy4th2026.slot.nextChapter.subtitle":
    "从四周年公演曲目中再自由选择一首",
  "live.joy4th2026.shareText":
    "我制作了≒JOY 4th ANNIVERSARY PREMIUM CONCERT四周年余韵 My Pick！\n（请附上已下载的图片）",

  "live.notEqualMe7th2026.title": "七周年余韵 My Pick",
  "live.notEqualMe7th2026.subtitle":
    "用六段记忆，留下≠ME 7th ANNIVERSARY PREMIUM CONCERT的余韵。",
  "live.notEqualMe7th2026.description":
    "从最难忘、最沸腾、最催泪、我推最闪耀、余韵最深与FREE PICK六个角度，回顾Ｋアリーナ横浜的七周年公演。可按已确认的午场、夜场或两场歌单选择。",
  "live.notEqualMe7th2026.slot.dreamOpening.label": "最难忘的歌",
  "live.notEqualMe7th2026.slot.dreamOpening.subtitle":
    "七周年公演中最留在心里的一首歌",
  "live.notEqualMe7th2026.slot.journey.label": "现场最沸腾的歌",
  "live.notEqualMe7th2026.slot.journey.subtitle":
    "连应援、舞台与全场气氛都一起点燃的一首歌",
  "live.notEqualMe7th2026.slot.venueEnergy.label": "让我落泪的歌",
  "live.notEqualMe7th2026.slot.venueEnergy.subtitle":
    "在Ｋアリーナ横浜让眼泪不由自主落下的一首歌",
  "live.notEqualMe7th2026.slot.oshiSpotlight.label": "我推闪耀的歌",
  "live.notEqualMe7th2026.slot.oshiSpotlight.subtitle":
    "想一直记住七周年公演中我推的这一瞬间",
  "live.notEqualMe7th2026.slot.gratitude.label": "余韵最深的歌",
  "live.notEqualMe7th2026.slot.gratitude.subtitle":
    "散场后仍在心里不断响起的一首歌",
  "live.notEqualMe7th2026.slot.nextChapter.label": "FREE PICK",
  "live.notEqualMe7th2026.slot.nextChapter.subtitle":
    "从七周年公演曲目中再自由选择一首",
  "live.notEqualMe7th2026.shareText":
    "我制作了≠ME 7th ANNIVERSARY PREMIUM CONCERT七周年余韵 My Pick！\n（请附上已下载的图片）",
} as const satisfies PresentationCatalog;

const koPresentation = {
  "project.equalLove.subtitle": "좋아하는 ＝LOVE 곡을 골라 보세요!",
  "project.equalLove.description":
    "좋아하는 ＝LOVE 곡을 골라 나만의 Pick 이미지를 만들고 공유할 수 있는 팬 도구입니다.",
  "project.equalLove.shareText":
    "＝LOVE 최애곡 My Pick을 만들었습니다!\n(다운로드한 이미지를 첨부해 주세요.)",

  "project.nearlyEqualJoy.subtitle": "좋아하는 ≒JOY 곡을 골라 보세요!",
  "project.nearlyEqualJoy.description":
    "좋아하는 ≒JOY 곡을 골라 나만의 Pick 이미지를 만들고 공유할 수 있는 팬 도구입니다.",
  "project.nearlyEqualJoy.shareText":
    "≒JOY 최애곡 My Pick을 만들었습니다!\n(다운로드한 이미지를 첨부해 주세요.)",

  "project.notEqualMe.subtitle": "좋아하는 ≠ME 곡을 골라 보세요!",
  "project.notEqualMe.description":
    "좋아하는 ≠ME 곡을 골라 나만의 Pick 이미지를 만들고 공유할 수 있는 팬 도구입니다.",
  "project.notEqualMe.shareText":
    "≠ME 최애곡 My Pick을 만들었습니다!\n(다운로드한 이미지를 첨부해 주세요.)",

  "live.kokuritsu2026.title": "국립경기장의 여운 My Pick",
  "live.kokuritsu2026.subtitle":
    "＝LOVE STADIUM LIVE의 여운을 여섯 가지 기억으로 남겨 보세요.",
  "live.kokuritsu2026.description":
    "国立競技場에서 열린 ＝LOVE STADIUM LIVE를 잊을 수 없는 곡, 가장 뜨거웠던 곡, 눈물 난 곡, 최애가 빛났던 곡, 돌아가는 길에 들은 곡, FREE PICK의 여섯 가지로 돌아보는 My Pick입니다.",
  "live.kokuritsu2026.slot.unforgettable.label": "잊을 수 없는 곡",
  "live.kokuritsu2026.slot.unforgettable.subtitle":
    "국립경기장에서 가장 마음에 남은 한 곡",
  "live.kokuritsu2026.slot.heatedUp.label": "현장에서 가장 뜨거웠던 곡",
  "live.kokuritsu2026.slot.heatedUp.subtitle":
    "콜과 연출, 현장의 공기까지 뜨겁게 만든 한 곡",
  "live.kokuritsu2026.slot.tears.label": "눈물 난 곡",
  "live.kokuritsu2026.slot.tears.subtitle": "나도 모르게 눈물이 흐른 한 곡",
  "live.kokuritsu2026.slot.oshiShined.label": "최애가 빛났던 곡",
  "live.kokuritsu2026.slot.oshiShined.subtitle":
    "이 순간의 최애를 오래 기억하고 싶은 한 곡",
  "live.kokuritsu2026.slot.wayHome.label": "돌아가는 길에 들은 곡",
  "live.kokuritsu2026.slot.wayHome.subtitle":
    "공연이 끝난 뒤 다시 찾아 들은 한 곡",
  "live.kokuritsu2026.slot.freePick.label": "FREE PICK",
  "live.kokuritsu2026.slot.freePick.subtitle":
    "국립경기장 무대에서 선보인 곡 중 한 곡을 더 고른다면",
  "live.kokuritsu2026.shareText":
    "＝LOVE STADIUM LIVE 국립경기장의 여운 My Pick을 만들었습니다!\n(다운로드한 이미지를 첨부해 주세요.)",
  "live.kokuritsu2026.hint":
    "‘돌아가는 길에 들은 곡’은 전체 곡에서, FREE PICK은 국립경기장 공연에서 선보인 곡에서 선택할 수 있습니다.",
  "live.kokuritsu2026.badge.wayHomeOnly": "돌아가는 길 슬롯 전용",

  "live.tokyoDome2027.title": "TOKYO DOME에서 듣고 싶은 My Pick",
  "live.tokyoDome2027.subtitle":
    "＝LOVE in TOKYO DOME에서 이루어졌으면 하는 여섯 순간을 골라 보세요.",
  "live.tokyoDome2027.description":
    "TOKYO DOME에서 듣고 싶은 ＝LOVE 곡을 오프닝, 뜨거운 순간, 눈물, 최애의 빛나는 순간, 피날레, FREE PICK의 여섯 테마로 고르는 My Pick입니다.",
  "live.tokyoDome2027.slot.opening.label": "오프닝으로 듣고 싶은 곡",
  "live.tokyoDome2027.slot.opening.subtitle":
    "TOKYO DOME의 첫 음으로 듣고 싶은 곡",
  "live.tokyoDome2027.slot.hype.label": "현장에서 함께 달아오르고 싶은 곡",
  "live.tokyoDome2027.slot.hype.subtitle":
    "돔 전체가 함께 뜨거워졌으면 하는 곡",
  "live.tokyoDome2027.slot.cry.label": "TOKYO DOME에서 울고 싶은 곡",
  "live.tokyoDome2027.slot.cry.subtitle":
    "그곳에서 들으면 눈물이 날 것 같은 곡",
  "live.tokyoDome2027.slot.oshi.label": "최애가 빛나는 모습을 보고 싶은 곡",
  "live.tokyoDome2027.slot.oshi.subtitle":
    "최애가 TOKYO DOME에서 선보였으면 하는 곡",
  "live.tokyoDome2027.slot.finale.label": "마지막에 듣고 싶은 곡",
  "live.tokyoDome2027.slot.finale.subtitle": "공연의 마지막 여운을 남겨 줄 곡",
  "live.tokyoDome2027.slot.freePick.label": "FREE PICK",
  "live.tokyoDome2027.slot.freePick.subtitle":
    "TOKYO DOME에서 꼭 듣고 싶은 또 한 곡",
  "live.tokyoDome2027.shareText":
    "＝LOVE in TOKYO DOME에서 듣고 싶은 My Pick을 만들었습니다!\n(다운로드한 이미지를 첨부해 주세요.)",

  "live.joy4th2026.title": "4주년의 여운 My Pick",
  "live.joy4th2026.subtitle":
    "≒JOY 4th ANNIVERSARY PREMIUM CONCERT의 여운을 여섯 가지 기억으로 남겨 보세요.",
  "live.joy4th2026.description":
    "日本武道館에서 열린 4주년 공연을 잊을 수 없는 곡, 가장 뜨거웠던 곡, 눈물 난 곡, 최애가 빛났던 곡, 여운에 남은 곡, FREE PICK의 여섯 가지로 돌아봅니다. 확인된 낮 공연, 밤 공연 또는 두 공연의 세트리스트에서 선택할 수 있습니다.",
  "live.joy4th2026.slot.dreamOpening.label": "잊을 수 없는 곡",
  "live.joy4th2026.slot.dreamOpening.subtitle":
    "4주년 공연에서 가장 마음에 남은 한 곡",
  "live.joy4th2026.slot.journey.label": "현장에서 가장 뜨거웠던 곡",
  "live.joy4th2026.slot.journey.subtitle":
    "콜과 연출, 현장의 공기까지 뜨겁게 만든 한 곡",
  "live.joy4th2026.slot.venueEnergy.label": "눈물 난 곡",
  "live.joy4th2026.slot.venueEnergy.subtitle":
    "日本武道館에서 나도 모르게 눈물이 흐른 한 곡",
  "live.joy4th2026.slot.oshiSpotlight.label": "최애가 빛났던 곡",
  "live.joy4th2026.slot.oshiSpotlight.subtitle":
    "4주년 공연의 최애를 오래 기억하고 싶은 한 곡",
  "live.joy4th2026.slot.gratitude.label": "여운에 남은 곡",
  "live.joy4th2026.slot.gratitude.subtitle":
    "공연이 끝난 뒤에도 마음속에서 계속 울린 한 곡",
  "live.joy4th2026.slot.nextChapter.label": "FREE PICK",
  "live.joy4th2026.slot.nextChapter.subtitle":
    "4주년 공연에서 선보인 곡 중 한 곡을 더 고른다면",
  "live.joy4th2026.shareText":
    "≒JOY 4th ANNIVERSARY PREMIUM CONCERT 4주년의 여운 My Pick을 만들었습니다!\n(다운로드한 이미지를 첨부해 주세요.)",

  "live.notEqualMe7th2026.title": "7주년의 여운 My Pick",
  "live.notEqualMe7th2026.subtitle":
    "≠ME 7th ANNIVERSARY PREMIUM CONCERT의 여운을 여섯 가지 기억으로 남겨 보세요.",
  "live.notEqualMe7th2026.description":
    "Ｋアリーナ横浜에서 열린 7주년 공연을 잊을 수 없는 곡, 가장 뜨거웠던 곡, 눈물 난 곡, 최애가 빛났던 곡, 여운에 남은 곡, FREE PICK의 여섯 가지로 돌아봅니다. 확인된 낮 공연, 밤 공연 또는 두 공연의 세트리스트에서 선택할 수 있습니다.",
  "live.notEqualMe7th2026.slot.dreamOpening.label": "잊을 수 없는 곡",
  "live.notEqualMe7th2026.slot.dreamOpening.subtitle":
    "7주년 공연에서 가장 마음에 남은 한 곡",
  "live.notEqualMe7th2026.slot.journey.label": "현장에서 가장 뜨거웠던 곡",
  "live.notEqualMe7th2026.slot.journey.subtitle":
    "콜과 연출, 현장의 공기까지 뜨겁게 만든 한 곡",
  "live.notEqualMe7th2026.slot.venueEnergy.label": "눈물 난 곡",
  "live.notEqualMe7th2026.slot.venueEnergy.subtitle":
    "Ｋアリーナ横浜에서 나도 모르게 눈물이 흐른 한 곡",
  "live.notEqualMe7th2026.slot.oshiSpotlight.label": "최애가 빛났던 곡",
  "live.notEqualMe7th2026.slot.oshiSpotlight.subtitle":
    "7주년 공연의 최애를 오래 기억하고 싶은 한 곡",
  "live.notEqualMe7th2026.slot.gratitude.label": "여운에 남은 곡",
  "live.notEqualMe7th2026.slot.gratitude.subtitle":
    "공연이 끝난 뒤에도 마음속에서 계속 울린 한 곡",
  "live.notEqualMe7th2026.slot.nextChapter.label": "FREE PICK",
  "live.notEqualMe7th2026.slot.nextChapter.subtitle":
    "7주년 공연에서 선보인 곡 중 한 곡을 더 고른다면",
  "live.notEqualMe7th2026.shareText":
    "≠ME 7th ANNIVERSARY PREMIUM CONCERT 7주년의 여운 My Pick을 만들었습니다!\n(다운로드한 이미지를 첨부해 주세요.)",
} as const satisfies PresentationCatalog;

const jaPresentation = {
  "live.kokuritsu2026.hint":
    "「帰り道に聴いた曲」は全楽曲から選べます。FREE PICKは国立で披露された楽曲から選べます。",
  "live.kokuritsu2026.badge.wayHomeOnly": "帰り道枠のみ",
} as const satisfies Partial<PresentationCatalog>;

type JapanesePresentationOverrideKey = keyof typeof jaPresentation;

export const presentationMessages = {
  en: enPresentation,
  "zh-CN": zhCnPresentation,
  ko: koPresentation,
  ja: jaPresentation,
} as const;

interface ProjectMessageKeys {
  subtitle: PresentationMessageKey;
  description: PresentationMessageKey;
  shareText: PresentationMessageKey;
}

interface LiveExperienceMessageKeys {
  title: PresentationMessageKey;
  subtitle: PresentationMessageKey;
  description: PresentationMessageKey;
  slots: Readonly<
    Record<
      string,
      Readonly<{
        label: PresentationMessageKey;
        subtitle: PresentationMessageKey;
      }>
    >
  >;
  contexts?: Readonly<Record<string, MessageKey>>;
  shareText: PresentationMessageKey;
  hint?: JapanesePresentationOverrideKey;
  catalogOnlyBadge?: JapanesePresentationOverrideKey;
}

export interface ExperienceUiCopy {
  title: string;
  subtitle: string;
  description: string;
  eventName?: string;
  venue?: string;
  slots: ExperiencePickSlot[];
  contextLabels?: Readonly<Record<string, string>>;
  shareText: string;
  hint?: string;
  catalogOnlyBadge?: string;
}

export const PROJECT_PRESENTATION_KEYS: Record<ProjectId, ProjectMessageKeys> =
  {
    "equal-love": {
      subtitle: "project.equalLove.subtitle",
      description: "project.equalLove.description",
      shareText: "project.equalLove.shareText",
    },
    "nearly-equal-joy": {
      subtitle: "project.nearlyEqualJoy.subtitle",
      description: "project.nearlyEqualJoy.description",
      shareText: "project.nearlyEqualJoy.shareText",
    },
    "not-equal-me": {
      subtitle: "project.notEqualMe.subtitle",
      description: "project.notEqualMe.description",
      shareText: "project.notEqualMe.shareText",
    },
  };

export const LIVE_EXPERIENCE_PRESENTATION_KEYS: Readonly<
  Record<string, LiveExperienceMessageKeys>
> = {
  kokuritsu_2026: {
    title: "live.kokuritsu2026.title",
    subtitle: "live.kokuritsu2026.subtitle",
    description: "live.kokuritsu2026.description",
    slots: {
      unforgettable: {
        label: "live.kokuritsu2026.slot.unforgettable.label",
        subtitle: "live.kokuritsu2026.slot.unforgettable.subtitle",
      },
      "heated-up": {
        label: "live.kokuritsu2026.slot.heatedUp.label",
        subtitle: "live.kokuritsu2026.slot.heatedUp.subtitle",
      },
      tears: {
        label: "live.kokuritsu2026.slot.tears.label",
        subtitle: "live.kokuritsu2026.slot.tears.subtitle",
      },
      "oshi-shined": {
        label: "live.kokuritsu2026.slot.oshiShined.label",
        subtitle: "live.kokuritsu2026.slot.oshiShined.subtitle",
      },
      "way-home": {
        label: "live.kokuritsu2026.slot.wayHome.label",
        subtitle: "live.kokuritsu2026.slot.wayHome.subtitle",
      },
      "free-pick": {
        label: "live.kokuritsu2026.slot.freePick.label",
        subtitle: "live.kokuritsu2026.slot.freePick.subtitle",
      },
    },
    contexts: {
      day1: "context.day1",
      day2: "context.day2",
      both: "context.both",
    },
    shareText: "live.kokuritsu2026.shareText",
    hint: "live.kokuritsu2026.hint",
    catalogOnlyBadge: "live.kokuritsu2026.badge.wayHomeOnly",
  },
  tokyo_dome_2027: {
    title: "live.tokyoDome2027.title",
    subtitle: "live.tokyoDome2027.subtitle",
    description: "live.tokyoDome2027.description",
    slots: {
      opening: {
        label: "live.tokyoDome2027.slot.opening.label",
        subtitle: "live.tokyoDome2027.slot.opening.subtitle",
      },
      hype: {
        label: "live.tokyoDome2027.slot.hype.label",
        subtitle: "live.tokyoDome2027.slot.hype.subtitle",
      },
      cry: {
        label: "live.tokyoDome2027.slot.cry.label",
        subtitle: "live.tokyoDome2027.slot.cry.subtitle",
      },
      oshi: {
        label: "live.tokyoDome2027.slot.oshi.label",
        subtitle: "live.tokyoDome2027.slot.oshi.subtitle",
      },
      finale: {
        label: "live.tokyoDome2027.slot.finale.label",
        subtitle: "live.tokyoDome2027.slot.finale.subtitle",
      },
      "free-pick": {
        label: "live.tokyoDome2027.slot.freePick.label",
        subtitle: "live.tokyoDome2027.slot.freePick.subtitle",
      },
    },
    shareText: "live.tokyoDome2027.shareText",
  },
  joy_4th_anniversary_2026_afterglow: {
    title: "live.joy4th2026.title",
    subtitle: "live.joy4th2026.subtitle",
    description: "live.joy4th2026.description",
    slots: {
      "dream-opening": {
        label: "live.joy4th2026.slot.dreamOpening.label",
        subtitle: "live.joy4th2026.slot.dreamOpening.subtitle",
      },
      journey: {
        label: "live.joy4th2026.slot.journey.label",
        subtitle: "live.joy4th2026.slot.journey.subtitle",
      },
      "venue-energy": {
        label: "live.joy4th2026.slot.venueEnergy.label",
        subtitle: "live.joy4th2026.slot.venueEnergy.subtitle",
      },
      "oshi-spotlight": {
        label: "live.joy4th2026.slot.oshiSpotlight.label",
        subtitle: "live.joy4th2026.slot.oshiSpotlight.subtitle",
      },
      gratitude: {
        label: "live.joy4th2026.slot.gratitude.label",
        subtitle: "live.joy4th2026.slot.gratitude.subtitle",
      },
      "next-chapter": {
        label: "live.joy4th2026.slot.nextChapter.label",
        subtitle: "live.joy4th2026.slot.nextChapter.subtitle",
      },
    },
    contexts: {
      day: "context.dayShow",
      night: "context.nightShow",
      both: "context.bothShows",
    },
    shareText: "live.joy4th2026.shareText",
  },
  not_equal_me_7th_anniversary_2026_afterglow: {
    title: "live.notEqualMe7th2026.title",
    subtitle: "live.notEqualMe7th2026.subtitle",
    description: "live.notEqualMe7th2026.description",
    slots: {
      "dream-opening": {
        label: "live.notEqualMe7th2026.slot.dreamOpening.label",
        subtitle: "live.notEqualMe7th2026.slot.dreamOpening.subtitle",
      },
      journey: {
        label: "live.notEqualMe7th2026.slot.journey.label",
        subtitle: "live.notEqualMe7th2026.slot.journey.subtitle",
      },
      "venue-energy": {
        label: "live.notEqualMe7th2026.slot.venueEnergy.label",
        subtitle: "live.notEqualMe7th2026.slot.venueEnergy.subtitle",
      },
      "oshi-spotlight": {
        label: "live.notEqualMe7th2026.slot.oshiSpotlight.label",
        subtitle: "live.notEqualMe7th2026.slot.oshiSpotlight.subtitle",
      },
      gratitude: {
        label: "live.notEqualMe7th2026.slot.gratitude.label",
        subtitle: "live.notEqualMe7th2026.slot.gratitude.subtitle",
      },
      "next-chapter": {
        label: "live.notEqualMe7th2026.slot.nextChapter.label",
        subtitle: "live.notEqualMe7th2026.slot.nextChapter.subtitle",
      },
    },
    contexts: {
      day: "context.dayShow",
      night: "context.nightShow",
      both: "context.bothShows",
    },
    shareText: "live.notEqualMe7th2026.shareText",
  },
};

export function getPresentationMessage(
  locale: Exclude<AppLocale, "ja">,
  key: PresentationMessageKey,
): string;
export function getPresentationMessage(
  locale: "ja",
  key: JapanesePresentationOverrideKey,
): string;
export function getPresentationMessage(
  locale: AppLocale,
  key: PresentationMessageKey,
) {
  if (locale === "ja") {
    const message = (jaPresentation as Partial<PresentationCatalog>)[key];
    if (message === undefined) {
      throw new Error(
        `[i18n] Missing Japanese presentation override for "${key}".`,
      );
    }
    return message;
  }

  return presentationMessages[locale][key];
}

export function localizeProjectPresentation(
  project: ProjectConfig,
  locale: AppLocale,
) {
  if (locale === "ja") {
    return {
      subtitle: project.subtitle,
      description: project.description,
      shareText: project.shareText,
    } as const;
  }

  const keys = PROJECT_PRESENTATION_KEYS[project.id];
  return {
    subtitle: getPresentationMessage(locale, keys.subtitle),
    description: getPresentationMessage(locale, keys.description),
    shareText: getPresentationMessage(locale, keys.shareText),
  } as const;
}

export function localizeLiveExperiencePresentation(
  experience: PickExperience,
  locale: AppLocale,
  translateCommon: (key: MessageKey) => string,
): ExperienceUiCopy {
  const keys = LIVE_EXPERIENCE_PRESENTATION_KEYS[experience.id];
  if (!keys) {
    throw new Error(
      `[i18n] Missing presentation mapping for live experience "${experience.id}".`,
    );
  }

  validateLiveExperienceIdentityClosure(experience, keys);

  const contextLabels = keys.contexts
    ? localizeContextLabels(keys.contexts, translateCommon)
    : undefined;

  if (locale === "ja") {
    return {
      title: experience.title,
      subtitle: experience.subtitle,
      description: experience.description,
      eventName: experience.eventName,
      venue: experience.venue,
      slots: experience.slots,
      contextLabels,
      shareText: experience.share.text,
      hint: keys.hint ? getPresentationMessage("ja", keys.hint) : undefined,
      catalogOnlyBadge: keys.catalogOnlyBadge
        ? getPresentationMessage("ja", keys.catalogOnlyBadge)
        : undefined,
    };
  }

  return {
    title: getPresentationMessage(locale, keys.title),
    subtitle: getPresentationMessage(locale, keys.subtitle),
    description: getPresentationMessage(locale, keys.description),
    eventName: experience.eventName,
    venue: experience.venue,
    slots: experience.slots.map((slot) => localizeSlot(slot, keys, locale)),
    contextLabels,
    shareText: getPresentationMessage(locale, keys.shareText),
    hint: keys.hint ? getPresentationMessage(locale, keys.hint) : undefined,
    catalogOnlyBadge: keys.catalogOnlyBadge
      ? getPresentationMessage(locale, keys.catalogOnlyBadge)
      : undefined,
  };
}

function validateLiveExperienceIdentityClosure(
  experience: PickExperience,
  keys: LiveExperienceMessageKeys,
) {
  assertExactIdentitySet(
    experience.id,
    "slot",
    Object.keys(keys.slots),
    experience.slots.map((slot) => slot.id),
  );

  const expectedContextIds = Object.keys(keys.contexts ?? {});
  const performanceContextIds = (experience.performances ?? []).map(
    (performance) => performance.id,
  );
  const actualContextIds = [...performanceContextIds];

  if (
    experience.includeCombinedPerformance &&
    performanceContextIds.length > 1
  ) {
    const performanceContextSet = new Set(performanceContextIds);
    const combinedContextCandidates = expectedContextIds.filter(
      (contextId) => !performanceContextSet.has(contextId),
    );
    if (combinedContextCandidates.length === 1) {
      actualContextIds.push(combinedContextCandidates[0]);
    }
  }

  assertExactIdentitySet(
    experience.id,
    "context",
    expectedContextIds,
    actualContextIds,
  );
}

function assertExactIdentitySet(
  experienceId: string,
  identityKind: "slot" | "context",
  expectedIds: readonly string[],
  actualIds: readonly string[],
) {
  const expectedSet = new Set(expectedIds);
  const actualSet = new Set(actualIds);
  const missing = expectedIds.filter((id) => !actualSet.has(id));
  const unexpected = actualIds.filter((id) => !expectedSet.has(id));
  const duplicates = actualIds.filter(
    (id, index) => actualIds.indexOf(id) !== index,
  );

  if (missing.length || unexpected.length || duplicates.length) {
    throw new Error(
      `[i18n] ${identityKind} identity closure mismatch for live experience "${experienceId}" (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}; duplicate: ${duplicates.join(", ") || "none"}).`,
    );
  }
}

function localizeContextLabels(
  contextKeys: Readonly<Record<string, MessageKey>>,
  translateCommon: (key: MessageKey) => string,
) {
  return Object.fromEntries(
    Object.entries(contextKeys).map(([id, key]) => [id, translateCommon(key)]),
  );
}

function localizeSlot(
  slot: ExperiencePickSlot,
  keys: LiveExperienceMessageKeys,
  locale: Exclude<AppLocale, "ja">,
) {
  const slotKeys = keys.slots[slot.id];
  if (!slotKeys) {
    throw new Error(
      `[i18n] Missing slot presentation mapping for "${slot.id}".`,
    );
  }

  return {
    ...slot,
    label: getPresentationMessage(locale, slotKeys.label),
    subtitle: getPresentationMessage(locale, slotKeys.subtitle),
  };
}
