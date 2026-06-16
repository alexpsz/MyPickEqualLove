# Tech Stack

## 1. 运行环境

当前 Node.js 要求来自 `package.json`：

- `node`: `>=20.9.0`

包管理使用 npm，仓库包含 `package-lock.json`。

## 2. 框架与语言

当前核心框架与语言来自 `package.json`：

- `next`: `^16.2.7`
- `react`: `^19.2.7`
- `react-dom`: `^19.2.7`
- `typescript`: `^6.0.3`

Next.js 使用 App Router，页面入口在 `src/app/`。

TypeScript 配置来自 `tsconfig.json`，关键设置包括：

- `strict: true`
- `moduleResolution: "bundler"`
- `jsx: "react-jsx"`
- `target: "ES2017"`
- `module: "esnext"`
- `resolveJsonModule: true`
- `isolatedModules: true`
- `paths: { "@/*": ["./src/*"] }`

## 3. 样式系统

当前样式系统使用 Tailwind CSS：

- `tailwindcss`: `^4.3.0`
- `@tailwindcss/postcss`: `^4.3.0`
- `@tailwindcss/oxide-darwin-arm64`: `^4.3.1`，当前为 optional dependency

全局样式入口是 `src/app/globals.css`。

组件主要使用 Tailwind className 和少量内联样式。导出画布 `ExportBoard` 使用内联样式确保 `html2canvas` 捕获稳定。

## 4. 图片导出

图片导出依赖：

- `html2canvas`: `^1.4.1`

导出流程在 `src/app/page.tsx` 中动态 import `html2canvas`，并捕获隐藏离屏的 `ExportBoard` DOM。

导出配置来自 `src/config/equalLove.ts` 的 `EXPORT_CONFIG`：

- `width`: `1080`
- `height`: `1350`
- `background`: `#ffffff`
- `scale`: `2`

当前 `EXPORT_CONFIG.height` 是配置项，但 `ExportBoard` 当前主要显式使用宽度、背景和 scale，实际高度由导出 DOM 内容布局决定。

## 5. 数据管理

当前无后端数据库。

静态数据文件：

- `src/data/equal-love-songs.json`
- `src/data/equal-love-members.json`

运行时派生模块：

- `src/data/songs.ts`

`src/data/songs.ts` 派生 `SONGS`、`SONGS_BY_ID`、`MEMBERS`、`MEMBERS_BY_ID`、`RELEASE_TYPES`、`TRACK_TYPES`、`RELEASE_YEARS`、`TAGS`。

浏览器本地状态：

- `STORAGE_KEYS.picks` 保存用户选择。
- `STORAGE_KEYS.options` 保存导出选项。

## 6. 构建与部署

当前 Next.js 配置来自 `next.config.ts`：

- `output: "export"`
- `images.unoptimized: true`
- `allowedDevOrigins: ["127.0.0.1"]`

当前 build 链路来自 `package.json`：

`node scripts/clean-static-export.mjs && next build && node scripts/copy-public-assets.mjs`

`scripts/clean-static-export.mjs` 清理 `out/`。

`next build` 生成静态导出产物。

`scripts/copy-public-assets.mjs` 将 `.next/static` 和 `public/` 资源同步到 `out/`。

部署必须保持静态站点兼容，不能引入依赖服务端运行时的核心功能，除非先更新架构文档并确认部署方式变化。

## 7. 脚本命令

当前 npm scripts 来自 `package.json`：

- `npm run dev`: `next dev`
- `npm run build`: `node scripts/clean-static-export.mjs && next build && node scripts/copy-public-assets.mjs`
- `npm run start`: `next start`
- `npm run lint`: `eslint`
- `npm run format`: `prettier --write .`
- `npm run format:check`: `prettier --check .`
- `npm run sync:data`: `python3 scripts/sync-equal-love-discography.py`
- `npm run validate:data`: `node scripts/validate-equal-love-data.mjs`

## 8. 依赖清单

生产依赖：

- `html2canvas`: `^1.4.1`
- `next`: `^16.2.7`
- `react`: `^19.2.7`
- `react-dom`: `^19.2.7`

开发依赖：

- `@tailwindcss/postcss`: `^4.3.0`
- `@types/node`: `^25.9.1`
- `@types/react`: `^19.2.16`
- `@types/react-dom`: `^19.2.3`
- `eslint`: `^9.39.4`
- `eslint-config-next`: `^16.2.7`
- `eslint-plugin-import`: `^2.32.0`
- `eslint-plugin-jsx-a11y`: `^6.10.2`
- `eslint-plugin-react-hooks`: `^7.1.1`
- `globals`: `^17.6.0`
- `prettier`: `^3.8.3`
- `tailwindcss`: `^4.3.0`
- `typescript`: `^6.0.3`
- `typescript-eslint`: `^8.60.1`

可选依赖：

- `@tailwindcss/oxide-darwin-arm64`: `^4.3.1`

## 9. 质量工具

Lint 使用 ESLint：

- 命令：`npm run lint`
- 配置入口：`eslint.config.mjs`

格式化使用 Prettier：

- 检查命令：`npm run format:check`
- 写入命令：`npm run format`

数据校验使用：

- `npm run validate:data`
- 脚本：`scripts/validate-equal-love-data.mjs`

构建验证使用：

- `npm run build`

## 10. 技术约束

必须保持 Node `>=20.9.0` 兼容。

必须保持 Next.js 静态导出兼容：`output: "export"`。

必须保持图片静态导出兼容：`images.unoptimized: true`。

不得引入依赖服务端数据库、服务端 session、API Routes 核心路径、动态服务端渲染或 Next.js 运行时图片优化的核心功能。

不得硬编码重复的存储 key、导出尺寸、品牌文案或路径常量。

不得在多个位置维护同一份事实数据。

不得复制依赖库源码到项目内改造使用。

## 11. 变更维护规则

依赖升级后必须更新本文件的版本清单，并运行相关验证。

修改 `package.json` scripts 后必须更新脚本命令和构建链路说明。

修改 `next.config.ts` 后必须更新构建与部署约束，并运行 `npm run build`。

修改 `tsconfig.json` 后必须更新 TypeScript 配置说明，并运行 `npm run lint` 和必要的构建验证。

修改数据同步或校验脚本后必须更新数据管理和质量工具说明，并运行 `npm run validate:data`。

如确需引入服务端运行时能力，必须先更新 `memory/architecture.md` 与本文件，并明确静态导出迁移方案。
