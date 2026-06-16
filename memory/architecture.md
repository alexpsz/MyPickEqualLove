# Architecture

## 1. 架构概览

MyPickEqualLove 是纯前端静态 Web App。运行时由 Next.js App Router 页面加载 React 客户端组件，使用项目内静态 JSON 数据和浏览器 `localStorage` 完成歌曲选择、筛选、图片生成与分享流程。

当前没有后端数据库、服务端 API、服务端 session、服务端图片生成或动态服务端渲染核心路径。

`src/app/page.tsx` 是当前客户端主编排层，负责 picks 状态、弹窗状态、替换流程、预览生成、本地持久化读取与写入。

## 2. 目录结构

当前主要目录职责：

- `src/app/`：Next.js App Router 页面、布局和全局样式。
- `src/components/`：首页 UI、pick board、搜索弹窗、替换弹窗、导出画布和预览弹窗。
- `src/config/`：应用品牌、存储 key、导出配置、默认槽位、主题色、筛选标签。
- `src/data/`：静态歌曲和成员 JSON，以及运行时派生集合。
- `src/schema/`：核心音乐数据类型契约。
- `src/utils/`：站点常量、颜色转换等通用工具。
- `scripts/`：数据同步、数据校验和静态导出辅助脚本。
- `public/`：静态站点资源和本地歌曲封面。
- `memory/`：项目记忆和 Agent 协作上下文。

## 3. 核心模块职责

`src/app/layout.tsx` 定义站点 metadata、语言、图标、OG/Twitter 信息和根布局。

`src/app/page.tsx` 是客户端主编排层：管理 `storedPicks`、`activeSlotId`、`showModal`、`pendingReplacementSong`、`previewUrl`、`generating`、`showTitles`、`transparentBg`、`nicknameDraft`、`hydrated`，并串联所有核心组件。

`src/config/equalLove.ts` 是品牌、存储 key、导出配置、槽位配置、主题色、release type label、track type label 的配置中心。

`src/schema/music.ts` 是核心类型契约，定义音乐、成员、发行、歌曲、槽位和 picks 的数据结构。

`src/data/songs.ts` 从 JSON 派生运行时集合和索引，包括 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。

`src/components/Controls.tsx` 负责歌曲总数展示、导出昵称输入、全局搜索、清空全部、生成图片按钮和生成中状态。

`src/components/PickBoard.tsx` 负责展示 10 个槽位和已选择数量，并将每个槽位委托给 `PickSlotCard`。

`src/components/PickSlotCard.tsx` 负责单个槽位的封面、标题、年份、track type 展示，以及单槽位清空按钮。

`src/components/SearchModal.tsx` 负责歌曲搜索、筛选、键盘关闭、移动端自动聚焦规避和歌曲选择。

`src/components/ReplacementModal.tsx` 负责满槽后选择要替换的槽位。

`src/components/ExportBoard.tsx` 负责隐藏离屏导出画布，按照 `EXPORT_CONFIG` 和当前 picks 渲染可被 `html2canvas` 捕获的 DOM。

`src/components/PreviewModal.tsx` 负责图片预览、显示标题开关、透明背景开关、下载图片和分享到 X。

`src/components/Header.tsx` 负责首页品牌头部和简短说明。

`src/components/Footer.tsx` 负责非官方项目声明、素材权利声明和来源说明。

`src/components/GitHubLink.tsx` 负责显示 GitHub 仓库入口。

## 4. 数据结构

`LocalizedString` 表示本地化文本，包含 `ja`、`romaji`，可选 `en`。

`Member` 表示 ＝LOVE 成员，包含成员 id、姓名、颜色、状态、毕业信息和排序。

`Release` 表示发行信息，包含发行 id、标题、类型、日期、版本、封面和官方链接。

`Song` 表示歌曲，包含 id、标题、artist、发行信息、曲目类型、封面、成员引用、可见性、来源状态、标签、credits 和官方链接。

`PickSlot` 表示 pick 槽位，包含槽位 id、标签、可选副标题和排序。

`StoredPicks` 是 `Record<PickSlotId, string>`，只保存槽位到 `song.id` 的映射。

`Picks` 是 `Record<PickSlotId, Song>`，是页面运行时从 `StoredPicks` 和 `SONGS_BY_ID` 派生出的完整歌曲映射。

## 5. 数据流

静态数据链路为：

`src/data/equal-love-songs.json` 与 `src/data/equal-love-members.json` → `src/data/songs.ts` 派生集合与索引 → `src/app/page.tsx` 状态 → UI 组件 → `ExportBoard` → `html2canvas` → `PreviewModal`。

`SONGS` 负责搜索列表和导出可选歌曲集合。

`SONGS_BY_ID` 负责将本地保存的 `song.id` 还原为完整 `Song`。

`MEMBERS` 负责成员颜色、搜索筛选和已毕业成员逻辑。

`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS` 负责筛选选项。

## 6. 状态流

`storedPicks` 保存当前槽位到 `song.id` 的映射，并写入 `localStorage`。

`activeSlotId` 表示当前指定选择的槽位；为 `null` 时表示全局搜索流程。

`showModal` 控制搜索弹窗显示。

`pendingReplacementSong` 保存满槽时等待替换的新歌曲。

`previewUrl` 保存 `html2canvas` 生成的 PNG data URL，并控制预览弹窗显示。

`generating` 控制图片生成中的 UI 状态。

`showTitles` 控制导出图是否显示歌曲标题。

`transparentBg` 控制导出图背景是否透明。

`nicknameDraft` 保存导出昵称输入草稿。

`hydrated` 标记浏览器端读取 `localStorage` 的初始化过程是否完成。

`generatingRef` 防止图片生成被并发重复触发。

页面通过 `useMemo` 从 `storedPicks` 派生 `picks`，过滤掉无法在 `SONGS_BY_ID` 中找到的无效歌曲 id。

## 7. 图片生成流程

用户点击 Generate Image 后，`handleGenerateImage` 先通过 `generatingRef` 防止重复执行，并将 `generating` 设为 true。

生成前临时包装 `window.getComputedStyle`，通过 `convertColorString` 将部分现代颜色函数转换为 `rgba`，提升 `html2canvas` 兼容性。

随后动态 import `html2canvas`，查找 id 为 `mypick-equal-love-export-canvas` 的离屏导出元素。

生成前等待 `document.fonts.ready`，并额外等待 150ms，降低字体或布局尚未稳定导致的导出风险。

`html2canvas` 使用 `useCORS: true`、`EXPORT_CONFIG.scale`、`EXPORT_CONFIG.background` 或透明背景配置生成 canvas。

生成完成后调用 `canvas.toDataURL("image/png")` 写入 `previewUrl`，打开或刷新 `PreviewModal`。

当预览已存在时，`showTitles` 或 `transparentBg` 变化会延迟 100ms 触发重新生成。

## 8. 搜索与筛选流程

`SearchModal` 接收 `songs`、`members`、`releaseTypes`、`trackTypes`、`years`。

搜索词会经过小写、去空白、保留日文/英文/数字和 ＝ 符号的规范化处理。

搜索字段包括歌曲标题、artist、作词者、作曲者、编曲者、成员和 center 成员的多语言名称。当前没有完整歌词正文搜索。

筛选条件包括：

- release type。
- track type。
- year。
- member。
- graduated members 显示开关。

快捷筛选覆盖 All、主要 track type 和 Digital。

默认无搜索词且未打开已毕业成员显示时，含已毕业成员参与的歌曲会被隐藏。

## 9. 本地持久化

用户选择写入 `localStorage` 的 `STORAGE_KEYS.picks`。

导出选项 `showTitles` 与 `transparentBg` 写入 `localStorage` 的 `STORAGE_KEYS.options`。

页面 hydration 后通过 `setTimeout(..., 0)` 读取 `localStorage`，并用 `parseStoredPicks` 校验槽位 id 和歌曲 id。

`parseStoredPicks` 只接受 `DEFAULT_PICK_SLOTS` 中存在的槽位，且只保留 `SONGS_BY_ID` 中存在的歌曲 id。

昵称当前保存在页面状态，不写入 `localStorage`。

## 10. 静态导出架构约束

项目必须保持 Next.js `output: "export"` 兼容。

项目必须保持 `images.unoptimized: true`，不得依赖 Next.js 运行时图片优化。

核心功能不能依赖服务端数据库、服务端 session、API Routes 核心路径、动态服务端渲染或服务端图片生成。

站点资源和歌曲封面必须能在静态导出的 `out/` 目录中被访问。

`npm run build` 当前链路会先清理 `out/`，再执行 `next build`，最后复制 `.next/static` 和 `public/` 资源到 `out/`。

## 11. 关键不变量

`DEFAULT_PICK_SLOTS` 当前是 10 个槽位。

用户选择只保存 `song.id`，不在本地持久化完整 `Song` 对象。

`localStorage` key 必须从 `STORAGE_KEYS` 获取。

导出尺寸、背景和 scale 必须从 `EXPORT_CONFIG` 获取。

`SONGS_BY_ID` 是通过 id 查找 `Song` 的唯一运行时索引。

`SearchModal` 的搜索字段和筛选规则必须与真实 `Song`、`Member` 数据结构一致。

数据变更必须通过 `npm run validate:data` 校验。

静态导出能力不得被依赖服务端运行时的实现破坏。

## 12. 架构变更维护规则

修改主流程、状态结构、数据派生、搜索筛选、导出流程或持久化规则后，必须更新本文件。

新增组件或移动模块职责后，必须更新目录结构和核心模块职责。

改变数据结构或 JSON 字段后，必须更新数据结构、数据流和校验说明。

改变部署模式、构建链路、Next.js 配置或图片策略后，必须同步更新 `memory/tech-stack.md`。

任何架构变化都必须保持与 `memory/app-design-document.md` 的产品流程和验收标准一致。
