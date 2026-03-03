# ClipStash

<p align="center">
  <img src="clipstash-ext/icons/icon128.png" width="80" height="80" alt="ClipStash">
</p>

<p align="center">
  <strong>剪切板缓存 — 一键暂存剪切板内容，随时回溯复用。</strong>
</p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
</p>

---

本仓库包含 ClipStash 的两个实现：

| 项目 | 说明 | 技术栈 |
|------|------|--------|
| [**clipstash-ext**](clipstash-ext/) | Chrome 浏览器扩展 | Manifest V3, Vanilla JS, chrome.storage.local |
| [**clipstash-desktop**](clipstash-desktop/) | 跨平台桌面客户端 | Tauri 2.x, Rust, Vanilla JS, SQLite |

两个项目在代码和运行时上**相互独立**，可以单独开发、构建和使用。唯一的跨项目依赖是 `clipstash-desktop` 在生成应用图标时会读取 `clipstash-ext/icons/icon128.png` 作为源图（仅构建时）。

### 浏览器扩展

![ClipStash 扩展](clipstash-ext/demo/cn-dark-theme.png)

### 桌面应用

![ClipStash 桌面版](clipstash-desktop/demo/cn-dark-theme.png)

## 快速链接

- **扩展** — [README](clipstash-ext/README.zh-CN.md) · [CHANGELOG](clipstash-ext/CHANGELOG.zh-CN.md)
- **桌面** — [README](clipstash-desktop/README.zh-CN.md) · [CHANGELOG](clipstash-desktop/CHANGELOG.zh-CN.md)

## 许可

[MIT](LICENSE) © [lonsty](https://github.com/lonsty)
