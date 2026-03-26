// ClipStash Extension - Popup entry point
// Orchestrates modules: card-renderer, modal-controller, trash-panel, sync-ui, settings-panel

import { initLang, t, getLang } from '../utils/i18n.js';
import {
  addCache, searchCaches, getStorageStats, getDeletedCaches, purgeExpiredCaches,
  getTheme,
} from '../utils/storage.js';
import {
  debounce, applyI18n, createConfirmController, applyThemeToDocument,
  getAdaptiveRefreshInterval,
} from '../shared/dom-utils.js';
import {
  PAGE_SIZE, SEARCH_DEBOUNCE_DELAY, FEEDBACK_DISPLAY_DURATION,
} from '../utils/constants.js';
import { formatRelativeTime } from '../utils/time.js';
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
let timeRefreshTimer = null;

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
  applyThemeToDocument(theme);
  await refreshList();
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

  // Re-schedule adaptive time refresh (new cards may need faster updates)
  scheduleTimeRefresh();
}

/**
 * scheduleTimeRefresh adaptively refreshes all [data-relative-time] elements.
 * Cancels any pending timer and re-schedules based on the newest visible timestamp.
 * The newest card changes fastest, so it drives the refresh frequency.
 * Interval decreases as content ages: 5s → 30s → 5min → 1h → stop (≥ 30d).
 */
function scheduleTimeRefresh() {
  clearTimeout(timeRefreshTimer);
  const els = document.querySelectorAll('[data-relative-time]');
  let newest = 0;
  els.forEach((el) => {
    const ts = Number(el.dataset.relativeTime);
    if (ts > 0) {
      el.textContent = formatRelativeTime(ts);
      if (ts > newest) newest = ts;
    }
  });
  const interval = getAdaptiveRefreshInterval(newest);
  if (interval > 0) {
    timeRefreshTimer = setTimeout(scheduleTimeRefresh, interval);
  }
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

// ===== Clipboard Read (directly in popup for image support) =====

/**
 * readClipboardInPopup reads clipboard content using the Clipboard API.
 * Popup has focus so navigator.clipboard.read() can access images.
 * Returns { type, content, htmlContent?, imageDataUrl?, imageHash? } or null.
 */
async function readClipboardInPopup() {
  try {
    const items = await navigator.clipboard.read();
    if (!items || items.length === 0) return null;

    const item = items[0];
    const types = item.types;

    // Check for image
    const imageType = types.find(t => t.startsWith('image/'));
    if (imageType) {
      const blob = await item.getType(imageType);
      const arrayBuffer = await blob.arrayBuffer();
      // Compute SHA-256 hash for dedup
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const imageHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      // Convert to data URL for display
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { type: 'image', content: '', imageDataUrl: dataUrl, imageHash };
    }

    // Check for HTML
    if (types.includes('text/html')) {
      const htmlBlob = await item.getType('text/html');
      const htmlContent = await htmlBlob.text();
      let textContent = '';
      if (types.includes('text/plain')) {
        const textBlob = await item.getType('text/plain');
        textContent = await textBlob.text();
      }
      if (htmlContent && htmlContent.trim()) {
        return {
          type: 'html',
          content: textContent || htmlContent.replace(/<[^>]+>/g, ''),
          htmlContent,
        };
      }
    }

    // Fallback to plain text
    if (types.includes('text/plain')) {
      const textBlob = await item.getType('text/plain');
      const text = await textBlob.text();
      if (text) return { type: 'text', content: text };
    }

    return null;
  } catch {
    // Fallback to readText (no image support)
    try {
      const text = await navigator.clipboard.readText();
      return text ? { type: 'text', content: text } : null;
    } catch {
      return null;
    }
  }
}

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

// Cache Now — read clipboard directly in popup (supports images)
btnCacheNow.addEventListener('click', async () => {
  btnCacheNow.disabled = true;
  btnCacheNow.classList.add('caching');
  try {
    const clipData = await readClipboardInPopup();
    if (!clipData) {
      showCacheNowFeedback(t('cacheEmpty'), 'cache-feedback-muted');
    } else {
      const result = await addCache(clipData);
      if (result.added) {
        showCacheNowFeedback(t('cacheSuccess'), 'cache-feedback-success');
        await refreshList();
      } else if (result.duplicate) {
        showCacheNowFeedback(t('cacheDuplicate'), 'cache-feedback-warn');
      } else {
        showCacheNowFeedback(t('cacheEmpty'), 'cache-feedback-muted');
      }
    }
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

  // Kick off adaptive relative-time refresh
  scheduleTimeRefresh();

  // Re-render cards once CM6 finishes lazy-loading (enables syntax highlighting)
  window.addEventListener('cm6-ready', () => refreshList(), { once: true });
}

init();
