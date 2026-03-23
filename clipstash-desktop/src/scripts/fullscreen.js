// ClipStash Desktop - Fullscreen page entry point
// Thin wrapper around shared/fullscreen-controller.js with Tauri-specific behavior.

import { initLang, getLang, t } from '../utils/i18n.js';
import {
  updateCacheTags, updateCacheContent, updateCacheLanguage,
  getAllTags, getSettings, getTheme,
} from '../utils/storage.js';
import { formatFullTime } from '../utils/time.js';
import { writeClipboard, getCacheById } from '../utils/bridge.js';
import {
  showCopyFeedback, applyThemeToDocument,
  applyI18n as sharedApplyI18n,
} from '../shared/dom-utils.js';
import { initFullscreen, renderContent } from '../shared/fullscreen-controller.js';

// ===== Platform-Specific: Clipboard =====

async function copyToClipboard(data, btnEl) {
  try {
    const type = data.type || 'text';
    await writeClipboard(
      type,
      data.content || '',
      data.htmlContent || null,
      data.imageDataUrl || null
    );
    showCopyFeedback(btnEl, t);
  } catch {
    // Fallback
    try {
      await navigator.clipboard.writeText(data.content || '');
      showCopyFeedback(btnEl, t);
    } catch {
      // Silent fail
    }
  }
}

// ===== Platform-Specific: HTML Sanitization =====
// Desktop does not bundle DOMPurify; render HTML directly.

function desktopSanitizeHtml(html) {
  return html;
}

// ===== Init =====

async function init() {
  // Get item ID from URL query string
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('id');
  if (!itemId) {
    document.body.textContent = 'Error: No item ID provided';
    return;
  }

  // Load settings for language & theme
  const settings = await getSettings();
  initLang(settings.language || 'en');

  const theme = await getTheme();
  applyThemeToDocument(theme, 'vendor');

  // Initialize shared fullscreen controller
  initFullscreen({
    t,
    formatFullTime,
    copyToClipboard,
    sanitizeHtml: desktopSanitizeHtml,
    updateCacheTags,
    updateCacheContent,
    updateCacheLanguage,
    getAllTags,
  });

  // Load the cache item by ID
  let currentItem;
  try {
    currentItem = await getCacheById(itemId);
  } catch (err) {
    document.body.textContent = `Error loading item: ${err}`;
    return;
  }

  if (!currentItem) {
    document.body.textContent = 'Item not found';
    return;
  }

  // Apply i18n and render
  sharedApplyI18n(t, getLang);
  renderContent(currentItem);
}

init();
