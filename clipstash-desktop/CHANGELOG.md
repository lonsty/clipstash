# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-03-20

### Added

- **Logging system** — integrated `tauri-plugin-log` for unified runtime logging across Rust backend and JavaScript frontend; logs are written to files (`LogDir`), stdout, and the Webview console; key events logged include: app startup, window creation/destruction, hotkey registration, clipboard monitor lifecycle, import/export operations, and errors
- **Sticky note page** — dedicated `sticky.html` + `sticky.js` page loaded via `WebviewUrl::App`; the sticky window now receives `item_id` and fetches data through Tauri commands, consistent with the fullscreen window architecture
- **Floating toolbar** — copy and edit buttons float at top-right of content area with backdrop blur, auto-hide in edit mode
- **Edit mode indicator bar** — header switches to green "✏️ Editing" bar with explicit Cancel / Save buttons when editing
- **Unsaved changes confirmation** — cancelling edit with unsaved changes shows a confirmation dialog
- **Card ID badge** — modal header displays `#shortID` (random hex suffix) in monospace badge style
- **Tag duplicate detection** — input shakes with red border and "Tag already exists" hint when adding a duplicate tag
- **Tag input auto-close** — tag input field auto-closes on blur (150ms delay to avoid click conflicts)

### Changed

- **Edit mode redesign** — replaced single toggle button with `enterEditMode()` / `saveEdit()` / `cancelEdit()` three-function architecture
- **Edit mode button colors** — Cancel/Save use green (`--success`) theme to distinguish from grey utility buttons (fullscreen/sticky/close)
- **Modal footer removed** — copy/edit buttons moved to floating toolbar; meta info moved to bottom status bar
- **Tags section redesign** — inline flow layout with `+` circle button (dashed border); shows "Add tag" text when empty, icon-only when tags exist
- **Language selector relocated** — moved from tags section to status bar right side
- **Header compact padding** — modal header padding reduced from `10px 16px` to `6px 16px`
- **Multi-page style unification** — extracted shared CSS classes (`.content-toolbar`, `.content-text`, `.content-html`, `.toolbar-btn`) across modal, fullscreen, and sticky pages; sticky note inline styles now use CSS variables
- **Fullscreen header streamlined** — removed duplicate meta info from header (kept only in bottom status bar); fixed header height to 44px for consistent edit/view transitions
- **Close to tray setting removed** — removed non-functional `closeToTray` toggle from settings UI (behavior unchanged: window always hides on focus loss)
- **Editor height behavior** — dynamic height adjustment to match content (uses `max(viewHeight, scrollHeight, 80)`) with auto-grow on input
- **Error handling** — improved error logging for database operations
- **Toolbar button opacity** — three-level progressive opacity: default 0.25 → content area hover 0.75 → button hover 1; reduces text obstruction
- **Window capabilities** — added `sticky_*` window permissions to capabilities config

### Fixed

- **Application freeze after fullscreen (Windows)** — replaced `Mutex<bool>` with `AtomicUsize` reference counter for `suppress_auto_hide` to eliminate deadlocks in multi-window scenarios; moved window creation (`WebviewWindowBuilder::build()`) to a background thread so the Tauri command handler returns immediately, preventing event loop deadlock when the new WebView2 instance invokes commands during initialization
- **GitHub Actions Windows build failure** — upgraded `tauri-apps/tauri-action` from `@v0` to `@v0.5`; removed global `APPLE_SIGNING_IDENTITY` and `TAURI_SIGNING_IDENTITY` environment variables
- **Fullscreen view blank on Windows** — fixed JavaScript string escaping in HTML content generation
- **Sticky note blank on Windows** — replaced `data:` URI approach with a dedicated `sticky.html` page loaded via `WebviewUrl::App`; the sticky window now receives `item_id` instead of raw HTML and fetches data through Tauri commands, consistent with the fullscreen window architecture
- **Inline editor visual consistency** — editing mode now matches view mode layout; text width, position, and scrolling behavior are identical
- **Editor cursor alignment** — synchronized textarea and syntax highlight layer overflow behavior and tab-size
- **Fullscreen toolbar hover** — fixed toolbar buttons not appearing on hover in fullscreen page
- **Sticky note horizontal scrollbar** — disabled horizontal scrolling; all content (text, code, HTML) auto-wraps to fit window width
- **Delete button in edit mode** — now checks for unsaved changes before deleting an item being edited
- **Missing i18n translations** — added `editing`, `cancelEdit`, `saveEdit`, `addTagHint`, `tagExists` to both EN/ZH locales

### Security

- **[CRITICAL] SQL injection fix** — added `ESCAPE '\\'` clause to LIKE conditions in `search_caches` to prevent query injection
- **XSS sanitization** — fullscreen and sticky note HTML injection now sanitizes `<script>` tags and escapes `</script>` in JS string literals

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

[0.1.3]: https://github.com/lonsty/clipstash/releases/tag/v0.1.3
[0.1.2]: https://github.com/lonsty/clipstash/releases/tag/v0.1.2
[0.1.1]: https://github.com/lonsty/clipstash/releases/tag/v0.1.1
[0.1.0]: https://github.com/lonsty/clipstash/releases/tag/v0.1.0
