// ClipStash Sticky Note Page - Interaction logic
// A lightweight always-on-top window that displays a single clipboard item.
// Loads item data via Tauri invoke, similar to fullscreen.js.

import { getSettings, getTheme } from '../utils/storage.js';
import { initLang, t } from '../utils/i18n.js';

const { invoke } = window.__TAURI__.core;

// ===== DOM References =====

const stickyContent = document.getElementById('sticky-content');
const btnCopy = document.getElementById('btn-copy');

// ===== SVG Icons =====

const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="color: var(--success)">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

// ===== State =====

let currentItem = null;

// ===== Utility Functions =====

function highlightCode(text, language) {
  if (!language || typeof hljs === 'undefined') return escapeHtml(text);
  try {
    const result = hljs.highlight(text, { language, ignoreIllegals: true });
    return result.value;
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Theme =====

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const hljsThemeEl = document.getElementById('hljs-theme');
  if (hljsThemeEl) {
    hljsThemeEl.href = isDark ? 'vendor/hljs-dark.css' : 'vendor/hljs-light.css';
  }
}

// ===== Copy =====

function showCopyFeedback() {
  btnCopy.innerHTML = ICON_CHECK;
  btnCopy.classList.add('copied');
  setTimeout(() => {
    btnCopy.innerHTML = ICON_COPY;
    btnCopy.classList.remove('copied');
  }, 1500);
}

async function copyToClipboard() {
  if (!currentItem) return;
  try {
    await invoke('write_clipboard', {
      contentType: currentItem.type || 'text',
      content: currentItem.content || '',
      htmlContent: currentItem.htmlContent || null,
      imageDataUrl: currentItem.imageDataUrl || null,
    });
    showCopyFeedback();
  } catch {
    try {
      await navigator.clipboard.writeText(currentItem.content || '');
      showCopyFeedback();
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
    // Sanitize HTML content: neutralize script tags
    const sanitized = item.htmlContent
      .replace(/<script[\s>]/gi, '&lt;script ')
      .replace(/<\/script>/gi, '&lt;/script&gt;');
    stickyContent.innerHTML = `<div class="content-html">${sanitized}</div>`;
  } else {
    const pre = document.createElement('pre');
    pre.className = 'content-text';
    const code = document.createElement('code');
    if (item.language) {
      code.innerHTML = highlightCode(item.content || '', item.language);
      code.className = 'hljs';
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
  applyTheme(theme);

  // Update copy button title with i18n
  btnCopy.title = t('copy');

  // Load the cache item by ID
  try {
    currentItem = await invoke('get_cache_by_id', { id: itemId });
  } catch (err) {
    stickyContent.textContent = `Error loading item: ${err}`;
    return;
  }

  if (!currentItem) {
    stickyContent.textContent = 'Item not found';
    return;
  }

  renderContent(currentItem);
}

init();
