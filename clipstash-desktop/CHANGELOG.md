# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-03-10

### Fixed

- **Window position on Windows** — smart expand direction based on taskbar position (expand upward when taskbar is at bottom)
- **Fullscreen view blank on Windows** — use correct cross-platform `file:///` URL format for fullscreen HTML window
- **UI frozen after fullscreen** — suppress main window auto-hide while fullscreen window is open, restore on close
- **Temp file cleanup** — auto-delete fullscreen HTML temp files when window is closed

### Changed

- **Chrome extension zip naming** — renamed from `clipstash-v*.zip` to `clipstash-chrome-extension-v*.zip` for clarity

## [0.1.0] - 2026-03-03

### Added

- **Clipboard caching** — support for text, images (PNG / JPEG as Data URL), and HTML rich text
- **Deduplication** — exact text matching for text/HTML, SHA-256 hash for images
- **System tray** — menu bar / taskbar icon with left-click to toggle popover window
- **Tray context menu** — "Cache Clipboard", "Open ClipStash", "Settings...", "Auto-start" (toggle), "Quit"
- **Popover-style window** — borderless rounded window anchored below the tray icon, auto-hides on focus loss
- **Custom title bar** — draggable header with app icon and "ClipStash" title
- **Global hotkey** — `Alt+Shift+C` to cache clipboard from anywhere (customizable)
- **Clipboard monitoring** — optional background polling (500ms) with auto-cache
- **Search** — real-time search with 250ms debounce, filtering by content and tags
- **Tags** — add / remove tags per item, tag suggestions
- **Pin / unpin** — pin important items to the top
- **Detail modal** — click a card to view full content with metadata
- **Fullscreen view** — open content in a separate fullscreen window
- **Cache limit** — configurable from 10 to 999, auto-eviction of oldest unpinned items
- **Import / export** — JSON-based data portability with deduplication on import
- **Theme support** — System (auto) / Light / Dark with full CSS variable system
- **Internationalization** — English and Chinese (中文) with 80+ keys, instant switching
- **Auto-start** — optional launch at system startup
- **System notifications** — configurable desktop notifications on cache events
- **SQLite storage** — local database with WAL mode
- **Cross-platform** — macOS (.app / .dmg), Windows (.exe), Linux (.deb / .AppImage)
- **Privacy** — zero network requests, all data stored locally

[0.1.1]: https://github.com/lonsty/clipstash/releases/tag/v0.1.1
[0.1.0]: https://github.com/lonsty/clipstash/releases/tag/desktop/v0.1.0
