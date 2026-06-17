# agent.md

## 重要提示

本文件是 MyPickEqualLove 的根目录 Agent 指令文件。所有后续开发任务必须先基于当前仓库真实文件判断项目状态，不得凭旧记忆或外部假设修改项目。

项目设计文档统一使用 `memory/app-design-document.md`。不再使用旧的游戏设计文档路径作为项目记忆、需求来源或开发前置阅读目标。

当前项目没有后端数据库、账号系统或服务端业务运行时。运行时数据来自静态 JSON 派生集合与浏览器 `localStorage`。

## 项目定位

MyPickEqualLove 是面向 ＝LOVE、≒JOY、≠ME 三姐妹项目粉丝的静态 Web App。用户从当前站点对应的歌曲目录中选择 Top 10 喜爱歌曲，搜索和筛选歌曲目录，并生成适合社交平台分享的图片。

项目采用 Next.js App Router、React、TypeScript、Tailwind CSS 与 `html2canvas`。当前部署模式是 Next.js 静态导出，必须保持 `output: "export"` 兼容性。

## 开发前流程

开始任何任务前，必须查看 `memory/progress.md`，确认当前进度、风险和未完成事项。

写任何代码前，必须完整阅读：

- `memory/architecture.md`
- `memory/app-design-document.md`
- `memory/tech-stack.md`

涉及依赖、构建、部署、Lint、格式化、Node 版本或静态导出配置时，必须重点复核 `memory/tech-stack.md`。

## 开发约束

不得采用只解决局部问题的补丁式修改而忽视整体设计。实现应遵循当前架构中的模块边界、状态流和数据流。

不得引入 Mock、Stub、Demo 级替代逻辑作为生产实现。所有导入模块必须真实存在，并在运行期参与执行。

不得复制 Next.js、React、html2canvas、Tailwind CSS、TypeScript、ESLint、Prettier 等成熟依赖的源码到项目内改造使用。当前项目只承担业务流程编排、模块组合调度、参数配置与输入输出适配职责。

不得保留未使用变量、未使用函数、无效分支或死代码。

## 胶水开发约束

优先复用框架、浏览器 API、依赖库和项目已有模块能力。新增逻辑应围绕现有数据结构、配置常量和组件职责进行编排。

新增抽象必须有明确收益：减少真实复杂度、消除有意义的重复、或匹配当前仓库已有模式。

不得在多个位置维护同一份事实数据。品牌文案、存储 key、导出尺寸、槽位配置、筛选标签等应从既有配置中心读取。

## 代码组织约束

源码优先放入 `src/`。

App Router 页面与布局放入 `src/app/`。

可复用 UI 组件放入 `src/components/`。

应用配置常量放入 `src/config/`。

静态业务数据放入 `src/data/`。

类型定义放入 `src/schema/`，或放在与模块强相关的位置。

通用工具函数放入 `src/utils/`。

自动化脚本放入 `scripts/`。

文档放入 `docs/` 或本项目指定的 `memory/`。`agent.md` 是用户明确指定的根目录项目指令文件，属于根目录新增文件例外。

只在用户要求或架构需要时新增目录，不随意重构目录。

## 数据与状态约束

歌曲与成员基础数据来自：

- `src/projects/equal-love/members.json`
- `src/projects/equal-love/songs.json`
- `src/projects/nearly-equal-joy/members.json`
- `src/projects/nearly-equal-joy/songs.json`
- `src/projects/not-equal-me/members.json`
- `src/projects/not-equal-me/songs.json`

`src/data/songs.ts` 派生 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。

用户选择保存在 `localStorage` 的 `STORAGE_KEYS.picks`。导出选项保存在 `localStorage` 的 `STORAGE_KEYS.options`。

不得硬编码重复的 `localStorage` key、导出尺寸、品牌文案或路径常量，应从 `src/config/project.ts` 和 `src/projects/registry.ts` 等配置来源读取。

数据变更后必须运行 `npm run validate:data`。

## UI 与交互约束

必须保持当前核心流程：指定槽位点击后选择歌曲；全局搜索优先填入第一个空槽位；10 个槽位已满时进入替换流程；清空单个槽位时阻止事件冒泡；清空全部选择前使用确认。

导出体验必须保留昵称、显示或隐藏歌曲标题、透明背景、下载图片与分享到 X 的能力。

搜索与筛选体验必须基于当前 `SearchModal` 的实际可搜索字段、筛选维度和已毕业成员显示规则，不得写入或实现与源码不一致的交互。

## 静态导出约束

必须保持 `next.config.ts` 中的 `output: "export"`。

必须保持当前静态图片策略兼容性：`images.unoptimized: true`。

核心功能不得依赖服务端数据库、服务端 session、API Routes 核心路径、动态服务端渲染或 Next.js 运行时图片优化。

如确需改变部署方式，必须先更新 `memory/architecture.md` 与 `memory/tech-stack.md`，并明确验证和迁移影响。

## 验证要求

源码变更后必须运行 `npm run lint`。

格式化相关变更后应运行 `npm run format:check`，需要自动格式化时运行 `npm run format`。

数据变更后必须运行 `npm run validate:data`。

构建、部署、Next.js 配置或静态导出链路变更后必须运行 `npm run build`。

不得跳过验证流程。如果环境无法执行验证命令，必须在最终说明或 `memory/progress.md` 中记录未执行项与原因。

## 文档维护要求

完成重大功能、架构调整、数据结构调整、依赖升级、构建流程调整或里程碑后，必须更新 `memory/architecture.md` 与 `memory/progress.md`。

产品范围、用户流程、核心交互或验收标准变化时，必须更新 `memory/app-design-document.md`。

技术栈、脚本、依赖、运行环境或部署方式变化时，必须更新 `memory/tech-stack.md`。

文档必须以当前仓库源码为准，不得编造不存在的后端、数据库、API 或服务端功能。

## README 写作标准

`README.md` 面向公开仓库访问者和部署使用者，必须保持发布版语气，优先说明产品、站点、核心功能、最小运行方式、构建方式、数据入口、技术栈、许可和免责声明。

README 只保留稳定且对外有用的核心信息。不得写入临时排障记录、详细交接日志、内部进度、未确认计划、源码逐文件说明、冗长实现细节或与当前发布无关的历史背景。

README 中的命令、站点 URL、项目 id、Node 版本、构建输出目录和数据路径必须来自当前仓库真实配置；修改相关事实源后必须同步复核 README。

复杂架构说明、实现细节、风险、未完成事项和最近更新记录应放在 `memory/architecture.md`、`memory/tech-stack.md`、`memory/app-design-document.md` 或 `memory/progress.md`，不得为了记录方便塞回 README。

README 结构应简洁稳定。新增章节前必须确认它是否属于公开发布页的核心信息；能用一句话或一个表格表达时，不展开成长段说明。

## 完成定义

任务完成时应满足以下条件：

- 变更范围符合用户要求，未修改无关文件。
- 实现与 `memory/architecture.md`、`memory/app-design-document.md`、`memory/tech-stack.md` 保持一致。
- 必要验证已执行；未执行项已说明原因。
- 相关项目记忆文档已按本文件要求更新。
- 未引入重复事实源、死代码、无效导入或静态导出不兼容能力。
