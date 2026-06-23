# Tech Stack

## 1. Runtime

当前 Node.js 要求来自 `package.json`：

- `node`: `>=20.9.0`

包管理使用 npm，仓库包含 `package-lock.json`。

## 2. Framework

- `next`: `^16.2.7`
- `react`: `^19.2.7`
- `react-dom`: `^19.2.7`
- `typescript`: `^6.0.3`

Next.js 使用 App Router，页面入口在 `src/app/`。

TypeScript 关键设置包括 `strict: true`、`moduleResolution: "bundler"`、`jsx: "react-jsx"`、`resolveJsonModule: true` 和 `isolatedModules: true`。

## 3. Styling

样式系统使用 Tailwind CSS 4：

- `tailwindcss`: `^4.3.0`
- `@tailwindcss/postcss`: `^4.3.0`

全局样式入口是 `src/app/globals.css`。项目主题色由 `src/app/layout.tsx` 写入 `--project-primary`、`--project-accent` 和 `--project-primary-wash`。

组件主要使用 Tailwind className 和少量内联样式。导出画布 `ExportBoard` 使用内联样式确保 `html2canvas` 捕获稳定；成员色胶囊优先使用单色 `color`，存在 `colors` 时可使用 CSS 渐变渲染。

## 4. Project Selection

三姐妹站点使用同一套源码，构建时通过 `NEXT_PUBLIC_PROJECT_ID` 选择：

- `equal-love`
- `nearly-equal-joy`
- `not-equal-me`

项目注册表在 `src/projects/registry.ts`，当前项目入口在 `src/config/project.ts`。

每个项目的数据文件位于 `src/projects/<project-id>/members.json` 和 `src/projects/<project-id>/songs.json`。

## 5. Image Export

图片导出依赖：

- `html2canvas`: `^1.4.1`

导出流程在 `src/app/page.tsx` 中动态 import `html2canvas`，并捕获隐藏离屏的 `ExportBoard` DOM。

导出配置来自 `src/config/project.ts` 的 `EXPORT_CONFIG`：

- `width`: `1080`
- `height`: `1350`
- `background`: `#ffffff`
- `scale`: `2`

当前 `EXPORT_CONFIG.height` 是配置项，但 `ExportBoard` 当前主要显式使用宽度、背景和 scale，实际高度由导出 DOM 内容布局决定。

## 6. Build And Deployment

Next.js 配置来自 `next.config.ts`：

- `output: "export"`
- `trailingSlash: true`
- `images.unoptimized: true`
- `allowedDevOrigins: ["127.0.0.1"]`

基础 build 链路：

`node scripts/clean-static-export.mjs && next build && node scripts/copy-public-assets.mjs`

Cloudflare Pages 使用三个独立 Pages 项目连接同一个 GitHub repo 和 `main` 分支：

- `npm run build:equal-love` → `out/`
- `npm run build:nearly-equal-joy` → `out/`
- `npm run build:not-equal-me` → `out/`

现有 `mypick.kozueginko.com` 保留给 `equal-love`。

## 7. Scripts

- `npm run dev`: 默认 Next dev，未设置项目时回退 `equal-love`
- `npm run dev:equal-love`
- `npm run dev:nearly-equal-joy`
- `npm run dev:not-equal-me`
- `npm run build`
- `npm run build:equal-love`
- `npm run build:nearly-equal-joy`
- `npm run build:not-equal-me`
- `npm run lint`: lint `src`、`scripts` 和配置文件，不扫描 `public/` 静态资源
- `npm run format`
- `npm run format:check`
- `npm run sync:data`: 同步 =LOVE 数据
- `npm run sync:data:equal-love`: 同步 =LOVE 数据
- `npm run sync:data:nearly-equal-joy`: 同步 ≒JOY 数据
- `npm run sync:data:not-equal-me`: 同步 ≠ME 数据
- `npm run sync:data:all`: 依次同步三个项目数据
- `npm run validate:data`: 校验全部项目数据
- `npm run validate:data:project -- equal-love`: 校验单个项目数据

本地开发脚本使用 `next dev --webpack`。Next.js 16.2.x 的 Turbopack dev 在本项目中可能停在首页首次 `Compiling / ...`，而 webpack dev 已验证可正常返回页面；生产构建仍使用 `next build` 静态导出。

项目化 `dev:*` 与 `build:*` 脚本通过 `scripts/run-project-command.mjs` 注入 `NEXT_PUBLIC_PROJECT_ID`，避免 POSIX 风格环境变量写法在 Windows PowerShell/cmd 下失效。

## 8. Quality Tools

Lint 使用 ESLint：

- 命令：`npm run lint`
- 配置入口：`eslint.config.mjs`

格式化使用 Prettier：

- 检查命令：`npm run format:check`
- 写入命令：`npm run format`

数据同步使用：

- 命令：`npm run sync:data:<project-id>` 或 `npm run sync:data:all`
- 脚本：`scripts/sync-project-discography.py`
- 来源：各项目官网 discography/profile、Uta-Net artist pages，以及项目级 special tracks/overrides

数据校验使用：

- 命令：`npm run validate:data`
- 脚本：`scripts/validate-project-data.mjs`
- 覆盖范围：成员、歌曲、封面、credits、项目严格边界，以及项目级 `live-experiences.json` 的 route、slot、setlist、source、verification status 和 published 门槛。

构建验证使用：

- `npm run build:equal-love`
- `npm run build:nearly-equal-joy`
- `npm run build:not-equal-me`

跨平台项目命令 helper：

- `scripts/run-project-command.mjs`：校验 project id 与目标 script，并用子进程运行 `npm run dev` 或 `npm run build`，同时设置 `NEXT_PUBLIC_PROJECT_ID`。

## 9. Constraints

必须保持 Node `>=20.9.0` 兼容。

必须保持 Next.js 静态导出兼容：`output: "export"`。

必须保持 canonical 尾斜杠路径兼容：`trailingSlash: true`，否则 `/live/<slug>/` 会导出为 `out/live/<slug>.html` 而不是目录式 `index.html`。

必须保持图片静态导出兼容：`images.unoptimized: true`。

不得引入依赖服务端数据库、服务端 session、API Routes 核心路径、动态服务端渲染或 Next.js 运行时图片优化的核心功能。

不得硬编码重复的存储 key、导出尺寸、品牌文案或路径常量。

不得在多个位置维护同一份事实数据。

## 10. Maintenance Rules

依赖升级后必须更新本文件的版本清单，并运行相关验证。

修改 `package.json` scripts 后必须更新脚本命令和构建链路说明。

修改 `next.config.ts` 后必须更新构建与部署约束，并运行构建验证。

修改数据同步或校验脚本后必须更新数据管理和质量工具说明，并运行 `npm run validate:data`。

修改 `src/projects/<project-id>/live-experiences.json`、`src/schema/pick-experience.ts` 或 `src/data/pickExperiences.ts` 后必须运行 `npm run validate:data`，并根据是否影响 UI 运行 lint/type/build 或浏览器回归。

如确需引入服务端运行时能力，必须先更新 `memory/architecture.md` 与本文件，并明确静态导出迁移方案。
