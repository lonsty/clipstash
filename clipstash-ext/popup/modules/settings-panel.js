// ClipStash Extension - Settings panel module

import { t, setLang, getLang } from '../../utils/i18n.js';
import { applyI18n } from '../../shared/dom-utils.js';
import {
  getSettings, saveSettings, getTheme, saveTheme,
  exportCaches, importCaches, clearAllCaches, deleteAllPermanently,
} from '../../utils/storage.js';
import { FEEDBACK_DISPLAY_DURATION } from '../../utils/constants.js';

// DOM references
const btnSettings = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const btnSettingsClose = document.getElementById('btn-settings-close');
const settingsMaxCache = document.getElementById('settings-max-cache');
const langBtnsEl = document.getElementById('lang-btns');
const themeBtnsEl = document.getElementById('theme-btns');
const shortcutDisplay = document.getElementById('shortcut-display');
const shortcutLink = document.getElementById('shortcut-link');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const importFile = document.getElementById('import-file');
const importStatus = document.getElementById('import-status');
const appVersionEl = document.getElementById('app-version');
const btnMoveAllTrash = document.getElementById('btn-move-all-trash');
const btnDeleteAllPermanent = document.getElementById('btn-delete-all-permanent');

// External callbacks
let showConfirm = null;
let hideConfirm = null;
let onRefresh = null;
let onApplyTheme = null;

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
    const settings = await getSettings();
    settingsMaxCache.value = settings.maxCacheSize;

    const lang = getLang();
    langBtnsEl.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    const theme = await getTheme();
    themeBtnsEl.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    importStatus.style.display = 'none';
    await loadShortcutDisplay();

    const manifest = chrome.runtime.getManifest();
    appVersionEl.textContent = `v${manifest.version}`;

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
    await setLang(btn.dataset.lang);
    applyI18n(t, getLang);
    await onRefresh();
  });

  // Shortcut link
  shortcutLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
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
    await saveSettings({ maxCacheSize: val });
    await onRefresh();
  });

  // Export
  btnExport.addEventListener('click', handleExport);

  // Import
  btnImport.addEventListener('click', () => {
    importFile.value = '';
    importFile.click();
  });
  importFile.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImport(e.target.files[0]);
    }
  });

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

async function loadShortcutDisplay() {
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find(c => c.name === 'cache-clipboard');
    if (cmd && cmd.shortcut) {
      shortcutDisplay.textContent = cmd.shortcut;
    } else {
      shortcutDisplay.textContent = 'Not set';
    }
  } catch {
    shortcutDisplay.textContent = 'Alt+Shift+C';
  }
}

async function handleExport() {
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

async function handleImport(file) {
  try {
    const text = await file.text();
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
