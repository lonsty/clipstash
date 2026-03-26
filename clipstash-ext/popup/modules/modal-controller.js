// ClipStash Extension - Modal controller module

import { t, getLang } from '../../utils/i18n.js';
import { formatFullTime } from '../../utils/time.js';
import {
  ICON_PIN, ICON_PIN_FILLED,
} from '../../shared/icons.js';
import {
  escapeHtml, highlightCode, sanitizeHtml,
  estimateDataUrlBytes, formatBytes,
  renderTagBadge, showTagExistsHint, showCopyFeedback,
} from '../../shared/dom-utils.js';
import {
  MAX_TAG_LENGTH,
} from '../../utils/constants.js';
import {
  updateCacheTags, togglePin, updateCacheContent, updateCacheLanguage, getAllTags,
} from '../../utils/storage.js';
import { copyToClipboard } from './card-renderer.js';
import { createCM6Editor } from '../../shared/cm6-editor.js';

// ===== Module State =====

let currentModalData = null;
let isEditMode = false;
let hasUnsavedChanges = false;
let cm6Instance = null;

// ===== DOM References =====

const modalOverlay = document.getElementById('modal-overlay');
const modalBody = document.querySelector('.modal-body');
const modalContent = document.getElementById('modal-content');
const modalCode = document.getElementById('modal-code');
const modalEditorContainer = document.getElementById('modal-editor-container');
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

  // Pin in modal
  btnModalPin.addEventListener('click', async () => {
    if (!currentModalData) return;
    await togglePin(currentModalData.id);
    currentModalData.pinned = !currentModalData.pinned;
    updatePinButton(currentModalData.pinned);
    await onRefresh();
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

  // Language selector
  modalLangSelect.addEventListener('change', async () => {
    if (!currentModalData) return;
    const lang = modalLangSelect.value || null;
    await updateCacheLanguage(currentModalData.id, lang);
    currentModalData.language = lang;
    if (currentModalData.type !== 'image' && currentModalData.type !== 'html') {
      if (isEditMode && cm6Instance) {
        cm6Instance.setLanguage(lang);
      } else if (lang) {
        modalCode.innerHTML = highlightCode(currentModalData.content || '', lang);
      } else {
        modalCode.textContent = currentModalData.content;
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
      tagInputWrap.style.display = 'none';
      tagSuggestions.style.display = 'none';
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

  updatePinButton(item.pinned);

  btnModalEdit.style.display = (type === 'image') ? 'none' : 'inline-flex';
  modalLangSelect.style.display = (type === 'image' || type === 'html') ? 'none' : 'inline-flex';
  modalLangSelect.value = item.language || '';

  if (type === 'image' && item.imageDataUrl) {
    modalImage.src = item.imageDataUrl;
    modalImage.alt = t('imageAlt');
    modalImageWrap.style.display = 'block';
  } else if (type === 'html' && item.htmlContent) {
    const sanitized = sanitizeHtml(item.htmlContent);
    modalHtmlWrap.innerHTML = sanitized;
    modalHtmlWrap.style.display = 'block';
    if (item.content) {
      modalCode.textContent = item.content;
      modalCode.className = '';
      modalContent.style.display = 'block';
    }
  } else {
    if (item.language) {
      modalCode.innerHTML = highlightCode(item.content || '', item.language);
    } else {
      modalCode.textContent = item.content;
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
  if (cm6Instance) {
    cm6Instance.destroy();
    cm6Instance = null;
  }
  modalEditorContainer.style.display = 'none';
  modalEditorContainer.classList.remove('editing');
  modalBody.classList.remove('editing-mode');
  modalEditBar.style.display = 'none';
  modalHeaderId.style.display = '';
  modalHeaderActions.style.display = '';
  tagInputWrap.style.display = 'none';
  tagSuggestions.style.display = 'none';
}

function updatePinButton(pinned) {
  if (pinned) {
    btnModalPin.innerHTML = ICON_PIN_FILLED;
    btnModalPin.classList.add('is-pinned');
    btnModalPin.title = t('unpin');
  } else {
    btnModalPin.innerHTML = ICON_PIN;
    btnModalPin.classList.remove('is-pinned');
    btnModalPin.title = t('pin');
  }
}

function openFullscreen() {
  if (!currentModalData) return;
  const url = chrome.runtime.getURL(`fullscreen/fullscreen.html?id=${encodeURIComponent(currentModalData.id)}`);
  chrome.tabs.create({ url });
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

async function enterEditMode() {
  if (!currentModalData || currentModalData.type === 'image') return;
  isEditMode = true;
  hasUnsavedChanges = false;

  modalContent.style.display = 'none';
  modalHtmlWrap.style.display = 'none';
  modalEditorContainer.style.display = 'block';
  modalEditorContainer.classList.add('editing');
  modalBody.classList.add('editing-mode');

  modalEditBar.style.display = 'flex';
  modalHeaderId.style.display = 'none';
  modalHeaderActions.style.display = 'none';

  // Clear any old CM6 instance
  if (cm6Instance) {
    cm6Instance.destroy();
    cm6Instance = null;
  }
  modalEditorContainer.innerHTML = '';

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (document.documentElement.getAttribute('data-theme') === 'system' &&
     window.matchMedia('(prefers-color-scheme: dark)').matches);

  cm6Instance = await createCM6Editor(modalEditorContainer, {
    content: currentModalData.content || '',
    language: currentModalData.language || '',
    dark: isDark,
    onChange: () => { hasUnsavedChanges = true; },
  });
}

async function saveEdit() {
  if (!currentModalData || !isEditMode || !cm6Instance) return;

  const newContent = cm6Instance.getContent();
  await updateCacheContent(currentModalData.id, newContent);
  currentModalData.content = newContent;
  currentModalData.contentLength = [...newContent].length;
  exitEditMode();

  const lang = currentModalData.language;
  if (lang) {
    modalCode.innerHTML = highlightCode(newContent, lang);
  } else {
    modalCode.textContent = newContent;
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
    const sanitized = sanitizeHtml(currentModalData.htmlContent);
    modalHtmlWrap.innerHTML = sanitized;
    modalHtmlWrap.style.display = 'block';
    if (currentModalData.content) {
      modalCode.textContent = currentModalData.content;
      modalContent.style.display = 'block';
    }
  } else {
    const lang = currentModalData.language;
    if (lang) {
      modalCode.innerHTML = highlightCode(currentModalData.content || '', lang);
    } else {
      modalCode.textContent = currentModalData.content;
    }
    modalContent.style.display = 'block';
  }
}

function exitEditMode() {
  isEditMode = false;
  hasUnsavedChanges = false;
  if (cm6Instance) {
    cm6Instance.destroy();
    cm6Instance = null;
  }
  modalEditorContainer.style.display = 'none';
  modalEditorContainer.classList.remove('editing');
  modalBody.classList.remove('editing-mode');
  modalEditBar.style.display = 'none';
  modalHeaderId.style.display = '';
  modalHeaderActions.style.display = '';
}

/**
 * isModalOpen returns whether the modal is currently displayed
 * @returns {boolean}
 */
export function isModalOpen() {
  return modalOverlay.style.display !== 'none';
}
