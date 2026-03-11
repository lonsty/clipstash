# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3-alpha] - 2026-03-11

> ⚠️ **Alpha Release**: This version contains experimental fixes that require further validation. Use with caution.

### Security

- **[CRITICAL] SQL injection fix** — escaped LIKE special characters (`\`, `%`, `_`) in `search_caches` function to prevent malicious query injection *(needs validation)*

### Fixed

- **Fullscreen view blank on Windows** — fixed JavaScript string escaping in HTML content generation (replaced template literals with properly escaped single quotes) *(needs validation)*
- **Application freeze after fullscreen** — improved window lifecycle management with delayed show and focus to prevent race conditions *(needs validation)*
- **Inline editor visual consistency** — editing mode now matches view mode layout with proper border spacing and consistent content positioning

### Changed

- **Inline editor design** — removed gradient background, added green border around editor with 4px spacing
- **Editor height behavior** — dynamic height adjustment to match content size (min 80px, max 500px) instead of fixed 240px
- **Error handling** — improved error logging for database operations
- **Window initialization** — fullscreen and sticky windows now start hidden and show after content loads to prevent flashing

## [0.1.2] - 2026-03-10

### Added

- **Syntax highlighting** — code blocks rendered with highlight.js, supporting 30 languages with light/dark themes
- **Inline editing** — edit text content directly in the detail modal
- **Language selector** — choose syntax highlighting language per cache item, stored in SQLite
- **Sticky note window** — open cache content as an always-on-top floating window
- **Detail modal redesign** — header shows metadata with fullscreen, pin, and close buttons; footer shows copy and edit buttons
- **Settings About section** — version info and GitHub link in settings panel
- **Dynamic tray menu** — tray context menu updates text on language switch

### Changed

- **Tray menu simplified** — removed "Cache clipboard", "Open ClipStash", separator; kept "Settings" and "Quit"
- **Database migration** — auto-add `language` column for existing databases
- **Fullscreen view** — redesigned with card-style layout and copy button for all content types (text, image, HTML)
- **Tags display** — tags now show with text truncation and tooltip; hidden when empty
- **Card code preview** — code cards show syntax-highlighted preview with language badge
- **Import/export** — `language` field included in data portability
- **Code cleanup** — removed unused i18n keys, unused `getCaches` wrapper, and unused `BaseDirectory` export

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

[0.1.2]: https://github.com/lonsty/clipstash/releases/tag/v0.1.2
[0.1.1]: https://github.com/lonsty/clipstash/releases/tag/v0.1.1
[0.1.0]: https://github.com/lonsty/clipstash/releases/tag/v0.1.0
