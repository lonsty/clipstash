// ClipStash - Service Worker (icon click, shortcut, context menu, periodic sync)

import { addCache } from '../utils/storage.js';
import { readClipboardViaScript, readClipboardViaOffscreen } from '../utils/clipboard.js';
import { getSyncSettings, performSync } from '../utils/sync.js';
import { SYNC_PERIODIC_PULL_INTERVAL } from '../utils/constants.js';

const SYNC_ALARM_NAME = 'clipstash-periodic-sync';

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

/**
 * openPopup opens the popup page via temporary popup assignment
 */
async function openPopup() {
  try {
    await chrome.action.setPopup({ popup: 'popup/popup.html' });
    await chrome.action.openPopup();
    setTimeout(async () => {
      await chrome.action.setPopup({ popup: '' });
    }, 500);
  } catch {
    // chrome.action.openPopup() may fail in certain contexts;
    // keep popup assigned so next icon click opens it normally
    console.warn('[ClipStash] openPopup failed, popup will open on next click');
  }
}

/**
 * openPopupWithAction opens the popup and sends an action message to it
 * @param {string} action
 */
async function openPopupWithAction(action) {
  try {
    await chrome.action.setPopup({ popup: 'popup/popup.html' });
    await chrome.action.openPopup();
    setTimeout(async () => {
      await chrome.action.setPopup({ popup: '' });
      chrome.runtime.sendMessage({ action });
    }, 300);
  } catch {
    console.warn('[ClipStash] openPopupWithAction failed');
  }
}

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
  // Set up periodic sync alarm
  setupSyncAlarm();
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
  }
});

// Re-check alarm on service worker startup
setupSyncAlarm();

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'open-settings') {
    await openPopupWithAction('open-settings');
  }
});

// ===== Event Listeners =====

// Icon click — always open popup
chrome.action.onClicked.addListener(() => openPopup());

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
