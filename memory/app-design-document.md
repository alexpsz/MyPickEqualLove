# App Design Document

## 1. 应用概述

MyPick 是面向 ＝LOVE、≒JOY、≠ME 三姐妹项目粉丝的非官方静态 Web App。用户可以从当前站点对应的歌曲目录中选择最多 10 首喜爱歌曲，形成个人 Top 10 pick board，并生成适合社交平台分享的图片。

应用运行在浏览器端，没有后端账号系统、数据库或服务端 API。歌曲与成员数据来自 `src/projects/<project-id>/` 下的静态 JSON，经 `src/data/songs.ts` 派生为运行时集合；用户选择与导出选项保存在浏览器 `localStorage`。

应用现在支持配置驱动的 Live Pick 特别页。普通版根路径 `/` 继续是 Top 10；当前 `equal-love` 站点新增 `/live/kokuritsu-2026/` 国立余韵六格页和 `/live/tokyo-dome-2027/` 东京巨蛋愿望六格页。

本项目为非官方粉丝项目。组合名称、歌曲标题、图片和相关素材权利归原权利方所有。

## 2. 目标用户

目标用户是希望快速制作 ＝LOVE、≒JOY 或 ≠ME 喜爱歌曲分享图的粉丝。

用户应能在不登录、不配置账号、不理解项目技术细节的情况下完成选择、搜索、筛选、预览、下载和分享到 X。

## 3. 核心价值

应用的核心价值是把「从当前组合歌曲目录中选择 Top 10」压缩成一个轻量、可分享、可重复编辑的浏览器体验。

它提供完整歌曲目录、封面展示、快速筛选、本地保存和高质量图片导出，使用户可以在社交平台表达自己的歌曲偏好。

## 4. 当前功能范围

当前功能范围包括：

- 10 个默认 pick 槽位。
- 点击指定槽位选择或替换歌曲。
- 全局搜索歌曲并自动填入第一个空槽位。
- 槽位已满时通过替换弹窗选择要覆盖的槽位。
- 清空单个槽位。
- 清空全部选择前弹出确认。
- 浏览器本地保存用户选择。
- 本地保存导出选项。
- 输入导出昵称。
- 生成图片预览。
- 切换显示或隐藏歌曲标题。
- 切换透明背景。
- 下载导出图片。
- 分享文案到 X。
- 通过左上角 `Other Picks` 抽屉跳转到另外两个姐妹 MyPick 站点，并浏览其他作者维护的外部 MyPick 站点链接。
- 通过站内 Experience Navigation 在普通版 My Pick 与当前团体已发布的 Live Pick 特别页之间切换。
- ＝LOVE 国立余韵六格页：支持 `DAY 1 / DAY 2 / 2 DAYS`，前四格和第六格限制为对应 setlist，第五格允许全曲库。
- ＝LOVE 东京巨蛋愿望六格页：六格全部允许从全曲库选择，不区分 Day 1 / Day 2。

## 5. 用户流程

用户进入首页后看到品牌头部、控制区和 10 个 pick 槽位。

用户可以点击左上角菜单按钮打开 `Other Picks` 抽屉，访问另外两个姐妹 MyPick 站点；当前站点不会在姐妹站点区重复显示。姐妹站点区下方会以较轻量的样式列出其他作者维护的外部 MyPick 站点。

当前团体有 Live Pick 特别页时，用户可以在 Header 下方的站内导航切换普通版和特别页。该导航只负责同一团体域名内的模式切换。

用户可以点击任一空槽位打开歌曲选择弹窗，选择歌曲后该歌曲进入指定槽位。

用户也可以点击全局搜索按钮打开歌曲选择弹窗。全局搜索选择歌曲时，如果还有空槽位，应用会自动填入第一个空槽位。

当 10 个槽位都已填满时，用户通过全局搜索选择新歌曲后，应用关闭搜索弹窗并打开替换弹窗。用户选择一个现有槽位后，新歌曲覆盖该槽位。

用户可以点击已选卡片上的清空按钮移除单个选择。清空按钮会阻止事件冒泡，避免同时触发卡片选择弹窗。

用户可以点击 Clear Board 清空全部选择。清空前必须通过浏览器确认框确认。

用户至少选择一首歌后，可以点击 Generate Image 生成分享图并打开预览弹窗。

在国立余韵页中，用户可以选择 `DAY 1`、`DAY 2` 或 `2 DAYS`。三种 context 的 picks 分开保存；切换 context 不会删除其他 context 的选择。用户从前四格或第六格打开搜索时只看到当前 context 实际披露曲；从第五格或全局搜索可看到全曲库，但非 setlist 歌曲只能进入第五格。

## 6. 核心交互规则

默认槽位数量由 `DEFAULT_PICK_SLOTS` 控制，当前为 10 个。

普通版使用 `STANDARD_PICK_EXPERIENCE` 与 10 个 `catalog` 槽位。Live 特别页使用项目级 `live-experiences.json` 中的五个 `ExperiencePickSlot`。

指定槽位选择时，选中的歌曲写入当前 `activeSlotId`。

全局搜索选择时，应用优先寻找第一个空且允许该歌曲的槽位；没有合法空槽位时进入替换流程。

替换流程必须遵守当前 slot eligibility。不合法槽位不能通过点击或键盘完成替换。

用户选择只保存 `song.id`，运行时通过 `SONGS_BY_ID` 还原完整 `Song` 数据。

普通版继续使用旧 `localStorage` key。Live 页按 experience 和 context 隔离 picks；国立 `day1`、`day2`、`both` 各自保存，东京巨蛋使用单独 experience key。

图片生成期间使用 `generatingRef` 防止并发重复生成，并通过 `generating` 控制按钮禁用和预览更新状态。

页面 hydration 后才从 `localStorage` 读取历史选择和导出选项，避免服务端渲染阶段访问浏览器 API。

## 7. 导出图片体验

导出画布由隐藏的离屏 `ExportBoard` 提供，元素 id 来自项目化 `EXPORT_CANVAS_ID`，格式为 `mypick-<project-id>-export-canvas`。

普通版仍使用旧 `EXPORT_CANVAS_ID`。Live 页使用 experience 化 canvas id，格式为 `mypick-<project-id>-<experience-id>-export-canvas`。

导出尺寸、背景色和 scale 来自 `EXPORT_CONFIG`。当前导出宽度为 1080，背景默认为白色，scale 为 2。

用户可以输入昵称，昵称会在导出图中显示为 `Selected by ...`。昵称会 trim、合并空白并限制长度。

预览弹窗支持：

- 显示或隐藏歌曲标题。
- 启用或关闭透明背景。
- 下载图片。
- 打开 X 分享入口。

当预览已打开后，切换歌曲标题显示或透明背景会触发重新生成预览。

普通版导出图继续使用 2×5 Top 10 grid。Live 六格页使用纵向 memory list，必须显示 event title、context、槽位标题、歌曲封面、昵称和当前特别页路径。

下载逻辑优先尝试可用浏览器能力：普通浏览器走下载链接，部分移动或内嵌浏览器走 Web Share 或打开图片兜底。

## 8. 搜索与筛选体验

搜索弹窗支持输入搜索词，并在 Enter 时选择当前筛选结果的第一首歌曲。

当前搜索字段以 `SearchModal` 源码为准，包括：

- 歌曲标题的日文、罗马音、英文。
- artist 的日文、罗马音、英文。
- 作词者、作曲者、编曲者的日文与罗马音。
- 参与成员与 center 成员的日文、罗马音、英文名。

当前没有完整歌词正文搜索。

Live 页的搜索弹窗接收调用方传入的 eligible songs。具体槽位搜索只列出当前槽位可选歌曲；全局搜索列出任一槽位可合法接收的歌曲。国立页可显示 `DAY 1`、`DAY 2` 或「帰り道枠のみ」等轻量 badge，帮助用户理解候选范围。

筛选支持：

- 快捷 track type：All、Title Song、Coupling、Album Track，以及 Digital 快捷入口。
- 年份筛选。
- 成员筛选。
- 已毕业成员显示开关。只有当前项目存在毕业成员时才显示 `GRADUATED` 按钮。
- release type 筛选。

搜索弹窗的滚动结构必须按视口区分：移动端保持搜索输入、`Filters` 按钮、快捷 track type 筛选条、展开后的高级 Filters 面板和歌曲列表共用同一个纵向滚动容器，向下滑动歌单时这些筛选 UI 都会一起向上滑出视口；`sm` 及以上视口则让搜索输入、`Filters` 按钮和快捷筛选条在滚动容器顶部 sticky 保持可用，仅展开后的高级 Filters 面板与歌曲列表一起滚动隐藏。高级 Filters 面板不能再单独设置纵向 `max-height` 或 `overflow-y-auto`。

默认无搜索词且未打开已毕业成员显示时，只隐藏 tags 明确包含 `graduated_member`、`graduation_solo` 或 `graduation_unit` 的毕业企划曲；普通团曲即使 `memberIds` 包含毕业成员也继续显示。打开 `GRADUATED` 后会显示毕业成员筛选入口，并恢复毕业企划曲。当前 ≒JOY 因保留福山萌叶为毕业成员会显示该按钮，但她没有专属毕业曲，因此默认仍显示全部 28 首；≠ME 因菅波美玲毕业也会显示该按钮；没有毕业成员的项目会隐藏该按钮。

Live 页的 setlist 关系不写入歌曲 tags，因此不会污染普通版筛选。

## 9. 数据与内容规则

歌曲数据来自 `src/projects/<project-id>/songs.json`，成员数据来自 `src/projects/<project-id>/members.json`。

Live Pick 数据来自 `src/projects/<project-id>/live-experiences.json`。当前只有 `equal-love` 有真实 live experience；`nearly-equal-joy` 与 `not-equal-me` 为空数组。

`src/data/songs.ts` 对歌曲按 releaseDate 降序、标题罗马音升序排序，并派生运行时索引和筛选集合。

歌曲封面使用本地 `public/covers/<project-id>/` 下的静态资源，以保证静态导出和图片生成时可用。

成员数据支持单色 `color` 和多色 `colors`。页面顶部颜色条会按当前项目现役成员颜色生成渐变；导出图顶部色条按现役成员实际数量渲染，一人一个应援色胶囊。≒JOY 以 wiki/官方 X 公告的单色メンバーカラー为准，不保存ペンライト双色设定。

数据变更后必须运行 `npm run validate:data`，确保字段枚举、封面文件、成员引用和 credits 有效。`equal-love` 还会额外校验歌曲数量、成员数量和边界歌曲规则。

Live experience 变更后也必须运行 `npm run validate:data`。Published 严格 setlist 页面必须使用 verified performance，且 setlist 的每个 `songId` 必须存在于当前项目 `songs.json`。

≒JOY 数据保留福山萌叶为毕业成员，且只把她关联到《≒JOY》《笑って フラジール》《超孤独ライオン》。目前没有可确认的福山萌叶专属毕业曲。

歌曲目录按 MyPick 选择体验优先保留目标团参与曲和成员 solo 曲。≒JOY 因此收录江角怜音 solo 曲《The rock is you!》和イコノイジョイ合同曲《トリプルデート》；≠ME 因此收录《次に会えた時 何を話そうかな》和《トリプルデート》。

≠ME 数据保留菅波美玲为毕业成员，并把《君はもう一度タネになる》作为 special/youtube_public 毕业曲补充进歌曲目录。《ここでファーストキッス》已依据官方 12th 両A面シングル页面加入目录；当前作曲/编曲 credits 尚未确认，数据中以 `sourceStatus: "unverified"` 标记。

## 10. 非目标范围

当前不包含后端账号系统。

当前不包含云端同步。

当前不包含数据库。

当前不包含服务端 API。

当前不包含服务端图片生成。

当前不包含服务端动态渲染。

当前不包含需要登录后才能使用的个性化资料页。

当前不包含云端或账号级 Live Pick 同步。

## 11. 验收标准

用户可以在空白状态下选择任一槽位并成功填入歌曲。

用户可以通过全局搜索选择歌曲，并自动填入第一个空槽位。

当 10 个槽位已满时，通过全局搜索选择新歌曲会打开替换弹窗，选择槽位后完成替换。

用户可以清空单个槽位，且不会同时打开该槽位的选择弹窗。

用户点击清空全部时会看到确认框；取消时选择不变，确认时清空全部选择。

刷新页面后，已保存的 picks 和导出选项会从 `localStorage` 恢复。

搜索标题、罗马音、成员名或 credits 中存在的文本时，结果列表会响应变化。

筛选 release type、track type、year、member 与 graduated members 时，结果列表会响应变化。

至少选择一首歌曲后可以生成图片预览。

预览中切换显示标题或透明背景后，预览会重新生成。

下载图片按钮可产出图片文件或触发浏览器支持的保存兜底。

分享到 X 会打开对应分享入口，并使用配置中的分享文案、标签和站点 URL。

左上角 `Other Picks` 抽屉上方显示当前项目以外的两个姐妹站点，链接目标来自项目配置中的 `siteUrl`；下方通过低调分割线区分其他作者维护的外部 MyPick 站点，并可通过按钮、背景或 Escape 关闭。

站内 Experience Navigation 显示普通版和当前团体已发布的 live specials；它不得替代或混入 `Other Picks`。

国立页 `/live/kokuritsu-2026/` 可访问，显示五个日文记忆槽位，选歌后仍显示槽位语义。

国立页 `DAY 1 / DAY 2 / 2 DAYS` 可切换，三种 context 的 picks 分别保存并可恢复。

国立页前四格和第六格不能选入当前 context 未披露歌曲，第五格可以选择全曲库。全局搜索和替换弹窗都必须遵守该规则。

国立页导出图显示 event、context、六格标题、昵称和 `/live/kokuritsu-2026/` 页面路径；X 分享使用国立页面 URL 和专属 hashtag。

东京巨蛋页 `/live/tokyo-dome-2027/` 可访问，显示六个愿望槽位，不出现 Day selector，六格都能从全曲库选择。

## 12. 后续可扩展方向

可扩展更多导出模板，但尺寸、背景、品牌文案等配置必须集中管理。

可扩展更多搜索字段，但必须基于现有数据结构或同步脚本补充真实数据。

可扩展数据同步流程，但必须保留 `validate:data` 校验，并同步更新数据结构文档。

可扩展静态站点 SEO 与分享元数据，但不得破坏静态导出约束。
