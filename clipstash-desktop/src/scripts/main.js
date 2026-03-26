// ClipStash Desktop - Main entry point
// Orchestrates modules: card-renderer, modal-controller, trash-panel, sync-ui, settings-panel

import { initLang, t, getLang } from '../utils/i18n.js';
import {
  addCache, searchCaches, getStorageStats, getDeletedCaches, purgeExpiredCaches,
  getSettings, getTheme,
} from '../utils/storage.js';
import {
  readClipboard, onEvent, showNotification,
  setClipboardMonitor, updateTrayMenu,
} from '../utils/bridge.js';
import { info, attachConsole, forwardConsole } from '../utils/logger.js';
import {
  debounce, applyI18n, createConfirmController, applyThemeToDocument,
  getAdaptiveRefreshInterval,
} from '../shared/dom-utils.js';
import { formatRelativeTime } from '../utils/time.js';
import {
  PAGE_SIZE, SEARCH_DEBOUNCE_DELAY, FEEDBACK_DISPLAY_DURATION, TRASH_TTL_MS,
} from '../shared/constants.js';
import { createCacheCard } from './modules/card-renderer.js';
import { initModal, openModal, closeModal, isModalOpen } from './modules/modal-controller.js';
import { initTrashPanel, updateTrashButton, isTrashOpen, closeTrash } from './modules/trash-panel.js';
import { initSyncUI } from './modules/sync-ui.js';
import {
  initSettingsPanel, isSettingsOpen, closeSettings,
  getCurrentSettings, setCurrentSettings,
} from './modules/settings-panel.js';

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
  scheduleTimeRefresh();
}

/**
 * scheduleTimeRefresh adaptively refreshes all [data-relative-time] elements.
 * Cancels any pending timer and re-schedules based on the newest visible timestamp.
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
  let hasTrash = false;
  try {
    const deleted = await getDeletedCaches();
    hasTrash = deleted.length > 0;
  } catch {
    // ignore
  }

  if (stats.count === 0 && !hasTrash) {
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

// ===== Cache Clipboard (from button / tray / hotkey / monitor) =====

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
  }

  if (showFeedbackOnButton) {
    showCacheNowFeedback(t('cacheEmpty'), 'cache-feedback-muted');
  }
  return 'empty';
}

async function tryNotify(title, body) {
  const settings = getCurrentSettings();
  if (!settings?.showNotification) return;
  try {
    await showNotification(title, body);
  } catch {
    // Notification not available
  }
}

// ===== Cache Now Button Feedback =====

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

// ===== Tauri Events =====

async function setupTauriEvents() {
  // Tray "Cache clipboard" menu item
  onEvent('tray-cache-clipboard', async () => {
    await cacheClipboardContent(false);
  });

  // Tray "Settings" menu item
  onEvent('tray-open-settings', () => {
    document.getElementById('btn-settings').click();
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
  await cacheClipboardContent(true);
  btnCacheNow.disabled = false;
  btnCacheNow.classList.remove('caching');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('confirm-overlay').style.display !== 'none') {
      confirm.hide();
    } else if (isTrashOpen()) {
      closeTrash();
    } else if (isSettingsOpen()) {
      closeSettings();
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

// ===== Init =====

async function init() {
  // Initialize logging: forward console to Tauri log plugin
  forwardConsole();
  await attachConsole().catch(() => {});

  // Load settings
  const settings = await getSettings();
  setCurrentSettings(settings);

  // Load language
  initLang(settings.language || 'en');
  applyI18n(t, getLang);

  // Update tray menu with current language
  await updateTrayMenu(t('traySettings'), t('trayQuit')).catch(() => {});

  // Load and apply theme
  const theme = await getTheme();
  await applyTheme(theme);

  // Purge expired soft-deleted records on startup + periodically (every hour)
  await purgeExpiredCaches(TRASH_TTL_MS).catch(() => {});
  setInterval(() => {
    purgeExpiredCaches(TRASH_TTL_MS).catch(() => {});
  }, 60 * 60 * 1000);

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

  // Setup Tauri events (tray, hotkey, clipboard monitor)
  await setupTauriEvents();

  // Start clipboard monitor if enabled
  if (settings.clipboardMonitor) {
    await setClipboardMonitor(true).catch(() => {});
  }

  // Kick off adaptive relative-time refresh
  scheduleTimeRefresh();

  // Re-render cards once CM6 finishes lazy-loading (enables syntax highlighting)
  window.addEventListener('cm6-ready', () => refreshList(), { once: true });

  info('Main window initialized');
}

init();
