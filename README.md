# Fish Reader (摸鱼阅读器)

一款专为“摸鱼”设计的轻量级、沉浸式本地 TXT 文本阅读器。
基于 Electron 和 Vue 3 开发，提供无边框、背景透明且始终置顶的窗口体验，让你在工作间隙也能隐秘、舒适地进行阅读。

## ✨ 核心特性 (Features)

- **无边框设计、背景透明、始终置顶，完美融入桌面环境。**
- **本地读取`.txt` 文本文件，自动记忆上次的阅读进度。**
- **使用全局快捷键进行翻页。**：
- **右键唤出菜单，可自由调整字号、字体颜色、背景颜色以及重新绑定快捷键。**
- **所有的自定义设置均会在本地保存。**

## 🛠 技术栈 (Tech Stack)

- **桌面端容器**：[Electron](https://www.electronjs.org/)
- **前端框架**：[Vue 3](https://vuejs.org/) (Composition API)
- **开发语言**：[TypeScript](https://www.typescriptlang.org/)
- **构建工具**：[Vite](https://vitejs.dev/) & [electron-vite](https://electron-vite.org/)
- **状态管理**：[Pinia](https://pinia.vuejs.org/)
- **持久化存储**：`electron-store`
- **文本与编码处理**：`iconv-lite` (解码) + `jschardet` (编码自动侦测)

## 📖 使用方法 (Usage)

### 1. 基础操作

- **打开菜单**：在阅读器窗口上 **右键点击**，即可唤出控制菜单。
- **导入书籍**：在菜单中点击“打开文件”，选择本地的 `.txt` 小说文件即可开始阅读。
- **拖拽窗口**：鼠标左键按住阅读器的文字区域即可自由拖动窗口位置。
- **调整大小**：将鼠标移动至窗口边缘，出现箭头指示时拖动即可调整窗口尺寸。

### 2. 快捷键翻页

- 默认情况下，按下键盘的 **上方向键 (`ArrowUp`)** 为上一页，**下方向键 (`ArrowDown`)** 为下一页。
- _提示：该快捷键为全局生效，即便您正在操作其他软件，也能悄悄翻页。_

### 3. 个性化设置

- 在右键菜单中，您可以：
  - 调整文字字号。
  - 更改文字颜色与背景颜色（支持输入 HEX 色值，如 `#333333`）。
  - 自定义上一页与下一页的全局快捷键。
- _注意：所有设置修改后会即时生效，并自动永久保存。_

## 📦 项目配置与运行 (Setup & Build)

### 推荐 IDE 环境

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

### 安装依赖

```bash
$ npm install
```

### 本地开发调试

```bash
$ npm run dev
```

### 构建与打包

```bash
# 构建 Windows 安装包
$ npm run build:win

# 构建 macOS 安装包
$ npm run build:mac

# 构建 Linux 安装包
$ npm run build:linux
```
