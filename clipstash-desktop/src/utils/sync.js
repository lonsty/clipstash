// ClipStash Desktop - Cloud sync utility

import {
  getSyncSettings as bridgeGetSyncSettings,
  saveSyncSettings as bridgeSaveSyncSettings,
  validateSyncToken as bridgeValidateToken,
  initCloudSync as bridgeInitSync,
  performCloudSync as bridgePerformSync,
  disconnectCloudSync as bridgeDisconnect,
} from './bridge.js';

export async function getSyncSettings() {
  try {
    return await bridgeGetSyncSettings();
  } catch {
    return {
      token: '',
      gistId: '',
      enabled: false,
      lastSyncAt: 0,
      autoSync: true,
    };
  }
}

export async function saveSyncSettings(settings) {
  return await bridgeSaveSyncSettings(settings);
}

export async function validateToken(token) {
  return await bridgeValidateToken(token);
}

export async function initSync(token) {
  return await bridgeInitSync(token);
}

export async function performSync() {
  return await bridgePerformSync();
}

export async function disconnectSync() {
  return await bridgeDisconnect();
}

/**
 * formatSyncTime formats a timestamp for display
 * @param {number} ts - milliseconds since epoch
 * @param {string} neverText - text to show when ts is 0
 * @returns {string}
 */
export function formatSyncTime(ts, neverText = 'never') {
  if (!ts || ts === 0) return neverText;

  const now = Date.now();
  const diff = now - ts;

  if (diff < 60000) return '< 1m ago';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  const d = new Date(ts);
  return d.toLocaleDateString();
}
