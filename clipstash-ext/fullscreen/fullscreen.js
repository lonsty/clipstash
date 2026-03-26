// ClipStash Extension - Fullscreen page entry point
// Thin wrapper around shared/fullscreen-controller.js with Extension-specific behavior.

import { initLang, getLang, t } from '../utils/i18n.js';
import {
  updateCacheTags, updateCacheContent, updateCacheLanguage,
  getAllTags, getCaches, getTheme,
} from '../utils/storage.js';
import { formatFullTime } from '../utils/time.js';
import {
  sanitizeHtml, showCopyFeedback, convertToPngBlob, applyThemeToDocument,
  applyI18n as sharedApplyI18n, highlightCode,
} from '../shared/dom-utils.js';
import { initFullscreen, renderContent } from '../shared/fullscreen-controller.js';
import { ensureCM6 } from '../shared/cm6-loader.js';

// ===== Platform-Specific: Clipboard =====

async function copyToClipboard(data, btnEl) {
  try {
    if (data.type === 'image' && data.imageDataUrl) {
      const resp = await fetch(data.imageDataUrl);
      const blob = await resp.blob();
      const pngBlob = blob.type === 'image/png'
        ? blob
        : await convertToPngBlob(data.imageDataUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
    } else if (data.type === 'html' && data.htmlContent) {
      const htmlBlob = new Blob([data.htmlContent], { type: 'text/html' });
      const textBlob = new Blob([data.content || ''], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]);
    } else {
      await navigator.clipboard.writeText(data.content || '');
    }
    showCopyFeedback(btnEl, t);
  } catch {
    try {
      await navigator.clipboard.writeText(data.content || '');
    } catch {
      // Silent fail
    }
    showCopyFeedback(btnEl, t);
  }
}

// ===== Platform-Specific: Data Loading =====

async function getCacheById(id) {
  const caches = await getCaches();
  return caches.find(c => c.id === id) || null;
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

  // Load language
  await initLang();

  // Load theme
  try {
    const theme = await getTheme();
    applyThemeToDocument(theme);
  } catch {
    applyThemeToDocument('system');
  }

  // Initialize shared fullscreen controller
  initFullscreen({
    t,
    formatFullTime,
    copyToClipboard,
    sanitizeHtml,
    updateCacheTags,
    updateCacheContent,
    updateCacheLanguage,
    getAllTags,
  });

  // Load the cache item by ID
  const currentItem = await getCacheById(itemId);

  if (!currentItem) {
    document.body.textContent = 'Item not found';
    return;
  }

  // Apply i18n and render
  sharedApplyI18n(t, getLang);
  renderContent(currentItem);

  // Lazy-load CM6 and re-render with syntax highlighting once ready
  ensureCM6().then((cm6) => {
    if (cm6) renderContent(currentItem);
  });
}

init();
