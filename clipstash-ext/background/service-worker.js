// ClipStash - Service Worker (icon click, shortcut, context menu, periodic sync)

import { addCache, purgeExpiredCaches } from '../utils/storage.js';
import { readClipboardViaScript, readClipboardViaOffscreen } from '../utils/clipboard.js';
import { getSyncSettings, performSync } from '../utils/sync.js';
import { SYNC_PERIODIC_PULL_INTERVAL, TRASH_TTL_MS } from '../utils/constants.js';

const SYNC_ALARM_NAME = 'clipstash-periodic-sync';
const TRASH_PURGE_ALARM_NAME = 'clipstash-trash-purge';
const TRASH_PURGE_INTERVAL_MINUTES = 360; // every 6 hours

// ===== Badge =====

/**
 * showBadge briefly displays a badge on the extension icon
 * @param {string} text
 * @param {string} color
 * @param {number} duration - ms
 */
async function showBadge(text, color, duration = 1500) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(async () => {
    await chrome.action.setBadgeText({ text: '' });
  }, duration);
}

// ===== Popup =====
// Popup is managed by manifest.json default_popup — no dynamic logic needed.

// ===== Clipboard Cache =====

/**
 * readClipboard reads clipboard content from the active tab or offscreen fallback
 * @param {chrome.tabs.Tab} [tab]
 * @returns {Promise<Object|null>}
 */
async function readClipboard(tab) {
  let clipData = null;

  if (tab && tab.id && tab.id > 0) {
    clipData = await readClipboardViaScript(tab.id);
  }

  if (clipData === null) {
    clipData = await readClipboardViaOffscreen();
  }

  return clipData;
}

/**
 * cacheClipboard reads clipboard and caches the content.
 * Always attempts to cache; shows badge feedback.
 * @param {chrome.tabs.Tab} [tab]
 */
async function cacheClipboard(tab) {
  try {
    const clipData = await readClipboard(tab);

    if (!clipData) {
      await showBadge('—', '#9ca3af', 1000);
      return;
    }

    const result = await addCache(clipData);

    if (result.added) {
      await showBadge('✓', '#22c55e');
    } else if (result.duplicate) {
      await showBadge('✓', '#f59e0b', 1000);
    } else {
      await showBadge('—', '#9ca3af', 1000);
    }
  } catch (error) {
    console.error('Failed to cache clipboard:', error);
    await showBadge('✗', '#ef4444', 1500);
  }
}

// ===== Context Menu =====

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-settings',
    title: 'Settings',
    contexts: ['action']
  });
  setupSyncAlarm();
  setupTrashPurgeAlarm();
});

// ===== Periodic Sync via chrome.alarms =====

async function setupSyncAlarm() {
  try {
    const settings = await getSyncSettings();
    if (settings.enabled && settings.token && settings.gistId) {
      await chrome.alarms.create(SYNC_ALARM_NAME, {
        periodInMinutes: SYNC_PERIODIC_PULL_INTERVAL,
      });
      console.log(`[ClipStash] Periodic sync alarm set (every ${SYNC_PERIODIC_PULL_INTERVAL}min)`);
    } else {
      await chrome.alarms.clear(SYNC_ALARM_NAME);
    }
  } catch (err) {
    console.warn('[ClipStash] Failed to set sync alarm:', err);
  }
}

async function handlePeriodicSync() {
  try {
    const settings = await getSyncSettings();
    if (!settings.enabled || !settings.token || !settings.gistId) {
      await chrome.alarms.clear(SYNC_ALARM_NAME);
      return;
    }
    await performSync();
    console.log('[ClipStash] Periodic sync completed');
  } catch (err) {
    const msg = typeof err === 'string' ? err : (err.message || String(err));
    console.warn('[ClipStash] Periodic sync failed:', msg);

    // 401 / 403 → token is invalid; clear alarm to stop retries
    if (/HTTP\s*(401|403)|Unauthorized|Forbidden/i.test(msg)) {
      console.warn('[ClipStash] Auth failure — clearing periodic sync alarm');
      await chrome.alarms.clear(SYNC_ALARM_NAME);
    }
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    handlePeriodicSync();
  } else if (alarm.name === TRASH_PURGE_ALARM_NAME) {
    purgeExpiredCaches(TRASH_TTL_MS).catch((err) => {
      console.warn('[ClipStash] Trash purge failed:', err);
    });
  }
});

// ===== Periodic Trash Purge via chrome.alarms =====

function setupTrashPurgeAlarm() {
  chrome.alarms.create(TRASH_PURGE_ALARM_NAME, {
    periodInMinutes: TRASH_PURGE_INTERVAL_MINUTES,
  });
}

// Re-check alarms on service worker startup
setupSyncAlarm();
setupTrashPurgeAlarm();

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'open-settings') {
    // Send action to the popup (which opens via default_popup on icon click)
    chrome.runtime.sendMessage({ action: 'open-settings' }).catch(() => {
      // Popup may not be open yet — ignore
    });
  }
});

// ===== Event Listeners =====

// Popup is opened via default_popup in manifest — no onClicked listener needed

// Keyboard shortcut — always cache clipboard
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'cache-clipboard') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await cacheClipboard(tab);
  }
});

// Message from popup — cache clipboard on demand
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'cache-clipboard-from-popup') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const clipData = await readClipboard(tab);

      if (!clipData) {
        sendResponse({ status: 'empty' });
        return;
      }

      const result = await addCache(clipData);

      if (result.added) {
        sendResponse({ status: 'added' });
      } else if (result.duplicate) {
        sendResponse({ status: 'duplicate' });
      } else {
        sendResponse({ status: 'empty' });
      }
    })();
    return true;
  }
});
