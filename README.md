# TDX Editor

TDX Editor 是一个基于 HTML 的通达信 `.tdx` 公式在线编辑器，支持实时语法高亮、函数说明、诊断提醒和自动补全。

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

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | React + TypeScript + Vite |
| 编辑器内核 | CodeMirror 6 |
| 语言核心 | `@tdx/language` 本地 workspace 包 |
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

## 常用命令

```bash
npm test      # 运行 TDX 语言核心测试
npm run lint  # 代码检查
npm run build # 构建 GitHub Pages 静态产物
```

## 项目结构

```text
.
├── packages/tdx-language   # TDX 语言核心，本地 workspace 包
├── src/components          # React 组件
├── src/hooks               # 文件操作、自动保存等 hooks
├── src/tdx                 # CodeMirror 集成和示例公式
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
