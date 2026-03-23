// ClipStash Extension - Popup entry point
// Orchestrates modules: card-renderer, modal-controller, trash-panel, sync-ui, settings-panel

import { initLang, t, getLang } from '../utils/i18n.js';
import {
  searchCaches, getStorageStats, getDeletedCaches, purgeExpiredCaches,
  getTheme,
} from '../utils/storage.js';
import {
  debounce, applyI18n, createConfirmController, applyThemeToDocument,
} from '../shared/dom-utils.js';
import {
  PAGE_SIZE, SEARCH_DEBOUNCE_DELAY, FEEDBACK_DISPLAY_DURATION,
} from '../utils/constants.js';
import { createCacheCard } from './modules/card-renderer.js';
import { initModal, openModal, closeModal, isModalOpen } from './modules/modal-controller.js';
import { initTrashPanel, updateTrashButton, isTrashOpen, closeTrash } from './modules/trash-panel.js';
import { initSyncUI } from './modules/sync-ui.js';
import { initSettingsPanel, isSettingsOpen, closeSettings } from './modules/settings-panel.js';

// ===== State =====

let allFilteredCaches = [];
let displayedCount = 0;
let isLoadingMore = false;
let currentQuery = '';

// ===== DOM References =====

const cacheListEl = document.getElementById('cache-list');
const emptyStateEl = document.getElementById('empty-state');
const noResultsEl = document.getElementById('no-results');
const loadingMoreEl = document.getElementById('loading-more');
const searchInput = document.getElementById('search-input');
const btnSearchClear = document.getElementById('btn-search-clear');
const statsBar = document.getElementById('stats-bar');
const statsText = document.getElementById('stats-text');
const btnCacheNow = document.getElementById('btn-cache-now');

// ===== Confirm Dialog =====

const confirm = createConfirmController({
  overlay: document.getElementById('confirm-overlay'),
  titleEl: document.getElementById('confirm-title'),
  descEl: document.getElementById('confirm-desc'),
  cancelBtn: document.getElementById('btn-confirm-cancel'),
  okBtn: document.getElementById('btn-confirm-ok'),
});

// ===== Theme =====

async function applyTheme(theme) {
  applyThemeToDocument(theme, '../vendor');
}

// ===== List Rendering =====

async function refreshList() {
  allFilteredCaches = await searchCaches(currentQuery);
  displayedCount = 0;
  cacheListEl.innerHTML = '';
  appendNextPage();
  await updateStats();
  updateEmptyStates();
  await updateTrashButton();
}

function appendNextPage() {
  const nextBatch = allFilteredCaches.slice(displayedCount, displayedCount + PAGE_SIZE);
  for (const item of nextBatch) {
    cacheListEl.appendChild(createCacheCard(item, {
      onRefresh: refreshList,
      onOpenModal: openModal,
      onShowConfirm: confirm.show,
      onHideConfirm: confirm.hide,
    }));
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

  return displayedCount < allFilteredCaches.length;
}

async function updateStats() {
  const stats = await getStorageStats();
  const deleted = await getDeletedCaches();

  if (stats.count === 0 && deleted.length === 0) {
    statsBar.style.display = 'none';
    return;
  }

  statsBar.style.display = 'flex';

  if (stats.count === 0) {
    statsText.textContent = '';
  } else {
    const searchInfo = currentQuery.trim()
      ? ` · ${t('found', { n: allFilteredCaches.length })}`
      : '';
    statsText.textContent = `${stats.count} / ${stats.maxCount} ${t('items')}${searchInfo} · ${stats.formattedSize}`;
  }
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

// ===== Search =====

const handleSearch = debounce(async (query) => {
  currentQuery = query;
  btnSearchClear.style.display = query.trim() ? 'inline-flex' : 'none';
  await refreshList();
}, SEARCH_DEBOUNCE_DELAY);

// ===== Cache Now =====

let cacheNowFeedbackTimer = null;

function showCacheNowFeedback(text, cls) {
  const svgEl = btnCacheNow.querySelector('svg');
  const spanEl = btnCacheNow.querySelector('span');

  if (cacheNowFeedbackTimer) {
    clearTimeout(cacheNowFeedbackTimer);
    btnCacheNow.classList.remove(
      'cache-feedback-success', 'cache-feedback-warn', 'cache-feedback-muted'
    );
  }

  if (svgEl) svgEl.style.display = 'none';
  spanEl.textContent = text;
  btnCacheNow.classList.add(cls);

  cacheNowFeedbackTimer = setTimeout(() => {
    cacheNowFeedbackTimer = null;
    if (svgEl) svgEl.style.display = '';
    spanEl.textContent = t('cacheNow');
    btnCacheNow.classList.remove(cls);
  }, FEEDBACK_DISPLAY_DURATION);
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

// Cache Now
btnCacheNow.addEventListener('click', async () => {
  btnCacheNow.disabled = true;
  btnCacheNow.classList.add('caching');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'cache-clipboard-from-popup' });
    const status = response?.status || 'empty';
    let feedbackText = '';
    let feedbackClass = '';
    if (status === 'added') {
      feedbackText = t('cacheSuccess');
      feedbackClass = 'cache-feedback-success';
      await refreshList();
    } else if (status === 'duplicate') {
      feedbackText = t('cacheDuplicate');
      feedbackClass = 'cache-feedback-warn';
    } else {
      feedbackText = t('cacheEmpty');
      feedbackClass = 'cache-feedback-muted';
    }
    showCacheNowFeedback(feedbackText, feedbackClass);
  } catch {
    showCacheNowFeedback(t('cacheEmpty'), 'cache-feedback-muted');
  }
  btnCacheNow.disabled = false;
  btnCacheNow.classList.remove('caching');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isTrashOpen()) {
      closeTrash();
    } else if (isSettingsOpen()) {
      closeSettings();
    } else if (document.getElementById('confirm-overlay').style.display !== 'none') {
      confirm.hide();
    } else if (isModalOpen()) {
      closeModal();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'open-settings') {
    document.getElementById('btn-settings').click();
  }
});

// ===== Init =====

async function init() {
  // Load language
  await initLang();
  applyI18n(t, getLang);

  // Load and apply theme
  const theme = await getTheme();
  await applyTheme(theme);

  // Purge expired soft-deleted records
  await purgeExpiredCaches();

  // Initialize modules
  const sharedCallbacks = {
    showConfirm: confirm.show,
    hideConfirm: confirm.hide,
    onRefresh: refreshList,
  };

  initModal({
    ...sharedCallbacks,
  });

  initTrashPanel({
    ...sharedCallbacks,
  });

  initSettingsPanel({
    ...sharedCallbacks,
    onApplyTheme: applyTheme,
  });

  await initSyncUI({
    ...sharedCallbacks,
  });

  // Setup scroll and render
  setupScrollLoading();
  await refreshList();
}

init();
