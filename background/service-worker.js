// ClipStash - Service Worker (icon click handling & cache logic)

import { addCache } from '../utils/storage.js';
import { readClipboardViaScript, readClipboardViaOffscreen } from '../utils/clipboard.js';

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

/**
 * openPopup opens the popup page
 */
async function openPopup() {
  await chrome.action.setPopup({ popup: 'popup/popup.html' });
  await chrome.action.openPopup();
  setTimeout(async () => {
    await chrome.action.setPopup({ popup: '' });
  }, 500);
}

/**
 * handleIconClick handles extension icon click or keyboard shortcut
 * @param {chrome.tabs.Tab} tab
 */
async function handleIconClick(tab) {
  let clipData = null;

  // Try reading clipboard via injected script (supports text, image, HTML)
  if (tab && tab.id && tab.id > 0) {
    clipData = await readClipboardViaScript(tab.id);
  }

  // Fallback: offscreen document (text only)
  if (clipData === null) {
    clipData = await readClipboardViaOffscreen();
  }

  // Empty clipboard → open Popup
  if (!clipData) {
    await openPopup();
    return;
  }

  // Try to cache
  const result = await addCache(clipData);

  if (result.added) {
    await showBadge('✓', '#22c55e');
  } else {
    // Duplicate or no content → open Popup
    await openPopup();
  }
}

// Listen for icon click (fires when no default_popup is set)
chrome.action.onClicked.addListener(handleIconClick);
