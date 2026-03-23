// ClipStash Extension - Cloud Sync UI module

import { t } from '../../utils/i18n.js';
import { applyI18n } from '../../shared/dom-utils.js';
import { getLang } from '../../utils/i18n.js';
import {
  SYNC_PUSH_DEBOUNCE_DELAY,
  SYNC_MIN_INTERVAL_MS,
  SYNC_TOAST_DURATION,
  SYNC_AUTH_PATTERN,
} from '../../utils/constants.js';
import { getSyncSettings, saveSyncSettings, initSync, performSync, disconnectSync, formatSyncTime } from '../../utils/sync.js';
import { onStorageChange } from '../../utils/storage.js';

// DOM references
const syncSetupEl = document.getElementById('sync-setup');
const syncConnectedEl = document.getElementById('sync-connected');
const syncTokenInput = document.getElementById('sync-token-input');
const btnSyncTokenToggle = document.getElementById('btn-sync-token-toggle');
const btnSyncConnect = document.getElementById('btn-sync-connect');
const btnSyncNow = document.getElementById('btn-sync-now');
const btnSyncDisconnect = document.getElementById('btn-sync-disconnect');
const syncStatusText = document.getElementById('sync-status-text');
const syncLastSyncEl = document.getElementById('sync-last-sync');
const syncResultEl = document.getElementById('sync-result');
const syncToastEl = document.getElementById('sync-toast');
const autoSyncToggleWrap = document.getElementById('auto-sync-toggle-wrap');
const toggleAutoSync = document.getElementById('toggle-auto-sync');
const autoSyncItem = document.querySelector('.settings-item--auto-sync');
const btnSyncQuick = document.getElementById('btn-sync-quick');

// State
let syncPushTimer = null;
let isSyncing = false;
let syncAuthFailed = false;
let syncToastTimer = null;
let autoSyncEnabled = true;

// External callbacks
let showConfirm = null;
let hideConfirm = null;
let onRefresh = null;

// ===== Sync Button State =====

const SYNC_STATE_CLASSES = ['sync-state--ok', 'sync-state--syncing', 'sync-state--error'];

function updateSyncIndicator(state) {
  const titles = {
    syncing: t('syncIndicatorSyncing'),
    ok: t('syncIndicatorOk'),
    error: t('syncIndicatorError'),
  };
  btnSyncQuick.classList.remove(...SYNC_STATE_CLASSES);
  btnSyncQuick.classList.add(`sync-state--${state}`);
  btnSyncQuick.title = titles[state] || t('syncQuickTooltip');
  btnSyncQuick.style.display = '';
}

function hideSyncIndicator() {
  btnSyncQuick.classList.remove(...SYNC_STATE_CLASSES);
  btnSyncQuick.style.display = 'none';
}

// ===== Sync Toast =====

function showSyncToast(message, isError = false) {
  clearTimeout(syncToastTimer);
  syncToastEl.textContent = message;
  syncToastEl.className = isError ? 'sync-toast toast-error' : 'sync-toast';
  syncToastEl.style.display = 'block';
  syncToastTimer = setTimeout(() => {
    syncToastEl.style.display = 'none';
  }, SYNC_TOAST_DURATION);
}

// ===== Auto Sync =====

async function isSyncEnabled() {
  try {
    const s = await getSyncSettings();
    return !!(s.enabled && s.token && s.gistId);
  } catch {
    return false;
  }
}

async function autoSyncPull() {
  if (isSyncing || syncAuthFailed || !autoSyncEnabled) return;
  const enabled = await isSyncEnabled();
  if (!enabled) return;

  // Throttle: skip if last sync was within the minimum interval
  const settings = await getSyncSettings();
  if (settings.lastSyncAt > 0 && (Date.now() - settings.lastSyncAt) < SYNC_MIN_INTERVAL_MS) {
    console.log(`[AutoSync] Skipped — last sync was less than ${SYNC_MIN_INTERVAL_MS / 1000}s ago`);
    return;
  }

  isSyncing = true;
  updateSyncIndicator('syncing');

  try {
    const result = await performSync();

    const hasChanges = result.pulled > 0 || result.updated > 0 || result.deleted > 0;
    if (hasChanges) {
      showSyncToast(t('syncAutoMerged', { n: result.pulled }));
      await onRefresh();
    }

    const syncSettings = await getSyncSettings();
    renderSyncState(syncSettings);
    updateSyncIndicator('ok');
  } catch (err) {
    const errMsg = typeof err === 'string' ? err : (err.message || String(err));
    console.warn(`[AutoSync] Pull failed: ${errMsg}`);

    if (SYNC_AUTH_PATTERN.test(errMsg)) {
      console.warn('[AutoSync] Auth failure detected — disabling auto-sync until re-connect');
      syncAuthFailed = true;
      clearTimeout(syncPushTimer);
    }

    updateSyncIndicator('error');
  } finally {
    isSyncing = false;
  }
}

/**
 * scheduleSyncPush debounces a sync push after data mutations.
 * No longer exported — triggered automatically via storage change hook.
 */
function scheduleSyncPush() {
  if (syncAuthFailed || !autoSyncEnabled) return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(async () => {
    await autoSyncPull();
  }, SYNC_PUSH_DEBOUNCE_DELAY);
}

// ===== Sync State Rendering =====

function renderSyncState(syncSettings) {
  if (syncSettings.enabled && syncSettings.token && syncSettings.gistId) {
    syncSetupEl.style.display = 'none';
    syncConnectedEl.style.display = 'block';
    syncStatusText.textContent = t('syncConnected');

    const statusDot = syncConnectedEl.querySelector('.sync-status-dot');
    statusDot.className = 'sync-status-dot sync-status-dot--ok';

    if (syncSettings.lastSyncAt > 0) {
      syncLastSyncEl.textContent = t('syncLastSync', { t: formatSyncTime(syncSettings.lastSyncAt, t('syncNever')) });
    } else {
      syncLastSyncEl.textContent = t('syncLastSync', { t: t('syncNever') });
    }
    syncLastSyncEl.style.display = '';

    // Enable auto-sync toggle when connected
    toggleAutoSync.disabled = false;
    autoSyncItem.classList.remove('is-disabled');
    // Read persisted auto-sync preference (default true)
    autoSyncEnabled = syncSettings.autoSync !== false;
    toggleAutoSync.checked = autoSyncEnabled;
  } else {
    syncSetupEl.style.display = 'block';
    syncConnectedEl.style.display = 'none';
    syncTokenInput.value = '';
    // Disable auto-sync toggle when disconnected
    toggleAutoSync.disabled = true;
    toggleAutoSync.checked = false;
    autoSyncItem.classList.add('is-disabled');
    autoSyncEnabled = false;
  }
}

function showSyncResult(message, isError) {
  syncResultEl.textContent = message;
  syncResultEl.className = isError ? 'sync-result error' : 'sync-result success';
  syncResultEl.style.display = 'block';
  setTimeout(() => { syncResultEl.style.display = 'none'; }, 5000);
}

// ===== Init =====

/**
 * initSyncUI wires up sync UI events and performs initial load
 * @param {Object} callbacks
 */
export async function initSyncUI(callbacks) {
  showConfirm = callbacks.showConfirm;
  hideConfirm = callbacks.hideConfirm;
  onRefresh = callbacks.onRefresh;

  // Token visibility toggle
  btnSyncTokenToggle.addEventListener('click', () => {
    const isPassword = syncTokenInput.type === 'password';
    syncTokenInput.type = isPassword ? 'text' : 'password';
    btnSyncTokenToggle.querySelector('.icon-eye').style.display = isPassword ? 'none' : '';
    btnSyncTokenToggle.querySelector('.icon-eye-off').style.display = isPassword ? '' : 'none';
  });

  // Auto-sync toggle
  toggleAutoSync.addEventListener('change', async () => {
    autoSyncEnabled = toggleAutoSync.checked;
    const settings = await getSyncSettings();
    settings.autoSync = autoSyncEnabled;
    await saveSyncSettings(settings);

    if (!autoSyncEnabled) {
      clearTimeout(syncPushTimer);
    }
  });

  // Connect
  btnSyncConnect.addEventListener('click', async () => {
    const token = syncTokenInput.value.trim();
    if (!token) {
      syncTokenInput.style.borderColor = 'var(--danger)';
      setTimeout(() => { syncTokenInput.style.borderColor = ''; }, 1500);
      return;
    }

    btnSyncConnect.disabled = true;
    btnSyncConnect.textContent = t('syncConnecting');

    try {
      const settings = await initSync(token);
      renderSyncState(settings);
      applyI18n(t, getLang);
      syncAuthFailed = false;
      updateSyncIndicator('ok');
      setTimeout(() => autoSyncPull(), 500);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err.message || 'Unknown error');
      showSyncResult(msg, true);
      syncTokenInput.style.borderColor = 'var(--danger)';
      setTimeout(() => { syncTokenInput.style.borderColor = ''; }, 2000);
    } finally {
      btnSyncConnect.disabled = false;
      btnSyncConnect.textContent = t('syncConnect');
    }
  });

  // Sync Now (always works regardless of auto-sync toggle)
  btnSyncNow.addEventListener('click', async () => {
    btnSyncNow.disabled = true;
    const spanEl = btnSyncNow.querySelector('span');
    const originalText = spanEl.textContent;
    spanEl.textContent = t('syncSyncing');

    const statusDot = syncConnectedEl.querySelector('.sync-status-dot');
    statusDot.className = 'sync-status-dot sync-status-dot--syncing';
    updateSyncIndicator('syncing');

    try {
      const result = await performSync();
      showSyncResult(
        t('syncSuccess', { a: result.pulled, u: result.updated, d: result.deleted }),
        false
      );
      await onRefresh();
      const syncSettings = await getSyncSettings();
      renderSyncState(syncSettings);
      updateSyncIndicator('ok');
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err.message || 'Unknown error');
      showSyncResult(t('syncFailed', { e: msg }), true);
      statusDot.className = 'sync-status-dot sync-status-dot--err';
      updateSyncIndicator('error');
    } finally {
      btnSyncNow.disabled = false;
      spanEl.textContent = originalText;
    }
  });

  // Quick Sync (header shortcut)
  btnSyncQuick.addEventListener('click', async () => {
    if (btnSyncQuick.classList.contains('syncing')) return;
    btnSyncQuick.classList.add('syncing');
    updateSyncIndicator('syncing');

    try {
      const result = await performSync();
      showSyncToast(
        t('syncSuccess', { a: result.pulled, u: result.updated, d: result.deleted }),
        false
      );
      const hasChanges = result.pulled > 0 || result.updated > 0 || result.deleted > 0;
      if (hasChanges) await onRefresh();
      const syncSettings = await getSyncSettings();
      renderSyncState(syncSettings);
      updateSyncIndicator('ok');
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err.message || 'Unknown error');
      showSyncToast(t('syncFailed', { e: msg }), true);
      updateSyncIndicator('error');
    } finally {
      btnSyncQuick.classList.remove('syncing');
    }
  });

  // Disconnect
  btnSyncDisconnect.addEventListener('click', () => {
    showConfirm(
      t('syncConfirmDisconnect'),
      t('syncConfirmDisconnectDesc'),
      t('syncDisconnect'),
      async () => {
        hideConfirm();
        await disconnectSync();
        renderSyncState({ enabled: false, token: '', gistId: '', lastSyncAt: 0 });
        hideSyncIndicator();
        clearTimeout(syncPushTimer);
      }
    );
  });

  // Initial load
  try {
    const syncSettings = await getSyncSettings();
    renderSyncState(syncSettings);

    if (syncSettings.enabled && syncSettings.token && syncSettings.gistId) {
      updateSyncIndicator('ok');
      if (autoSyncEnabled) {
        setTimeout(() => autoSyncPull(), 800);
      }
    } else {
      hideSyncIndicator();
    }
  } catch {
    hideSyncIndicator();
  }

  // Subscribe to storage changes — auto-trigger sync on any data mutation.
  // This replaces all manual scheduleSyncPush() calls scattered across UI modules.
  onStorageChange(() => {
    scheduleSyncPush();
  });
}
