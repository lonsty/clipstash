# ClipStash Desktop

<p align="center">
  <img src="src/icons/icon128.png" width="80" height="80" alt="ClipStash">
</p>

<p align="center">
  <strong>跨平台剪切板缓存管理器</strong><br>
  一键暂存剪切板内容，随时回溯复用。
</p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/lonsty/clipstash/releases"><img src="https://img.shields.io/github/v/release/lonsty/clipstash?style=flat-square" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

---

## 功能

- **剪切板缓存** — 支持文本、图片（PNG / JPEG）、HTML 富文本
- **内容去重** — 图片 SHA-256 哈希，文本精确匹配
- **云同步** — 通过 GitHub Gist 跨设备同步剪贴板数据，支持自动同步
- **回收站** — 软删除，保留 30 天，支持恢复或永久删除
- **系统托盘** — 常驻菜单栏/任务栏，弹出式窗口
- **全局快捷键** — `Alt+Shift+C`（可自定义），一键缓存剪切板
- **剪切板监听** — 可选自动缓存
- **搜索与标签** — 实时搜索、标签、置顶
- **内联编辑** — 在详情弹窗中编辑内容，支持语法高亮、浮动工具栏、未保存变更保护
- **全屏与便签** — 全屏查看内容或以常驻置顶窗口方式打开
- **导入导出** — JSON 格式数据迁移
- **主题** — 跟随系统 / 浅色 / 深色，完整 CSS 变量体系
- **国际化** — English & 中文
- **隐私优先** — 数据本地存储于 SQLite；可选通过 GitHub Gist 云同步（用户自主控制）

## 截图

![深色主题](demo/cn-dark-theme.png)

## 安装

### macOS

1. 从 [Releases](https://github.com/lonsty/clipstash/releases) 下载 `ClipStash_x.x.x_aarch64.dmg`（Apple Silicon）或 `ClipStash_x.x.x_x64.dmg`（Intel）。
2. 打开 `.dmg` 文件，将 **ClipStash** 拖入 **应用程序** 文件夹。
3. 如果 macOS 提示 **"ClipStash 已损坏，无法打开"**，请在终端中执行：
   ```bash
   xattr -cr /Applications/ClipStash.app
   ```
   这是未签名应用的正常现象。也可以前往 **系统设置 → 隐私与安全性**，点击 **仍要打开**。

### Windows

1. 从 [Releases](https://github.com/lonsty/clipstash/releases) 下载 `ClipStash_x.x.x_x64-setup.exe`。
2. 运行安装程序并按提示操作。
3. 需要 Windows 10+ 及 WebView2（大多数系统已预装）。

### Linux

1. 从 [Releases](https://github.com/lonsty/clipstash/releases) 下载 `ClipStash_x.x.x_amd64.deb`（Debian / Ubuntu）或 `ClipStash_x.x.x_amd64.AppImage`（通用）。
2. `.deb` 安装：
   ```bash
   sudo dpkg -i ClipStash_x.x.x_amd64.deb
   ```
3. `.AppImage` 安装：
   ```bash
   chmod +x ClipStash_x.x.x_amd64.AppImage
   ./ClipStash_x.x.x_amd64.AppImage
   ```
4. 需要 `libwebkit2gtk-4.1` 和 `libgtk-3`。

## 使用

| 操作 | 方式 |
|------|------|
| 打开或隐藏窗口 | 左键点击托盘图标 |
| 缓存剪切板 | 点击按钮、快捷键 `Alt+Shift+C` 或托盘菜单 |
| 搜索 | `Ctrl/Cmd+F` 或点击搜索栏 |
| 复制缓存 | 点击卡片上的复制按钮 |
| 置顶 | 点击卡片上的置顶按钮 |
| 查看全文 | 点击卡片内容区域 |
| 编辑内容 | 打开详情弹窗 → 点击浮动工具栏中的编辑按钮 |
| 全屏查看 | 打开详情弹窗 → 点击全屏按钮 |
| 便签窗口 | 打开详情弹窗 → 点击便签按钮 |
| 添加标签 | 打开详情弹窗 → 点击标签区域的 `+` 按钮 |
| 设置 | 点击齿轮图标或托盘菜单 → **设置...** |
| 退出 | 托盘菜单 → **退出** |

> 窗口失去焦点时自动隐藏（弹出式行为）。

## 从源码构建

### 前置依赖

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.77
- 平台特定依赖：
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), WebView2
  - **Linux**: `build-essential`, `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### 步骤

```bash
git clone https://github.com/lonsty/clipstash.git
cd clipstash/clipstash-desktop

# 安装 Node 依赖
npm install

# 开发模式（热重载）
npx tauri dev

# 生产构建
npx tauri build
```

### 构建产物

| 平台 | 路径 |
|------|------|
| macOS | `src-tauri/target/release/bundle/macos/ClipStash.app` |
| macOS DMG | `src-tauri/target/release/bundle/dmg/ClipStash_*.dmg` |
| Windows | `src-tauri/target/release/bundle/nsis/ClipStash_*-setup.exe` |
| Linux DEB | `src-tauri/target/release/bundle/deb/ClipStash_*.deb` |
| Linux AppImage | `src-tauri/target/release/bundle/appimage/ClipStash_*.AppImage` |

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | [Tauri 2.x](https://v2.tauri.app/) |
| 后端 | Rust |
| 前端 | Vanilla JS (ES Modules) + HTML + CSS |
| 数据库 | SQLite（通过 `rusqlite`，WAL 模式） |
| 剪切板 | `arboard`（支持图片） |
| 图标 | 内联 SVG + PNG 应用图标 |

## 项目结构

```
clipstash-desktop/
├── src-tauri/                     # 后端（Rust）
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/              # 窗口权限配置
│   ├── icons/                     # 应用图标
│   └── src/
│       ├── main.rs                # 入口
│       ├── lib.rs                 # 初始化与插件注册
│       ├── tray.rs                # 系统托盘
│       ├── clipboard.rs           # 剪切板读写
│       ├── commands.rs            # Tauri 命令
│       ├── db.rs                  # 数据库层（WAL）
│       ├── sync.rs                # GitHub Gist 云同步
│       ├── hotkey.rs              # 全局快捷键
│       └── monitor.rs             # 剪切板监听（500ms）
├── src/                           # 前端（Vanilla JS）
│   ├── index.html                 # 主页面
│   ├── fullscreen.html            # 全屏查看页面
│   ├── sticky.html                # 便签页面
│   ├── icons/
│   │   └── icon128.png            # 应用图标
│   ├── styles/
│   │   ├── main.css               # 主样式（浅色 / 深色 / 跟随系统）
│   │   └── fullscreen.css         # 全屏查看样式
│   ├── scripts/
│   │   ├── main.js                # 主逻辑（模块编排）
│   │   ├── fullscreen.js          # 全屏查看逻辑
│   │   ├── sticky.js              # 便签逻辑
│   │   └── modules/
│   │       ├── card-renderer.js   # 卡片列表渲染
│   │       ├── modal-controller.js # 详情弹窗逻辑
│   │       ├── settings-panel.js  # 设置面板
│   │       ├── sync-ui.js         # 同步界面及 GitHub Gist 配置
│   │       └── trash-panel.js     # 回收站面板
│   ├── shared/                    # 共享模块（从根目录 shared/ 同步）
│   │   ├── constants.js           # 共享常量
│   │   ├── dom-utils.js           # DOM 工具函数
│   │   ├── fullscreen-controller.js # 全屏页面控制器
│   │   ├── icons.js               # SVG 图标定义
│   │   └── messages.js            # 基础国际化翻译
│   └── utils/
│       ├── bridge.js              # Tauri 调用封装
│       ├── i18n.js                # 国际化（EN / 中文）
│       ├── logger.js              # 前端日志转发（tauri-plugin-log）
│       ├── storage.js             # 存储封装
│       ├── sync.js                # 同步客户端（前端）
│       └── time.js                # 相对时间格式化
├── package.json
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## 相关项目

- [ClipStash Extension](../clipstash-ext/) — Chrome 浏览器扩展（原始版本）

> **注意**：桌面端应用图标由 `clipstash-ext/icons/icon128.png` 生成。更新源图标后需运行 `node scripts/generate-icons.js`。

## 许可

[MIT](LICENSE) © [lonsty](https://github.com/lonsty)
