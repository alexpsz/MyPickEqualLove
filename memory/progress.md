# Progress

## 1. 当前状态摘要

本仓库已从单一 MyPickEqualLove 站点重构为三姐妹项目单仓库架构：`equal-love`、`nearly-equal-joy`、`not-equal-me` 共用同一套核心前端。

主功能仍然存在：歌曲选择、搜索筛选、本地持久化、导出图片、预览、下载、分享到 X。

## 2. 已完成功能

当前已实现 10 个 pick 槽位。

当前已实现指定槽位选择歌曲。

当前已实现全局搜索并自动填入第一个空槽位。

当前已实现满槽后的替换弹窗流程。

当前已实现清空单个槽位和清空全部选择确认。

当前已实现歌曲搜索、快捷筛选、年份筛选、成员筛选、release type 筛选和已毕业成员显示开关。

当前已实现通过项目化 `localStorage` key 保存用户选择和导出选项。

当前已实现离屏导出画布、`html2canvas` 图片生成、预览弹窗、下载图片、分享到 X。

当前已实现基于 `NEXT_PUBLIC_PROJECT_ID` 的项目配置、metadata、主题色、favicon、robots 和 sitemap 切换。

当前已实现左上角 `Other Picks` 抽屉入口；每个站点从配置中展示另外两个姐妹 MyPick 站点链接，并在低调分割线下展示其他作者维护的外部 MyPick 站点列表。

当前已实现三项目开发和构建脚本：`dev:*` 使用 webpack dev，`build:*` 使用静态导出。

## 3. 当前技术状态

项目使用 Next.js App Router、React、TypeScript、Tailwind CSS 与 `html2canvas`。

当前 Node 要求为 `>=20.9.0`。

当前部署方式为静态导出，`next.config.ts` 设置了 `output: "export"`。

当前本地开发命令使用 `next dev --webpack`。已确认 Next.js 16.2.9 的 Turbopack dev 在本项目首页首次编译时可能长时间停在 `○ Compiling / ...`，而 webpack dev 能正常返回页面。

当前图片配置为 `images.unoptimized: true`。

当前未引入后端数据库或服务端运行时。

## 4. 当前数据状态

=LOVE 数据来自 `src/projects/equal-love/songs.json` 和 `src/projects/equal-love/members.json`，当前严格校验目标为 84 首歌曲、12 名成员。

`nearly-equal-joy` 与 `not-equal-me` 已填充真实成员、歌曲、credits 和本地封面数据。`nearly-equal-joy` 当前为 28 首歌曲、13 名成员；`not-equal-me` 当前为 61 首歌曲、12 名成员。

`nearly-equal-joy` 保留福山萌叶为毕业成员：`fukuyama-moeka`，毕业日 `2023-03-29`。她只关联实际参与的早期原创曲《≒JOY》《笑って フラジール》《超孤独ライオン》。目前没有可确认的福山萌叶专属毕业曲，因此不添加毕业曲。

`not-equal-me` 标记菅波美玲为毕业成员：`suganami-mirei`，毕业日 `2026-06-12`。毕业曲《君はもう一度タネになる》作为 special/youtube_public 补充曲写入数据，避免常规官网 discography 或 Uta-Net 暂未收录时遗漏。`not-equal-me` 也按目标团参与即收录的口径补充《次に会えた時 何を話そうかな》《トリプルデート》；《ここでファーストキッス》已作为 12th 両A面シングル收录曲加入，但作曲/编曲 credits 暂标 `未確認`，`sourceStatus` 为 `unverified`。

`nearly-equal-joy` 按目标团参与和成员 solo 即收录的口径补充《The rock is you!》和イコノイジョイ合同曲《トリプルデート》。

运行时集合和索引由 `src/data/songs.ts` 从当前项目数据派生，包括 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。

`scripts/validate-project-data.mjs` 会校验全部项目数据；其中 `equal-love` 仍执行歌曲数量、成员数量和边界歌曲严格检查。`nearly-equal-joy` 额外检查福山萌叶成员状态、早期三首参与边界、12 名现役成员单色 `color` 且禁止 `colors`；`not-equal-me` 额外检查菅波美玲成员状态、毕业曲边界、11 名现役成员色。

## 5. 部署状态

建议 Cloudflare Pages 使用三个独立 Pages 项目，全部连接同一个 GitHub repo 和 `main` 分支：

- MyPickEqualLove：`npm run build:equal-love`，输出 `out/`，域名 `mypick.kozueginko.com`
- MyPickNearlyEqualJoy：`npm run build:nearly-equal-joy`，输出 `out/`
- MyPickNotEqualMe：`npm run build:not-equal-me`，输出 `out/`

## 6. 已知风险与待确认事项

两个新项目的最终自定义域名尚未写入配置；当前使用 Cloudflare Pages 默认域名占位。

两个新项目的品牌主题色为初始可配置值，后续可按实际设计调整。

`nearly-equal-joy` 的成员色以 wiki 和官方 X 公告中 2026-03-05 决定的单色メンバーカラー为准；不保存ペンライト双色。`not-equal-me` 的成员色仍沿用此前公开应援色资料，后续如官方颜色规则变化，需要同步更新十六进制映射。

文档内容需要随源码演进维护；重大功能、架构、数据结构、依赖、部署流程变化后必须同步更新 `memory/`。

`public/robots.txt` 与 `public/sitemap.xml` 已被删除，后续不要恢复静态文件；robots 和 sitemap 现在由 `src/app/robots.ts` 与 `src/app/sitemap.ts` 按项目配置生成。

## 7. 最近更新记录

2026-06-19：扩展左上角 `Other Picks` 抽屉。上方继续由 `SISTER_PROJECT_LINKS` 展示当前项目以外的两个姐妹站点；下方新增低调分割线和 `EXTERNAL_MY_PICK_LINKS` 外部 MyPick 列表，包含 LLerNote、Aqours、Nijigasaki、Liella!、Hasunosora 与 IKIZULIVE，并在底部加入其他作者 fan-made 项目免责声明。

2026-06-19：修复歌曲选择弹窗在展开 Filters 后遮挡歌曲列表的问题，并按交互反馈细化滚动层级。`SearchModal` 现在让搜索控制条、高级 Filters 面板和歌曲列表共用同一个纵向滚动容器；移动端控制条保持普通流布局，会随歌单一起向上滑出视口，`sm` 及以上视口控制条使用 sticky 留在滚动容器顶部，仅高级 Filters 面板和歌曲列表滚动隐藏。高级筛选面板不再拥有独立 `max-height`/`overflow-y-auto` 滚动层。后续维护搜索弹窗时不要把高级 Filters 面板和结果列表拆回两个独立纵向滚动区域。已用 `npm run lint`、`npm run build`、in-app Browser 在 390x740 和 900x740 视口验证。

2026-06-18：新增左上角 `Other Picks` 姐妹项目抽屉入口。互链由 `SISTER_PROJECT_LINKS` 从项目注册表和当前项目 id 派生，当前站点只显示另外两个姐妹站点，并沿用现有黑白面板设计和项目主题色点缀。

2026-06-17：补充开发者交接记录；`architecture.md` 增加文件职责索引，解释三姐妹项目重构后的关键源码、配置、脚本和资源目录作用。

2026-06-17：按“目标团参与/成员 solo 均可收录”的 MyPick 目录口径补充新项目歌曲：≒JOY 增加《The rock is you!》《トリプルデート》后为 28 首；≠ME 增加《次に会えた時 何を話そうかな》《トリプルデート》《ここでファーストキッス》后为 61 首。《ここでファーストキッス》当前依据官方 12th single 页面确认收录，credits 待 Uta-Net 或官方完整资料公开后更新。

2026-06-17：新增通用数据同步入口 `scripts/sync-project-discography.py --project <project-id>` 和 npm scripts：`sync:data:nearly-equal-joy`、`sync:data:not-equal-me`、`sync:data:all`。完成 ≒JOY 与 ≠ME 数据同步：≒JOY 26 首/13 名成员，保留福山萌叶毕业成员并仅关联早期三首；≠ME 58 首/12 名成员，补充菅波美玲毕业曲《君はもう一度タネになる》。`validate:data` 已覆盖新项目非空、封面、credits、成员引用和毕业边界。

2026-06-17：修复 ≒JOY / ≠ME 成员色 UI。新增 `Member.colors` 与 `src/utils/memberColors.ts`，页面顶部改为现役成员色展开渐变，导出图成员色条按实际现役成员数量显示：≒JOY 12 人、≠ME 11 人；双色胶囊使用平滑渐变。同步脚本和 validator 已覆盖 joy/me 成员色。

2026-06-17：按 ≒JOY wiki 与官方 X 公告改正 ≒JOY 颜色数据：删除 ≒JOY 现役成员 `colors` 双色/ペンライト设定，改用单色メンバーカラー：ボルドー、薄ピンク、紫、青、水色、白、黄色、オレンジ、緑、赤、ピンク、アイスグリーン。同步脚本和 validator 已禁止 ≒JOY 重新写入 `colors`。

2026-06-17：排查 `npm run dev` 卡在 `○ Compiling / ...` 的问题。确认端口已连接但首页 15 秒无响应；webpack dev 对照正常返回，因此将 `dev`、`dev:equal-love`、`dev:nearly-equal-joy`、`dev:not-equal-me` 改为 `next dev --webpack`。生产 `build:*` 继续走 `next build` 静态导出。

2026-06-17：完成验证：`npm run validate:data` 通过，`npm run lint` 0 error 且保留 4 个既有 `<img>` warning，`npx tsc --noEmit` 通过，三个 `build:*` 均通过；in-app browser 确认 `dev:equal-love` 首页显示 `MY PICK =LOVE` 与 `SONGS 84`。

2026-06-17：重构为三姐妹项目单仓库架构，新增 `src/projects/` 配置和数据层、项目化 metadata/theme/storage/export id、三个 Cloudflare Pages build 脚本和通用数据校验脚本。
