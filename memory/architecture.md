# Architecture

## 1. 架构概览

本仓库现在是三姐妹 MyPick 站点的单代码库：`equal-love`、`nearly-equal-joy`、`not-equal-me` 共用同一套 Next.js/React 前端、搜索、pick board、本地持久化、图片导出和分享流程。

项目差异由 `NEXT_PUBLIC_PROJECT_ID` 在构建时选择。默认项目是 `equal-love`，因此现有未设置环境变量的本地构建仍会生成 MyPickEqualLove。

应用仍是纯前端静态 Web App。没有后端数据库、服务端 API、服务端 session、服务端图片生成或动态服务端渲染核心路径。

## 2. 目录结构

- `src/app/`：Next.js App Router 页面、metadata、robots/sitemap 和全局样式。
- `src/components/`：共用 UI、pick board、搜索弹窗、替换弹窗、导出画布和预览弹窗。
- `src/config/project.ts`：当前项目配置入口、storage key、导出配置、槽位配置、主题色和筛选标签。
- `src/projects/`：项目注册表以及每个站点的 `members.json`、`songs.json` 和品牌配置。
- `src/data/songs.ts`：从当前项目数据派生运行时集合和索引。
- `src/schema/`：核心音乐数据类型契约。
- `src/utils/`：站点 URL、颜色转换等通用工具。
- `scripts/`：=LOVE 数据同步、通用数据校验和静态导出辅助脚本。
- `public/`：静态站点资源、项目 icon 和本地歌曲封面。

## 3. 文件职责索引

### 3.1 根目录配置与文档

- `README.md`：面向仓库使用者的项目介绍、三项目 dev/build 命令、Cloudflare Pages 部署方式和数据维护入口。
- `agent.md`：给自动化开发代理的项目背景、约束和常用工作流提示。
- `LICENSE`：仓库许可证。
- `package.json`：npm scripts、Node 版本要求、运行依赖和开发依赖。`dev:*` 明确选择项目并使用 webpack dev；`build:*` 明确选择项目并静态导出到 `out/`。
- `package-lock.json`：npm 依赖锁定文件，必须与 `package.json` 同步提交。
- `next.config.ts`：Next.js 配置。当前保持 `output: "export"`、`images.unoptimized: true` 和本地 dev origin。
- `tsconfig.json`：TypeScript 编译配置，启用严格类型、JSON import 和 `@/*` 路径别名。
- `next-env.d.ts`：Next.js 自动维护的类型声明入口，不手动写业务逻辑。
- `eslint.config.mjs`：ESLint flat config。当前 lint 范围由 package script 限定到源码、脚本和配置文件。
- `postcss.config.mjs`：Tailwind CSS 4 的 PostCSS 插件入口。

### 3.2 memory 文档

- `memory/progress.md`：当前开发状态、已完成事项、已知风险和最近更新记录。后续交接先读这里。
- `memory/architecture.md`：架构说明和文件职责索引。修改核心流程、配置层或部署链路后必须同步更新。
- `memory/tech-stack.md`：运行环境、依赖、脚本、构建部署和质量工具说明。
- `memory/app-design-document.md`：产品流程、UI/交互验收标准和导出体验要求。

### 3.3 scripts

- `scripts/clean-static-export.mjs`：构建前删除旧 `out/`，避免不同项目的静态产物混在一起。
- `scripts/copy-public-assets.mjs`：静态导出后同步 `.next/static` 与 `public/` 资源到 `out/`，让 Cloudflare Pages 可直接托管。
- `scripts/sync-project-discography.py`：通用数据同步脚本，通过 `--project equal-love|nearly-equal-joy|not-equal-me` 选择项目。负责抓取官网 discography/profile、Uta-Net credits、本地封面下载、毕业成员/特殊曲和成员参与 override。
- `scripts/sync-equal-love-discography.py`：兼容旧命令的薄 wrapper，内部调用通用同步脚本同步 `equal-love`。
- `scripts/validate-project-data.mjs`：校验全部或单个项目数据。检查 song id 唯一、成员引用存在、封面存在、类型合法、credits 完整和项目非空；`equal-love` 额外检查 84 首歌曲、12 名成员和边界歌曲，`nearly-equal-joy` 检查福山萌叶毕业成员与早期三首参与边界，`not-equal-me` 检查菅波美玲毕业成员与毕业曲边界。

### 3.4 Next App Router

- `src/app/layout.tsx`：根 layout。读取 `PROJECT_CONFIG` 生成 metadata、favicon、OG/Twitter 信息，并把项目主题色写入 CSS variables。
- `src/app/page.tsx`：客户端主页面和状态编排。负责 picks、搜索/替换弹窗、localStorage、导出图片、预览和分享入口。
- `src/app/globals.css`：全局样式、Tailwind 入口、基础背景、面板、按钮和项目主题 CSS class。
- `src/app/robots.ts`：按当前项目 `siteUrl` 生成静态 robots。不要恢复 `public/robots.txt`。
- `src/app/sitemap.ts`：按当前项目 `siteUrl` 生成静态 sitemap。不要恢复 `public/sitemap.xml`。

### 3.5 组件

- `src/components/Header.tsx`：首页品牌标题和副标题，读取当前项目 `groupName`、`subtitle`。
- `src/components/Footer.tsx`：页脚免责声明和灵感来源链接，文案随当前项目 group 切换。
- `src/components/GitHubLink.tsx`：右上角 GitHub 链接，默认使用当前项目 `repoUrl`。
- `src/components/Controls.tsx`：昵称输入、搜索、清空和生成图片按钮区。
- `src/components/PickBoard.tsx`：pick 槽位网格容器，把槽位配置、已选歌曲和交互回调分发给卡片。
- `src/components/PickSlotCard.tsx`：单个 pick 槽位卡片，展示封面、标题、成员色和清空按钮。
- `src/components/SearchModal.tsx`：歌曲搜索弹窗，提供关键字、快捷筛选、年份、成员、release type 和毕业成员显示控制。
- `src/components/ReplacementModal.tsx`：当 10 个槽位已满时选择替换目标的弹窗。
- `src/components/ExportBoard.tsx`：隐藏离屏导出画布，id 来自 `EXPORT_CANVAS_ID`；供 `html2canvas` 捕获 PNG。
- `src/components/PreviewModal.tsx`：导出预览弹窗，处理下载文件名、分享到 X 和 Web Share API。

### 3.6 配置、数据、类型与工具

- `src/projects/registry.ts`：项目注册表。定义固定 `PROJECT_IDS`、默认项目、每个项目的品牌配置，并把对应 `members.json` 和 `songs.json` 注册进当前构建。
- `src/config/project.ts`：当前项目配置入口。派生 `PROJECT_CONFIG`、`PROJECT_ID`、`STORAGE_KEYS`、`EXPORT_CONFIG`、`EXPORT_CANVAS_ID`、`DEFAULT_PICK_SLOTS`、主题色和筛选标签。
- `src/data/songs.ts`：从当前项目 JSON 派生运行时集合与索引，包括 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。
- `src/schema/music.ts`：成员、歌曲、发行、曲目类型、pick slot、localStorage 数据结构的 TypeScript 契约。
- `src/utils/colors.ts`：颜色工具。当前用于把现代 CSS 颜色函数转换为 `html2canvas` 更稳定支持的格式。
- `src/utils/memberColors.ts`：成员应援色工具。读取 `color`/`colors` 并为页面顶部渐变与导出图色条提供统一颜色序列。
- `src/utils/constants.ts`：从当前项目配置导出的站点常量，例如 `SITE_URL`。

### 3.7 项目数据与静态资源

- `src/projects/equal-love/members.json`：=LOVE 成员数据源。
- `src/projects/equal-love/songs.json`：=LOVE 歌曲数据源。
- `src/projects/nearly-equal-joy/members.json`：≒JOY 成员数据，当前包含 12 名现役成员和毕业成员福山萌叶；现役成员使用 wiki/官方 X 公告的单色メンバーカラー `color`，不保存ペンライト双色 `colors`。
- `src/projects/nearly-equal-joy/songs.json`：≒JOY 歌曲数据。福山萌叶只关联《≒JOY》《笑って フラジール》《超孤独ライオン》，目前不添加毕业曲。
- `src/projects/not-equal-me/members.json`：≠ME 成员数据，当前包含 11 名现役成员和毕业成员菅波美玲；成员包含双色应援色 `colors`，导出图默认使用 11 名现役成员。
- `src/projects/not-equal-me/songs.json`：≠ME 歌曲数据，包含菅波美玲毕业曲《君はもう一度タネになる》作为 special/youtube_public 曲。
- `public/icon.svg`：旧通用 icon，保留用于兼容历史引用；新 metadata 使用项目化 icon。
- `public/icons/equal-love.svg`：=LOVE 站点 favicon/OG icon。
- `public/icons/nearly-equal-joy.svg`：≒JOY 站点 favicon/OG icon。
- `public/icons/not-equal-me.svg`：≠ME 站点 favicon/OG icon。
- `public/covers/equal-love/*`：=LOVE 本地封面图，路径被 `songs.json` 的 `coverUrl` 引用。
- `public/covers/nearly-equal-joy/`：≒JOY 本地封面图，路径被 `songs.json` 的 `coverUrl` 引用。
- `public/covers/not-equal-me/`：≠ME 本地封面图，路径被 `songs.json` 的 `coverUrl` 引用。
- `docs/equal-love-mypicks-preview.png`：README 预览图。

## 4. 核心模块职责

`src/projects/registry.ts` 定义固定项目 id、项目配置、成员 JSON 和歌曲 JSON 的注册表。

`src/config/project.ts` 基于 `NEXT_PUBLIC_PROJECT_ID` 暴露当前项目的 `PROJECT_CONFIG`、`STORAGE_KEYS`、`EXPORT_CANVAS_ID`、`DEFAULT_PICK_SLOTS`、`PROJECT_THEME_COLOR`、`EXPORT_CONFIG` 和筛选标签。

`src/app/layout.tsx` 从当前项目配置生成 title、description、keywords、favicon、OG/Twitter metadata，并把项目主题色写入 CSS variables。

`src/app/page.tsx` 是客户端主编排层：管理 picks 状态、弹窗状态、替换流程、预览生成、本地持久化读取与写入。

`src/data/songs.ts` 从当前项目 JSON 派生 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。

`src/components/ExportBoard.tsx` 使用项目化 `EXPORT_CANVAS_ID` 和当前项目品牌配置渲染隐藏离屏导出画布。

## 5. 数据与配置流

当前项目选择链路为：

`NEXT_PUBLIC_PROJECT_ID` → `src/projects/registry.ts` → `src/config/project.ts` 与 `src/data/songs.ts` → 页面和组件。

静态数据链路为：

`src/projects/<project-id>/songs.json` 与 `members.json` → `src/data/songs.ts` 派生集合与索引 → `src/app/page.tsx` 状态 → UI 组件 → `ExportBoard` → `html2canvas` → `PreviewModal`。

封面继续使用 public 静态路径，例如 `/covers/equal-love/...`。新增项目应使用对应目录，例如 `/covers/nearly-equal-joy/...` 和 `/covers/not-equal-me/...`。

## 6. 本地持久化

用户选择写入 `STORAGE_KEYS.picks`，导出选项写入 `STORAGE_KEYS.options`。

`STORAGE_KEYS` 由当前项目的 `storagePrefix` 派生，例如 `equal_love_mypicks_v1`、`nearly_equal_joy_mypicks_v1`、`not_equal_me_mypicks_v1`，避免三个站点在浏览器里互相污染。

用户选择只保存 `song.id`，运行时通过当前项目的 `SONGS_BY_ID` 还原完整 `Song`。

## 7. 图片生成流程

用户点击 Generate Image 后，`handleGenerateImage` 通过 `generatingRef` 防止并发重复执行。

生成前临时包装 `window.getComputedStyle`，通过 `convertColorString` 提升 `html2canvas` 对现代颜色函数的兼容性。

随后动态 import `html2canvas`，查找当前项目的 `EXPORT_CANVAS_ID`，等待字体稳定后生成 PNG data URL，并写入 `PreviewModal`。

`ExportBoard` 的成员色条使用现役成员实际数量，不再固定截取前 10 名。存在 `colors` 的项目可渲染渐变胶囊；≒JOY 当前只使用单色胶囊。

当预览已存在时，`showTitles` 或 `transparentBg` 变化会延迟触发重新生成。

## 8. 构建与部署

项目必须保持 Next.js `output: "export"` 兼容和 `images.unoptimized: true`。

`npm run build` 默认生成 `equal-love`。Cloudflare Pages 使用三个独立 Pages 项目连接同一 GitHub repo 和 `main` 分支：

- `npm run build:equal-love` → `out/` → `mypick.kozueginko.com`
- `npm run build:nearly-equal-joy` → `out/`
- `npm run build:not-equal-me` → `out/`

`src/app/robots.ts` 与 `src/app/sitemap.ts` 根据当前项目 `siteUrl` 生成静态 robots 和 sitemap。

本地开发使用 `next dev --webpack`。Next.js 16.2.9 的 Turbopack dev 已在本项目中复现首页首次编译卡住，表现为端口已连接但请求长时间无响应；生产 `next build` 未受影响。

## 9. 关键不变量

固定项目 id 只有 `equal-love`、`nearly-equal-joy`、`not-equal-me`。

`DEFAULT_PICK_SLOTS` 当前是 10 个槽位。

`localStorage` key 必须从 `STORAGE_KEYS` 获取。

导出尺寸、背景和 scale 必须从 `EXPORT_CONFIG` 获取。

数据变更必须运行 `npm run validate:data`。=LOVE 数据仍保留 84 首、12 名成员和边界歌曲的严格校验；≒JOY 和 ≠ME 不允许回到空数据壳，并保留各自毕业成员边界校验。

静态导出能力不得被依赖服务端运行时的实现破坏。

## 10. 架构变更维护规则

修改主流程、状态结构、项目配置层、数据派生、搜索筛选、导出流程或持久化规则后，必须更新本文件。

改变部署模式、构建链路、Next.js 配置或图片策略后，必须同步更新 `memory/tech-stack.md`。

任何架构变化都必须保持与 `memory/app-design-document.md` 的产品流程和验收标准一致。
