// ClipStash Desktop - Main interaction logic

import {
  addCache, removeCache, clearAllCaches, updateCacheTags,
  togglePin, updateCacheContent, updateCacheLanguage,
  searchCaches, getAllTags, getStorageStats,
  getSettings, saveSettings, getTheme, saveTheme,
  exportCaches, importCaches, formatBytes
} from '../utils/storage.js';
import { formatRelativeTime, formatFullTime } from '../utils/time.js';
import { initLang, setLang, getLang, t } from '../utils/i18n.js';
import {
  readClipboard, writeClipboard,
  onEvent, showSaveDialog, showOpenDialog,
  writeTextFile, readTextFile,
  setAutostart, getAutostart,
  setClipboardMonitor, getClipboardMonitor,
  registerHotkey, showNotification, openFullscreenWindow, openStickyWindow, openUrl,
  setSuppressAutoHide, getAppVersion, updateTrayMenu,
} from '../utils/bridge.js';

const PAGE_SIZE = 12;

// State
let allFilteredCaches = [];
let displayedCount = 0;
let isLoadingMore = false;
let currentQuery = '';
let currentModalData = null;
let isEditMode = false;
let hasUnsavedChanges = false;
let confirmCallback = null;
let currentSettings = null;

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
const modalBody = document.querySelector('.modal-body');
const modalContent = document.getElementById('modal-content');
const modalImageWrap = document.getElementById('modal-image-wrap');
const modalImage = document.getElementById('modal-image');
const modalHtmlWrap = document.getElementById('modal-html-wrap');
const modalMeta = document.getElementById('modal-meta');
const modalHeaderId = document.getElementById('modal-header-id');
const modalStatusMeta = document.getElementById('modal-status-meta');
const modalTagsEl = document.getElementById('modal-tags');
const btnAddTag = document.getElementById('btn-add-tag');
const tagInputWrap = document.getElementById('tag-input-wrap');
const tagInput = document.getElementById('tag-input');
const tagSuggestions = document.getElementById('tag-suggestions');
const btnModalClose = document.getElementById('btn-modal-close');
const btnModalCopy = document.getElementById('btn-modal-copy');
const btnModalFullscreen = document.getElementById('btn-modal-fullscreen');
const btnModalPin = document.getElementById('btn-modal-pin');
const btnModalEdit = document.getElementById('btn-modal-edit');
const modalContentToolbar = document.getElementById('modal-content-toolbar');
const modalEditBar = document.getElementById('modal-edit-bar');
const modalHeaderActions = document.querySelector('.modal-header-actions');
const btnEditCancel = document.getElementById('btn-edit-cancel');
const btnEditSave = document.getElementById('btn-edit-save');
const modalLangSelect = document.getElementById('modal-lang-select');
const modalEditorContainer = document.getElementById('modal-editor-container');
const modalEditor = document.getElementById('modal-editor');
const modalEditorPreview = document.getElementById('modal-editor-preview');
const modalEditorCode = document.getElementById('modal-editor-code');
const modalCode = document.getElementById('modal-code');
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
const langBtnsEl = document.getElementById('lang-btns');
const themeBtnsEl = document.getElementById('theme-btns');
const shortcutDisplay = document.getElementById('shortcut-display');
const btnChangeShortcut = document.getElementById('btn-change-shortcut');
const shortcutRecording = document.getElementById('shortcut-recording');
const shortcutInput = document.getElementById('shortcut-input');
const btnShortcutSave = document.getElementById('btn-shortcut-save');
const btnShortcutCancel = document.getElementById('btn-shortcut-cancel');
const toggleAutostart = document.getElementById('toggle-autostart');
const toggleClipboardMonitor = document.getElementById('toggle-clipboard-monitor');
const toggleNotification = document.getElementById('toggle-notification');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const importStatus = document.getElementById('import-status');
const btnCacheNow = document.getElementById('btn-cache-now');
const btnGithub = document.getElementById('btn-github');
const appVersionEl = document.getElementById('app-version');
const aboutGithub = document.getElementById('about-github');

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

function highlightCode(text, language) {
  if (!language || typeof hljs === 'undefined') return escapeHtml(text);
  try {
    const result = hljs.highlight(text, { language, ignoreIllegals: true });
    return result.value;
  } catch {
    return escapeHtml(text);
  }
}

// Inline hljs theme CSS for standalone HTML pages
const HLJS_LIGHT_CSS = `pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#24292e;background:transparent}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{color:#24292e;font-style:italic}.hljs-strong{color:#24292e;font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}`;
const HLJS_DARK_CSS = `pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#c9d1d9;background:transparent}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#79c0ff}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#a5d6ff}.hljs-built_in,.hljs-symbol{color:#ffa657}.hljs-code,.hljs-comment,.hljs-formula{color:#8b949e}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#7ee787}.hljs-subst{color:#c9d1d9}.hljs-section{color:#1f6feb;font-weight:700}.hljs-bullet{color:#f2cc60}.hljs-emphasis{color:#c9d1d9;font-style:italic}.hljs-strong{color:#c9d1d9;font-weight:700}.hljs-addition{color:#aff5b4;background-color:#033a16}.hljs-deletion{color:#ffdcd7;background-color:#67060c}`;

function getHljsCss() {
  const isDark = currentTheme === 'dark' ||
    (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark ? HLJS_DARK_CSS : HLJS_LIGHT_CSS;
}

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
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const hljsThemeEl = document.getElementById('hljs-theme');
  if (hljsThemeEl) {
    hljsThemeEl.href = isDark ? 'vendor/hljs-dark.css' : 'vendor/hljs-light.css';
  }
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
  span.title = tagName; // 添加 title 属性用于 hover 显示完整内容
  
  // 创建标签文本容器
  const textSpan = document.createElement('span');
  textSpan.className = 'tag-text';
  textSpan.textContent = tagName;
  span.appendChild(textSpan);
  
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
  const tags = currentModalData.tags || [];
  
  modalTagsEl.innerHTML = '';
  
  for (const tag of tags) {
    modalTagsEl.appendChild(renderTagBadge(tag, true, async (tg) => {
      const newTags = currentModalData.tags.filter(x => x !== tg);
      await updateCacheTags(currentModalData.id, newTags);
      currentModalData.tags = newTags;
      renderModalTags();
      await refreshList();
    }));
  }

  // Show text label on add-tag button only when no tags exist
  const addTagLabel = btnAddTag.querySelector('.btn-add-tag-label');
  if (addTagLabel) {
    addTagLabel.style.display = tags.length === 0 ? '' : 'none';
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
  if (tags.includes(name)) {
    showTagExistsHint(tagInput, tagInputWrap);
    return;
  }
  tags.push(name);
  await updateCacheTags(currentModalData.id, tags);
  currentModalData.tags = tags;
  renderModalTags();
  tagInput.value = '';
  tagSuggestions.style.display = 'none';
  tagInputWrap.style.display = 'none';
  await refreshList();
}

function showTagExistsHint(inputEl, wrapEl) {
  // Remove existing hint if any
  const oldHint = wrapEl.querySelector('.tag-exists-hint');
  if (oldHint) oldHint.remove();

  // Add error style with shake
  inputEl.classList.remove('tag-exists');
  void inputEl.offsetWidth; // force reflow to re-trigger animation
  inputEl.classList.add('tag-exists');

  // Show hint text
  const hint = document.createElement('div');
  hint.className = 'tag-exists-hint';
  hint.textContent = t('tagExists');
  wrapEl.appendChild(hint);

  // Auto-clear after 2s
  setTimeout(() => {
    inputEl.classList.remove('tag-exists');
    hint.remove();
  }, 2000);
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
    if (item.language) {
      contentHtml = `<pre class="cache-text"><code class="hljs">${highlightCode(preview, item.language)}</code></pre>`;
    } else {
      contentHtml = `<div class="cache-text">${escapeHtml(preview)}</div>`;
    }
  }

  let typeBadge = '';
  if (type === 'image') {
    typeBadge = `<span class="cache-type-badge type-image">${t('typeImage')}</span>`;
  } else if (type === 'html') {
    typeBadge = `<span class="cache-type-badge type-html">${t('typeHtml')}</span>`;
  }
  if (item.language) {
    typeBadge += `<span class="cache-lang-badge">${escapeHtml(item.language)}</span>`;
  }

  let tagsHtml = '';
  if (tags.length > 0) {
    tagsHtml = `<div class="cache-tags-row">${tags.map(tg => `<span class="tag" title="${escapeHtml(tg)}"><span class="tag-text">${escapeHtml(tg)}</span></span>`).join('')}</div>`;
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
    
    // Check if currently editing this item with unsaved changes
    if (isEditMode && hasUnsavedChanges && currentModalData && currentModalData.id === item.id) {
      showConfirm(
        t('unsavedTitle'),
        t('unsavedDesc'),
        t('discardChanges'),
        () => {
          hideConfirm();
          isEditMode = false;
          hasUnsavedChanges = false;
          modalEditorContainer.style.display = 'none';
          modalEditor.classList.remove('has-highlight');
          modalEditorContainer.classList.remove('editing');
          modalBody.classList.remove('editing-mode');
          modalEditBar.style.display = 'none';
          modalHeaderId.style.display = '';
          modalHeaderActions.style.display = '';
          
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
        }
      );
      return;
    }
    
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

  btnClearAll.disabled = (allFilteredCaches.length === 0);

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
  const scrollEl = document.getElementById('scroll-container');
  scrollEl.addEventListener('scroll', () => {
    if (isLoadingMore) return;
    if (displayedCount >= allFilteredCaches.length) return;

    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 40) {
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
    const type = data.type || 'text';
    await writeClipboard(
      type,
      data.content || '',
      data.htmlContent || null,
      data.imageDataUrl || null
    );
    showCopyFeedback(btnEl);
  } catch {
    // Fallback
    try {
      await navigator.clipboard.writeText(data.content || '');
      showCopyFeedback(btnEl);
    } catch {
      // Silent fail
    }
  }
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
  isEditMode = false;
  hasUnsavedChanges = false;
  const type = item.type || 'text';

  modalContent.style.display = 'none';
  modalImageWrap.style.display = 'none';
  modalHtmlWrap.style.display = 'none';
  modalEditorContainer.style.display = 'none';
  modalEditBar.style.display = 'none';
  modalHeaderId.style.display = '';

  // Set header ID badge (short form: first 8 chars)
  const shortId = String(item.id).length > 8 ? String(item.id).slice(0, 8) : String(item.id);
  modalHeaderId.textContent = `#${shortId}`;

  // Show/hide edit & language controls based on type
  btnModalEdit.style.display = (type === 'image') ? 'none' : 'inline-flex';
  modalLangSelect.style.display = (type === 'image' || type === 'html') ? 'none' : 'inline-flex';
  modalLangSelect.value = item.language || '';

  if (type === 'image' && item.imageDataUrl) {
    modalImage.src = item.imageDataUrl;
    modalImage.alt = t('imageAlt');
    modalImageWrap.style.display = 'block';
  } else if (type === 'html' && item.htmlContent) {
    modalHtmlWrap.innerHTML = item.htmlContent;
    modalHtmlWrap.style.display = 'block';
    if (item.content) {
      modalCode.textContent = item.content;
      modalCode.className = '';
      modalContent.style.display = 'block';
    }
  } else {
    if (item.language) {
      modalCode.innerHTML = highlightCode(item.content || '', item.language);
      modalCode.className = 'hljs';
    } else {
      modalCode.textContent = item.content;
      modalCode.className = '';
    }
    modalContent.style.display = 'block';
  }

  const sizeInfo = type === 'image'
    ? `${t('typeImage')} · ${formatBytes(estimateDataUrlBytes(item.imageDataUrl))}`
    : `${item.contentLength} ${t('chars')}`;
  const metaText = `${sizeInfo} · ${formatFullTime(item.createdAt)}`;
  modalMeta.textContent = metaText;
  modalStatusMeta.textContent = metaText;

  renderModalTags();
  tagInputWrap.style.display = 'none';
  tagInput.value = '';
  tagSuggestions.style.display = 'none';
  modalOverlay.style.display = 'flex';
}

function closeModal() {
  // Check for unsaved changes
  if (isEditMode && hasUnsavedChanges) {
    showConfirm(
      t('unsavedTitle'),
      t('unsavedDesc'),
      t('discardChanges'),
      () => {
        hideConfirm();
        forceCloseModal();
      }
    );
    return;
  }
  forceCloseModal();
}

function forceCloseModal() {
  modalOverlay.style.display = 'none';
  currentModalData = null;
  isEditMode = false;
  hasUnsavedChanges = false;
  modalEditorContainer.style.display = 'none';
  modalEditor.classList.remove('has-highlight');
  modalEditorContainer.classList.remove('editing');
  modalBody.classList.remove('editing-mode');
  modalEditBar.style.display = 'none';
  modalHeaderId.style.display = '';
  modalHeaderActions.style.display = '';
  tagInputWrap.style.display = 'none';
  tagSuggestions.style.display = 'none';
}

async function openFullscreen() {
  if (!currentModalData) return;
  try {
    await openFullscreenWindow(currentModalData.id);
  } catch {
    // Fallback: open as blob URL if Tauri API fails
    const blob = new Blob([`<p>Failed to open fullscreen</p>`], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
}

// 打开便签窗口：创建一个始终在顶部的小窗口显示内容
async function openStickyNote() {
  if (!currentModalData) return;
  const item = currentModalData;
  const type = item.type || 'text';
  const isDark = currentTheme === 'dark' ||
    (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const bgColor = isDark ? '#1a1b1e' : '#ffffff';
  const textColor = isDark ? '#e4e5e7' : '#111827';
  const btnHover = isDark ? '#2c2d33' : '#e2e8f0';
  const btnBorder = isDark ? '#3a3b40' : '#e5e7eb';
  const successColor = '#22c55e';
  const mutedColor = isDark ? '#6b6c70' : '#9ca3af';
  const fontMono = "'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace";

  let bodyContent = '';
  let copyDataScript = '';

  // 图片类型：flexbox居中展示
  if (type === 'image' && item.imageDataUrl) {
    bodyContent = `<div style="display:flex;align-items:center;justify-content:center;flex:1;">
      <img src="${item.imageDataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;">
    </div>`;
    copyDataScript = `
      async function doCopy() {
        try {
          const img = document.querySelector('img');
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(async (blob) => {
            await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
            showCopyOk();
          }, 'image/png');
        } catch { showCopyOk(); }
      }`;
  // 富文本类型：渲染HTML内容，紧凑布局
  } else if (type === 'html' && item.htmlContent) {
    // Escape for safe embedding in JavaScript string literals
    const escapedHtml = item.htmlContent
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/<\/script>/gi, '<\\/script>');
    const escapedText = (item.content || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/<\/script>/gi, '<\\/script>');
    // Sanitize HTML content for safe DOM embedding: neutralize script tags
    const sanitizedStickyHtml = item.htmlContent
      .replace(/<script[\s>]/gi, '&lt;script ')
      .replace(/<\/script>/gi, '&lt;/script&gt;');
    bodyContent = `<div class="content-html">${sanitizedStickyHtml}</div>`;
    copyDataScript = `
      async function doCopy() {
        try {
          const htmlStr = '${escapedHtml}';
          const textStr = '${escapedText}';
          const htmlBlob = new Blob([htmlStr], {type: 'text/html'});
          const textBlob = new Blob([textStr], {type: 'text/plain'});
          await navigator.clipboard.write([new ClipboardItem({'text/html': htmlBlob, 'text/plain': textBlob})]);
          showCopyOk();
        } catch {
          await navigator.clipboard.writeText('${escapedText}');
          showCopyOk();
        }
      }`;
  // 文本/代码类型：使用 pre+code 展示，支持语法高亮
  } else {
    const escaped = item.language ? highlightCode(item.content || '', item.language) : escapeHtml(item.content || '');
    const codeClass = item.language ? ' class="hljs"' : '';
    // Escape for safe embedding in JavaScript string literals
    const escapedForJs = (item.content || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/<\/script>/gi, '<\\/script>');
    bodyContent = `<pre class="content-text"><code${codeClass}>${escaped}</code></pre>`;
    copyDataScript = `
      async function doCopy() {
        try {
          const text = '${escapedForJs}';
          await navigator.clipboard.writeText(text);
          showCopyOk();
        } catch {}
      }`;
  }

  const copyBtnLabel = t('copy');
  const pinLabel = t('pinToTop');
  const hljsCssStickyInline = item.language ? getHljsCss() : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ClipStash - ${pinLabel}</title>
<style>
  :root {
    --bg: ${bgColor};
    --text: ${textColor};
    --text-secondary: ${isDark ? '#a1a2a6' : '#4b5563'};
    --text-muted: ${mutedColor};
    --bg-hover: ${btnHover};
    --border: ${btnBorder};
    --success: ${successColor};
    --font-mono: ${fontMono};
    --transition: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; height: 100vh; -webkit-app-region: drag; }
  img { display: block; }

  /* Content area */
  .sticky-body { flex: 1; overflow-x: hidden; overflow-y: auto; padding: 12px 16px; -webkit-app-region: no-drag; }
  .sticky-body img { max-width: 100%; }

  /* Shared toolbar (same rules as main.css .content-toolbar) */
  .content-toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; gap: 4px; pointer-events: none; height: 0; overflow: visible; }
  .toolbar-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-muted); cursor: pointer; transition: all var(--transition); pointer-events: auto; opacity: 0.45; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
  .toolbar-btn svg { width: 14px; height: 14px; }
  body:hover .toolbar-btn { opacity: 0.85; }
  .toolbar-btn:hover { opacity: 1 !important; background: var(--bg-hover); color: var(--text-secondary); border-color: var(--text-muted); }
  .toolbar-btn.copied { opacity: 1 !important; background: var(--success); color: #fff; border-color: var(--success); }

  /* Shared content formatting (same rules as main.css .content-text) */
  .content-text { font-family: var(--font-mono); font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--text); margin: 0; padding: 0; background: transparent; tab-size: 4; }
  .content-text code { font-family: inherit; font-size: inherit; line-height: inherit; display: block; white-space: pre-wrap; word-break: break-all; background: transparent !important; padding: 0 !important; tab-size: inherit; overflow-x: hidden; }
  .content-text code.hljs { background: transparent !important; padding: 0 !important; overflow-x: hidden; }

  /* Shared HTML content (same rules as main.css .content-html) */
  .content-html { font-size: 12px; line-height: 1.6; color: var(--text); overflow: hidden; word-break: break-all; }
  .content-html img { max-width: 100%; }

  /* Scrollbar (same rules as main.css) */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

  ${hljsCssStickyInline}

  /* Override hljs defaults that appear after our rules */
  .content-text code.hljs { overflow-x: hidden !important; padding: 0 !important; white-space: pre-wrap !important; word-break: break-all !important; }
</style>
</head>
<body>
<div class="sticky-body">
  <div class="content-toolbar">
    <button class="toolbar-btn" onclick="doCopy()" title="${copyBtnLabel}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>
  </div>
  ${bodyContent}
</div>
<script>
  const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
  function showCopyOk() {
    const btn = document.querySelector('.toolbar-btn');
    btn.classList.add('copied');
    btn.innerHTML = ICON_CHECK;
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = ICON_COPY; }, 1500);
  }
  ${copyDataScript}
</script>
</body>
</html>`;

  try {
    await openStickyWindow(html);
    closeModal();
  } catch {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
}

// ===== Search =====

const handleSearch = debounce(async (query) => {
  currentQuery = query;
  btnSearchClear.style.display = query.trim() ? 'inline-flex' : 'none';
  await refreshList();
}, 250);

// ===== Export / Import =====

async function handleExport() {
  try {
    const json = await exportCaches();
    const defaultName = `clipstash-export-${Date.now()}.json`;
    await setSuppressAutoHide(true);
    try {
      const filePath = await showSaveDialog(defaultName);
      if (filePath) {
        await writeTextFile(filePath, json);
      }
    } finally {
      await setSuppressAutoHide(false);
    }
  } catch {
    // Fallback: download via blob
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
}

async function handleImport() {
  try {
    await setSuppressAutoHide(true);
    let filePath;
    try {
      filePath = await showOpenDialog();
    } finally {
      await setSuppressAutoHide(false);
    }
    if (!filePath) return;
    const text = await readTextFile(filePath);
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

// ===== Cache Clipboard (from button / tray / hotkey) =====

async function cacheClipboardContent(showFeedbackOnButton) {
  const clipData = await readClipboard();

  if (!clipData) {
    if (showFeedbackOnButton) {
      showCacheNowFeedback(t('cacheEmpty'), 'cache-feedback-muted');
    } else {
      await tryNotify('ClipStash', t('notifEmpty'));
    }
    return 'empty';
  }

  const result = await addCache(clipData);

  if (result.added) {
    if (showFeedbackOnButton) {
      showCacheNowFeedback(t('cacheSuccess'), 'cache-feedback-success');
    } else {
      await tryNotify('ClipStash', t('notifCached'));
    }
    await refreshList();
    return 'added';
  } else if (result.duplicate) {
    if (showFeedbackOnButton) {
      showCacheNowFeedback(t('cacheDuplicate'), 'cache-feedback-warn');
    } else {
      await tryNotify('ClipStash', t('notifDuplicate'));
    }
    return 'duplicate';
  } else {
    if (showFeedbackOnButton) {
      showCacheNowFeedback(t('cacheEmpty'), 'cache-feedback-muted');
    }
    return 'empty';
  }
}

async function tryNotify(title, body) {
  if (!currentSettings?.showNotification) return;
  try {
    await showNotification(title, body);
  } catch {
    // Notification not available
  }
}

let _cacheNowFeedbackTimer = null;

function showCacheNowFeedback(text, cls) {
  const svgEl = btnCacheNow.querySelector('svg');
  const spanEl = btnCacheNow.querySelector('span');

  if (_cacheNowFeedbackTimer) {
    clearTimeout(_cacheNowFeedbackTimer);
    btnCacheNow.classList.remove(
      'cache-feedback-success', 'cache-feedback-warn', 'cache-feedback-muted'
    );
  }

  if (svgEl) svgEl.style.display = 'none';
  spanEl.textContent = text;
  btnCacheNow.classList.add(cls);

  _cacheNowFeedbackTimer = setTimeout(() => {
    _cacheNowFeedbackTimer = null;
    if (svgEl) svgEl.style.display = '';
    spanEl.textContent = t('cacheNow');
    btnCacheNow.classList.remove(cls);
  }, 1500);
}

// ===== Shortcut Recording =====

let recordedKeys = [];

function startRecordingShortcut() {
  shortcutRecording.style.display = 'block';
  shortcutInput.value = '';
  recordedKeys = [];
  shortcutInput.focus();
}

function stopRecordingShortcut() {
  shortcutRecording.style.display = 'none';
  recordedKeys = [];
}

function handleShortcutKeyDown(e) {
  e.preventDefault();
  const keys = [];
  if (e.ctrlKey) keys.push('Ctrl');
  if (e.altKey) keys.push('Alt');
  if (e.shiftKey) keys.push('Shift');
  if (e.metaKey) keys.push('Super');

  const key = e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    keys.push(key.length === 1 ? key.toUpperCase() : key);
  }

  recordedKeys = keys;
  shortcutInput.value = keys.join('+');
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
      settingsOverlay.style.display = 'none';
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
btnModalPin.addEventListener('click', openStickyNote);

// Language selector
modalLangSelect.addEventListener('change', async () => {
  if (!currentModalData) return;
  const lang = modalLangSelect.value || null;
  await updateCacheLanguage(currentModalData.id, lang);
  currentModalData.language = lang;
  // Re-render highlighted content
  if (currentModalData.type !== 'image' && currentModalData.type !== 'html') {
    if (lang) {
      modalCode.innerHTML = highlightCode(currentModalData.content || '', lang);
      modalCode.className = 'hljs';
    } else {
      modalCode.textContent = currentModalData.content;
      modalCode.className = '';
    }
  }
  await refreshList();
});

// Edit mode: enter
btnModalEdit.addEventListener('click', () => {
  if (!currentModalData || isEditMode) return;
  enterEditMode();
});

function enterEditMode() {
  isEditMode = true;
  hasUnsavedChanges = false;

  // Capture the view-mode content height before hiding it
  const viewHeight = modalContent.offsetHeight || modalHtmlWrap.offsetHeight || 80;

  modalEditor.value = currentModalData.content || '';

  // Set textarea height to match the view-mode content height
  // scrollHeight already includes padding, use it directly
  modalEditor.style.height = 'auto';
  const contentHeight = modalEditor.scrollHeight;
  // Use whichever is larger: view-mode height or actual content height
  const editorHeight = Math.max(viewHeight, contentHeight, 80);
  modalEditor.style.height = `${editorHeight}px`;

  modalContent.style.display = 'none';
  modalHtmlWrap.style.display = 'none';
  modalEditorContainer.style.display = 'block';
  modalEditorContainer.classList.add('editing');
  modalBody.classList.add('editing-mode');

  // Show edit bar in header, hide ID badge and header actions (fullscreen/pin/close)
  modalEditBar.style.display = 'flex';
  modalHeaderId.style.display = 'none';
  modalHeaderActions.style.display = 'none';

  // Update initial highlight
  updateEditorHighlight();
}

// Edit mode: save
btnEditSave.addEventListener('click', saveEdit);

async function saveEdit() {
  if (!currentModalData || !isEditMode) return;

  const newContent = modalEditor.value;
  await updateCacheContent(currentModalData.id, newContent);
  currentModalData.content = newContent;
  currentModalData.contentLength = [...newContent].length;
  exitEditMode();

  // Re-render content with highlighting
  const lang = currentModalData.language;
  if (lang) {
    modalCode.innerHTML = highlightCode(newContent, lang);
    modalCode.className = 'hljs';
  } else {
    modalCode.textContent = newContent;
    modalCode.className = '';
  }
  modalContent.style.display = 'block';

  // Update meta
  const sizeInfo = `${currentModalData.contentLength} ${t('chars')}`;
  const metaText = `${sizeInfo} · ${formatFullTime(currentModalData.createdAt)}`;
  modalMeta.textContent = metaText;
  modalStatusMeta.textContent = metaText;

  await refreshList();
}

// Edit mode: cancel
btnEditCancel.addEventListener('click', () => {
  if (!isEditMode) return;
  if (hasUnsavedChanges) {
    showConfirm(
      t('unsavedTitle'),
      t('unsavedDesc'),
      t('discardChanges'),
      () => {
        hideConfirm();
        cancelEdit();
      }
    );
  } else {
    cancelEdit();
  }
});

function cancelEdit() {
  if (!currentModalData) return;
  exitEditMode();

  // Restore original content display
  const type = currentModalData.type || 'text';
  if (type === 'html' && currentModalData.htmlContent) {
    modalHtmlWrap.innerHTML = currentModalData.htmlContent;
    modalHtmlWrap.style.display = 'block';
    if (currentModalData.content) {
      modalCode.textContent = currentModalData.content;
      modalCode.className = '';
      modalContent.style.display = 'block';
    }
  } else {
    if (currentModalData.language) {
      modalCode.innerHTML = highlightCode(currentModalData.content || '', currentModalData.language);
      modalCode.className = 'hljs';
    } else {
      modalCode.textContent = currentModalData.content;
      modalCode.className = '';
    }
    modalContent.style.display = 'block';
  }
}

function exitEditMode() {
  isEditMode = false;
  hasUnsavedChanges = false;
  modalEditorContainer.style.display = 'none';
  modalEditor.classList.remove('has-highlight');
  modalEditorContainer.classList.remove('editing');
  modalBody.classList.remove('editing-mode');
  modalEditBar.style.display = 'none';
  modalHeaderId.style.display = '';
  modalHeaderActions.style.display = '';
}

// Real-time syntax highlighting in editor
function updateEditorHighlight() {
  if (!isEditMode || !currentModalData) return;
  
  const lang = currentModalData.language;
  const content = modalEditor.value;
  
  if (lang && typeof hljs !== 'undefined') {
    modalEditor.classList.add('has-highlight');
    const highlighted = highlightCode(content, lang);
    modalEditorCode.innerHTML = highlighted;
    modalEditorCode.className = 'hljs';
  } else {
    // No syntax highlighting - show plain text in preview layer
    modalEditor.classList.add('has-highlight');
    modalEditorCode.textContent = content;
    modalEditorCode.className = '';
  }
}

// Track unsaved changes, update highlight, and auto-resize textarea
modalEditor.addEventListener('input', () => {
  hasUnsavedChanges = true;
  updateEditorHighlight();
  // Auto-resize textarea to fit content
  modalEditor.style.height = 'auto';
  modalEditor.style.height = `${Math.max(modalEditor.scrollHeight, 80)}px`;
});

// Sync scroll between editor and preview
modalEditor.addEventListener('scroll', () => {
  if (modalEditorPreview) {
    modalEditorPreview.scrollTop = modalEditor.scrollTop;
    modalEditorPreview.scrollLeft = modalEditor.scrollLeft;
  }
});

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

// Close tag input on blur (delayed to allow clicking suggestions)
tagInput.addEventListener('blur', () => {
  setTimeout(() => {
    // Only close if the focus didn't move to a suggestion item
    if (!tagInputWrap.contains(document.activeElement)) {
      tagInputWrap.style.display = 'none';
      tagSuggestions.style.display = 'none';
      tagInput.value = '';
    }
  }, 150);
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

// Cache Now button
btnCacheNow.addEventListener('click', async () => {
  btnCacheNow.disabled = true;
  btnCacheNow.classList.add('caching');
  await cacheClipboardContent(true);
  btnCacheNow.disabled = false;
  btnCacheNow.classList.remove('caching');
});

// GitHub link (open in external browser)
btnGithub.addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await openUrl('https://github.com/lonsty/clipstash');
  } catch {
    window.open('https://github.com/lonsty/clipstash', '_blank');
  }
});

// About GitHub link in settings
aboutGithub.addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await openUrl('https://github.com/lonsty/clipstash');
  } catch {
    window.open('https://github.com/lonsty/clipstash', '_blank');
  }
});

// Settings
btnSettings.addEventListener('click', async () => {
  currentSettings = await getSettings();
  settingsMaxCache.value = currentSettings.cacheLimit;

  const lang = getLang();
  langBtnsEl.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  const theme = await getTheme();
  themeBtnsEl.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  shortcutDisplay.textContent = currentSettings.hotkey || 'Alt+Shift+C';

  // Desktop toggles
  toggleAutostart.checked = await getAutostart().catch(() => false);
  toggleClipboardMonitor.checked = await getClipboardMonitor().catch(() => false);
  toggleNotification.checked = currentSettings.showNotification;

  importStatus.style.display = 'none';
  shortcutRecording.style.display = 'none';

  // Show app version
  const version = await getAppVersion();
  if (version) {
    appVersionEl.textContent = `v${version}`;
  }

  settingsOverlay.style.display = 'flex';
});

btnSettingsClose.addEventListener('click', () => {
  settingsOverlay.style.display = 'none';
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.style.display = 'none';
});

// Theme button clicks
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
  setLang(btn.dataset.lang);
  if (currentSettings) {
    currentSettings.language = btn.dataset.lang;
    await saveSettings(currentSettings);
  }
  applyI18n();
  await updateTrayMenu(t('traySettings'), t('trayQuit')).catch(() => {});
  await refreshList();
});

// Shortcut change
btnChangeShortcut.addEventListener('click', startRecordingShortcut);
btnShortcutCancel.addEventListener('click', stopRecordingShortcut);
shortcutInput.addEventListener('keydown', handleShortcutKeyDown);
btnShortcutSave.addEventListener('click', async () => {
  if (recordedKeys.length < 2) return;
  const keys = shortcutInput.value;
  try {
    await registerHotkey(keys);
    shortcutDisplay.textContent = keys;
    if (currentSettings) {
      currentSettings.hotkey = keys;
      await saveSettings(currentSettings);
    }
    stopRecordingShortcut();
  } catch (err) {
    shortcutInput.style.borderColor = 'var(--danger)';
    setTimeout(() => { shortcutInput.style.borderColor = ''; }, 1500);
  }
});

// Save cache limit on blur
let _maxCacheInputDirty = false;

settingsMaxCache.addEventListener('input', () => {
  _maxCacheInputDirty = true;
  const val = parseInt(settingsMaxCache.value, 10);
  if (isNaN(val) || val < 10 || val > 999) {
    settingsMaxCache.style.borderColor = 'var(--danger)';
  } else {
    settingsMaxCache.style.borderColor = '';
  }
});

settingsMaxCache.addEventListener('blur', async () => {
  if (!_maxCacheInputDirty) return;
  _maxCacheInputDirty = false;
  const val = parseInt(settingsMaxCache.value, 10);
  if (isNaN(val) || val < 10 || val > 999) {
    settingsMaxCache.style.borderColor = 'var(--danger)';
    setTimeout(() => { settingsMaxCache.style.borderColor = ''; }, 1500);
    return;
  }
  settingsMaxCache.style.borderColor = 'var(--success)';
  setTimeout(() => { settingsMaxCache.style.borderColor = ''; }, 800);
  if (currentSettings) {
    currentSettings.cacheLimit = val;
    await saveSettings(currentSettings);
  }
  await refreshList();
  await updateStats();
});

// Desktop toggles
toggleAutostart.addEventListener('change', async () => {
  await setAutostart(toggleAutostart.checked).catch(() => {});
  if (currentSettings) {
    currentSettings.autostart = toggleAutostart.checked;
    await saveSettings(currentSettings);
  }
});

toggleClipboardMonitor.addEventListener('change', async () => {
  await setClipboardMonitor(toggleClipboardMonitor.checked).catch(() => {});
  if (currentSettings) {
    currentSettings.clipboardMonitor = toggleClipboardMonitor.checked;
    await saveSettings(currentSettings);
  }
});

toggleNotification.addEventListener('change', async () => {
  if (currentSettings) {
    currentSettings.showNotification = toggleNotification.checked;
    await saveSettings(currentSettings);
  }
});

// Export
btnExport.addEventListener('click', handleExport);

// Import
btnImport.addEventListener('click', handleImport);

// ===== Tauri Events =====

async function setupTauriEvents() {
  // Tray "Cache clipboard" menu item
  onEvent('tray-cache-clipboard', async () => {
    await cacheClipboardContent(false);
  });

  // Tray "Settings" menu item
  onEvent('tray-open-settings', async () => {
    btnSettings.click();
  });

  // Global hotkey
  onEvent('hotkey-cache-clipboard', async () => {
    await cacheClipboardContent(false);
  });

  // Clipboard monitor
  onEvent('monitor-clipboard-changed', async (payload) => {
    if (payload) {
      const result = await addCache(payload);
      if (result.added) {
        await refreshList();
        await tryNotify('ClipStash', t('notifCached'));
      }
    }
  });
}

// ===== Init =====

async function init() {
  // Load settings
  currentSettings = await getSettings();

  // Load language
  initLang(currentSettings.language || 'en');
  applyI18n();
  
  // Update tray menu with current language
  await updateTrayMenu(t('traySettings'), t('trayQuit')).catch(() => {});

  // Load and apply theme
  const theme = await getTheme();
  await applyTheme(theme);

  // Setup scroll and render
  setupScrollLoading();
  await refreshList();

  // Setup Tauri events
  await setupTauriEvents();

  // Start clipboard monitor if enabled
  if (currentSettings.clipboardMonitor) {
    await setClipboardMonitor(true).catch(() => {});
  }
}

init();
