# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-03

### Added

- **Popup panel** — click extension icon to open
- **Cache clipboard button** — one-click cache with success / duplicate / empty feedback
- **Clipboard caching** — text, images (PNG / JPEG), HTML rich text
- **Deduplication** — identical content is not cached twice
- **Hotkey** — `Alt+Shift+C` to cache clipboard directly (no popup), badge feedback for new (green ✓) and duplicate (yellow ✓)
- **Context menu** — "Cache clipboard" and "Open ClipStash"
- **Cache list** — thumbnail display, relative time, character count
- **Quick copy** — one-click copy with "Copied ✓" feedback
- **Fullscreen view** — modal + new tab fullscreen for images, long text, and HTML
- **Delete** — single delete (with confirmation) and clear all (disabled when empty)
- **Cache limit** — configurable 10 ~ 999 (default 100), auto-save on blur
- **Tags** — add / remove custom tags per item
- **Search** — real-time search by content and tags (250ms debounce), Ctrl/Cmd+F shortcut
- **Infinite scroll** — default 12 items, auto-load on scroll
- **Stats** — cache count / limit, search matches, storage usage
- **Pin** — pin items to the top with yellow left border
- **Import / export** — JSON format, auto-dedup on import with stats
- **Settings panel** — cache limit, language switch, data import/export section
- **Themes** — System / Light / Dark modes, instant switch
- **i18n** — English & 中文, instant switch
- **Fixed header** — title bar, search bar, stats bar pinned to top; list scrolls independently
- **Card hover effect** — lift + deeper shadow on hover
- **GitHub link** — icon button in popup header
- **Special page fallback** — graceful handling of restricted pages
- **Manifest V3** — supports Chrome 104+
- **Zero dependencies** — pure frontend, no runtime dependencies, no network requests

[0.1.0]: https://github.com/lonsty/clipstash/releases/tag/ext/v0.1.0
