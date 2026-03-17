# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-03-20

### Added

- **Fullscreen page** — open cache content in a new browser tab with full-width layout; supports text, code (syntax highlighting), images, and HTML
- **Inline editing (fullscreen)** — edit text content directly in fullscreen page with real-time syntax highlighting preview, auto-grow textarea, and synchronized scrolling
- **Floating toolbar** — copy and edit buttons float at top-right of content area with backdrop blur; three-level progressive opacity (0.25 → 0.75 → 1) to avoid obscuring text
- **Edit mode indicator bar** — header switches to green "✏️ Editing" bar with explicit Cancel / Save buttons when editing
- **Unsaved changes confirmation** — cancelling edit with unsaved changes shows a confirmation dialog
- **Card ID badge** — modal header displays `#shortID` (random hex suffix) in monospace badge style
- **Tag duplicate detection** — input shakes with red border and "Tag already exists" hint when adding a duplicate tag
- **Tag input auto-close** — tag input field auto-closes on blur (150ms delay to avoid click conflicts)
- **Constants module** — extracted all magic numbers and config values to `constants.js`
- **Error handling** — comprehensive `console.error` logging for all storage operations (`addCache`, `removeCache`, `clearAllCaches`, `updateCacheTags`, `togglePin`, `updateCacheContent`, `updateCacheLanguage`, `saveTheme`, `exportCaches`, `importCaches`), clipboard reading (`readClipboardViaScript`, `readClipboardViaOffscreen`), and cache workflow (`cacheClipboard` with red ✗ badge on failure)
- **Public API** — exported `getCaches` function for external use
- **i18n keys** — added `fullscreen`, `edit`, `editing`, `cancelEdit`, `saveEdit`, `save`, `syntaxLang`, `addTagHint`, `tagExists`, `unsavedTitle`, `unsavedDesc`, `discardChanges`

### Changed

- **Edit mode redesign** — replaced single toggle button with `enterEditMode()` / `saveEdit()` / `cancelEdit()` three-function architecture
- **Modal footer removed** — copy/edit buttons moved to floating toolbar; meta info moved to bottom status bar
- **Tags section redesign** — inline flow layout with `+` circle button (dashed border); shows "Add tag" text when empty, icon-only when tags exist
- **Language selector relocated** — moved from tags section to status bar right side
- **Multi-page style unification** — extracted shared CSS classes (`.content-toolbar`, `.toolbar-btn`) across modal and fullscreen pages
- **Toolbar button opacity** — three-level progressive opacity: default 0.25 → content area hover 0.75 → button hover 1
- **Code refactoring** — unified error handling patterns across all storage functions
- **Clipboard API** — prioritize modern `navigator.clipboard` API with `execCommand` fallback
- **Code organization** — imported constants from centralized module for better maintainabilityext-v0.1.3
- **Build script** — added `fullscreen/` directory to build copy list

### Security

- **[CRITICAL] SQL injection fix** — escaped LIKE special characters (`\`, `%`, `_`) in search queries
- **[CRITICAL] XSS prevention** — added HTML sanitization with DOMPurify for safe rendering of HTML content

## [0.1.2] - 2026-03-10

### Added

- **Syntax highlighting** — code blocks rendered with highlight.js, supporting 30 languages with light/dark themes
- **Inline editing** — edit text content directly in the detail modal
- **Language selector** — choose syntax highlighting language per cache item
- **Detail modal redesign** — header shows metadata, action buttons (fullscreen, close) moved to header; footer shows copy and edit buttons
- **Settings About section** — version info and GitHub link in settings panel
- **Right-click context menu** — "Settings" entry on extension icon context menu

### Fixed

- **Highlight.js not loading** — vendor files were missing from build output; added `vendor/` to build script copy list

### Changed

- **Context menu simplified** — removed "Cache clipboard" and "Open ClipStash" context menu items
- **Tags display** — tags now show with text truncation and tooltip; hidden when empty
- **Card code preview** — code cards show syntax-highlighted preview with language badge
- **Import/export** — `language` field included in data portability
- **Code cleanup** — removed unused i18n keys and redundant fallback code

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

[0.1.3]: https://github.com/lonsty/clipstash/releases/tag/v0.1.3
[0.1.2]: https://github.com/lonsty/clipstash/releases/tag/v0.1.2
[0.1.0]: https://github.com/lonsty/clipstash/releases/tag/v0.1.0
