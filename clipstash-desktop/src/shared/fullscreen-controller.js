// ClipStash - Shared fullscreen page controller
// Contains platform-agnostic fullscreen logic. Platform-specific behavior
// (clipboard write, HTML sanitization, data loading) is injected via callbacks.

import {
  highlightCode, escapeHtml, estimateDataUrlBytes, formatBytes,
  renderTagBadge, showTagExistsHint, showCopyFeedback,
  createConfirmController, applyI18n as sharedApplyI18n,
  applyThemeToDocument,
} from './dom-utils.js';
import { MAX_TAG_LENGTH } from './constants.js';

// ===== Module State =====

let currentItem = null;
let isEditMode = false;
let hasUnsavedChanges = false;

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

// External dependencies (set via init)
let tFn = null;
let formatFullTimeFn = null;
let copyToClipboardFn = null;
let sanitizeHtmlFn = null;
let updateCacheTagsFn = null;
let updateCacheContentFn = null;
let updateCacheLanguageFn = null;
let getAllTagsFn = null;
let confirm = null;

/**
 * initFullscreen wires up the fullscreen controller with platform-specific dependencies
 * @param {Object} deps
 * @param {Function} deps.t - i18n translation function
 * @param {Function} deps.formatFullTime - full time formatter
 * @param {Function} deps.copyToClipboard - platform-specific clipboard write (data, btnEl) => Promise
 * @param {Function} deps.sanitizeHtml - HTML sanitizer (html) => string
 * @param {Function} deps.updateCacheTags - (id, tags) => Promise
 * @param {Function} deps.updateCacheContent - (id, content) => Promise
 * @param {Function} deps.updateCacheLanguage - (id, lang) => Promise
 * @param {Function} deps.getAllTags - () => Promise<string[]>
 */
export function initFullscreen(deps) {
  tFn = deps.t;
  formatFullTimeFn = deps.formatFullTime;
  copyToClipboardFn = deps.copyToClipboard;
  sanitizeHtmlFn = deps.sanitizeHtml;
  updateCacheTagsFn = deps.updateCacheTags;
  updateCacheContentFn = deps.updateCacheContent;
  updateCacheLanguageFn = deps.updateCacheLanguage;
  getAllTagsFn = deps.getAllTags;

  // Create confirm dialog controller
  confirm = createConfirmController({
    overlay: document.getElementById('confirm-overlay'),
    titleEl: document.getElementById('confirm-title'),
    descEl: document.getElementById('confirm-desc'),
    cancelBtn: document.getElementById('btn-confirm-cancel'),
    okBtn: document.getElementById('btn-confirm-ok'),
  });

  // Wire up event listeners
  setupEventListeners();
}

/**
 * renderContent renders a cache item in the fullscreen view
 * @param {Object} item - cache record
 */
export function renderContent(item) {
  currentItem = item;
  isEditMode = false;
  hasUnsavedChanges = false;

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
    fsImage.alt = tFn('imageAlt');
    fsImageWrap.style.display = 'block';
  } else if (type === 'html' && item.htmlContent) {
    const safeHtml = sanitizeHtmlFn(item.htmlContent);
    fsHtmlWrap.innerHTML = safeHtml;
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

  // Set header ID badge
  const idStr = String(item.id);
  const shortId = idStr.includes('_') ? idStr.split('_').pop() : idStr.slice(0, 8);
  fsHeaderId.textContent = `#${shortId}`;

  // Meta info
  const sizeInfo = type === 'image'
    ? `${tFn('typeImage')} · ${formatBytes(estimateDataUrlBytes(item.imageDataUrl))}`
    : `${item.contentLength} ${tFn('chars')}`;
  const metaText = `${sizeInfo} · ${formatFullTimeFn(item.createdAt)}`;
  fsStatusMeta.textContent = metaText;

  // Render tags
  renderTags();
  fsTagInputWrap.style.display = 'none';
  fsTagInput.value = '';
  fsTagSuggestions.style.display = 'none';
}

// ===== Tags =====

function renderTags() {
  if (!currentItem) return;
  const tags = currentItem.tags || [];

  fsTagsEl.innerHTML = '';

  for (const tag of tags) {
    fsTagsEl.appendChild(renderTagBadge(tag, true, async (tg) => {
      const newTags = currentItem.tags.filter(x => x !== tg);
      await updateCacheTagsFn(currentItem.id, newTags);
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

async function showTagSuggestionsList(value) {
  const allTags = await getAllTagsFn();
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
    showTagExistsHint(fsTagInput, fsTagInputWrap, tFn);
    return;
  }
  tags.push(name);
  await updateCacheTagsFn(currentItem.id, tags);
  currentItem.tags = tags;
  renderTags();
  fsTagInput.value = '';
  fsTagSuggestions.style.display = 'none';
  fsTagInputWrap.style.display = 'none';
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

  fsEditBar.style.display = 'flex';
  fsHeaderLeft.style.display = 'none';
  fsHeaderActions.style.display = 'none';

  updateEditorHighlight();
}

async function saveEdit() {
  if (!currentItem || !isEditMode) return;

  const newContent = fsEditor.value;
  await updateCacheContentFn(currentItem.id, newContent);
  currentItem.content = newContent;
  currentItem.contentLength = [...newContent].length;
  exitEditMode();

  const lang = currentItem.language;
  if (lang) {
    fsCode.innerHTML = highlightCode(newContent, lang);
    fsCode.className = 'hljs';
  } else {
    fsCode.textContent = newContent;
    fsCode.className = '';
  }
  fsContent.style.display = 'block';

  const sizeInfo = `${currentItem.contentLength} ${tFn('chars')}`;
  const metaText = `${sizeInfo} · ${formatFullTimeFn(currentItem.createdAt)}`;
  fsStatusMeta.textContent = metaText;
}

function cancelEdit() {
  if (!currentItem) return;
  exitEditMode();

  const type = currentItem.type || 'text';
  if (type === 'html' && currentItem.htmlContent) {
    const safeHtml = sanitizeHtmlFn(currentItem.htmlContent);
    fsHtmlWrap.innerHTML = safeHtml;
    fsHtmlWrap.style.display = 'block';
    if (currentItem.content) {
      fsCode.textContent = currentItem.content;
      fsCode.className = '';
      fsContent.style.display = 'block';
    }
  } else {
    const lang = currentItem.language;
    if (lang) {
      fsCode.innerHTML = highlightCode(currentItem.content || '', lang);
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

function setupEventListeners() {
  // Copy
  btnFsCopy.addEventListener('click', () => {
    if (!currentItem) return;
    copyToClipboardFn(currentItem, btnFsCopy);
  });

  // Edit
  btnFsEdit.addEventListener('click', () => enterEditMode());

  // Edit save
  btnEditSave.addEventListener('click', saveEdit);

  // Edit cancel
  btnEditCancel.addEventListener('click', () => {
    if (!isEditMode) return;
    if (hasUnsavedChanges) {
      confirm.show(
        tFn('unsavedTitle'),
        tFn('unsavedDesc'),
        tFn('discardChanges'),
        () => {
          confirm.hide();
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
    await updateCacheLanguageFn(currentItem.id, lang);
    currentItem.language = lang;
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
      showTagSuggestionsList('');
    } else {
      fsTagSuggestions.style.display = 'none';
    }
  });

  fsTagInput.addEventListener('input', (e) => showTagSuggestionsList(e.target.value));
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

  // Click outside tag suggestions
  document.addEventListener('click', (e) => {
    if (!fsTagInputWrap.contains(e.target) && e.target !== btnFsAddTag) {
      fsTagSuggestions.style.display = 'none';
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('confirm-overlay').style.display !== 'none') {
        confirm.hide();
      } else if (isEditMode) {
        if (hasUnsavedChanges) {
          confirm.show(
            tFn('unsavedTitle'),
            tFn('unsavedDesc'),
            tFn('discardChanges'),
            () => {
              confirm.hide();
              cancelEdit();
            }
          );
        } else {
          cancelEdit();
        }
      }
    }
  });

  // Prevent accidental close when editing with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (isEditMode && hasUnsavedChanges) {
      e.preventDefault();
    }
  });
}
