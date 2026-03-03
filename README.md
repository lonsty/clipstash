# ClipStash

<p align="center">
  <img src="clipstash-ext/icons/icon128.png" width="80" height="80" alt="ClipStash">
</p>

<p align="center">
  <strong>Clipboard cache — stash clipboard content with one click, revisit anytime.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> | English
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
</p>

---

This repository contains two implementations of ClipStash:

| Project | Description | Tech Stack |
|---------|-------------|------------|
| [**clipstash-ext**](clipstash-ext/) | Chrome browser extension | Manifest V3, Vanilla JS, chrome.storage.local |
| [**clipstash-desktop**](clipstash-desktop/) | Cross-platform desktop app | Tauri 2.x, Rust, Vanilla JS, SQLite |

The two projects are **independent** in terms of code and runtime — each can be developed, built, and used on its own. The only cross-project dependency is that `clipstash-desktop` reads the icon source from `clipstash-ext/icons/icon128.png` when generating app icons (build-time only).

### Browser Extension

![ClipStash Extension](clipstash-ext/demo/en-light-theme.png)

### Desktop App

![ClipStash Desktop](clipstash-desktop/demo/en-light-theme.png)

## Quick Links

- **Extension** — [README](clipstash-ext/README.md) · [CHANGELOG](clipstash-ext/CHANGELOG.md)
- **Desktop** — [README](clipstash-desktop/README.md) · [CHANGELOG](clipstash-desktop/CHANGELOG.md)

## License

[MIT](LICENSE) © [lonsty](https://github.com/lonsty)
