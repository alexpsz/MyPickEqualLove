# Progress

## 1. 当前状态摘要

MyPickEqualLove 当前是一个面向 ＝LOVE 粉丝的静态 Web App。主功能已经存在：歌曲选择、搜索筛选、本地持久化、导出图片、预览、下载、分享到 X。

本次新增或更新了根目录 `agent.md`，以及 `memory/` 下 4 个项目记忆文档：

- `memory/app-design-document.md`
- `memory/progress.md`
- `memory/architecture.md`
- `memory/tech-stack.md`

## 2. 已完成功能

当前已实现 10 个 pick 槽位。

当前已实现指定槽位选择歌曲。

当前已实现全局搜索并自动填入第一个空槽位。

当前已实现满槽后的替换弹窗流程。

当前已实现清空单个槽位和清空全部选择确认。

当前已实现歌曲搜索、快捷筛选、年份筛选、成员筛选、release type 筛选和已毕业成员显示开关。

当前已实现通过 `localStorage` 保存用户选择和导出选项。

当前已实现离屏导出画布、`html2canvas` 图片生成、预览弹窗、下载图片、分享到 X。

## 3. 当前技术状态

项目使用 Next.js App Router、React、TypeScript、Tailwind CSS 与 `html2canvas`。

当前 Node 要求为 `>=20.9.0`。

当前部署方式为静态导出，`next.config.ts` 设置了 `output: "export"`。

当前图片配置为 `images.unoptimized: true`。

当前未引入后端数据库或服务端运行时。

本次未执行 `npm run lint`，原因：本次仅文档生成，未修改源码/数据/构建配置。

本次未执行 `npm run build`，原因：本次仅文档生成，未修改源码/数据/构建配置。

本次未执行 `npm run validate:data`，原因：本次仅文档生成，未修改源码/数据/构建配置。

## 4. 当前数据状态

歌曲数据来自 `src/data/equal-love-songs.json`，当前源码校验到 84 首歌曲。

成员数据来自 `src/data/equal-love-members.json`，当前源码校验到 12 名成员，其中 10 名 active，2 名 inactive/graduated。

运行时集合和索引由 `src/data/songs.ts` 派生，包括 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。

`scripts/validate-equal-love-data.mjs` 当前校验歌曲数量、成员数量、字段枚举、封面存在性、成员引用、credits 以及特定边界歌曲。

## 5. 当前文档状态

已创建 `agent.md` 作为根目录 Agent 指令文件。

已创建 `memory/app-design-document.md` 作为统一应用设计文档。

已创建 `memory/progress.md` 记录当前项目状态、风险和更新历史。

已创建 `memory/architecture.md` 记录当前运行时架构、数据流、状态流和静态导出约束。

已创建 `memory/tech-stack.md` 记录当前运行环境、依赖版本、脚本命令、构建链路和技术约束。

## 6. 已知风险与待确认事项

文档内容需要随源码演进维护；新增功能后必须同步更新 `memory/` 文档。

重大功能、架构调整、数据结构调整、依赖升级、构建流程调整或里程碑完成后，必须更新 `memory/architecture.md` 与 `memory/progress.md`。

产品范围、用户流程、核心交互或验收标准变化时，必须更新 `memory/app-design-document.md`。

技术栈、脚本、依赖、运行环境或部署方式变化时，必须更新 `memory/tech-stack.md`。

任务说明中要求写入旧路径禁用声明，同时又要求不要引用旧目录和旧路径。本次按更严格的迁移约束处理：文档只声明统一使用 `memory/app-design-document.md`，不把旧路径写成可引用目标。

## 7. 下一步建议

后续源码变更前先阅读 `memory/progress.md`、`memory/architecture.md`、`memory/app-design-document.md` 与 `memory/tech-stack.md`。

涉及歌曲或成员数据时，先确认同步脚本和数据校验脚本约束，再修改 JSON 或数据派生逻辑。

涉及导出体验时，重点复核 `ExportBoard`、`PreviewModal`、`EXPORT_CONFIG` 和 `html2canvas` 生成流程。

涉及部署方式或 Next.js 配置时，先评估是否仍满足静态导出约束。

## 8. 最近更新记录

2026-06-17：基于当前仓库源码新增项目 Agent 指令和 4 个 `memory/` 项目记忆文档；未修改源码、数据、配置、脚本或依赖文件。
