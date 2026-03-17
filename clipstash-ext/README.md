# ClipStash Extension

<p align="center">
  <img src="icons/icon128.png" width="80" height="80" alt="ClipStash">
</p>

<p align="center">
  <strong>Chrome clipboard cache extension</strong><br>
  Stash clipboard content with one click, revisit anytime.
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> | English
</p>

<p align="center">
  <a href="https://github.com/lonsty/clipstash/releases"><img src="https://img.shields.io/github/v/release/lonsty/clipstash?style=flat-square" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-Chrome-lightgrey?style=flat-square" alt="Platform">
</p>

---

## Screenshot

![Light Theme](demo/en-light-theme.png)

## Features

| Feature | Description |
|---------|-------------|
| Clipboard caching | Cache clipboard content on click; supports text, images, HTML rich text |
| Quick copy | One-click copy with "Copied ✓" feedback |
| Inline editing | Floating toolbar to edit text content directly; unsaved changes confirmation |
| Fullscreen view | Open content in a new tab with full-width layout; supports editing, syntax highlighting |
| Syntax highlighting | Code blocks highlighted with 30 language support |
| Tags | Add custom tags to each item, duplicate detection with shake animation |
| Search | Real-time search by content and tags, Ctrl/Cmd+F shortcut |
| Pin | Pin frequently used items to the top |
| Import / export | JSON format, auto-dedup on import |
| Themes | System / Light / Dark modes, instant switch |
| i18n | English & 中文, instant switch |
| Hotkey | Default `Alt+Shift+C`, customizable in `chrome://extensions/shortcuts` |
| Cache limit | Configurable 10 ~ 999 items |

## Installation

### From GitHub Release

1. Download the latest `clipstash-*.zip` from [Releases](https://github.com/lonsty/clipstash/releases).
2. Extract to any directory.
3. Open Chrome, navigate to `chrome://extensions/`.
4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted directory.

### Build from Source

```bash
git clone https://github.com/lonsty/clipstash.git
cd clipstash/clipstash-ext
npm install
npm run build
```

Then follow steps 3-5 above to load the `dist/` directory.

## Usage

| Action | How |
|--------|-----|
| Open popup | Click the extension icon |
| Cache clipboard | Click **Cache clipboard** button or press `Alt+Shift+C` |
| Search | `Ctrl/Cmd+F` or click search bar |
| Copy a cached item | Click the copy button on any card |
| Pin / unpin | Click the pin button on any card |
| Add tags | Open detail modal → click **Add Tag** |
| View full content | Click on a card's content area |
| Settings | Click the settings section in popup |

## Development

```bash
# Generate icons
npm run icons

# Build to dist/
npm run build

# Build and package zip
npm run zip

# Clean build artifacts
npm run clean
```

### Debugging

- **Popup page**: Right-click extension icon → Inspect popup
- **Service Worker**: `chrome://extensions/` → ClipStash card → click "Service Worker" link

## Tech Stack

| Component | Technology |
|-----------|------------|
| Platform | Chrome Manifest V3 |
| Frontend | Vanilla JS (ES Modules) + HTML + CSS |
| Storage | `chrome.storage.local` |
| Clipboard | `navigator.clipboard` API |
| Dependencies | Zero runtime dependencies |

## Project Structure

```
clipstash-ext/
├── manifest.json              # Extension manifest (Manifest V3)
├── popup/
│   ├── popup.html             # Popup page
│   ├── popup.css              # Styles
│   └── popup.js               # UI logic
├── background/
│   └── service-worker.js      # Service Worker
├── offscreen/
│   ├── offscreen.html         # Offscreen document
│   └── offscreen.js           # Clipboard reading
├── fullscreen/
│   ├── fullscreen.html        # Fullscreen page (new tab)
│   ├── fullscreen.css         # Fullscreen styles
│   └── fullscreen.js          # Fullscreen logic
├── utils/
│   ├── storage.js             # Storage wrapper
│   ├── clipboard.js           # Clipboard wrapper
│   ├── time.js                # Relative time formatting
│   ├── i18n.js                # i18n (EN / 中文)
│   └── constants.js           # Shared constants
├── vendor/
│   ├── highlight.min.js       # Syntax highlighting engine
│   ├── hljs-light.css         # Light theme for highlight.js
│   └── hljs-dark.css          # Dark theme for highlight.js
├── icons/                     # Icons (16/48/128px)
├── scripts/
│   ├── build.js               # Build script
│   └── generate-icons.js      # Icon generation
└── dist/                      # Build output
```

## Privacy

- No user data collection
- No network requests
- All data stored locally (`chrome.storage.local`)

## Related

- [ClipStash Desktop](../clipstash-desktop/) — Cross-platform desktop client (Tauri 2.x)

## License

[MIT](LICENSE) © [lonsty](https://github.com/lonsty)
