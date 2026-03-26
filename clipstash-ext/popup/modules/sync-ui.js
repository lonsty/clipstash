// ClipStash Extension - Cloud Sync UI module

import { t, getLang } from '../../utils/i18n.js';
import { applyI18n, getAdaptiveRefreshInterval, showCopyFeedback } from '../../shared/dom-utils.js';
import {
  SYNC_PUSH_DEBOUNCE_DELAY,
  SYNC_MIN_INTERVAL_MS,
  SYNC_TOAST_DURATION,
  SYNC_AUTH_PATTERN,
  SYNC_PASSWORD_MIN_LENGTH,
  SYNC_PASSWORD_MAX_LENGTH,
} from '../../utils/constants.js';
import { getSyncSettings, saveSyncSettings, initSync, performSync, disconnectSync } from '../../utils/sync.js';
import { formatRelativeTime } from '../../utils/time.js';
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
const btnSyncQuick = document.getElementById('btn-sync-quick');
const syncStepPassword = document.getElementById('sync-step-password');
const syncStepOptions = document.getElementById('sync-step-options');
const syncPasswordItem = syncStepPassword; // alias for existing references
const syncImagesItem = syncStepOptions; // alias
const toggleSyncImages = document.getElementById('toggle-sync-images');
const syncPasswordInput = document.getElementById('sync-password-input');
const syncPasswordConfirmInput = document.getElementById('sync-password-confirm');
const btnSyncPasswordSave = document.getElementById('btn-sync-password-save');
const btnSyncPasswordRemove = document.getElementById('btn-sync-password-remove');
const syncPasswordStatus = document.getElementById('sync-password-status');
const syncEncryptionStatus = document.getElementById('sync-encryption-status');
const btnSyncPasswordToggle = document.getElementById('btn-sync-password-toggle');
const btnSyncPasswordCopy = document.getElementById('btn-sync-password-copy');

// State
let syncPushTimer = null;
let isSyncing = false;
let syncAuthFailed = false;
let syncToastTimer = null;
let autoSyncEnabled = true;
let syncImagesEnabled = false;
let lastSyncTimestamp = 0;
let syncTimeRefreshTimer = null;
let currentSyncPassword = '';

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
  btnSyncQuick.classList.remove(...SYNC_STATE_CLASSES, 'is-disabled');
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

/**
 * isSyncReady checks if sync is fully configured (token + password).
 */
async function isSyncReady() {
  try {
    const s = await getSyncSettings();
    return !!(s.enabled && s.token && s.gistId && s.syncPassword);
  } catch {
    return false;
  }
}

async function autoSyncPull() {
  if (isSyncing || syncAuthFailed || !autoSyncEnabled) return;
  const ready = await isSyncReady();
  if (!ready) return;

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
  const isConnected = !!(syncSettings.enabled && syncSettings.token && syncSettings.gistId);
  const hasPassword = !!(syncSettings.syncPassword);
  const isSyncReady = isConnected && hasPassword;

  if (isConnected) {
    syncSetupEl.style.display = 'none';
    syncConnectedEl.style.display = 'block';
    syncStatusText.textContent = t('syncConnected');

    const statusDot = syncConnectedEl.querySelector('.sync-status-dot');
    statusDot.className = 'sync-status-dot sync-status-dot--ok';

    if (syncSettings.lastSyncAt > 0) {
      lastSyncTimestamp = syncSettings.lastSyncAt;
      syncLastSyncEl.textContent = t('syncLastSync', { t: formatRelativeTime(syncSettings.lastSyncAt) });
    } else {
      lastSyncTimestamp = 0;
      syncLastSyncEl.textContent = t('syncLastSync', { t: t('syncNever') });
    }
    syncLastSyncEl.style.display = '';

    // Sync Now button: only enabled when password is set
    btnSyncNow.disabled = !isSyncReady;

    // Password section: always enabled when connected
    syncStepPassword.classList.remove('is-disabled');
    renderSyncPasswordState(syncSettings.syncPassword || '');

    // Options step: only enabled when password is set
    syncStepOptions.classList.toggle('is-disabled', !isSyncReady);
    toggleAutoSync.disabled = !isSyncReady;
    autoSyncEnabled = isSyncReady && syncSettings.autoSync !== false;
    toggleAutoSync.checked = autoSyncEnabled;

    toggleSyncImages.disabled = !isSyncReady;
    syncImagesEnabled = isSyncReady && syncSettings.syncImages === true;
    toggleSyncImages.checked = syncImagesEnabled;
  } else {
    syncSetupEl.style.display = 'block';
    syncConnectedEl.style.display = 'none';
    syncTokenInput.value = '';

    // Everything disabled when not connected
    syncStepPassword.classList.add('is-disabled');
    syncPasswordInput.value = '';

    syncStepOptions.classList.add('is-disabled');
    toggleAutoSync.disabled = true;
    toggleAutoSync.checked = false;
    autoSyncEnabled = false;

    toggleSyncImages.disabled = true;
    toggleSyncImages.checked = false;
    syncImagesEnabled = false;
  }

  // Update header quick-sync button state
  if (isSyncReady) {
    updateSyncIndicator('ok');
  } else if (isConnected) {
    // Connected but no password — show disabled with hint
    btnSyncQuick.style.display = '';
    btnSyncQuick.classList.remove(...SYNC_STATE_CLASSES);
    btnSyncQuick.classList.add('is-disabled');
    btnSyncQuick.title = t('syncSetupHintNoPassword');
  } else {
    // Not connected — show disabled with hint
    btnSyncQuick.style.display = '';
    btnSyncQuick.classList.remove(...SYNC_STATE_CLASSES);
    btnSyncQuick.classList.add('is-disabled');
    btnSyncQuick.title = t('syncSetupHintNoToken');
  }

  scheduleSyncTimeRefresh();
}

/**
 * renderSyncPasswordState updates the password UI based on whether a password is set.
 * @param {string} currentPassword - the current sync password (empty if not set)
 */
function renderSyncPasswordState(currentPassword) {
  currentSyncPassword = currentPassword;
  // Reset visibility state
  syncPasswordInput.type = 'password';
  btnSyncPasswordToggle.querySelector('.icon-eye').style.display = '';
  btnSyncPasswordToggle.querySelector('.icon-eye-off').style.display = 'none';

  if (currentPassword) {
    syncPasswordInput.value = '••••••••';
    syncPasswordInput.disabled = true;
    btnSyncPasswordSave.textContent = t('syncPasswordChange');
    btnSyncPasswordSave.dataset.i18n = 'syncPasswordChange';
    btnSyncPasswordSave.dataset.mode = 'change';
    btnSyncPasswordRemove.style.display = '';
    syncPasswordConfirmInput.style.display = 'none';
    syncPasswordConfirmInput.value = '';
    // Show copy button when password is set
    btnSyncPasswordCopy.style.display = '';
    syncEncryptionStatus.textContent = t('syncEncryptionOn');
    syncEncryptionStatus.dataset.i18n = 'syncEncryptionOn';
    syncEncryptionStatus.className = 'sync-encryption-status encryption-on';
  } else {
    syncPasswordInput.value = '';
    syncPasswordInput.disabled = false;
    btnSyncPasswordSave.textContent = t('syncPasswordSet');
    btnSyncPasswordSave.dataset.i18n = 'syncPasswordSet';
    btnSyncPasswordSave.dataset.mode = 'set';
    btnSyncPasswordRemove.style.display = 'none';
    syncPasswordConfirmInput.style.display = '';
    syncPasswordConfirmInput.value = '';
    // Hide copy button when no password
    btnSyncPasswordCopy.style.display = 'none';
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
  syncLastSyncEl.textContent = t('syncLastSync', { t: formatRelativeTime(lastSyncTimestamp) });
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
 * refreshSyncState re-reads sync settings and re-renders the sync UI.
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

  // Password visibility toggle
  btnSyncPasswordToggle.addEventListener('click', () => {
    if (!currentSyncPassword) return;
    const isHidden = syncPasswordInput.type === 'password';
    syncPasswordInput.type = isHidden ? 'text' : 'password';
    syncPasswordInput.value = isHidden ? currentSyncPassword : '••••••••';
    btnSyncPasswordToggle.querySelector('.icon-eye').style.display = isHidden ? 'none' : '';
    btnSyncPasswordToggle.querySelector('.icon-eye-off').style.display = isHidden ? '' : 'none';
  });

  // Password copy
  btnSyncPasswordCopy.addEventListener('click', async () => {
    if (!currentSyncPassword) return;
    try {
      await navigator.clipboard.writeText(currentSyncPassword);
      showCopyFeedback(btnSyncPasswordCopy, t);
    } catch {
      // fallback
    }
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
    // Re-render to enable sync buttons now that password is set
    renderSyncState(settings);
  });

  // Sync Password: Remove (disabled — password is mandatory, but keep handler for Change flow)
  btnSyncPasswordRemove.addEventListener('click', async () => {
    showConfirm(
      t('syncConfirmDisconnect'),
      t('syncPasswordRemoveConfirmDesc') || 'Removing the password will disable sync until a new password is set.',
      t('syncPasswordRemove'),
      async () => {
        hideConfirm();
        const settings = await getSyncSettings();
        settings.syncPassword = '';
        await saveSyncSettings(settings);
        renderSyncPasswordState('');
        showSyncPasswordStatus(t('syncPasswordRemoved'));
        renderSyncState(settings);
      }
    );
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
      // Only auto-sync if password is already set
      if (settings.syncPassword) {
        updateSyncIndicator('ok');
        setTimeout(() => autoSyncPull(), 500);
      }
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

  // Quick Sync (header shortcut) — only works when fully configured
  btnSyncQuick.addEventListener('click', async () => {
    if (btnSyncQuick.classList.contains('syncing') || btnSyncQuick.classList.contains('is-disabled')) return;
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

    const isReady = !!(syncSettings.enabled && syncSettings.token && syncSettings.gistId && syncSettings.syncPassword);
    if (isReady && autoSyncEnabled) {
      setTimeout(() => autoSyncPull(), 800);
    }
  } catch {
    // Not configured — renderSyncState already shows disabled state
  }

  // Subscribe to storage changes — auto-trigger sync on any data mutation.
  // This replaces all manual scheduleSyncPush() calls scattered across UI modules.
  onStorageChange(() => {
    scheduleSyncPush();
  });
}
