# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-23

### Added

- **Cloud Sync** — sync clipboard data across devices via GitHub Gist; connect with a fine-grained PAT (Gists read/write scope)
- **Sync encryption** — all cloud data is encrypted with AES-256-GCM + gzip compression; users can set an optional sync password for additional security
- **Sync password management** — set, change, or remove the sync encryption password with confirmation validation
- **Auto Sync** — automatically push local changes (debounced) and pull remote updates on popup open (throttled to avoid excessive API calls); togglable in settings
- **Periodic background sync** — uses `chrome.alarms` for 5-minute background sync cycles
- **Quick Sync button** — header shortcut button for one-click manual sync with status indicator (syncing / connected / error)
- **Image cloud sync** — optional sync of image clipboard items to Gist with per-image (5 MB) and total (50 MB) quota enforcement
- **Force Push** — when sync password mismatch is detected, offers a force-push option to overwrite cloud data with local data
- **Cross-device deduplication** — content hash (SHA-256) based dedup prevents duplicate records across devices during sync
- **Trash bin** — soft delete with 30-day retention; items can be restored or permanently deleted; countdown shows days remaining
- **Trash batch actions** — "Restore All" and "Empty Trash" buttons for bulk operations
- **Delete All Permanently** — danger zone action in settings to permanently wipe all data (active + trash)
- **Shared modules** — extracted `shared/` directory with `constants.js`, `messages.js`, `icons.js`, `dom-utils.js`, `fullscreen-controller.js`, `crypto.js` for code reuse between Extension and Desktop
- **Modular architecture** — `popup.js` refactored into modules: `card-renderer.js`, `modal-controller.js`, `trash-panel.js`, `sync-ui.js`, `settings-panel.js`
- **Adaptive time refresh** — card relative timestamps and sync "last sync" time auto-refresh at adaptive intervals based on age

### Changed

- **i18n architecture** — shared `BASE_MESSAGES` + platform-specific `EXT_MESSAGES`; `mergeMessages()` function for composability
- **Time formatting** — delegated to shared `dom-utils.js` with dependency-injected `t()` function
- **Code organization** — `popup.js` reduced from ~1200 lines to ~390 lines via module extraction; `fullscreen.js` now uses shared `fullscreen-controller.js`
- **Service worker** — added `try/catch` around `chrome.action.openPopup()` for robustness in restricted contexts; added periodic sync via `chrome.alarms`
- **Manifest** — added `alarms` permission and `host_permissions` for `https://api.github.com/*`
- **Storage layer** — added trash operations, sync data conversion, pending deletion/restoration tracking, and content hash computation

### Security

- **Encrypted cloud storage** — all sync data stored in GitHub Gist is encrypted regardless of whether the user sets a password

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

### Changed

- **Edit mode redesign** — replaced single toggle button with `enterEditMode()` / `saveEdit()` / `cancelEdit()` three-function architecture
- **Modal footer removed** — copy/edit buttons moved to floating toolbar; meta info moved to bottom status bar
- **Tags section redesign** — inline flow layout with `+` circle button (dashed border); shows "Add tag" text when empty, icon-only when tags exist
- **Language selector relocated** — moved from tags section to status bar right side
- **Toolbar button opacity** — three-level progressive opacity: default 0.25 → content area hover 0.75 → button hover 1
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
- **Hotkey** — Default `Alt+Shift+C`, customizable in `chrome://extensions/shortcuts`
- **Manifest V3** — supports Chrome 104+
- **Zero dependencies** — pure frontend, no runtime dependencies

[0.2.0]: https://github.com/lonsty/clipstash/releases/tag/v0.2.0
[0.1.3]: https://github.com/lonsty/clipstash/releases/tag/v0.1.3
[0.1.2]: https://github.com/lonsty/clipstash/releases/tag/v0.1.2
[0.1.0]: https://github.com/lonsty/clipstash/releases/tag/v0.1.0
