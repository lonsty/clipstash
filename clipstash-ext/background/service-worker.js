// ClipStash - Service Worker (icon click, shortcut, context menu)

import { addCache } from '../utils/storage.js';
import { readClipboardViaScript, readClipboardViaOffscreen } from '../utils/clipboard.js';

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
  await chrome.action.setPopup({ popup: 'popup/popup.html' });
  await chrome.action.openPopup();
  setTimeout(async () => {
    await chrome.action.setPopup({ popup: '' });
  }, 500);
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
}

// ===== Context Menu =====

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'cache-clipboard',
    title: 'Cache clipboard',
    contexts: ['action']
  });
  chrome.contextMenus.create({
    id: 'open-clipstash',
    title: 'Open ClipStash',
    contexts: ['action']
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'cache-clipboard') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await cacheClipboard(tab);
  } else if (info.menuItemId === 'open-clipstash') {
    await openPopup();
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
