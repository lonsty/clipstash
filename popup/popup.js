// ClipStash - Popup interaction logic

import {
  getCaches, removeCache, clearAllCaches, updateCacheTags,
  togglePin, searchCaches, getAllTags, getStorageStats,
  getSettings, saveSettings, getTheme, saveTheme,
  exportCaches, importCaches, formatBytes
} from '../utils/storage.js';
import { formatRelativeTime, formatFullTime } from '../utils/time.js';
import { initLang, setLang, getLang, t } from '../utils/i18n.js';

const PAGE_SIZE = 12;

// State
let allFilteredCaches = [];
let displayedCount = 0;
let isLoadingMore = false;
let currentQuery = '';
let currentModalData = null;
let confirmCallback = null;

// DOM references
const cacheListEl = document.getElementById('cache-list');
const emptyStateEl = document.getElementById('empty-state');
const noResultsEl = document.getElementById('no-results');
const loadingMoreEl = document.getElementById('loading-more');
const searchInput = document.getElementById('search-input');
const btnSearchClear = document.getElementById('btn-search-clear');
const statsBar = document.getElementById('stats-bar');
const statsText = document.getElementById('stats-text');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const modalImageWrap = document.getElementById('modal-image-wrap');
const modalImage = document.getElementById('modal-image');
const modalHtmlWrap = document.getElementById('modal-html-wrap');
const modalMeta = document.getElementById('modal-meta');
const modalTagsEl = document.getElementById('modal-tags');
const btnAddTag = document.getElementById('btn-add-tag');
const tagInputWrap = document.getElementById('tag-input-wrap');
const tagInput = document.getElementById('tag-input');
const tagSuggestions = document.getElementById('tag-suggestions');
const btnModalClose = document.getElementById('btn-modal-close');
const btnModalCopy = document.getElementById('btn-modal-copy');
const btnModalFullscreen = document.getElementById('btn-modal-fullscreen');
const btnClearAll = document.getElementById('btn-clear-all');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmTitleEl = document.getElementById('confirm-title');
const confirmDescEl = document.getElementById('confirm-desc');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmOk = document.getElementById('btn-confirm-ok');
const btnSettings = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const btnSettingsClose = document.getElementById('btn-settings-close');
const settingsMaxCache = document.getElementById('settings-max-cache');
const btnSettingsSave = document.getElementById('btn-settings-save');
const langBtnsEl = document.getElementById('lang-btns');
const themeBtnsEl = document.getElementById('theme-btns');
const shortcutDisplay = document.getElementById('shortcut-display');
const shortcutLink = document.getElementById('shortcut-link');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const importFile = document.getElementById('import-file');
const importStatus = document.getElementById('import-status');

// SVG icons
const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

const ICON_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
</svg>`;

const ICON_PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
  <path d="M12 17v5"/>
  <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z"/>
</svg>`;

const ICON_PIN_FILLED = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
  <path d="M12 17v5"/>
  <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z"/>
</svg>`;

const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="color: var(--success)">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

// ===== Utility Functions =====

function truncateText(text) {
  const lines = text.split('\n');
  const truncatedLines = lines.slice(0, 3).map(line =>
    line.length > 80 ? line.slice(0, 80) + '…' : line
  );
  let result = truncatedLines.join('\n');
  if (lines.length > 3) result += '\n…';
  return result;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl) return 0;
  const base64Idx = dataUrl.indexOf(',');
  if (base64Idx === -1) return dataUrl.length;
  const base64Str = dataUrl.substring(base64Idx + 1);
  return Math.floor(base64Str.length * 3 / 4);
}

// ===== Theme =====

let currentTheme = 'system';

async function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

// ===== i18n DOM binding =====

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
}

// ===== Confirm Dialog =====

function showConfirm(title, desc, okText, callback) {
  confirmTitleEl.textContent = title;
  confirmDescEl.textContent = desc;
  btnConfirmOk.textContent = okText;
  confirmCallback = callback;
  confirmOverlay.style.display = 'flex';
}

function hideConfirm() {
  confirmOverlay.style.display = 'none';
  confirmCallback = null;
}

// ===== Tags =====

function renderTagBadge(tagName, removable, onRemove) {
  const span = document.createElement('span');
  span.className = 'tag';
  span.textContent = tagName;
  if (removable && onRemove) {
    const removeBtn = document.createElement('span');
    removeBtn.className = 'tag-remove';
    removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(tagName);
    });
    span.appendChild(removeBtn);
  }
  return span;
}

function renderModalTags() {
  if (!currentModalData) return;
  modalTagsEl.innerHTML = '';
  const tags = currentModalData.tags || [];
  if (tags.length === 0) {
    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:11px;color:var(--text-muted);';
    hint.textContent = t('noTags');
    modalTagsEl.appendChild(hint);
    return;
  }
  for (const tag of tags) {
    modalTagsEl.appendChild(renderTagBadge(tag, true, async (tg) => {
      const newTags = currentModalData.tags.filter(x => x !== tg);
      await updateCacheTags(currentModalData.id, newTags);
      currentModalData.tags = newTags;
      renderModalTags();
      await refreshList();
    }));
  }
}

async function showTagSuggestions(value) {
  const allTags = await getAllTags();
  const currentTags = currentModalData?.tags || [];
  const q = value.toLowerCase().trim();
  const filtered = allTags.filter(tg =>
    !currentTags.includes(tg) && (!q || tg.toLowerCase().includes(q))
  );
  if (filtered.length === 0) {
    tagSuggestions.style.display = 'none';
    return;
  }
  tagSuggestions.innerHTML = '';
  for (const tg of filtered.slice(0, 8)) {
    const item = document.createElement('div');
    item.className = 'tag-suggestion-item';
    item.textContent = tg;
    item.addEventListener('click', () => addTagToCurrentItem(tg));
    tagSuggestions.appendChild(item);
  }
  tagSuggestions.style.display = 'block';
}

async function addTagToCurrentItem(tagName) {
  if (!currentModalData) return;
  const name = tagName.trim();
  if (!name || name.length > 20) return;
  const tags = currentModalData.tags || [];
  if (tags.includes(name)) return;
  tags.push(name);
  await updateCacheTags(currentModalData.id, tags);
  currentModalData.tags = tags;
  renderModalTags();
  tagInput.value = '';
  tagSuggestions.style.display = 'none';
  tagInputWrap.style.display = 'none';
  await refreshList();
}

// ===== Card Rendering =====

function createCacheCard(item) {
  const card = document.createElement('div');
  card.className = 'cache-card' + (item.pinned ? ' pinned' : '');
  card.dataset.id = item.id;

  const type = item.type || 'text';
  const tags = item.tags || [];

  let contentHtml = '';
  if (type === 'image' && item.imageDataUrl) {
    contentHtml = `<img class="cache-image-thumb" src="${item.imageDataUrl}" alt="${t('imageAlt')}">`;
  } else {
    const preview = truncateText(item.content || '');
    contentHtml = `<div class="cache-text">${escapeHtml(preview)}</div>`;
  }

  let typeBadge = '';
  if (type === 'image') {
    typeBadge = `<span class="cache-type-badge type-image">${t('typeImage')}</span>`;
  } else if (type === 'html') {
    typeBadge = `<span class="cache-type-badge type-html">${t('typeHtml')}</span>`;
  }

  let tagsHtml = '';
  if (tags.length > 0) {
    tagsHtml = `<div class="cache-tags-row">${tags.map(tg => `<span class="tag">${escapeHtml(tg)}</span>`).join('')}</div>`;
  }

  const metaText = type === 'image'
    ? formatBytes(estimateDataUrlBytes(item.imageDataUrl))
    : `${item.contentLength} ${t('chars')}`;
  const metaTime = formatRelativeTime(item.createdAt);

  card.innerHTML = `
    <div class="cache-content">
      ${contentHtml}
    </div>
    ${tagsHtml}
    <div class="cache-footer">
      <div class="cache-meta">
        ${typeBadge}
        <span>${metaText} · ${metaTime}</span>
      </div>
      <div class="cache-actions">
        <button class="btn-icon copy-btn" title="${t('copy')}">${ICON_COPY}</button>
        <button class="btn-icon pin-btn ${item.pinned ? 'is-pinned' : ''}" title="${item.pinned ? t('unpin') : t('pin')}">${item.pinned ? ICON_PIN_FILLED : ICON_PIN}</button>
        <span class="cache-actions-sep"></span>
        <button class="btn-icon delete-btn" title="${t('delete')}">${ICON_DELETE}</button>
      </div>
    </div>
  `;

  card.querySelector('.cache-content').addEventListener('click', () => openModal(item));

  card.querySelector('.pin-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await togglePin(item.id);
    await refreshList();
  });

  card.querySelector('.copy-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(item, card.querySelector('.copy-btn'));
  });

  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirm(
      t('confirmDeleteTitle'),
      t('confirmDeleteDesc'),
      t('confirmDeleteOk'),
      async () => {
        hideConfirm();
        card.style.maxHeight = card.offsetHeight + 'px';
        card.offsetHeight;
        card.classList.add('removing');
        await removeCache(item.id);
        setTimeout(() => refreshList(), 300);
      }
    );
  });

  return card;
}

// ===== List Rendering =====

async function refreshList() {
  allFilteredCaches = await searchCaches(currentQuery);
  displayedCount = 0;
  cacheListEl.innerHTML = '';
  appendNextPage();
  await updateStats();
  updateEmptyStates();
}

function appendNextPage() {
  const nextBatch = allFilteredCaches.slice(displayedCount, displayedCount + PAGE_SIZE);
  for (const item of nextBatch) {
    cacheListEl.appendChild(createCacheCard(item));
  }
  displayedCount += nextBatch.length;
  updateEmptyStates();
}

function updateEmptyStates() {
  const hasData = displayedCount > 0;
  const isSearching = currentQuery.trim().length > 0;

  cacheListEl.style.display = hasData ? 'block' : 'none';
  loadingMoreEl.style.display = 'none';

  if (!hasData && isSearching) {
    emptyStateEl.style.display = 'none';
    noResultsEl.style.display = 'flex';
  } else if (!hasData && !isSearching) {
    emptyStateEl.style.display = 'flex';
    noResultsEl.style.display = 'none';
  } else {
    emptyStateEl.style.display = 'none';
    noResultsEl.style.display = 'none';
  }

  btnClearAll.style.display = (allFilteredCaches.length > 0 && !isSearching) ? 'inline-flex' : 'none';

  return displayedCount < allFilteredCaches.length;
}

async function updateStats() {
  const stats = await getStorageStats();
  if (stats.count === 0) {
    statsBar.style.display = 'none';
    return;
  }
  statsBar.style.display = 'flex';
  const searchInfo = currentQuery.trim()
    ? ` · ${t('found', { n: allFilteredCaches.length })}`
    : '';
  statsText.textContent = `${stats.count} / ${stats.maxCount} ${t('items')}${searchInfo} · ${stats.formattedSize}`;
}

// ===== Scroll Loading =====

function setupScrollLoading() {
  document.addEventListener('scroll', () => {
    if (isLoadingMore) return;
    if (displayedCount >= allFilteredCaches.length) return;

    const el = document.documentElement;
    const scrollTop = el.scrollTop || document.body.scrollTop;
    const scrollHeight = el.scrollHeight || document.body.scrollHeight;
    const clientHeight = el.clientHeight || document.body.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight - 40) {
      isLoadingMore = true;
      loadingMoreEl.style.display = 'flex';
      setTimeout(() => {
        appendNextPage();
        loadingMoreEl.style.display = 'none';
        isLoadingMore = false;
      }, 200);
    }
  }, { passive: true });
}

// ===== Clipboard =====

async function copyToClipboard(data, btnEl) {
  try {
    if (data.type === 'image' && data.imageDataUrl) {
      // Convert data URL back to Blob and write as image
      const resp = await fetch(data.imageDataUrl);
      const blob = await resp.blob();
      // clipboard.write requires image/png
      const pngBlob = blob.type === 'image/png'
        ? blob
        : await convertToPngBlob(data.imageDataUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
    } else if (data.type === 'html' && data.htmlContent) {
      // Write both HTML and plain text fallback
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
    showCopyFeedback(btnEl);
  } catch {
    // Fallback: plain text copy
    const text = data.content || data.imageDataUrl || '';
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showCopyFeedback(btnEl);
  }
}

function convertToPngBlob(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    };
    img.src = dataUrl;
  });
}

function showCopyFeedback(btnEl) {
  const original = btnEl.innerHTML;
  const originalTitle = btnEl.title;
  const wasBtn = btnEl.classList.contains('btn');

  if (wasBtn) {
    btnEl.textContent = t('copied');
    btnEl.classList.add('btn-success');
  } else {
    btnEl.innerHTML = ICON_CHECK;
    btnEl.title = t('copied');
  }

  setTimeout(() => {
    btnEl.innerHTML = original;
    btnEl.title = originalTitle;
    if (wasBtn) btnEl.classList.remove('btn-success');
  }, 1500);
}

// ===== Modal =====

function openModal(item) {
  currentModalData = item;
  const type = item.type || 'text';

  // Reset all content areas
  modalContent.style.display = 'none';
  modalImageWrap.style.display = 'none';
  modalHtmlWrap.style.display = 'none';

  if (type === 'image' && item.imageDataUrl) {
    modalImage.src = item.imageDataUrl;
    modalImage.alt = t('imageAlt');
    modalImageWrap.style.display = 'block';
  } else if (type === 'html' && item.htmlContent) {
    modalHtmlWrap.innerHTML = item.htmlContent;
    modalHtmlWrap.style.display = 'block';
    // Also show plain text fallback
    if (item.content) {
      modalContent.textContent = item.content;
      modalContent.style.display = 'block';
    }
  } else {
    modalContent.textContent = item.content;
    modalContent.style.display = 'block';
  }

  const sizeInfo = type === 'image'
    ? `${t('typeImage')} · ${formatBytes(estimateDataUrlBytes(item.imageDataUrl))}`
    : `${item.contentLength} ${t('chars')}`;
  modalMeta.textContent = `${sizeInfo} · ${formatFullTime(item.createdAt)}`;

  renderModalTags();
  tagInputWrap.style.display = 'none';
  tagInput.value = '';
  tagSuggestions.style.display = 'none';
  modalOverlay.style.display = 'flex';
}

function closeModal() {
  modalOverlay.style.display = 'none';
  currentModalData = null;
  tagInputWrap.style.display = 'none';
  tagSuggestions.style.display = 'none';
}

function openFullscreen() {
  if (!currentModalData) return;
  const item = currentModalData;
  const type = item.type || 'text';
  const isDark = currentTheme === 'dark' ||
    (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const bgColor = isDark ? '#1a1b1e' : '#ffffff';
  const textColor = isDark ? '#e4e5e7' : '#111827';
  const fontMono = "'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace";

  let bodyContent = '';
  if (type === 'image' && item.imageDataUrl) {
    bodyContent = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
      <img src="${item.imageDataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain;">
    </div>`;
  } else if (type === 'html' && item.htmlContent) {
    bodyContent = `<div style="max-width:900px;margin:0 auto;padding:40px 24px;font-size:15px;line-height:1.8;">
      ${item.htmlContent}
    </div>`;
  } else {
    const escaped = escapeHtml(item.content || '');
    bodyContent = `<pre style="max-width:900px;margin:0 auto;padding:40px 24px;font-family:${fontMono};font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-all;">${escaped}</pre>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ClipStash - ${t('fullscreen')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${bgColor}; color: ${textColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  img { display: block; }
</style>
</head>
<body>${bodyContent}</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ===== Search =====

const handleSearch = debounce(async (query) => {
  currentQuery = query;
  btnSearchClear.style.display = query.trim() ? 'inline-flex' : 'none';
  await refreshList();
}, 250);

// ===== Export / Import =====

async function handleExport() {
  const json = await exportCaches();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clipstash-export-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleImport(file) {
  try {
    const text = await file.text();
    const result = await importCaches(text);
    importStatus.style.display = 'block';
    importStatus.className = 'import-status success';
    if (result.duplicates > 0) {
      importStatus.textContent = t('importDuplicate', { n: result.added, d: result.duplicates });
    } else {
      importStatus.textContent = t('importSuccess', { n: result.added });
    }
    await refreshList();
    setTimeout(() => { importStatus.style.display = 'none'; }, 3000);
  } catch {
    importStatus.style.display = 'block';
    importStatus.className = 'import-status error';
    importStatus.textContent = t('importFail');
    setTimeout(() => { importStatus.style.display = 'none'; }, 3000);
  }
}

// ===== Shortcut display =====

async function loadShortcutDisplay() {
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find(c => c.name === '_execute_action');
    if (cmd && cmd.shortcut) {
      shortcutDisplay.textContent = cmd.shortcut;
    } else {
      shortcutDisplay.textContent = 'Not set';
    }
  } catch {
    shortcutDisplay.textContent = 'Alt+Shift+C';
  }
}

// ===== Event Listeners =====

// Search
searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
btnSearchClear.addEventListener('click', () => {
  searchInput.value = '';
  btnSearchClear.style.display = 'none';
  handleSearch('');
  searchInput.focus();
});

// Clear all
btnClearAll.addEventListener('click', () => {
  showConfirm(
    t('confirmClearTitle'),
    t('confirmClearDesc'),
    t('confirmClearOk'),
    async () => {
      await clearAllCaches();
      hideConfirm();
      await refreshList();
    }
  );
});

// Confirm dialog
btnConfirmCancel.addEventListener('click', hideConfirm);
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) hideConfirm();
});
btnConfirmOk.addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
});

// Modal
btnModalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
btnModalCopy.addEventListener('click', () => {
  if (!currentModalData) return;
  copyToClipboard(currentModalData, btnModalCopy);
});
btnModalFullscreen.addEventListener('click', openFullscreen);

// Tag input
btnAddTag.addEventListener('click', () => {
  tagInputWrap.style.display = tagInputWrap.style.display === 'none' ? 'block' : 'none';
  if (tagInputWrap.style.display === 'block') {
    tagInput.focus();
    showTagSuggestions('');
  } else {
    tagSuggestions.style.display = 'none';
  }
});

tagInput.addEventListener('input', (e) => showTagSuggestions(e.target.value));
tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTagToCurrentItem(tagInput.value);
  }
  if (e.key === 'Escape') {
    tagInputWrap.style.display = 'none';
    tagSuggestions.style.display = 'none';
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (settingsOverlay.style.display !== 'none') {
      settingsOverlay.style.display = 'none';
    } else if (confirmOverlay.style.display !== 'none') {
      hideConfirm();
    } else if (modalOverlay.style.display !== 'none') {
      closeModal();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// Click outside tag suggestions
document.addEventListener('click', (e) => {
  if (!tagInputWrap.contains(e.target) && e.target !== btnAddTag) {
    tagSuggestions.style.display = 'none';
  }
});

// Settings
btnSettings.addEventListener('click', async () => {
  const settings = await getSettings();
  settingsMaxCache.value = settings.maxCacheSize;

  // Language buttons
  const lang = getLang();
  langBtnsEl.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Theme buttons
  const theme = await getTheme();
  themeBtnsEl.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  importStatus.style.display = 'none';
  await loadShortcutDisplay();
  settingsOverlay.style.display = 'flex';
});

btnSettingsClose.addEventListener('click', () => {
  settingsOverlay.style.display = 'none';
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.style.display = 'none';
});

// Theme button clicks — apply immediately
themeBtnsEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.theme-btn');
  if (!btn) return;
  themeBtnsEl.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const theme = btn.dataset.theme;
  await saveTheme(theme);
  await applyTheme(theme);
});

// Language button clicks
langBtnsEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.lang-btn');
  if (!btn) return;
  langBtnsEl.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await setLang(btn.dataset.lang);
  applyI18n();
  await refreshList();
});

// Shortcut link opens chrome://extensions/shortcuts
shortcutLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// Save settings
btnSettingsSave.addEventListener('click', async () => {
  const val = parseInt(settingsMaxCache.value, 10);
  if (isNaN(val) || val < 10 || val > 999) {
    settingsMaxCache.style.borderColor = 'var(--danger)';
    setTimeout(() => { settingsMaxCache.style.borderColor = ''; }, 1500);
    return;
  }
  await saveSettings({ maxCacheSize: val });

  settingsOverlay.style.display = 'none';
  await refreshList();
  await updateStats();
});

// Export
btnExport.addEventListener('click', handleExport);

// Import
btnImport.addEventListener('click', () => {
  importFile.value = '';
  importFile.click();
});
importFile.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleImport(e.target.files[0]);
  }
});

// ===== Init =====

async function init() {
  // Load language first
  await initLang();
  applyI18n();

  // Load and apply theme
  const theme = await getTheme();
  await applyTheme(theme);

  // Setup scroll and render
  setupScrollLoading();
  await refreshList();
}

init();
