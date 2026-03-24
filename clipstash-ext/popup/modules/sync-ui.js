// ClipStash Extension - Cloud Sync UI module

import { t } from '../../utils/i18n.js';
import { applyI18n } from '../../shared/dom-utils.js';
import { getLang } from '../../utils/i18n.js';
import {
  SYNC_PUSH_DEBOUNCE_DELAY,
  SYNC_MIN_INTERVAL_MS,
  SYNC_TOAST_DURATION,
  SYNC_AUTH_PATTERN,
  SYNC_PASSWORD_MIN_LENGTH,
  SYNC_PASSWORD_MAX_LENGTH,
} from '../../utils/constants.js';
import { getAdaptiveRefreshInterval } from '../../shared/dom-utils.js';
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
const syncPasswordItem = document.querySelector('.settings-item--sync-password');
const syncImagesItem = document.querySelector('.settings-item--sync-images');
const toggleSyncImages = document.getElementById('toggle-sync-images');
const syncPasswordInput = document.getElementById('sync-password-input');
const syncPasswordConfirmInput = document.getElementById('sync-password-confirm');
const btnSyncPasswordSave = document.getElementById('btn-sync-password-save');
const btnSyncPasswordRemove = document.getElementById('btn-sync-password-remove');
const syncPasswordStatus = document.getElementById('sync-password-status');
const syncEncryptionStatus = document.getElementById('sync-encryption-status');

// State
let syncPushTimer = null;
let isSyncing = false;
let syncAuthFailed = false;
let syncToastTimer = null;
let autoSyncEnabled = true;
let syncImagesEnabled = false;
let lastSyncTimestamp = 0; // tracks lastSyncAt for periodic refresh
let syncTimeRefreshTimer = null;

// External callbacks
let showConfirm = null;
let hideConfirm = null;
let onRefresh = null;

/**
 * translateSyncError translates known error message keys to i18n text.
 * Falls back to the original message for unknown errors.
 */
function translateSyncError(msg) {
  const knownKeys = ['syncPasswordWrong', 'syncPasswordRequired'];
  for (const key of knownKeys) {
    if (msg === key) return t(key);
  }
  return msg;
}

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
      lastSyncTimestamp = syncSettings.lastSyncAt;
      syncLastSyncEl.textContent = t('syncLastSync', { t: formatSyncTime(syncSettings.lastSyncAt, t('syncNever')) });
    } else {
      lastSyncTimestamp = 0;
      syncLastSyncEl.textContent = t('syncLastSync', { t: t('syncNever') });
    }
    syncLastSyncEl.style.display = '';

    // Enable auto-sync toggle when connected
    toggleAutoSync.disabled = false;
    autoSyncItem.classList.remove('is-disabled');
    // Read persisted auto-sync preference (default true)
    autoSyncEnabled = syncSettings.autoSync !== false;
    toggleAutoSync.checked = autoSyncEnabled;

    // Enable sync password section when connected
    syncPasswordItem.classList.remove('is-disabled');
    renderSyncPasswordState(syncSettings.syncPassword || '');

    // Enable sync images toggle when connected
    toggleSyncImages.disabled = false;
    syncImagesItem.classList.remove('is-disabled');
    syncImagesEnabled = syncSettings.syncImages === true;
    toggleSyncImages.checked = syncImagesEnabled;
  } else {
    syncSetupEl.style.display = 'block';
    syncConnectedEl.style.display = 'none';
    syncTokenInput.value = '';
    // Disable auto-sync toggle when disconnected
    toggleAutoSync.disabled = true;
    toggleAutoSync.checked = false;
    autoSyncItem.classList.add('is-disabled');
    autoSyncEnabled = false;

    // Disable sync password section when disconnected
    syncPasswordItem.classList.add('is-disabled');
    syncPasswordInput.value = '';

    // Disable sync images toggle when disconnected
    toggleSyncImages.disabled = true;
    toggleSyncImages.checked = false;
    syncImagesItem.classList.add('is-disabled');
    syncImagesEnabled = false;
  }

  // Re-schedule the adaptive "Last sync" time refresh whenever state changes
  scheduleSyncTimeRefresh();
}

/**
 * renderSyncPasswordState updates the password UI based on whether a password is set.
 * @param {string} currentPassword - the current sync password (empty if not set)
 */
function renderSyncPasswordState(currentPassword) {
  if (currentPassword) {
    // Password is set — show masked dots and change/remove buttons
    syncPasswordInput.value = '••••••••';
    syncPasswordInput.disabled = true;
    btnSyncPasswordSave.textContent = t('syncPasswordChange');
    btnSyncPasswordSave.dataset.i18n = 'syncPasswordChange';
    btnSyncPasswordSave.dataset.mode = 'change';
    btnSyncPasswordRemove.style.display = '';
    // Hide confirm input when password is already set
    syncPasswordConfirmInput.style.display = 'none';
    syncPasswordConfirmInput.value = '';
    // Encryption ON
    syncEncryptionStatus.textContent = t('syncEncryptionOn');
    syncEncryptionStatus.dataset.i18n = 'syncEncryptionOn';
    syncEncryptionStatus.className = 'sync-encryption-status encryption-on';
  } else {
    // No password — show empty input, confirm input, and set button
    syncPasswordInput.value = '';
    syncPasswordInput.disabled = false;
    btnSyncPasswordSave.textContent = t('syncPasswordSet');
    btnSyncPasswordSave.dataset.i18n = 'syncPasswordSet';
    btnSyncPasswordSave.dataset.mode = 'set';
    btnSyncPasswordRemove.style.display = 'none';
    // Show confirm input for first-time password setup
    syncPasswordConfirmInput.style.display = '';
    syncPasswordConfirmInput.value = '';
    // Encryption OFF
    syncEncryptionStatus.textContent = t('syncEncryptionOff');
    syncEncryptionStatus.dataset.i18n = 'syncEncryptionOff';
    syncEncryptionStatus.className = 'sync-encryption-status encryption-off';
  }
  syncPasswordStatus.style.display = 'none';
}

function showSyncPasswordStatus(message, isError = false) {
  syncPasswordStatus.textContent = message;
  syncPasswordStatus.className = isError ? 'sync-password-status error' : 'sync-password-status success';
  syncPasswordStatus.style.display = 'block';
  setTimeout(() => { syncPasswordStatus.style.display = 'none'; }, 3000);
}

/**
 * scheduleSyncTimeRefresh adaptively refreshes "Last sync: Xs ago".
 * Cancels any pending timer and re-schedules based on the current age.
 */
function scheduleSyncTimeRefresh() {
  clearTimeout(syncTimeRefreshTimer);
  if (lastSyncTimestamp <= 0) return;
  syncLastSyncEl.textContent = t('syncLastSync', { t: formatSyncTime(lastSyncTimestamp, t('syncNever')) });
  const interval = getAdaptiveRefreshInterval(lastSyncTimestamp);
  if (interval > 0) {
    syncTimeRefreshTimer = setTimeout(scheduleSyncTimeRefresh, interval);
  }
}

function showSyncResult(message, isError) {
  syncResultEl.textContent = message;
  syncResultEl.className = isError ? 'sync-result error' : 'sync-result success';
  syncResultEl.style.display = 'flex';
  setTimeout(() => { syncResultEl.style.display = 'none'; }, 5000);
}

/**
 * showSyncPasswordWrongWithForcePush shows the password-wrong error
 * along with a "Force Push" button that lets the user overwrite cloud data.
 * @param {Function} showResultFn - function(message, isError) for displaying result
 * @param {'settings'|'toast'} context - where to show the result
 */
function showSyncPasswordWrongWithForcePush(context) {
  const errorMsg = t('syncFailed', { e: t('syncPasswordWrong') });

  if (context === 'toast') {
    // For toast and quick-sync, show error toast + a separate "Force Push" toast action
    showSyncToast(errorMsg, true);
    return;
  }

  // For settings panel: show error with Force Push button inline
  syncResultEl.innerHTML = '';
  syncResultEl.className = 'sync-result error';
  syncResultEl.style.display = 'flex';

  const msgSpan = document.createElement('span');
  msgSpan.textContent = errorMsg;
  syncResultEl.appendChild(msgSpan);

  const forcePushBtn = document.createElement('button');
  forcePushBtn.className = 'btn btn-danger btn-sm sync-force-push-btn';
  forcePushBtn.textContent = t('syncForcePush');
  forcePushBtn.addEventListener('click', () => {
    syncResultEl.style.display = 'none';
    handleForcePush();
  });
  syncResultEl.appendChild(forcePushBtn);
}

/**
 * handleForcePush triggers a force-push sync after user confirmation.
 */
function handleForcePush() {
  showConfirm(
    t('syncForcePushConfirmTitle'),
    t('syncForcePushConfirmDesc'),
    t('syncForcePushConfirmOk'),
    async () => {
      hideConfirm();
      btnSyncNow.disabled = true;
      const spanEl = btnSyncNow.querySelector('span');
      const originalText = spanEl.textContent;
      spanEl.textContent = t('syncSyncing');
      updateSyncIndicator('syncing');

      try {
        const result = await performSync({ forcePush: true });
        showSyncResult(t('syncForcePushSuccess'), false);
        await onRefresh();
        const syncSettings = await getSyncSettings();
        renderSyncState(syncSettings);
        updateSyncIndicator('ok');
      } catch (err) {
        const msg = translateSyncError(typeof err === 'string' ? err : (err.message || 'Unknown error'));
        showSyncResult(t('syncFailed', { e: msg }), true);
        updateSyncIndicator('error');
      } finally {
        btnSyncNow.disabled = false;
        spanEl.textContent = originalText;
      }
    }
  );
}

// ===== Init =====

/**
 * initSyncUI wires up sync UI events and performs initial load
 * @param {Object} callbacks
 */
/**
 * refreshSyncState re-reads sync settings and re-renders the sync UI.
 * Call this when the settings panel opens to reset any stale editing state
 * (e.g. user clicked "Change" password but closed without saving).
 */
export async function refreshSyncState() {
  try {
    const syncSettings = await getSyncSettings();
    renderSyncState(syncSettings);
  } catch {
    // ignore — sync may not be configured
  }
}

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

  // Sync images toggle
  toggleSyncImages.addEventListener('change', async () => {
    syncImagesEnabled = toggleSyncImages.checked;
    const settings = await getSyncSettings();
    settings.syncImages = syncImagesEnabled;
    await saveSyncSettings(settings);
  });

  // Sync Password: Save/Change
  btnSyncPasswordSave.addEventListener('click', async () => {
    const mode = btnSyncPasswordSave.dataset.mode;
    if (mode === 'change') {
      // Switch to edit mode — show both input and confirm row
      syncPasswordInput.value = '';
      syncPasswordInput.disabled = false;
      syncPasswordInput.focus();
      syncPasswordConfirmInput.style.display = '';
      syncPasswordConfirmInput.value = '';
      btnSyncPasswordSave.textContent = t('syncPasswordSet');
      btnSyncPasswordSave.dataset.i18n = 'syncPasswordSet';
      btnSyncPasswordSave.dataset.mode = 'set';
      return;
    }

    const newPassword = syncPasswordInput.value.trim();
    if (!newPassword) {
      syncPasswordInput.style.borderColor = 'var(--danger)';
      setTimeout(() => { syncPasswordInput.style.borderColor = ''; }, 1500);
      return;
    }

    // Validate password length
    if (newPassword.length < SYNC_PASSWORD_MIN_LENGTH) {
      syncPasswordInput.style.borderColor = 'var(--danger)';
      showSyncPasswordStatus(t('syncPasswordTooShort', { n: SYNC_PASSWORD_MIN_LENGTH }), true);
      setTimeout(() => { syncPasswordInput.style.borderColor = ''; }, 1500);
      return;
    }
    if (newPassword.length > SYNC_PASSWORD_MAX_LENGTH) {
      syncPasswordInput.style.borderColor = 'var(--danger)';
      showSyncPasswordStatus(t('syncPasswordTooLong', { n: SYNC_PASSWORD_MAX_LENGTH }), true);
      setTimeout(() => { syncPasswordInput.style.borderColor = ''; }, 1500);
      return;
    }

    // Validate confirm password matches
    const confirmPassword = syncPasswordConfirmInput.value.trim();
    if (newPassword !== confirmPassword) {
      syncPasswordConfirmInput.style.borderColor = 'var(--danger)';
      showSyncPasswordStatus(t('syncPasswordMismatch'), true);
      setTimeout(() => { syncPasswordConfirmInput.style.borderColor = ''; }, 1500);
      return;
    }

    const settings = await getSyncSettings();
    settings.syncPassword = newPassword;
    await saveSyncSettings(settings);
    renderSyncPasswordState(newPassword);
    showSyncPasswordStatus(t('syncPasswordSaved'));
  });

  // Sync Password: Remove
  btnSyncPasswordRemove.addEventListener('click', async () => {
    const settings = await getSyncSettings();
    settings.syncPassword = '';
    await saveSyncSettings(settings);
    renderSyncPasswordState('');
    showSyncPasswordStatus(t('syncPasswordRemoved'));
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
      const rawMsg = typeof err === 'string' ? err : (err.message || 'Unknown error');
      if (rawMsg === 'syncPasswordWrong') {
        showSyncPasswordWrongWithForcePush('settings');
      } else {
        const msg = translateSyncError(rawMsg);
        showSyncResult(t('syncFailed', { e: msg }), true);
      }
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
      const rawMsg = typeof err === 'string' ? err : (err.message || 'Unknown error');
      const msg = translateSyncError(rawMsg);
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
