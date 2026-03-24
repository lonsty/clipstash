// ClipStash Desktop - Modal controller module

import { t, getLang } from '../../utils/i18n.js';
import { formatFullTime } from '../../utils/time.js';
import {
  escapeHtml, highlightCode,
  estimateDataUrlBytes, formatBytes,
  renderTagBadge, showTagExistsHint, showCopyFeedback,
} from '../../shared/dom-utils.js';
import {
  MAX_TAG_LENGTH,
} from '../../shared/constants.js';
import {
  updateCacheTags, togglePin, updateCacheContent, updateCacheLanguage, getAllTags,
} from '../../utils/storage.js';
import { openFullscreenWindow, openStickyWindow } from '../../utils/bridge.js';
import { copyToClipboard } from './card-renderer.js';

// ===== Module State =====

let currentModalData = null;
let isEditMode = false;
let hasUnsavedChanges = false;

// ===== DOM References =====

const modalOverlay = document.getElementById('modal-overlay');
const modalBody = document.querySelector('.modal-body');
const modalContent = document.getElementById('modal-content');
const modalCode = document.getElementById('modal-code');
const modalEditorContainer = document.getElementById('modal-editor-container');
const modalEditor = document.getElementById('modal-editor');
const modalEditorPreview = document.getElementById('modal-editor-preview');
const modalEditorCode = document.getElementById('modal-editor-code');
const modalImageWrap = document.getElementById('modal-image-wrap');
const modalImage = document.getElementById('modal-image');
const modalHtmlWrap = document.getElementById('modal-html-wrap');
const modalMeta = document.getElementById('modal-meta');
const modalHeaderId = document.getElementById('modal-header-id');
const modalEditBar = document.getElementById('modal-edit-bar');
const modalHeaderActions = document.querySelector('.modal-header-actions');
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
const btnEditCancel = document.getElementById('btn-edit-cancel');
const btnEditSave = document.getElementById('btn-edit-save');
const modalLangSelect = document.getElementById('modal-lang-select');

// External callbacks (set via init)
let showConfirm = null;
let hideConfirm = null;
let onRefresh = null;

/**
 * initModal wires up the modal controller with external dependencies
 * @param {Object} callbacks
 */
export function initModal(callbacks) {
  showConfirm = callbacks.showConfirm;
  hideConfirm = callbacks.hideConfirm;
  onRefresh = callbacks.onRefresh;

  // Wire up event listeners
  btnModalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  btnModalCopy.addEventListener('click', () => {
    if (!currentModalData) return;
    copyToClipboard(currentModalData, btnModalCopy);
  });
  btnModalFullscreen.addEventListener('click', openFullscreen);

  // Pin in modal → Desktop: opens sticky note window
  btnModalPin.addEventListener('click', async () => {
    if (!currentModalData) return;
    try {
      await openStickyWindow(currentModalData.id);
      closeModal();
    } catch {
      // Fallback: open as blob URL
      const blob = new Blob(['<p>Failed to open sticky note</p>'], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  });

  // Edit mode
  btnModalEdit.addEventListener('click', enterEditMode);
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
  btnEditSave.addEventListener('click', saveEdit);

  // Editor input: track changes + highlight + auto-resize
  modalEditor.addEventListener('input', () => {
    hasUnsavedChanges = true;
    updateEditorHighlight();
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

  // Language selector
  modalLangSelect.addEventListener('change', async () => {
    if (!currentModalData) return;
    const lang = modalLangSelect.value || null;
    await updateCacheLanguage(currentModalData.id, lang);
    currentModalData.language = lang;
    if (currentModalData.type !== 'image' && currentModalData.type !== 'html') {
      if (lang) {
        modalCode.innerHTML = highlightCode(currentModalData.content || '', lang);
        modalCode.className = 'hljs';
      } else {
        modalCode.textContent = currentModalData.content;
        modalCode.className = '';
      }
    }
    await onRefresh();
  });

  // Tag input
  btnAddTag.addEventListener('click', () => {
    tagInputWrap.style.display = tagInputWrap.style.display === 'none' ? 'block' : 'none';
    if (tagInputWrap.style.display === 'block') {
      tagInput.focus();
      showTagSuggestionsList('');
    } else {
      tagSuggestions.style.display = 'none';
    }
  });

  tagInput.addEventListener('input', (e) => showTagSuggestionsList(e.target.value));
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

  tagInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!tagInputWrap.contains(document.activeElement)) {
        tagInputWrap.style.display = 'none';
        tagSuggestions.style.display = 'none';
        tagInput.value = '';
      }
    }, 150);
  });

  // Click outside tag suggestions
  document.addEventListener('click', (e) => {
    if (!tagInputWrap.contains(e.target) && e.target !== btnAddTag) {
      tagSuggestions.style.display = 'none';
    }
  });
}

// ===== Modal Open / Close =====

export function openModal(item) {
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
  modalHeaderActions.style.display = '';

  modalHeaderId.textContent = `#${item.id}`;

  btnModalEdit.style.display = (type === 'image') ? 'none' : 'inline-flex';
  modalLangSelect.style.display = (type === 'image' || type === 'html') ? 'none' : 'inline-flex';
  modalLangSelect.value = item.language || '';

  if (type === 'image' && item.imageDataUrl) {
    modalImage.src = item.imageDataUrl;
    modalImage.alt = t('imageAlt');
    modalImageWrap.style.display = 'block';
  } else if (type === 'html' && item.htmlContent) {
    // Desktop: render HTML content directly (no DOMPurify available by default)
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

export function closeModal() {
  if (isEditMode && hasUnsavedChanges) {
    showConfirm(
      t('unsavedTitle'),
      t('unsavedDesc'),
      t('discardChanges'),
      () => {
        hideConfirm();
        doCloseModal();
      }
    );
    return;
  }
  doCloseModal();
}

function doCloseModal() {
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
    const blob = new Blob(['<p>Failed to open fullscreen</p>'], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
}

// ===== Tags =====

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
      await onRefresh();
    }));
  }

  const addTagLabel = btnAddTag.querySelector('.btn-add-tag-label');
  if (addTagLabel) {
    addTagLabel.style.display = tags.length === 0 ? '' : 'none';
  }
}

async function showTagSuggestionsList(value) {
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
  if (!name || name.length > MAX_TAG_LENGTH) return;
  const tags = currentModalData.tags || [];
  if (tags.includes(name)) {
    showTagExistsHint(tagInput, tagInputWrap, t);
    return;
  }
  tags.push(name);
  await updateCacheTags(currentModalData.id, tags);
  currentModalData.tags = tags;
  renderModalTags();
  tagInput.value = '';
  tagSuggestions.style.display = 'none';
  tagInputWrap.style.display = 'none';
  await onRefresh();
}

// ===== Edit Mode =====

function enterEditMode() {
  if (!currentModalData || currentModalData.type === 'image') return;
  isEditMode = true;
  hasUnsavedChanges = false;

  const viewHeight = modalContent.offsetHeight || modalHtmlWrap.offsetHeight || 80;
  modalEditor.value = currentModalData.content || '';
  modalEditor.style.height = 'auto';
  const contentHeight = modalEditor.scrollHeight;
  const editorHeight = Math.max(viewHeight, contentHeight, 80);
  modalEditor.style.height = `${editorHeight}px`;

  modalContent.style.display = 'none';
  modalHtmlWrap.style.display = 'none';
  modalEditorContainer.style.display = 'block';
  modalEditorContainer.classList.add('editing');
  modalBody.classList.add('editing-mode');

  modalEditBar.style.display = 'flex';
  modalHeaderId.style.display = 'none';
  modalHeaderActions.style.display = 'none';

  updateEditorHighlight();
}

async function saveEdit() {
  if (!currentModalData || !isEditMode) return;

  const newContent = modalEditor.value;
  await updateCacheContent(currentModalData.id, newContent);
  currentModalData.content = newContent;
  currentModalData.contentLength = [...newContent].length;
  exitEditMode();

  const lang = currentModalData.language;
  if (lang) {
    modalCode.innerHTML = highlightCode(newContent, lang);
    modalCode.className = 'hljs';
  } else {
    modalCode.textContent = newContent;
    modalCode.className = '';
  }
  modalContent.style.display = 'block';

  const sizeInfo = `${currentModalData.contentLength} ${t('chars')}`;
  const metaText = `${sizeInfo} · ${formatFullTime(currentModalData.createdAt)}`;
  modalMeta.textContent = metaText;
  modalStatusMeta.textContent = metaText;

  await onRefresh();
}

function cancelEdit() {
  if (!currentModalData) return;
  exitEditMode();

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
    const lang = currentModalData.language;
    if (lang) {
      modalCode.innerHTML = highlightCode(currentModalData.content || '', lang);
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
    modalEditor.classList.add('has-highlight');
    modalEditorCode.textContent = content;
    modalEditorCode.className = '';
  }
}

/**
 * isModalOpen returns whether the modal is currently displayed
 * @returns {boolean}
 */
export function isModalOpen() {
  return modalOverlay.style.display !== 'none';
}
