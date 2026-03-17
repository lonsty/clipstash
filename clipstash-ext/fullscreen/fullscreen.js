// ClipStash Extension Fullscreen Page - Interaction logic
// Mirrors the modal detail view but in a standalone fullscreen window.
// Uses chrome.storage to load data instead of Tauri IPC.

import {
  updateCacheTags, updateCacheContent, updateCacheLanguage,
  getAllTags, formatBytes, getCaches, getTheme
} from '../utils/storage.js';
import { formatFullTime } from '../utils/time.js';
import { initLang, getLang, t } from '../utils/i18n.js';
import { MAX_TAG_LENGTH, THEME_SYSTEM } from '../utils/constants.js';

// ===== State =====

let currentItem = null;
let isEditMode = false;
let hasUnsavedChanges = false;
let confirmCallback = null;

// ===== DOM References =====

const fsHeaderId = document.getElementById('fs-header-id');
const fsEditBar = document.getElementById('fs-edit-bar');
const fsHeaderActions = document.getElementById('fs-header-actions');
const fsHeaderLeft = document.querySelector('.fs-header-left');
const fsBody = document.querySelector('.fs-body');
const fsContent = document.getElementById('fs-content');
const fsCode = document.getElementById('fs-code');
const fsEditorContainer = document.getElementById('fs-editor-container');
const fsEditor = document.getElementById('fs-editor');
const fsEditorPreview = document.getElementById('fs-editor-preview');
const fsEditorCode = document.getElementById('fs-editor-code');
const fsImageWrap = document.getElementById('fs-image-wrap');
const fsImage = document.getElementById('fs-image');
const fsHtmlWrap = document.getElementById('fs-html-wrap');
const fsContentToolbar = document.getElementById('fs-content-toolbar');
const btnFsCopy = document.getElementById('btn-fs-copy');
const btnFsEdit = document.getElementById('btn-fs-edit');
const btnEditCancel = document.getElementById('btn-edit-cancel');
const btnEditSave = document.getElementById('btn-edit-save');
const fsLangSelect = document.getElementById('fs-lang-select');
const fsStatusMeta = document.getElementById('fs-status-meta');
const fsTagsEl = document.getElementById('fs-tags');
const btnFsAddTag = document.getElementById('btn-fs-add-tag');
const fsTagInputWrap = document.getElementById('fs-tag-input-wrap');
const fsTagInput = document.getElementById('fs-tag-input');
const fsTagSuggestions = document.getElementById('fs-tag-suggestions');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmTitleEl = document.getElementById('confirm-title');
const confirmDescEl = document.getElementById('confirm-desc');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmOk = document.getElementById('btn-confirm-ok');

// ===== SVG Icons =====

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

function sanitizeHtml(html) {
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html);
  }
  // Fallback: strip script tags
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<script\b/gi, '&lt;script');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl) return 0;
  const base64Idx = dataUrl.indexOf(',');
  if (base64Idx === -1) return dataUrl.length;
  const base64Str = dataUrl.substring(base64Idx + 1);
  return Math.floor(base64Str.length * 3 / 4);
}

// ===== Theme =====

let currentTheme = THEME_SYSTEM;

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const hljsThemeEl = document.getElementById('hljs-theme');
  if (hljsThemeEl) {
    hljsThemeEl.href = isDark ? '../vendor/hljs-dark.css' : '../vendor/hljs-light.css';
  }
}

// ===== i18n DOM Binding =====

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
  span.title = tagName;

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

function renderTags() {
  if (!currentItem) return;
  const tags = currentItem.tags || [];

  fsTagsEl.innerHTML = '';

  for (const tag of tags) {
    fsTagsEl.appendChild(renderTagBadge(tag, true, async (tg) => {
      const newTags = currentItem.tags.filter(x => x !== tg);
      await updateCacheTags(currentItem.id, newTags);
      currentItem.tags = newTags;
      renderTags();
    }));
  }

  // Show text label on add-tag button only when no tags exist
  const addTagLabel = btnFsAddTag.querySelector('.btn-add-tag-label');
  if (addTagLabel) {
    addTagLabel.style.display = tags.length === 0 ? '' : 'none';
  }
}

async function showTagSuggestions(value) {
  const allTags = await getAllTags();
  const currentTags = currentItem?.tags || [];
  const q = value.toLowerCase().trim();
  const filtered = allTags.filter(tg =>
    !currentTags.includes(tg) && (!q || tg.toLowerCase().includes(q))
  );
  if (filtered.length === 0) {
    fsTagSuggestions.style.display = 'none';
    return;
  }
  fsTagSuggestions.innerHTML = '';
  for (const tg of filtered.slice(0, 8)) {
    const item = document.createElement('div');
    item.className = 'tag-suggestion-item';
    item.textContent = tg;
    item.addEventListener('click', () => addTagToItem(tg));
    fsTagSuggestions.appendChild(item);
  }
  fsTagSuggestions.style.display = 'block';
}

async function addTagToItem(tagName) {
  if (!currentItem) return;
  const name = tagName.trim();
  if (!name || name.length > MAX_TAG_LENGTH) return;
  const tags = currentItem.tags || [];
  if (tags.includes(name)) {
    showTagExistsHint(fsTagInput, fsTagInputWrap);
    return;
  }
  tags.push(name);
  await updateCacheTags(currentItem.id, tags);
  currentItem.tags = tags;
  renderTags();
  fsTagInput.value = '';
  fsTagSuggestions.style.display = 'none';
  fsTagInputWrap.style.display = 'none';
}

function showTagExistsHint(inputEl, wrapEl) {
  const oldHint = wrapEl.querySelector('.tag-exists-hint');
  if (oldHint) oldHint.remove();

  inputEl.classList.remove('tag-exists');
  void inputEl.offsetWidth;
  inputEl.classList.add('tag-exists');

  const hint = document.createElement('div');
  hint.className = 'tag-exists-hint';
  hint.textContent = t('tagExists');
  wrapEl.appendChild(hint);

  setTimeout(() => {
    inputEl.classList.remove('tag-exists');
    hint.remove();
  }, 2000);
}

// ===== Clipboard =====

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
    showCopyFeedback(btnEl);
  } catch {
    try {
      await navigator.clipboard.writeText(data.content || '');
    } catch {
      // Silent fail
    }
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

// ===== Render Content =====

function renderContent(item) {
  const type = item.type || 'text';

  fsContent.style.display = 'none';
  fsImageWrap.style.display = 'none';
  fsHtmlWrap.style.display = 'none';
  fsEditorContainer.style.display = 'none';
  fsEditBar.style.display = 'none';

  // Show/hide edit & language controls based on type
  btnFsEdit.style.display = (type === 'image') ? 'none' : 'inline-flex';
  fsLangSelect.style.display = (type === 'image' || type === 'html') ? 'none' : 'inline-flex';
  fsLangSelect.value = item.language || '';

  if (type === 'image' && item.imageDataUrl) {
    fsImage.src = item.imageDataUrl;
    fsImage.alt = t('imageAlt');
    fsImageWrap.style.display = 'block';
  } else if (type === 'html' && item.htmlContent) {
    const sanitized = sanitizeHtml(item.htmlContent);
    fsHtmlWrap.innerHTML = sanitized;
    fsHtmlWrap.style.display = 'block';
    if (item.content) {
      fsCode.textContent = item.content;
      fsCode.className = '';
      fsContent.style.display = 'block';
    }
  } else {
    if (item.language) {
      fsCode.innerHTML = highlightCode(item.content || '', item.language);
      fsCode.className = 'hljs';
    } else {
      fsCode.textContent = item.content;
      fsCode.className = '';
    }
    fsContent.style.display = 'block';
  }

  // Set header ID badge (random hex part after underscore)
  const idStr = String(item.id);
  const shortId = idStr.includes('_') ? idStr.split('_').pop() : idStr.slice(0, 8);
  fsHeaderId.textContent = `#${shortId}`;

  // Meta info
  const sizeInfo = type === 'image'
    ? `${t('typeImage')} · ${formatBytes(estimateDataUrlBytes(item.imageDataUrl))}`
    : `${item.contentLength} ${t('chars')}`;
  const metaText = `${sizeInfo} · ${formatFullTime(item.createdAt)}`;
  fsStatusMeta.textContent = metaText;

  // Render tags
  renderTags();
  fsTagInputWrap.style.display = 'none';
  fsTagInput.value = '';
  fsTagSuggestions.style.display = 'none';
}

// ===== Edit Mode =====

function enterEditMode() {
  if (!currentItem || isEditMode) return;
  isEditMode = true;
  hasUnsavedChanges = false;

  const viewHeight = fsContent.offsetHeight || fsHtmlWrap.offsetHeight || 80;

  fsEditor.value = currentItem.content || '';

  fsEditor.style.height = 'auto';
  const contentHeight = fsEditor.scrollHeight;
  const editorHeight = Math.max(viewHeight, contentHeight, 80);
  fsEditor.style.height = `${editorHeight}px`;

  fsContent.style.display = 'none';
  fsHtmlWrap.style.display = 'none';
  fsEditorContainer.style.display = 'block';
  fsEditorContainer.classList.add('editing');
  fsBody.classList.add('editing-mode');

  // Show edit bar, hide header left and actions
  fsEditBar.style.display = 'flex';
  fsHeaderLeft.style.display = 'none';
  fsHeaderActions.style.display = 'none';

  updateEditorHighlight();
}

async function saveEdit() {
  if (!currentItem || !isEditMode) return;

  const newContent = fsEditor.value;
  await updateCacheContent(currentItem.id, newContent);
  currentItem.content = newContent;
  currentItem.contentLength = [...newContent].length;
  exitEditMode();

  // Re-render content with highlighting
  const lang = currentItem.language;
  if (lang) {
    fsCode.innerHTML = highlightCode(newContent, lang);
    fsCode.className = 'hljs';
  } else {
    fsCode.textContent = newContent;
    fsCode.className = '';
  }
  fsContent.style.display = 'block';

  // Update meta
  const sizeInfo = `${currentItem.contentLength} ${t('chars')}`;
  const metaText = `${sizeInfo} · ${formatFullTime(currentItem.createdAt)}`;
  fsStatusMeta.textContent = metaText;
}

function cancelEdit() {
  if (!currentItem) return;
  exitEditMode();

  // Restore original content display
  const type = currentItem.type || 'text';
  if (type === 'html' && currentItem.htmlContent) {
    const sanitized = sanitizeHtml(currentItem.htmlContent);
    fsHtmlWrap.innerHTML = sanitized;
    fsHtmlWrap.style.display = 'block';
    if (currentItem.content) {
      fsCode.textContent = currentItem.content;
      fsCode.className = '';
      fsContent.style.display = 'block';
    }
  } else {
    if (currentItem.language) {
      fsCode.innerHTML = highlightCode(currentItem.content || '', currentItem.language);
      fsCode.className = 'hljs';
    } else {
      fsCode.textContent = currentItem.content;
      fsCode.className = '';
    }
    fsContent.style.display = 'block';
  }
}

function exitEditMode() {
  isEditMode = false;
  hasUnsavedChanges = false;
  fsEditorContainer.style.display = 'none';
  fsEditor.classList.remove('has-highlight');
  fsEditorContainer.classList.remove('editing');
  fsBody.classList.remove('editing-mode');
  fsEditBar.style.display = 'none';
  fsHeaderLeft.style.display = '';
  fsHeaderActions.style.display = '';
}

function updateEditorHighlight() {
  if (!isEditMode || !currentItem) return;

  const lang = currentItem.language;
  const content = fsEditor.value;

  if (lang && typeof hljs !== 'undefined') {
    fsEditor.classList.add('has-highlight');
    const highlighted = highlightCode(content, lang);
    fsEditorCode.innerHTML = highlighted;
    fsEditorCode.className = 'hljs';
  } else {
    fsEditor.classList.add('has-highlight');
    fsEditorCode.textContent = content;
    fsEditorCode.className = '';
  }
}

// ===== Event Listeners =====

// Copy
btnFsCopy.addEventListener('click', () => {
  if (!currentItem) return;
  copyToClipboard(currentItem, btnFsCopy);
});

// Edit
btnFsEdit.addEventListener('click', () => enterEditMode());

// Edit save
btnEditSave.addEventListener('click', saveEdit);

// Edit cancel
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

// Editor input: track changes + highlight + auto-resize
fsEditor.addEventListener('input', () => {
  hasUnsavedChanges = true;
  updateEditorHighlight();
  fsEditor.style.height = 'auto';
  fsEditor.style.height = `${Math.max(fsEditor.scrollHeight, 80)}px`;
});

// Sync scroll between editor and preview
fsEditor.addEventListener('scroll', () => {
  if (fsEditorPreview) {
    fsEditorPreview.scrollTop = fsEditor.scrollTop;
    fsEditorPreview.scrollLeft = fsEditor.scrollLeft;
  }
});

// Language selector
fsLangSelect.addEventListener('change', async () => {
  if (!currentItem) return;
  const lang = fsLangSelect.value || null;
  await updateCacheLanguage(currentItem.id, lang);
  currentItem.language = lang;
  // Re-render highlighted content
  if (currentItem.type !== 'image' && currentItem.type !== 'html') {
    if (lang) {
      fsCode.innerHTML = highlightCode(currentItem.content || '', lang);
      fsCode.className = 'hljs';
    } else {
      fsCode.textContent = currentItem.content;
      fsCode.className = '';
    }
  }
});

// Tag input
btnFsAddTag.addEventListener('click', () => {
  fsTagInputWrap.style.display = fsTagInputWrap.style.display === 'none' ? 'block' : 'none';
  if (fsTagInputWrap.style.display === 'block') {
    fsTagInput.focus();
    showTagSuggestions('');
  } else {
    fsTagSuggestions.style.display = 'none';
  }
});

fsTagInput.addEventListener('input', (e) => showTagSuggestions(e.target.value));
fsTagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTagToItem(fsTagInput.value);
  }
  if (e.key === 'Escape') {
    fsTagInputWrap.style.display = 'none';
    fsTagSuggestions.style.display = 'none';
  }
});

fsTagInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!fsTagInputWrap.contains(document.activeElement)) {
      fsTagInputWrap.style.display = 'none';
      fsTagSuggestions.style.display = 'none';
      fsTagInput.value = '';
    }
  }, 150);
});

// Confirm dialog
btnConfirmCancel.addEventListener('click', hideConfirm);
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) hideConfirm();
});
btnConfirmOk.addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
});

// Click outside tag suggestions
document.addEventListener('click', (e) => {
  if (!fsTagInputWrap.contains(e.target) && e.target !== btnFsAddTag) {
    fsTagSuggestions.style.display = 'none';
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (confirmOverlay.style.display !== 'none') {
      hideConfirm();
    } else if (isEditMode) {
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
    }
  }
});

// ===== Load Item from chrome.storage =====

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
    applyTheme(theme);
  } catch {
    applyTheme('system');
  }

  // Load the cache item by ID
  currentItem = await getCacheById(itemId);

  if (!currentItem) {
    document.body.textContent = 'Item not found';
    return;
  }

  // Apply i18n and render
  applyI18n();
  renderContent(currentItem);
}

init();
