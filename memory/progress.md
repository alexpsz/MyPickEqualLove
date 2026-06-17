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

`nearly-equal-joy` 与 `not-equal-me` 已建立项目配置与空数据壳，后续填充 `members.json`、`songs.json` 和对应 `public/covers/<project-id>/` 封面即可上线内容。

运行时集合和索引由 `src/data/songs.ts` 从当前项目数据派生，包括 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。

`scripts/validate-project-data.mjs` 会校验全部项目数据；其中 `equal-love` 仍执行歌曲数量、成员数量和边界歌曲严格检查。

## 5. 部署状态

建议 Cloudflare Pages 使用三个独立 Pages 项目，全部连接同一个 GitHub repo 和 `main` 分支：

- MyPickEqualLove：`npm run build:equal-love`，输出 `out/`，域名 `mypick.kozueginko.com`
- MyPickNearlyEqualJoy：`npm run build:nearly-equal-joy`，输出 `out/`
- MyPickNotEqualMe：`npm run build:not-equal-me`，输出 `out/`

## 6. 已知风险与待确认事项

`nearly-equal-joy` 与 `not-equal-me` 当前只有配置和空数据壳，页面可以构建但没有可选歌曲。

两个新项目的最终自定义域名尚未写入配置；当前使用 Cloudflare Pages 默认域名占位。

两个新项目的品牌主题色为初始可配置值，后续可按实际设计调整。

文档内容需要随源码演进维护；重大功能、架构、数据结构、依赖、部署流程变化后必须同步更新 `memory/`。

`public/robots.txt` 与 `public/sitemap.xml` 已被删除，后续不要恢复静态文件；robots 和 sitemap 现在由 `src/app/robots.ts` 与 `src/app/sitemap.ts` 按项目配置生成。

## 7. 最近更新记录

2026-06-17：补充开发者交接记录；`architecture.md` 增加文件职责索引，解释三姐妹项目重构后的关键源码、配置、脚本和资源目录作用。

2026-06-17：排查 `npm run dev` 卡在 `○ Compiling / ...` 的问题。确认端口已连接但首页 15 秒无响应；webpack dev 对照正常返回，因此将 `dev`、`dev:equal-love`、`dev:nearly-equal-joy`、`dev:not-equal-me` 改为 `next dev --webpack`。生产 `build:*` 继续走 `next build` 静态导出。

2026-06-17：完成验证：`npm run validate:data` 通过，`npm run lint` 0 error 且保留 4 个既有 `<img>` warning，`npx tsc --noEmit` 通过，三个 `build:*` 均通过；in-app browser 确认 `dev:equal-love` 首页显示 `MY PICK =LOVE` 与 `SONGS 84`。

2026-06-17：重构为三姐妹项目单仓库架构，新增 `src/projects/` 配置和数据层、项目化 metadata/theme/storage/export id、三个 Cloudflare Pages build 脚本和通用数据校验脚本。
