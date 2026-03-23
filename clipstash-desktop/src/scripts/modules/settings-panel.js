// ClipStash Desktop - Settings panel module

import { t, setLang, getLang } from '../../utils/i18n.js';
import { applyI18n } from '../../shared/dom-utils.js';
import {
  getSettings, saveSettings, getTheme, saveTheme,
  exportCaches, importCaches, clearAllCaches, deleteAllPermanently,
} from '../../utils/storage.js';
import {
  showSaveDialog, showOpenDialog,
  writeTextFile, readTextFile,
  setAutostart, getAutostart,
  setClipboardMonitor, getClipboardMonitor,
  registerHotkey, setSuppressAutoHide,
  getAppVersion, updateTrayMenu, openUrl,
} from '../../utils/bridge.js';

// DOM references
const btnSettings = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const btnSettingsClose = document.getElementById('btn-settings-close');
const settingsMaxCache = document.getElementById('settings-max-cache');
const langBtnsEl = document.getElementById('lang-btns');
const themeBtnsEl = document.getElementById('theme-btns');
const shortcutDisplay = document.getElementById('shortcut-display');
const btnChangeShortcut = document.getElementById('btn-change-shortcut');
const shortcutRecording = document.getElementById('shortcut-recording');
const shortcutInput = document.getElementById('shortcut-input');
const btnShortcutSave = document.getElementById('btn-shortcut-save');
const btnShortcutCancel = document.getElementById('btn-shortcut-cancel');
const toggleAutostart = document.getElementById('toggle-autostart');
const toggleClipboardMonitor = document.getElementById('toggle-clipboard-monitor');
const toggleNotification = document.getElementById('toggle-notification');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const importStatus = document.getElementById('import-status');
const appVersionEl = document.getElementById('app-version');
const btnMoveAllTrash = document.getElementById('btn-move-all-trash');
const btnDeleteAllPermanent = document.getElementById('btn-delete-all-permanent');
const btnGithub = document.getElementById('btn-github');
const aboutGithub = document.getElementById('about-github');

// External callbacks
let showConfirm = null;
let hideConfirm = null;
let onRefresh = null;
let onApplyTheme = null;

// Module state
let currentSettings = null;
let recordedKeys = [];

/**
 * initSettingsPanel wires up settings panel events
 * @param {Object} callbacks
 */
export function initSettingsPanel(callbacks) {
  showConfirm = callbacks.showConfirm;
  hideConfirm = callbacks.hideConfirm;
  onRefresh = callbacks.onRefresh;
  onApplyTheme = callbacks.onApplyTheme;

  // Open settings
  btnSettings.addEventListener('click', async () => {
    currentSettings = await getSettings();
    settingsMaxCache.value = currentSettings.cacheLimit;

    const lang = getLang();
    langBtnsEl.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    const theme = await getTheme();
    themeBtnsEl.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    shortcutDisplay.textContent = currentSettings.hotkey || 'Alt+Shift+C';

    // Desktop toggles
    toggleAutostart.checked = await getAutostart().catch(() => false);
    toggleClipboardMonitor.checked = await getClipboardMonitor().catch(() => false);
    toggleNotification.checked = currentSettings.showNotification;

    importStatus.style.display = 'none';
    shortcutRecording.style.display = 'none';

    const version = await getAppVersion();
    if (version) {
      appVersionEl.textContent = `v${version}`;
    }

    settingsOverlay.style.display = 'flex';
  });

  // Close settings
  btnSettingsClose.addEventListener('click', () => {
    settingsOverlay.style.display = 'none';
  });
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.style.display = 'none';
  });

  // Theme buttons
  themeBtnsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.theme-btn');
    if (!btn) return;
    themeBtnsEl.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const theme = btn.dataset.theme;
    await saveTheme(theme);
    await onApplyTheme(theme);
  });

  // Language buttons
  langBtnsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.lang-btn');
    if (!btn) return;
    langBtnsEl.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setLang(btn.dataset.lang);
    if (currentSettings) {
      currentSettings.language = btn.dataset.lang;
      await saveSettings(currentSettings);
    }
    applyI18n(t, getLang);
    await updateTrayMenu(t('traySettings'), t('trayQuit')).catch(() => {});
    await onRefresh();
  });

  // GitHub links (open in external browser)
  btnGithub.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await openUrl('https://github.com/lonsty/clipstash');
    } catch {
      window.open('https://github.com/lonsty/clipstash', '_blank');
    }
  });

  aboutGithub.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await openUrl('https://github.com/lonsty/clipstash');
    } catch {
      window.open('https://github.com/lonsty/clipstash', '_blank');
    }
  });

  // Shortcut recording
  btnChangeShortcut.addEventListener('click', () => {
    shortcutRecording.style.display = 'block';
    shortcutInput.value = '';
    recordedKeys = [];
    shortcutInput.focus();
  });

  btnShortcutCancel.addEventListener('click', () => {
    shortcutRecording.style.display = 'none';
    recordedKeys = [];
  });

  shortcutInput.addEventListener('keydown', (e) => {
    e.preventDefault();
    const keys = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Super');

    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      keys.push(key.length === 1 ? key.toUpperCase() : key);
    }

    recordedKeys = keys;
    shortcutInput.value = keys.join('+');
  });

  btnShortcutSave.addEventListener('click', async () => {
    if (recordedKeys.length < 2) return;
    const keys = shortcutInput.value;
    try {
      await registerHotkey(keys);
      shortcutDisplay.textContent = keys;
      if (currentSettings) {
        currentSettings.hotkey = keys;
        await saveSettings(currentSettings);
      }
      shortcutRecording.style.display = 'none';
      recordedKeys = [];
    } catch {
      shortcutInput.style.borderColor = 'var(--danger)';
      setTimeout(() => { shortcutInput.style.borderColor = ''; }, 1500);
    }
  });

  // Cache limit
  let maxCacheInputDirty = false;

  settingsMaxCache.addEventListener('input', () => {
    maxCacheInputDirty = true;
    const val = parseInt(settingsMaxCache.value, 10);
    if (isNaN(val) || val < 10 || val > 999) {
      settingsMaxCache.style.borderColor = 'var(--danger)';
    } else {
      settingsMaxCache.style.borderColor = '';
    }
  });

  settingsMaxCache.addEventListener('blur', async () => {
    if (!maxCacheInputDirty) return;
    maxCacheInputDirty = false;
    const val = parseInt(settingsMaxCache.value, 10);
    if (isNaN(val) || val < 10 || val > 999) {
      settingsMaxCache.style.borderColor = 'var(--danger)';
      setTimeout(() => { settingsMaxCache.style.borderColor = ''; }, 1500);
      return;
    }
    settingsMaxCache.style.borderColor = 'var(--success)';
    setTimeout(() => { settingsMaxCache.style.borderColor = ''; }, 800);
    if (currentSettings) {
      currentSettings.cacheLimit = val;
      await saveSettings(currentSettings);
    }
    await onRefresh();
  });

  // Desktop toggles
  toggleAutostart.addEventListener('change', async () => {
    await setAutostart(toggleAutostart.checked).catch(() => {});
    if (currentSettings) {
      currentSettings.autostart = toggleAutostart.checked;
      await saveSettings(currentSettings);
    }
  });

  toggleClipboardMonitor.addEventListener('change', async () => {
    await setClipboardMonitor(toggleClipboardMonitor.checked).catch(() => {});
    if (currentSettings) {
      currentSettings.clipboardMonitor = toggleClipboardMonitor.checked;
      await saveSettings(currentSettings);
    }
  });

  toggleNotification.addEventListener('change', async () => {
    if (currentSettings) {
      currentSettings.showNotification = toggleNotification.checked;
      await saveSettings(currentSettings);
    }
  });

  // Export
  btnExport.addEventListener('click', handleExport);

  // Import
  btnImport.addEventListener('click', handleImport);

  // Move All to Trash (danger zone)
  btnMoveAllTrash.addEventListener('click', () => {
    showConfirm(
      t('confirmClearTitle'),
      t('confirmClearDesc'),
      t('confirmClearOk'),
      async () => {
        await clearAllCaches();
        hideConfirm();
        settingsOverlay.style.display = 'none';
        await onRefresh();
      }
    );
  });

  // Delete All Permanently (danger zone)
  btnDeleteAllPermanent.addEventListener('click', () => {
    showConfirm(
      t('confirmDeleteAllTitle'),
      t('confirmDeleteAllDesc'),
      t('confirmDeleteAllOk'),
      async () => {
        await deleteAllPermanently();
        hideConfirm();
        settingsOverlay.style.display = 'none';
        await onRefresh();
      }
    );
  });
}

async function handleExport() {
  try {
    const json = await exportCaches();
    const defaultName = `clipstash-export-${Date.now()}.json`;
    await setSuppressAutoHide(true);
    try {
      const filePath = await showSaveDialog(defaultName);
      if (filePath) {
        await writeTextFile(filePath, json);
      }
    } finally {
      await setSuppressAutoHide(false);
    }
  } catch {
    // Fallback: download via blob
    const json = await exportCaches();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clipstash-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

async function handleImport() {
  try {
    await setSuppressAutoHide(true);
    let filePath;
    try {
      filePath = await showOpenDialog();
    } finally {
      await setSuppressAutoHide(false);
    }
    if (!filePath) return;
    const text = await readTextFile(filePath);
    const result = await importCaches(text);
    importStatus.style.display = 'block';
    importStatus.className = 'import-status success';
    if (result.duplicates > 0) {
      importStatus.textContent = t('importDuplicate', { n: result.added, d: result.duplicates });
    } else {
      importStatus.textContent = t('importSuccess', { n: result.added });
    }
    await onRefresh();
    setTimeout(() => { importStatus.style.display = 'none'; }, 3000);
  } catch {
    importStatus.style.display = 'block';
    importStatus.className = 'import-status error';
    importStatus.textContent = t('importFail');
    setTimeout(() => { importStatus.style.display = 'none'; }, 3000);
  }
}

/**
 * getCurrentSettings returns the cached settings object
 * @returns {Object|null}
 */
export function getCurrentSettings() {
  return currentSettings;
}

/**
 * setCurrentSettings updates the cached settings object
 * @param {Object} settings
 */
export function setCurrentSettings(settings) {
  currentSettings = settings;
}

/**
 * isSettingsOpen returns whether the settings panel is currently displayed
 * @returns {boolean}
 */
export function isSettingsOpen() {
  return settingsOverlay.style.display !== 'none';
}

/**
 * closeSettings hides the settings panel
 */
export function closeSettings() {
  settingsOverlay.style.display = 'none';
}
