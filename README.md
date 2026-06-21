# TDX Editor

TDX Editor 是一个基于 React、CodeMirror 和 Tauri 的通达信 `.tdx` 公式编辑器，支持网页版在线使用，也可以构建为 macOS/Windows/Linux 桌面应用。

在线使用：<https://sjjliqpl.github.io/tdx-editor/>

## 功能特性

- **实时语法高亮**：在编辑区直接高亮 TDX 系统函数、行情字段、变量、输出线、绘图函数、绘图属性、颜色、注释和字符串。
- **函数说明提示**：鼠标悬停在 `EMA`、`MA`、`REF`、`STICKLINE` 等函数上时显示说明、用法、分类和来源。
- **自动补全**：支持系统函数、行情字段、绘图属性、颜色常量以及当前文件中已定义变量的补全。
- **诊断提醒**：提示缺少分号、中文标点、括号不匹配、未知函数、未定义变量、参数数量和潜在除零风险。
- **颜色提示**：支持 `COLOR00D7FF`、`COLORRED`、`RGB(...)` 等颜色识别，并在编辑器中显示颜色标记。
- **文件操作**：支持打开、保存、另存为 `.tdx` 文件；浏览器不支持 File System Access API 时自动降级为上传和下载。
- **自动保存**：内容自动保存到浏览器 `localStorage`，刷新后可恢复。
- **深浅主题**：提供深色和浅色编辑界面。
- **桌面系统集成**：Tauri 桌面版提供系统菜单、原生打开/保存对话框、多窗口文档、最近文件、拖拽打开、未保存关闭确认和 `.tdx` 文件关联。
- **统一代码库**：网页版和桌面版复用同一套 React 编辑器、TDX 语言核心和平台适配层。

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | React + TypeScript + Vite |
| 编辑器内核 | CodeMirror 6 |
| 语言核心 | `@tdx/language` 本地 workspace 包 |
| 桌面壳 | Tauri v2 |
| 图标 | `lucide-react` |
| 部署 | GitHub Actions + GitHub Pages |

## 与 tdx-highlight 的关系

本项目参考并复用了自维护项目 [sjjliqpl/tdx-highlight](https://github.com/sjjliqpl/tdx-highlight) 的 `packages/tdx-language` 语言核心。

复用范围包括：

- tokenizer / parser
- 函数目录和颜色目录
- `lintTdx` 诊断能力
- `getCompletions` 自动补全能力
- `getHover` 函数说明能力
- `collectColors` 颜色解析能力

`tdx-highlight` 的 `tdx-html` 静态 HTML 高亮器没有作为编辑器内核使用。TDX Editor 使用 CodeMirror 的 Decoration、Lint、Autocomplete 和 Hover Tooltip 机制，让高亮、提醒和补全直接发生在可编辑区域中。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:5173/tdx-editor/
```

如果端口被占用，Vite 会自动使用下一个可用端口。

## 桌面版开发

桌面版使用 Tauri v2，前端仍由 Vite 提供。首次运行前需要安装 Rust 和对应平台的 Tauri 构建依赖。

```bash
npm install
npm run desktop:dev
```

构建桌面安装包：

```bash
npm run desktop:build
```

macOS 构建完成后，产物位于：

```text
src-tauri/target/release/bundle/macos/TDX Editor.app
src-tauri/target/release/bundle/dmg/TDX Editor_0.0.0_aarch64.dmg
```

桌面版会把页面文件工具栏移到系统菜单中，并支持每个文件独立窗口。通过系统双击或“打开方式”打开 `.tdx` 文件时，会复用干净的启动占位窗口，避免同时出现空白窗口和文件窗口。

## 常用命令

```bash
npm test              # 运行 TDX 语言核心测试
npm run lint          # 代码检查
npm run build         # 构建 GitHub Pages 静态产物
npm run desktop:dev   # 启动 Tauri 桌面开发环境
npm run desktop:build # 构建 Tauri 桌面应用
```

## 项目结构

```text
.
├── packages/tdx-language   # TDX 语言核心，本地 workspace 包
├── src-tauri               # Tauri v2 桌面壳、菜单、文件命令和打包配置
├── src/components          # React 组件
├── src/hooks               # 文档状态、自动保存等 hooks
├── src/platform            # Web/Tauri 文件平台适配层
├── src/tdx                 # CodeMirror 集成和示例公式
├── src/types               # 编辑器文档、桌面命令等共享类型
└── .github/workflows       # GitHub Pages 部署流程
```

## 部署

项目 push 到 `main` 后会触发 GitHub Actions：

1. 安装依赖
2. 运行语言核心测试
3. 运行 ESLint
4. 构建 `dist`
5. 发布到 GitHub Pages

Pages 地址为：

<https://sjjliqpl.github.io/tdx-editor/>

## 许可证

MIT
