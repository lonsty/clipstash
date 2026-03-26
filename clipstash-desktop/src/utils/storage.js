// ClipStash Desktop - Storage utility (wraps Tauri backend calls)

import {
  addCache as bridgeAddCache,
  removeCache as bridgeRemoveCache,
  clearAllCaches as bridgeClearAll,
  updateCacheTags as bridgeUpdateTags,
  togglePin as bridgeTogglePin,
  updateCacheContent as bridgeUpdateCacheContent,
  updateCacheLanguage as bridgeUpdateCacheLanguage,
  searchCaches as bridgeSearchCaches,
  getAllTags as bridgeGetAllTags,
  getStorageStats as bridgeGetStorageStats,
  getSettings as bridgeGetSettings,
  saveSettings as bridgeSaveSettings,
  exportCaches as bridgeExportCaches,
  importCaches as bridgeImportCaches,
  getDeletedCaches as bridgeGetDeletedCaches,
  restoreCache as bridgeRestoreCache,
  permanentDeleteCache as bridgePermanentDeleteCache,
  purgeExpiredCaches as bridgePurgeExpiredCaches,
} from './bridge.js';
import {
  DEFAULT_MAX_CACHE_SIZE, DEFAULT_LANGUAGE, DEFAULT_THEME, DEFAULT_HOTKEY,
  DEFAULT_AUTOSTART, DEFAULT_CLIPBOARD_MONITOR, DEFAULT_SHOW_NOTIFICATION,
} from '../shared/constants.js';

// ===== Storage Change Hooks =====
// Pub-sub system: any module can subscribe to data mutations.
// Sync subscribes once — no more scattered manual scheduleSyncPush() calls.

const changeListeners = new Set();

/**
 * onStorageChange registers a listener that fires after any data mutation.
 * @param {(action: string, detail?: Object) => void} listener
 * @returns {() => void} unsubscribe function
 */
export function onStorageChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/**
 * notifyChange fires all registered change listeners.
 * Called internally after every successful data mutation.
 * @param {string} action - e.g. 'add', 'delete', 'update', 'restore', 'import', 'clear'
 * @param {Object} [detail] - optional context (e.g. { id })
 */
function notifyChange(action, detail) {
  for (const fn of changeListeners) {
    try {
      fn(action, detail);
    } catch (err) {
      console.error('[StorageHook] Listener error:', err);
    }
  }
}

/**
 * generateId generates a random identifier (10 hex chars = 5 bytes)
 * @returns {string} e.g. "a3f7e2b14c"
 */
function generateId() {
  const arr = new Uint8Array(5);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * generateUniqueId generates a collision-free ID against an existing set
 * @param {Set<string>|Array<string>} existingIds - IDs already in use
 * @returns {string} a unique 10 hex char ID
 */
function generateUniqueId(existingIds) {
  const ids = existingIds instanceof Set ? existingIds : new Set(existingIds);
  let id = generateId();
  while (ids.has(id)) {
    id = generateId();
  }
  return id;
}

// ===== Settings =====

export async function getSettings() {
  try {
    return await bridgeGetSettings();
  } catch {
    return {
      cacheLimit: DEFAULT_MAX_CACHE_SIZE,
      theme: DEFAULT_THEME,
      language: DEFAULT_LANGUAGE,
      hotkey: DEFAULT_HOTKEY,
      clipboardMonitor: DEFAULT_CLIPBOARD_MONITOR,
      autostart: DEFAULT_AUTOSTART,
      showNotification: DEFAULT_SHOW_NOTIFICATION,
    };
  }
}

export async function saveSettings(settings) {
  return await bridgeSaveSettings(settings);
}

// ===== Theme (stored in settings) =====

export async function getTheme() {
  const settings = await getSettings();
  return settings.theme || 'system';
}

export async function saveTheme(theme) {
  const settings = await getSettings();
  settings.theme = theme;
  await saveSettings(settings);
}

// ===== Cache CRUD =====

export async function addCache(data) {
  const type = data.type || 'text';
  const content = data.content || '';
  const contentLength = type === 'image' ? 0 : [...content].length;

  const item = {
    id: generateId(),
    type,
    content,
    htmlContent: data.htmlContent || null,
    imageDataUrl: data.imageDataUrl || null,
    imageHash: data.imageHash || null,
    createdAt: Date.now(),
    contentLength,
    tags: [],
    pinned: false,
    pinnedAt: null,
  };

  try {
    const added = await bridgeAddCache(item);
    if (added) {
      notifyChange('add', { id: item.id });
      return { added: true, duplicate: false };
    }
    return { added: false, duplicate: true };
  } catch {
    return { added: false, duplicate: false };
  }
}

export async function removeCache(id) {
  const result = await bridgeRemoveCache(id);
  if (result) notifyChange('delete', { id });
  return result;
}

export async function clearAllCaches() {
  const result = await bridgeClearAll();
  notifyChange('clear');
  return result;
}

/**
 * deleteAllPermanently removes all records permanently (active + trash).
 * First soft-deletes all active, then permanently removes everything.
 */
export async function deleteAllPermanently() {
  // Step 1: soft-delete active records so they become trash
  await bridgeClearAll();
  // Step 2: permanently remove all trash records
  const deleted = await bridgeGetDeletedCaches();
  let count = 0;
  for (const item of deleted) {
    const ok = await bridgePermanentDeleteCache(item.id);
    if (ok) count++;
  }
  if (count > 0) notifyChange('deleteAll', { count });
  return count;
}

export async function updateCacheTags(id, tags) {
  const result = await bridgeUpdateTags(id, tags);
  if (result) notifyChange('updateTags', { id });
  return result;
}

export async function togglePin(id) {
  const result = await bridgeTogglePin(id);
  notifyChange('togglePin', { id });
  return result;
}

export async function updateCacheContent(id, content) {
  const result = await bridgeUpdateCacheContent(id, content);
  if (result) notifyChange('updateContent', { id });
  return result;
}

export async function updateCacheLanguage(id, language) {
  const result = await bridgeUpdateCacheLanguage(id, language);
  if (result) notifyChange('updateLanguage', { id });
  return result;
}

// ===== Search =====

export async function searchCaches(query) {
  return await bridgeSearchCaches(query);
}

export async function getAllTags() {
  return await bridgeGetAllTags();
}

// ===== Stats =====

export async function getStorageStats() {
  const stats = await bridgeGetStorageStats();
  const settings = await getSettings();
  return {
    count: stats.totalRecords,
    maxCount: settings.cacheLimit,
    totalBytes: stats.totalSize,
    formattedSize: formatBytes(stats.totalSize),
  };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ===== Export / Import =====

export async function exportCaches() {
  return await bridgeExportCaches();
}

export async function importCaches(jsonStr) {
  const result = await bridgeImportCaches(jsonStr);
  if (result.added > 0) {
    notifyChange('import', { added: result.added });
  }
  return {
    total: result.added + result.skipped,
    added: result.added,
    duplicates: result.skipped,
  };
}

// ===== Trash Bin =====

export async function getDeletedCaches() {
  return await bridgeGetDeletedCaches();
}

export async function restoreCache(id) {
  const result = await bridgeRestoreCache(id);
  if (result) notifyChange('restore', { id });
  return result;
}

export async function permanentDeleteCache(id) {
  const result = await bridgePermanentDeleteCache(id);
  if (result) notifyChange('permanentDelete', { id });
  return result;
}

export async function restoreAllCaches() {
  const deleted = await bridgeGetDeletedCaches();
  let count = 0;
  for (const item of deleted) {
    const ok = await bridgeRestoreCache(item.id);
    if (ok) count++;
  }
  if (count > 0) notifyChange('restoreAll', { count });
  return count;
}

export async function permanentDeleteAllCaches() {
  const deleted = await bridgeGetDeletedCaches();
  let count = 0;
  for (const item of deleted) {
    const ok = await bridgePermanentDeleteCache(item.id);
    if (ok) count++;
  }
  if (count > 0) notifyChange('permanentDeleteAll', { count });
  return count;
}

export async function purgeExpiredCaches(ttlMs) {
  return await bridgePurgeExpiredCaches(ttlMs);
}
