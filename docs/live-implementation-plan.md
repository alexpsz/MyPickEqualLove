# Live Pick 特别网页实施计划

> 项目：`alexpsz/MyPickEqualLove`  
> 计划日期：2026-06-22  
> 仓库基线：`main@c527702e5ea2c479301e6ad98aa9ccbd28e64710`  
> 适用站点：`equal-love`、`nearly-equal-joy`、`not-equal-me` 三个独立域名站点  
> 首批页面：＝LOVE 国立余韵、＝LOVE 东京巨蛋愿望歌单

## 0. 核心结论

本次改动应采用 **“保留普通版根路径 + 同域新增 Live Pick 静态子路由 + 三团共用配置驱动接口”** 的方案：

- 现有 `/` 继续是原封不动的普通 Top 10，不替换默认页，不迁移现有 `localStorage`，不改变现有分享链接。
- ＝LOVE 站点新增：
  - `/live/kokuritsu-2026/`：国立演出后的 5 首余韵 Pick。
  - `/live/tokyo-dome-2027/`：东京巨蛋演出前的 5 首愿望 Pick。
- 不新增域名，不新增 Cloudflare Pages 项目，也不为每场 live 增加新的构建命令。
- 国立 Day 1、Day 2 不拆成两个页面；在同一页面内提供 `DAY 1 / DAY 2 / 2 DAYS` 观演范围切换。
- 国立前四格严格限定为所选日期实际演出曲；第五格「帰り道に聴いた曲」保留全曲库，因为它表达的是终演后的私人余韵，不要求现场演唱过。
- 东京巨蛋目前不区分 Day 1 / Day 2：演出尚未发生，提前区分只会制造没有事实基础的精细度。
- 所有 live 页面由当前团体项目配置生成；未来 ≠ME、≒JOY 只增加事件数据，不复制页面代码。

### 0.1 本次国立歌单的事实源与复核材料

国立 Day 1 / Day 2 的生产数据以用户提供的 ＝LOVE 官方 X 帖文与 Apple Music 官方歌单链接为主来源：

- [＝LOVE 官方 X：国立两日セットリスト](https://x.com/equal_love_12/status/2068677833850057105?s=46)
- [Apple Music：＝LOVE STADIUM LIVE「Beyond "KYUN"♡」Day1](https://music.apple.com/cn/playlist/love-stadium-live-beyond-kyun-day1/pl.u-b3b8Mv7iKorrg0W)
- [Apple Music：＝LOVE STADIUM LIVE「Beyond "KYUN"♡」Day2](https://music.apple.com/cn/playlist/love-stadium-live-beyond-kyun-day2/pl.u-RRbVY3VCmE99WZA)

Apple Music 公开页面本身只稳定暴露歌单标题、艺人、31 首歌曲与时长；实际曲目顺序可通过 Apple Music catalog playlist API 读取。抓取结果已与用户本地曲库截图交叉核对：

- `C:\Users\shaoz\Downloads\d1-1.png`、`C:\Users\shaoz\Downloads\d1-2.png`：Day 1 本地曲库截图。
- `C:\Users\shaoz\Downloads\d2-1.png`、`C:\Users\shaoz\Downloads\d2-2.png`：Day 2 本地曲库截图。

本地截图只作为人工复核参考，不作为生产代码可访问的 `sourceUrl`。生产数据应保存官方 X 与 Apple Music URL，并在 `sourceNote` 中说明对应 Day、Apple Music playlist、截图复核结论。录入时必须把 Day 1、Day 2 曲目逐条映射到当前 `src/projects/equal-love/songs.json` 的稳定 `songId`；不得把日文标题字符串直接散落在组件或过滤逻辑中。

本计划不另存一份脱离 song ID 的“第二套歌名清单”，以免官网新曲同步或标题修正后产生双重事实源。活动配置中的有序 setlist entry 才是上线后的唯一运行时事实。

> **核验边界：** Apple Music 与本地截图已经能确认 Day 1 / Day 2 的 31 条 source track 顺序，但上线前仍须完成一次代码侧 `songId` 映射复核。`Overture` 出现在 source track 1，但当前 `songs.json` 没有对应歌曲且不作为 Pick 候选；生产 setlist 不应为它新增可选歌曲。`ナツマトペ` 应映射到现有 `songId: "natsumatope"`，同时修正当前主数据中 `ナツマトぺ` 的字符问题。

### 0.2 已确认的国立曲库映射

以下列表以 Apple Music source order 为准，并已结合 `d1-*` / `d2-*` 本地截图复核。`source-only` 表示来源中存在但不进入可选歌曲集合；其余条目均应保存为 `LiveSetlistEntry.songId`。

Day 1：

```text
01 Overture -> source-only, not selectable
02 とくべチュ、して -> tokubechu-shite
03 Oh!Darling -> oh-darling
04 ナツマトペ -> natsumatope
05 ヒロインズ -> hiroinzu
06 お姫様にしてよ! -> o-himesama-nishiteyo
07 Be Selfish -> be-selfish
08 僕らの制服クリスマス -> bokura-no-seifuku-christmas
09 ラブソングに襲われる -> love-song-ni-osowareru
10 Want you!Want you! -> want-you-want-you
11 Queens -> queens
12 真夜中マーメイド -> mayonaka-maameido
13 劇薬中毒 -> gekiyaku-chuudoku
14 「ドライブ デート 都内」 -> doraibu-deeto-tonai
15 shukipi -> shukipi
16 木漏れ日メゾフォルテ -> ki-more-nichi-mezoforute
17 仲直りシュークリーム -> nakanaori-shuukuriimu
18 お姫様の作り方 -> o-himesama-no-tsukurikata
19 超特急逃走中 -> choutokkyuu-tousou-naka
20 内緒バナシ -> naisho-banashi
21 Junkies -> junkies
22 モラトリアム -> moratoriamu
23 seishun subliminal -> seishun-subliminal
24 夏祭り恋慕う -> natsumatsuri-renbo-u
25 絶対アイドル辞めないで -> zettai-idol-yamenaide
26 ラブソングに襲われる -> love-song-ni-osowareru
27 海とレモンティー -> umi-to-remonteii
28 だからとて -> dakaratote
29 この空がトリガー -> kono-sora-ga-trigger
30 探せ ダイヤモンドリリー -> sagase-diamond-lily
31 =LOVE -> equal-love
```

Day 2：

```text
01 Overture -> source-only, not selectable
02 とくべチュ、して -> tokubechu-shite
03 Oh!Darling -> oh-darling
04 ナツマトペ -> natsumatope
05 ヒロインズ -> hiroinzu
06 お姫様にしてよ! -> o-himesama-nishiteyo
07 Be Selfish -> be-selfish
08 僕らの制服クリスマス -> bokura-no-seifuku-christmas
09 ラブソングに襲われる -> love-song-ni-osowareru
10 Want you!Want you! -> want-you-want-you
11 Queens -> queens
12 真夜中マーメイド -> mayonaka-maameido
13 劇薬中毒 -> gekiyaku-chuudoku
14 「ドライブ デート 都内」 -> doraibu-deeto-tonai
15 shukipi -> shukipi
16 木漏れ日メゾフォルテ -> ki-more-nichi-mezoforute
17 仲直りシュークリーム -> nakanaori-shuukuriimu
18 お姫様の作り方 -> o-himesama-no-tsukurikata
19 超特急逃走中 -> choutokkyuu-tousou-naka
20 内緒バナシ -> naisho-banashi
21 Junkies -> junkies
22 モラトリアム -> moratoriamu
23 seishun subliminal -> seishun-subliminal
24 夏祭り恋慕う -> natsumatsuri-renbo-u
25 絶対アイドル辞めないで -> zettai-idol-yamenaide
26 だからとて -> dakaratote
27 この空がトリガー -> kono-sora-ga-trigger
28 探せ ダイヤモンドリリー -> sagase-diamond-lily
29 笑顔のレシピ -> egao-no-reshipi
30 =LOVE -> equal-love
31 スタート! -> sutaato
```

派生集合：

- Day 1 source track 为 31 条；排除 `Overture` 且按 `songId` 去重后，候选歌曲为 29 首。
- Day 2 source track 为 31 条；排除 `Overture` 后，候选歌曲为 30 首。
- Day 1 only：`umi-to-remonteii`。
- Day 2 only：`egao-no-reshipi`、`sutaato`。
- 2 DAYS 候选集合为 31 首，按首次出现顺序组织。

---

## 1. 当前仓库架构判断

本计划以仓库当前真实结构为基础，并已阅读：

- `memory/progress.md`
- `memory/architecture.md`
- `memory/app-design-document.md`
- `memory/tech-stack.md`
- 根目录 `agent.md`
- 与本功能直接相关的页面、配置、schema、搜索、槽位、导出和分享组件

### 1.1 当前不变量

当前仓库已经是三姐妹项目的单代码库：

```text
NEXT_PUBLIC_PROJECT_ID
  -> src/projects/registry.ts
  -> src/config/project.ts + src/data/songs.ts
  -> src/app/page.tsx
  -> 共用组件、html2canvas 导出与分享
```

三个站点通过独立 Cloudflare Pages 构建部署，但共用同一个仓库和 `main` 分支：

- `build:equal-love`
- `build:nearly-equal-joy`
- `build:not-equal-me`

应用仍须保持：

- Next.js App Router
- `output: "export"`
- `images.unoptimized: true`
- 无后端、无数据库、无服务端 session
- 静态 JSON 数据 + 浏览器 `localStorage`
- 当前普通版十槽选择、搜索、替换、导出、下载及分享到 X 的全部行为

### 1.2 当前代码对 Live Pick 的主要限制

目前以下事实均为普通 Top 10 硬编码：

- `DEFAULT_PICK_SLOTS` 固定为 10 格。
- `src/app/page.tsx` 直接引用固定槽位、固定存储键和全曲库。
- `PickSlotCard` 没有接收或显示槽位标题。
- `ExportBoard` 固定为 2 列 × 5 行，并不显示槽位语义。
- `PreviewModal` 固定读取普通版分享文案、根域名和下载文件名。
- `Header`、`Controls`、`SearchModal` 的文案以普通 Top Picks 为前提。
- `localStorage` 只按团体隔离，尚未按特别企划或演出日期隔离。

因此不能用“再写一个几乎相同的页面”解决。应先做一次 **行为不变的共用编排抽取**，再以配置添加特别页。

---

## 2. 产品范围与 URL 设计

### 2.1 保留现有普通版

每个团体站点的根路径继续维持当前普通版：

```text
/
```

普通版必须继续使用现有存储键，例如：

```text
equal_love_mypicks_v1
equal_love_options_v1
```

不得为了统一接口而更名，否则会让现有用户已保存的 Pick 消失。

### 2.2 ＝LOVE 首批特别页

```text
/live/kokuritsu-2026/
/live/tokyo-dome-2027/
```

推荐使用简短稳定的公开 URL；页面类型通过配置描述，而不是写进 URL。

东京巨蛋演出结束后，不覆盖原有愿望页，应新增一个独立余韵页面，例如：

```text
/live/tokyo-dome-2027-afterglow/
```

原 `/live/tokyo-dome-2027/` 可以保留为已归档的演出前愿望企划，从而避免旧分享链接失效。

### 2.3 三团未来复用

同一套路由在每个独立域名下只读取当前团体的事件配置。例如：

```text
# ≠ME 自己的域名
/live/arena-tour-2027-afterglow/

# ≒JOY 自己的域名
/live/anniversary-2027-wishlist/
```

不得让 ＝LOVE 域名承载 ≠ME 或 ≒JOY 的 live 页面；跨团跳转继续由现有 `Other Picks` 负责。

---

## 3. 国立余韵页面的内容设计

### 3.1 页面定位

页面标题建议：

```text
国立の余韻 5 Picks
```

日文说明建议：

```text
＝LOVE STADIUM LIVEの余韻を、5つの記憶で残そう。
```

它不是“现场歌曲 Top 5 排名”，而是让用户从五个不同角度保存 live 记忆。因此每格必须有独立语义，并同时出现在：

- 空槽卡片
- 已选歌曲卡片
- 替换弹窗
- 导出图片

### 3.2 最终推荐的五种类型

1. **`忘れられない曲`**  
   辅助说明：`国立でいちばん心に残った一曲`。从所选演出范围内的实际演出曲选择。
2. **`会場で高まった曲`**  
   辅助说明：`コール・演出・空気ごと熱くなった一曲`。从所选演出范围内的实际演出曲选择。
3. **`涙が出た曲`**  
   辅助说明：`思わず涙がこぼれた一曲`。从所选演出范围内的实际演出曲选择。
4. **`推しが輝いていた曲`**  
   辅助说明：`この瞬間の推しを忘れたくない一曲`。从所选演出范围内的实际演出曲选择。
5. **`帰り道に聴いた曲`**  
   辅助说明：`終演後にもう一度聴き返した一曲`。允许从 ＝LOVE 全曲库选择。

这版比抽象的「一番刺さった曲」更口语，也更容易让用户回忆具体画面。

### 3.3 为什么第五格不应受 setlist 强限制

「帰り道に聴いた曲」描述的是终演后的行为，而不是舞台事实。用户可能因为 MC、成员表情或整场情绪，在回程重新听一首当日没有演出的歌。

因此页面应明确提示：

```text
「帰り道に聴いた曲」は国立で披露されていない楽曲も選べます。
```

这能同时保留活动专属性和个人表达空间。

### 3.4 是否强制填满五格

首版不建议强制填满后才能导出。

原因：并非所有用户都有“真的哭了”的一首歌；强制完成会让模板从回忆工具变成答题任务。沿用普通版“至少选择一首即可生成”的规则，既能保持行为一致，也降低传播门槛。

### 3.5 是否允许同一首歌重复出现

首版应 **允许同一首歌占据多个情绪槽位**，并延续当前普通版没有去重约束的行为。某首歌完全可能同时是「忘れられない曲」和「涙が出た曲」；强制唯一会迫使用户用次优答案填格。

界面可在未来增加非阻断提示，例如“同じ曲が2つの記憶に選ばれています”，但不应禁止生成。

---

## 4. Day 1 / Day 2 / 2 DAYS 设计

### 4.1 结论：事实层必须区分，产品层不拆页

官方来源已经把国立歌单按 Day 1、Day 2 分别呈现，因此数据层必须保存为两个独立 `LivePerformance`。即使两天曲目高度重合，观演日期、歌曲顺序、版本、成员瞬间和导出语境仍然不同；若页面使用强限制却不考虑日期，单日观演用户会看到另一日才演出的歌曲，事件语义会失真。

但不应建立：

```text
/live/kokuritsu-2026-day1/
/live/kokuritsu-2026-day2/
```

因为两页的五种情绪槽位完全相同，拆页会带来：

- 分享链接和 SEO 权重分散
- 用户需要先判断进入哪个页面
- 两套状态和内容重复维护
- 两日都参加的用户没有自然入口

### 4.2 单页观演范围选择器

在国立页面标题下方增加：

```text
振り返る公演
[ DAY 1 · 6/20 ] [ DAY 2 · 6/21 ] [ 2 DAYS ]
```

推荐默认值：`2 DAYS`。

理由：

- 第一次进入无需先完成额外步骤。
- 两日参加者可以直接做整体余韵。
- 单日参加者仍可主动切换到准确范围。

导出图片上必须显示当前范围，例如：

```text
DAY 1 · 2026.06.20
DAY 2 · 2026.06.21
2 DAYS · 2026.06.20–21
```

### 4.3 三种范围的歌曲集合

- `day1`：只使用 Day 1 setlist。
- `day2`：只使用 Day 2 setlist。
- `both`：Day 1 与 Day 2 的并集，按歌曲 ID 去重。

歌曲是否属于哪一天应保存在事件 setlist 数据中，**不要写入全局 `songs.json` 的 tags**。同一歌曲未来会参加很多 live，把事件关系写入歌曲主数据会迅速失控。

### 4.4 切换日期时的状态处理

推荐按观演范围分别保存 Pick，而不是切换时删除不合法歌曲：

```text
equal_love_live_kokuritsu_2026_day1_picks_v1
equal_love_live_kokuritsu_2026_day2_picks_v1
equal_love_live_kokuritsu_2026_both_picks_v1
```

效果：

- 用户可以分别制作 Day 1、Day 2 和 2 DAYS 三张图。
- 切换时不会丢失上一版选择。
- 不需要复杂的“哪些歌曲将被清空”确认弹窗。
- 未来其他多日巡演可直接复用。

页面另存最近选择的范围：

```text
equal_love_live_kokuritsu_2026_context_v1
```

---

## 5. Setlist 限制策略

### 5.1 推荐：按槽位限制，而不是整页限制

国立配置应允许每个槽位拥有自己的 eligibility policy：

```ts
"selected-performance" // 当前 DAY 1 / DAY 2 / 2 DAYS 的演出曲
"event-union"          // 整个活动两日并集
"catalog"              // 当前团体全曲库
```

国立首版：

```text
槽位 1–4 -> selected-performance
槽位 5   -> catalog
```

东京巨蛋愿望页：

```text
全部槽位 -> catalog
```

### 5.2 强限制必须覆盖所有入口

仅在 `SearchModal` 隐藏不合法歌曲还不够。需要在状态层统一校验：

1. 点击具体槽位时，只把该槽位 eligible songs 传给 `SearchModal`。
2. 全局搜索选择歌曲时，寻找“第一个空且允许该歌曲”的槽位，而不是简单寻找第一个空槽位。
3. 已满时，`ReplacementModal` 只显示或只启用允许该歌曲的槽位。
4. 从 `localStorage` 恢复时重新校验槽位与歌曲是否匹配当前配置。
5. 生成图片前再做一次轻量合法性检查，避免旧缓存绕过新规则。

这个统一规则可由纯函数实现：

```ts
isSongEligibleForSlot({ experience, slot, songId, contextId })
getEligibleSongsForSlot({ experience, slot, contextId })
findFirstEligibleEmptySlot({ experience, picks, songId, contextId })
```

普通 Top 10 的所有槽位都是 `catalog`，因此其行为将自然保持与现状一致。

### 5.3 全局搜索在混合范围下的行为

国立第五格允许全曲库，因此全局搜索的候选集合应按“任一槽位可合法接收”计算，而不是只看前四格。国立首版中第五格为 `catalog`，所以全局搜索候选集合仍然是全曲库。选择一首非国立演出曲时：

- 若第五格为空，自动放入第五格。
- 若第五格已满，替换弹窗只允许替换第五格。
- 不允许把该歌曲放入前四格。
- 如果用户是从某一个具体槽位打开搜索，则候选集合只按该槽位 eligibility 计算。

搜索结果可增加轻量 badge，降低意外感：

```text
DAY 1
DAY 2
2 DAYS
帰り道枠のみ
```

badge 可作为第二阶段优化，核心合法性必须在第一阶段完成。

### 5.4 官方歌单的转录与发布门槛

本次已有 ＝LOVE 官方 X 的两日歌单帖与 Apple Music 官方歌单作为 primary sources，并已结合本地截图完成一次人工方向的曲库确认。但“来源可靠”不等于“代码录入自动正确”。事件配置仍应包含：

```ts
verificationStatus: "unverified" | "partial" | "verified"
sourceUrls: string[]
sourceNote?: string
```

`verificationStatus` 的作用是发布闸门，不是用户界面标签：

- `unverified`：只有来源链接或草稿列表，尚未完成 `songId` 映射；不得发布强限制页面。
- `partial`：已完成初步映射，但仍存在未处理条目、标题字符差异、重复曲、section 或人工复核缺口；可本地预览，不得公开发布 `selected-performance` 强限制体验。
- `verified`：曲目顺序、`songId`、重复曲、`Overture` 排除规则和 Day 1 / Day 2 差异均已复核；validator 才允许 `published`。

规则：

- Day 1、Day 2 分别从 Apple Music playlist 抓取或人工转录，并逐条映射到当前团体的稳定 `songId`。
- 使用 `d1-1.png`、`d1-2.png`、`d2-1.png`、`d2-2.png` 作为本地人工复核参考；这些本地路径不进入生产 `sourceUrls`。
- 至少进行一次独立复核：检查顺序、漏曲、重复曲、`Overture` 排除规则、section、medley/short ver. 和全半角/假名标题差异。
- 使用 `selected-performance` 强限制的公开页面，相关 performance 必须为 `verified`。
- validator 应拒绝“`published` + 严格 setlist 限制 + 未核验 setlist”的组合。
- 无法完成映射或复核时，页面保持 `draft`；不要用标题猜测、非官方转帖或记忆补位。
- 非官方 repo、现场 repo 和媒体报道可以交叉检查，但不能覆盖与官方 X 或 Apple Music 相冲突的事实。

### 5.5 Setlist 录入规则

建议按演出顺序保存 entry，而不是只保存无序 song ID：

```ts
interface LiveSetlistEntry {
  order: number;
  songId: string;
  section?: "main" | "encore" | "double-encore";
  versionNote?: string;
}
```

处理约定：

- MC、VTR、`Overture` 不作为可选歌曲，除非它们本身已经是项目歌曲目录中的正式曲目。本次国立 `Overture` 只作为 source track 记录在 `sourceNote` 或实施记录中，不进入候选集合，也不为此新增 `songs.json` 条目。
- 同一歌曲若在同一天重复出现，可保留多条 entry；候选歌曲集合按 `songId` 去重。
- medley、short ver. 仍指向原歌曲 ID，用 `versionNote` 记录，不复制一个新 Song。
- 现场首发但尚未进入 `songs.json` 的歌曲，必须先按现有歌曲数据规则补齐，再进入 setlist。
- `2 DAYS` 默认按“首次出现顺序”组织候选歌曲；搜索后仍按当前搜索规则过滤。
- source order 可保留 Apple Music 原始顺序号；排除 `Overture` 后不要求 setlist order 从 1 连续重排。
- `ナツマトペ` 必须映射到 `songId: "natsumatope"`；同时修复 `src/projects/equal-love/songs.json` 中标题字符 `ナツマトぺ`，避免未来同步或搜索出现片假名/平假名混用问题。

---

## 6. 东京巨蛋愿望页面

### 6.1 页面定位

标题建议：

```text
東京ドームで聴きたい 5 Picks
```

说明建议：

```text
＝LOVE in TOKYO DOMEで叶ってほしい5つの瞬間を選ぼう。
```

它是演出前的愿望模板，不是未来 setlist 预测，也不是 Day 1 / Day 2 猜测。

### 6.2 推荐五格

1. **`開幕で聴きたい曲`**：`東京ドームの最初の一音に選びたい曲`。
2. **`会場で高まりたい曲`**：`ドーム全体で熱くなりたい曲`。
3. **`東京ドームで泣きたい曲`**：`この場所で聴けたら涙が出そうな曲`。
4. **`推しが輝く姿を見たい曲`**：`東京ドームで推しに届けてほしい曲`。
5. **`最後に聴きたい曲`**：`この公演の余韻を託したい曲`。

五格都使用当前团体全曲库。文案在上线前可再请日语母语粉丝做一次自然度校对，但槽位职责应保持不变。

### 6.3 不做 Day 1 / Day 2 区分

东京巨蛋虽有两日，但演出尚未发生，用户无法知道两日歌单差异。当前增加日期选择器只会制造假精细度，并让同一个愿望被迫分裂。

首版只做整个 `＝LOVE in TOKYO DOME` 的一张愿望板。演出结束后再根据真实 setlist 创建新的 afterglow 页面，并按国立接口启用日期范围。

---

## 7. 三团通用数据接口

### 7.1 新增 schema

建议新增：

```text
src/schema/pick-experience.ts
```

核心类型建议：

```ts
export type PickExperienceKind =
  | "standard"
  | "live-afterglow"
  | "live-wishlist";

export type ExperienceStatus = "draft" | "published" | "archived";

export type SongEligibilityScope =
  | "catalog"
  | "selected-performance"
  | "event-union";

export interface ExperiencePickSlot extends PickSlot {
  eligibility: SongEligibilityScope;
}

export interface LiveSetlistEntry {
  order: number;
  songId: string;
  section?: "main" | "encore" | "double-encore";
  versionNote?: string;
}

export interface LivePerformance {
  id: string;          // day1, day2
  label: string;       // DAY 1
  date: string;        // 2026-06-20
  setlist: LiveSetlistEntry[];
  sourceUrls: string[];
  sourceNote?: string; // e.g. official post image: DAY 1
  verificationStatus: "unverified" | "partial" | "verified";
}

export interface PickExperienceExportConfig {
  title: string;
  subtitle: string;
  imageFileName: string;
  layout: "top10-grid" | "five-memory-list";
}

export interface PickExperienceShareConfig {
  text: string;
  hashtags: string[];
}

export interface PickExperience {
  id: string;
  projectId: ProjectId;
  slug: string;
  kind: PickExperienceKind;
  status: ExperienceStatus;
  title: string;
  subtitle: string;
  description: string;
  canonicalPath: string;
  eventName?: string;
  venue?: string;
  officialUrl?: string;
  performances?: LivePerformance[];
  includeCombinedPerformance?: boolean;
  defaultContextId?: string;
  slots: ExperiencePickSlot[];
  export: PickExperienceExportConfig;
  share: PickExperienceShareConfig;
}
```

### 7.2 项目级事件数据

推荐每个团体都拥有同名事件数据入口：

```text
src/projects/equal-love/live-experiences.json
src/projects/nearly-equal-joy/live-experiences.json
src/projects/not-equal-me/live-experiences.json
```

首批状态：

- `equal-love/live-experiences.json`：国立 + 东京巨蛋。
- `nearly-equal-joy/live-experiences.json`：空数组。
- `not-equal-me/live-experiences.json`：空数组。

这样未来加活动时只改当前团体文件，不改通用组件。

### 7.3 注册表扩展

`src/projects/registry.ts` 的 `ProjectDefinition` 增加：

```ts
liveExperiences: PickExperience[];
```

当前构建仍由 `NEXT_PUBLIC_PROJECT_ID` 决定团体，但一次构建会静态生成该团体全部 `published` live 页面。

不要增加：

```text
NEXT_PUBLIC_LIVE_ID
NEXT_PUBLIC_EVENT_ID
```

也不要为每场活动增加一套 Cloudflare Pages 构建。事件是站点内内容，不是新的站点产品。

### 7.4 运行时派生模块

新增：

```text
src/data/pickExperiences.ts
```

职责：

- 提供普通版 `STANDARD_PICK_EXPERIENCE`。
- 读取当前项目已注册的 live experiences。
- 按 slug 查找页面配置。
- 派生可静态生成的 routes：`published` 与 `archived` 都生成页面，`draft` 不生成页面。
- 派生当前日期范围的候选歌曲与 day badge。
- 对 setlist 并集、顺序和 song ID 做统一处理。

---

## 8. 页面与组件重构计划

### 8.1 第一步：先做行为不变的编排抽取

从 `src/app/page.tsx` 抽出：

```text
src/components/PickExperienceClient.tsx
```

或：

```text
src/features/pick-experience/PickExperienceClient.tsx
```

它接收：

```ts
interface PickExperienceClientProps {
  experience: ResolvedPickExperience;
}
```

根页面变成薄 wrapper：

```tsx
export default function Home() {
  return <PickExperienceClient experience={STANDARD_PICK_EXPERIENCE} />;
}
```

这一提交只重构，不改变 UI、文案、存储键、十格布局或行为。完成后先跑完整回归，再添加 live 功能。

### 8.2 新增静态动态路由

新增：

```text
src/app/live/[eventSlug]/page.tsx
```

页面职责：

- `generateStaticParams()` 返回当前团体所有 `published` 与 `archived` experience slug；`draft` 不生成静态页面。
- `dynamicParams = false`，无效 slug 返回 404。
- `generateMetadata()` 生成该特别页独立 title、description、canonical、Open Graph 与 X metadata。
- 页面本身把已解析 experience 传给 `PickExperienceClient`。

该方案与静态导出一致：每个团体构建会在 `out/live/<slug>/index.html` 生成静态页面。

### 8.3 `src/config/project.ts`

保留现有：

```ts
STORAGE_KEYS
DEFAULT_PICK_SLOTS
EXPORT_CANVAS_ID
```

作为普通版兼容入口，同时新增工厂函数：

```ts
getExperienceStorageKeys(experienceId, contextId?)
getExperienceExportCanvasId(experienceId)
```

普通版必须返回当前旧 key；live 页面返回独立 key。

### 8.4 `PickBoard` 与 `PickSlotCard`

修改：

- `PickBoard` 把完整 `slot` 传给 `PickSlotCard`。
- 空槽显示 `slot.label` 和 `slot.subtitle`。
- 已选状态仍要显示槽位标题，不能选完后失去“五种记忆”的语义。
- 五槽页面使用更宽的卡片布局；普通十槽布局保持当前样式。

建议通过 experience layout 配置切换：

```text
top10-grid       -> 当前 1 / 2 / 5 列响应式网格
five-memory-list -> 桌面 1 或 2 列、移动端单列
```

不要根据 `slots.length === 5` 在多个组件中散落判断；集中由 layout profile 决定。

### 8.5 `SearchModal`

新增可选 props：

```ts
contextLabel?: string;
resultBadgesBySongId?: Record<string, string[]>;
emptyMessage?: string;
```

核心筛选仍复用现有实现。每次打开时，由编排层直接传入当前槽位合法歌曲列表。

普通版传入完整 `SONGS`，行为不变。

### 8.6 `ReplacementModal`

新增：

- 显示 `slot.label`。
- 支持传入可替换槽位集合，或每格 `disabledReason`。
- 不合法槽位不得通过键盘或点击完成替换。

普通版所有槽位均合法，因此视觉和行为可保持现状。

### 8.7 `Header`、`Controls` 与页面导航

`Header` 改为允许 experience 覆盖：

- 主标题
- 副标题
- 说明
- event/date/venue 行

`Controls` 改为允许：

- 指标名从固定 `Songs` 变为 `Eligible Songs` 或活动文案。
- 显示 Day selector。
- 普通版仍使用现有英文按钮和指标。

新增独立组件：

```text
src/components/ExperienceNavigation.tsx
```

放置在 Header 下方、Controls 上方，在当前团体站点内显示：

- 通常版 My Pick
- 当前 published live specials
- archived specials 可放次级区域或从主导航隐藏，但页面本身必须可直达

不要把它塞进 `SisterProjectsMenu`。后者的职责是跨团体/外部站点；前者是当前站点内部模式导航。

### 8.8 `ExportBoard`

改为接收 experience，而不是直接依赖所有普通版项目文案：

```ts
interface ExportBoardProps {
  experience: ResolvedPickExperience;
  context?: ResolvedExperienceContext;
  slots: ExperiencePickSlot[];
  ...
}
```

保留当前普通版 `top10-grid` 的视觉与尺寸，不进行顺手重设计。

新增 `five-memory-list` 导出布局：

- 1080 px 宽度继续沿用。
- 五格采用纵向大卡片或清晰的 1 列列表。
- 每格必须显示槽位标题、歌曲封面和歌名。
- 顶部显示 event title、日期范围、昵称。
- 底部显示当前特别页路径，而不是固定根域名。

五格页面不应把现有 2 × 5 网格简单留出五个空位。

### 8.9 `PreviewModal`

去除对普通版分享配置的硬编码，改为 props：

```ts
pageUrl
previewLabel
imageFileName
shareText
shareHashtags
shareTitle
```

这样下载文件名和 X 分享文案才能按特别页变化，例如：

```text
EqualLove_Kokuritsu2026_Afterglow_DAY1.png
EqualLove_TokyoDome2027_Wishlist.png
```

X 分享 URL 必须是当前特别页 URL，而不是站点根路径。

### 8.10 sitemap

`src/app/sitemap.ts` 改为包含：

- 当前站点根路径
- 当前团体全部 `published` live experience 路径
- 可选择保留 `archived` 页，确保旧链接可搜索；即使不进入 sitemap，`archived` 页面也必须静态生成以保护旧分享链接

不得把其他团体页面写进当前域名 sitemap。

---

## 9. `localStorage` 与向后兼容

### 9.1 普通版

完全保留：

```text
<projectPrefix>_mypicks_v1
<projectPrefix>_options_v1
```

### 9.2 Live 页

推荐格式：

```text
<projectPrefix>_live_<experienceId>_<contextId>_picks_v1
<projectPrefix>_live_<experienceId>_options_v1
<projectPrefix>_live_<experienceId>_context_v1
```

东京巨蛋无 context 时：

```text
equal_love_live_tokyo_dome_2027_picks_v1
```

### 9.3 读取时的防御性校验

现有 `parseStoredPicks` 需要从固定 `SLOT_IDS` 改为接收：

- 当前 slots
- 当前歌曲索引
- 当前 context
- eligibility validator

无效或已从 setlist 移除的歌曲不应进入运行时 Picks。建议记录 warning，但不要让页面崩溃。

---

## 10. 数据校验扩展

扩展 `scripts/validate-project-data.mjs`，为三个项目统一校验 live experience：

### 10.1 基础字段

- experience `id`、`slug` 在当前项目内唯一。
- `projectId` 与文件所在项目一致。
- `canonicalPath` 与 `/live/<slug>/` 一致。
- status、kind、layout、scope 均为合法枚举。
- published 页面必须有 title、description、share、export 配置。

### 10.2 槽位

- slot id 唯一。
- `sortOrder` 唯一且连续。
- label 非空。
- `live-afterglow` / `live-wishlist` 首版固定为 5 格。
- `selected-performance` 只能用于存在 performances 的 experience。

### 10.3 Setlist

- performance id 唯一。
- 日期格式合法。
- entry order 为正整数。
- 每个 `songId` 必须存在于当前项目 `songs.json`。
- 不允许跨团体 song ID。
- 同一 performance 内允许同一 `songId` 多次出现，用于保留重复披露；候选集合派生时必须按 `songId` 去重。
- `sourceUrls` 至少包含一个可追溯来源；本次国立应包含用户提供的官方 X 帖文和对应 Day 的 Apple Music playlist URL。
- `sourceNote` 能区分 DAY 1 / DAY 2，并说明 Apple Music playlist 与本地截图复核情况。
- published 严格限制页面必须达到 `verificationStatus: "verified"`。
- 本次国立不得把 `Overture` 作为可选 `songId`；若未来需要保留 source-only 条目，应先扩展 schema，而不是塞入假的 song ID。

### 10.4 导出和存储

- image filename 必须以 `.png` 结尾。
- experience id 与 context id 必须满足可安全用于 storage key 的 slug 规则。
- route slug 不得与保留路径冲突。

---

## 11. 实施阶段

### Phase 0：官方歌单转录与事实数据准备

1. 以 [＝LOVE 官方 X 的国立两日セットリスト](https://x.com/equal_love_12/status/2068677833850057105?s=46)、[Apple Music Day1](https://music.apple.com/cn/playlist/love-stadium-live-beyond-kyun-day1/pl.u-b3b8Mv7iKorrg0W) 与 [Apple Music Day2](https://music.apple.com/cn/playlist/love-stadium-live-beyond-kyun-day2/pl.u-RRbVY3VCmE99WZA) 为 primary sources。
2. 用 Apple Music playlist API 或人工打开歌单取得 Day 1、Day 2 的 source order；不得让页面运行时依赖 Apple Music API、图片 OCR 文本或临时标题字符串。
3. 使用 `d1-1.png`、`d1-2.png`、`d2-1.png`、`d2-2.png` 作为本地复核参考，确认 source order 与截图一致。
4. 将每一首可选歌曲映射到当前 `src/projects/equal-love/songs.json` 的真实、稳定 `songId`；`Overture` 只记录为 source-only，不进入候选集合。
5. 修正 `ナツマトペ` 主数据字符问题，并映射到 `songId: "natsumatope"`。
6. 保留 Day 1 中 `ラブソングに襲われる` 两次出现的 source order；候选集合派生时按 `songId` 去重。
7. 标记 main / encore / double encore、medley、short ver. 与其他特殊版本说明；若 Apple Music 无法提供 section，先用 `section` 空值保存，后续有官方图确认再补。
8. 计算两日交集、Day 1 only、Day 2 only 与两日并集：当前已确认 Day 1 only 为 `umi-to-remonteii`，Day 2 only 为 `egao-no-reshipi`、`sutaato`，2 DAYS 候选为 31 首。
9. 为两个 performance 保存共同官方 X URL，并分别保存对应 Day 的 Apple Music playlist URL；`sourceNote` 写明本地截图复核。
10. 完成代码侧映射复核后，把状态从 `partial` 提升为 `verified`；未达到 `verified` 前页面保持 `draft`，不得发布强限制页面。
11. 对无法映射的曲目先补齐项目歌曲主数据，或保持 experience 为 `draft`；不用猜测填充。

交付物：可通过 validator、且能生成准确 Day 1 / Day 2 / 2 DAYS 候选集合的国立 setlist 数据。

### Phase 1：普通版无行为变化重构

1. 建立 `PickExperience` schema。
2. 建立 `STANDARD_PICK_EXPERIENCE`。
3. 从 `src/app/page.tsx` 抽出 `PickExperienceClient`。
4. 把固定 slots、storage、export/share config 改为 props/config。
5. 确认根路径 UI、十槽逻辑、旧 localStorage、图片导出和分享完全不变。

该阶段不添加任何 live 页面，便于定位回归来源。

### Phase 2：通用 Live Experience 基础设施

1. 为三个项目加入 `live-experiences.json`。
2. 扩展项目 registry。
3. 新增 `src/data/pickExperiences.ts`。
4. 新增 `/live/[eventSlug]/` 静态动态路由。
5. 新增 storage key factory。
6. 新增 eligibility 纯函数。
7. 扩展 sitemap 和 metadata。
8. 扩展 validator。

### Phase 3：国立余韵上线

1. 加入五格文案和 `five-memory-list` 布局。
2. 加入 `DAY 1 / DAY 2 / 2 DAYS` selector。
3. 前四格接 selected-performance，第五格接 catalog。
4. 按 context 隔离 picks。
5. 导出图显示日期范围与槽位标题。
6. 分享文案和文件名使用国立配置。
7. 在普通版和特别页加入站内 Experience Navigation。

### Phase 4：东京巨蛋愿望上线

1. 加入五格愿望文案。
2. 所有槽位使用 catalog。
3. 不显示 Day selector。
4. 添加独立 metadata、分享文案、导出文件名。
5. 将页面加入当前站点导航和 sitemap。

### Phase 5：三团复用验证

1. 保持 ≠ME 与 ≒JOY 的 `live-experiences.json` 为真实的空数组，不制造虚构活动或 demo 数据。
2. 运行三个项目构建，确认空 experience 项目仍只生成根页面，且不会出现失效 live 导航或路由。
3. 以 ＝LOVE 的两个真实 experience 证明同一 React 页面、存储工厂、导出模板和 validator 可以由配置驱动。
4. 未来姐妹团有真实活动时，验收标准是“仅新增该团体事件数据即可发布”，若仍需修改通用页面代码，应视为接口设计未完成。

### Phase 6：项目文档更新

按 `agent.md` 要求同步更新：

- `memory/architecture.md`
- `memory/app-design-document.md`
- `memory/progress.md`
- 若构建脚本或技术栈变化，再更新 `memory/tech-stack.md`
- README 只增加稳定的公开功能说明，不写内部实现细节

---

## 12. 验收标准

### 12.1 普通版回归

- `/` 仍显示 10 个普通槽位。
- 已有 localStorage Picks 能恢复。
- 指定槽位选择、全局搜索、满槽替换、清空和确认行为不变。
- 普通版导出布局、文件名、文案和分享 URL 不变。
- 三个站点根路径均通过构建。

### 12.2 国立页面

- `/live/kokuritsu-2026/` 可通过静态路径访问。
- 显示五个指定日文槽位，并在选歌后继续显示槽位语义。
- `DAY 1 / DAY 2 / 2 DAYS` 可切换。
- 三种 context 的 Pick 分别保存并可恢复。
- 前四格无法选入所选日期未演出的歌曲。
- 第五格可选择全曲库，并有明确说明。
- 全局搜索不会把不合法歌曲写入不合法槽位。
- 替换弹窗不会允许不合法替换。
- 导出图显示 event、context、五格标题、昵称和正确 URL。
- X 分享使用国立页面 URL 和专属 hashtag。

### 12.3 东京巨蛋页面

- `/live/tokyo-dome-2027/` 可通过静态路径访问。
- 显示五个愿望槽位。
- 不出现 Day 1 / Day 2 selector。
- 五格都能从全曲库选择。
- 状态与普通版、国立版完全隔离。
- 导出和分享使用东京巨蛋专属配置。

### 12.4 三团构建

依次执行：

```bash
npm run validate:data
npm run lint
npm run format:check
npx tsc --noEmit
npm run build:equal-love
npm run build:nearly-equal-joy
npm run build:not-equal-me
```

人工验证至少覆盖：

- 移动端约 390 × 740
- 桌面端约 900 × 740 或更宽
- 普通十格导出
- 国立五格导出
- 东京巨蛋五格导出
- 透明背景、隐藏歌名、下载及分享到 X
- 直接访问特别页及无效 slug 的 404

---

## 13. 风险与控制

### 风险 A：为特别页重构后破坏普通版

控制：Phase 1 单独提交，只做无行为变化抽取；在添加 live 数据前完成三站构建与手工回归。

### 风险 B：Day 1 / Day 2 setlist 数据错误

控制：以官方 X 两日歌单帖为 primary source，逐条映射 song ID；使用事件级来源字段、verification status 与 validator 发布门槛，不把未复核转录作为强限制生产源。

### 风险 C：混合槽位范围导致全局搜索选错位置

控制：统一 eligibility 函数；全局搜索寻找第一个“合法且为空”的槽位；满槽时只允许合法替换目标。

### 风险 D：五格导出沿用十格布局导致视觉稀疏

控制：显式 export layout profile；普通版 `top10-grid` 和特别页 `five-memory-list` 分开定义，避免条件样式散落。

### 风险 E：未来每场活动继续复制代码

控制：所有活动差异只进入 `live-experiences.json`；通用路由和组件不引用任何具体活动 slug。

### 风险 F：活动结束后直接改写原页面，旧分享失去语义

控制：experience slug 和类型视为不可变内容；wishlist 与 afterglow 建立不同 experience，旧页面进入 archived 状态而不被覆盖。

---

## 14. 首版明确不做

- 不新增域名或 Cloudflare Pages 项目。
- 不改变三个团体的构建环境变量体系。
- 不让特别页替换根路径普通版。
- 不增加后端、账户、数据库或云端同步。
- 不把 live 日期关系写进全局歌曲 tags。
- 不根据未经核验的 repo 猜测 Day 1 / Day 2 setlist。
- 不新增歌曲去重限制；普通版与 Live Pick 均延续允许同一歌曲出现在不同槽位的现有语义。
- 不提前为东京巨蛋虚构 Day 1 / Day 2 歌单差异。
- 不把 `Other Picks` 改造成站内模式菜单；新增独立 Experience Navigation。

---

## 15. 建议提交拆分

为降低回归和审查成本，建议按以下提交边界推进：

1. `refactor: extract configurable pick experience client`
2. `feat: add project-scoped live experience registry and validation`
3. `feat: add static live experience routes and navigation`
4. `feat: add kokuritsu 2026 afterglow experience`
5. `feat: add tokyo dome 2027 wishlist experience`
6. `docs: update architecture design and progress memory`

每个功能提交都应保持可构建，避免把重构、事件数据和视觉改版塞进一个不可分辨的大提交。

---

## 16. 最终推荐决策

- **域名与部署：** 不新建域名、不新建 Cloudflare Pages 项目；在当前团体域名下增加静态子路径。
- **普通版：** 根页面 `/` 与既有 `localStorage` key 完全保留。
- **特别页：** 国立与东京巨蛋各自拥有独立、稳定的 URL，不用 query 参数充当页面身份。
- **国立日期：** 数据层分别保存 Day 1 与 Day 2；产品层用一个页面内的 `DAY 1 / DAY 2 / 2 DAYS` selector，默认 `2 DAYS`。
- **国立限制：** 前四格只允许当前日期范围实际演出曲；「帰り道に聴いた曲」允许全曲库。
- **国立曲库来源：** 官方 X、Apple Music Day1/Day2 playlist 与用户本地 `d1-*` / `d2-*` 截图已确认 source order；生产数据保存官方 URL 与 `songId` 映射，不依赖截图或在线 API。
- **国立数据门槛：** `songId` 映射、重复曲、`Overture` 排除和 `ナツマトペ` 字符修正未完成代码侧核验前，不发布强限制页面。
- **东京巨蛋：** 演出前愿望版不区分 Day 1 / Day 2，五格全部使用全曲库。
- **状态隔离：** 普通版、不同 live experience、国立三个日期 context 分别存储，互不覆盖。
- **导出选项隔离：** live 页导出选项按 experience 共享；国立 Day 1 / Day 2 / 2 DAYS 的 picks 按 context 分开保存。
- **站内导航：** Experience Navigation 放在 Header 下方、Controls 上方；`Other Picks` 继续只负责跨团体与外部站点。
- **归档页面：** `archived` experience 仍生成静态页面以保护旧链接，但不放入主导航；是否加入 sitemap 由实现时按 SEO 需要选择。
- **复用方式：** 三团共享 schema、路由、页面编排、eligibility、导出和验证逻辑；团体差异只写入项目级真实数据。
- **重复歌曲：** 允许同一歌曲承担多个情绪槽位，不强制唯一。
