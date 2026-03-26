// ClipStash Sticky Note Page - Interaction logic
// A lightweight always-on-top window that displays a single clipboard item.
// Loads item data via Tauri invoke.

import { getSettings, getTheme } from '../utils/storage.js';
import { initLang, t } from '../utils/i18n.js';
import { writeClipboard, getCacheById } from '../utils/bridge.js';
import { highlightCode, applyThemeToDocument, sanitizeHtml, showCopyFeedback } from '../shared/dom-utils.js';
import { ensureCM6 } from '../shared/cm6-loader.js';

// ===== DOM References =====

const stickyContent = document.getElementById('sticky-content');
const btnCopy = document.getElementById('btn-copy');

// ===== State =====

let currentItem = null;

// ===== Copy =====

async function copyToClipboard() {
  if (!currentItem) return;
  try {
    await writeClipboard(
      currentItem.type || 'text',
      currentItem.content || '',
      currentItem.htmlContent || null,
      currentItem.imageDataUrl || null
    );
    showCopyFeedback(btnCopy, t);
  } catch {
    try {
      await navigator.clipboard.writeText(currentItem.content || '');
      showCopyFeedback(btnCopy, t);
    } catch {
      // Silent fail
    }
  }
}

// ===== Render Content =====

function renderContent(item) {
  const type = item.type || 'text';

  if (type === 'image' && item.imageDataUrl) {
    stickyContent.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'content-image';
    const img = document.createElement('img');
    img.src = item.imageDataUrl;
    img.alt = 'Image';
    wrap.appendChild(img);
    stickyContent.appendChild(wrap);
  } else if (type === 'html' && item.htmlContent) {
    stickyContent.innerHTML = `<div class="content-html">${sanitizeHtml(item.htmlContent)}</div>`;
  } else {
    const pre = document.createElement('pre');
    pre.className = 'content-text';
    const code = document.createElement('code');
    if (item.language) {
      code.innerHTML = highlightCode(item.content || '', item.language);
      code.className = '';
    } else {
      code.textContent = item.content || '';
    }
    pre.appendChild(code);
    stickyContent.innerHTML = '';
    stickyContent.appendChild(pre);
  }
}

// ===== Event Listeners =====

btnCopy.addEventListener('click', copyToClipboard);

// ===== Init =====

async function init() {
  // Get item ID from URL query string
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('id');
  if (!itemId) {
    stickyContent.textContent = 'Error: No item ID provided';
    return;
  }

  // Load settings for language & theme
  const settings = await getSettings();
  initLang(settings.language || 'en');

  const theme = await getTheme();
  applyThemeToDocument(theme);

  // Update copy button title with i18n
  btnCopy.title = t('copy');

  // Load the cache item by ID
  try {
    currentItem = await getCacheById(itemId);
  } catch (err) {
    stickyContent.textContent = `Error loading item: ${err}`;
    return;
  }

  if (!currentItem) {
    stickyContent.textContent = 'Item not found';
    return;
  }

  renderContent(currentItem);

  // Lazy-load CM6 and re-render with syntax highlighting once ready
  ensureCM6().then((cm6) => {
    if (cm6 && currentItem) renderContent(currentItem);
  });
}

init();
