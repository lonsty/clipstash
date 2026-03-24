// ClipStash - Storage utility for chrome.storage.local

import {
  STORAGE_KEY,
  SETTINGS_KEY,
  THEME_KEY,
  PENDING_DELETED_KEY,
  PENDING_RESTORED_KEY,
  DEFAULT_MAX_CACHE_SIZE
} from './constants.js';

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

/**
 * computeContentHash calculates a short SHA-256 based hash for content dedup.
 * For text/html records: hash(type + content), first 16 hex chars (8 bytes).
 * For image records: reuses imageHash directly.
 * @param {string} type - 'text' | 'html' | 'image'
 * @param {string} content - text content
 * @param {string} [imageHash] - pre-computed image hash
 * @returns {Promise<string>} 16-char hex hash, or empty string if no content
 */
async function computeContentHash(type, content, imageHash) {
  if (type === 'image') {
    return imageHash || '';
  }
  if (!content) return '';
  const data = new TextEncoder().encode(`${type}\0${content}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  // Take first 8 bytes → 16 hex chars (collision probability ~1 in 2^64)
  return Array.from(hashArray.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ===== Settings =====

/**
 * getSettings retrieves user settings
 * @returns {Promise<Object>} settings object
 */
export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
    ...data[SETTINGS_KEY]
  };
}

/**
 * saveSettings persists user settings
 * @param {Object} settings - settings to merge
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  try {
    const current = await getSettings();
    await chrome.storage.local.set({
      [SETTINGS_KEY]: { ...current, ...settings }
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

// ===== Theme =====

/**
 * getTheme retrieves the saved theme preference
 * @returns {Promise<string>} 'system' | 'light' | 'dark'
 */
export async function getTheme() {
  const data = await chrome.storage.local.get(THEME_KEY);
  return data[THEME_KEY] || 'system';
}

/**
 * saveTheme persists the theme preference
 * @param {string} theme - 'system' | 'light' | 'dark'
 * @returns {Promise<void>}
 */
export async function saveTheme(theme) {
  try {
    await chrome.storage.local.set({ [THEME_KEY]: theme });
  } catch (error) {
    console.error('Failed to save theme:', error);
    throw error;
  }
}

// ===== Cache CRUD =====

/**
 * getCaches retrieves all active (non-deleted) cache records from storage
 * @returns {Promise<Array>}
 */
export async function getCaches() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    // Filter out soft-deleted records
    return caches.filter(item => !item.deletedAt);
  } catch (error) {
    console.error('Failed to get caches:', error);
    return [];
  }
}

/**
 * getAllCachesIncludingDeleted retrieves all cache records including soft-deleted ones
 * @returns {Promise<Array>}
 */
export async function getAllCachesIncludingDeleted() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || [];
  } catch (error) {
    console.error('Failed to get all caches:', error);
    return [];
  }
}

/**
 * getDeletedCaches retrieves only soft-deleted cache records
 * @returns {Promise<Array>}
 */
export async function getDeletedCaches() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    return caches.filter(item => !!item.deletedAt);
  } catch (error) {
    console.error('Failed to get deleted caches:', error);
    return [];
  }
}

/**
 * sortCaches sorts: pinned first (by pinnedAt desc), then by createdAt desc
 * @param {Array} caches
 * @returns {Array}
 */
function sortCaches(caches) {
  const pinned = caches.filter(c => c.pinned).sort((a, b) => b.pinnedAt - a.pinnedAt);
  const unpinned = caches.filter(c => !c.pinned).sort((a, b) => b.createdAt - a.createdAt);
  return [...pinned, ...unpinned];
}

/**
 * addCache adds a new cache record
 * @param {Object} data - { content, type, htmlContent?, imageDataUrl? }
 *   type: 'text' | 'image' | 'html'
 * @returns {Promise<{added: boolean, duplicate: boolean}>}
 */
export async function addCache(data) {
  try {
    const type = data.type || 'text';
    const content = data.content || '';
    const htmlContent = data.htmlContent || '';
    const imageDataUrl = data.imageDataUrl || '';
    const imageHash = data.imageHash || '';

    // Determine the dedup key based on type
    let dedupKey = content;
    if (type === 'image') {
      dedupKey = imageHash || imageDataUrl;
    }

    if (!dedupKey || (typeof dedupKey === 'string' && !dedupKey.trim())) {
      return { added: false, duplicate: false };
    }

    // Read the full array (including soft-deleted) so we don't discard trash records
    const rawData = await chrome.storage.local.get(STORAGE_KEY);
    const allCaches = rawData[STORAGE_KEY] || [];
    const activeCaches = allCaches.filter(c => !c.deletedAt);

    const isDuplicate = activeCaches.some(item => {
      if (type === 'image') {
        // Prefer hash-based dedup; fall back to data URL comparison for old records
        if (imageHash && item.imageHash) return item.imageHash === imageHash;
        if (imageHash || item.imageHash) return false;
        return item.imageDataUrl === imageDataUrl;
      }
      return item.content === content;
    });
    if (isDuplicate) {
      return { added: false, duplicate: true };
    }

    const settings = await getSettings();

    const contentHash = await computeContentHash(type, content, imageHash);

    const existingIds = activeCaches.map(item => item.id);
    const newItem = {
      id: generateUniqueId(existingIds),
      type,
      content,
      contentHash,
      createdAt: Date.now(),
      contentLength: type === 'image' ? 0 : [...content].length,
      tags: [],
      pinned: false,
      pinnedAt: 0
    };

    if (type === 'html') {
      newItem.htmlContent = htmlContent;
    }
    if (type === 'image') {
      newItem.imageDataUrl = imageDataUrl;
      newItem.imageHash = imageHash;
      newItem.contentLength = 0;
    }

    activeCaches.unshift(newItem);

    // Evict non-pinned oldest active records only
    while (activeCaches.length > settings.maxCacheSize) {
      const lastUnpinnedIdx = activeCaches.findLastIndex(c => !c.pinned);
      if (lastUnpinnedIdx !== -1) {
        activeCaches.splice(lastUnpinnedIdx, 1);
      } else {
        break;
      }
    }

    // Merge back: sorted active records + unchanged soft-deleted records
    const deletedCaches = allCaches.filter(c => !!c.deletedAt);
    const merged = [...sortCaches(activeCaches), ...deletedCaches];
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    notifyChange('add', { id: newItem.id });
    return { added: true, duplicate: false };
  } catch (error) {
    console.error('Failed to add cache:', error);
    throw error;
  }
}

/**
 * removeCache soft-deletes a cache record by id (moves to trash).
 * The record stays in storage with a deletedAt timestamp and will be
 * permanently purged after the TTL expires (30 days).
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function removeCache(id) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const item = caches.find(c => c.id === id && !c.deletedAt);
    if (!item) return false;
    item.deletedAt = Date.now();
    // Track deletion for sync propagation
    await appendPendingDeleted([id]);
    await chrome.storage.local.set({ [STORAGE_KEY]: caches });
    notifyChange('delete', { id });
    return true;
  } catch (error) {
    console.error('Failed to soft-delete cache:', error);
    throw error;
  }
}

/**
 * clearAllCaches soft-deletes all active cache records (moves to trash).
 * Records stay in storage with deletedAt timestamps.
 * @returns {Promise<void>}
 */
export async function clearAllCaches() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const now = Date.now();
    const activeIds = [];
    for (const item of caches) {
      if (!item.deletedAt) {
        item.deletedAt = now;
        activeIds.push(item.id);
      }
    }
    if (activeIds.length > 0) {
      await appendPendingDeleted(activeIds);
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: caches });
    if (activeIds.length > 0) {
      notifyChange('clear');
    }
  } catch (error) {
    console.error('Failed to soft-delete all caches:', error);
    throw error;
  }
}

/**
 * deleteAllPermanently removes all cache records permanently (active + trash).
 * @returns {Promise<number>} number of permanently deleted records
 */
export async function deleteAllPermanently() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    if (caches.length === 0) return 0;
    const allIds = caches.map(c => c.id);
    await appendPendingDeleted(allIds);
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    notifyChange('deleteAll', { count: allIds.length });
    return allIds.length;
  } catch (error) {
    console.error('Failed to permanently delete all caches:', error);
    throw error;
  }
}

/**
 * softDeleteCache marks a cache record as soft-deleted (trash bin)
 * The record remains in storage but is hidden from normal views.
 * It will be auto-purged after the TTL expires.
 * @param {string} id
 * @param {number} [deletedAt] - timestamp of deletion (defaults to now)
 * @returns {Promise<boolean>}
 */
export async function softDeleteCache(id, deletedAt) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const item = caches.find(c => c.id === id);
    if (!item) return false;
    item.deletedAt = deletedAt || Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: caches });
    return true;
  } catch (error) {
    console.error('Failed to soft-delete cache:', error);
    throw error;
  }
}

/**
 * restoreCache restores a soft-deleted cache record
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function restoreCache(id) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const item = caches.find(c => c.id === id);
    if (!item || !item.deletedAt) return false;
    item.deletedAt = 0;
    item.updatedAt = Date.now();
    // Track restoration for sync: prevent cloud deleted_ids from re-deleting
    await appendPendingRestored([id]);
    // Remove from pending-deleted so we don't push deletion to cloud again
    await removePendingDeleted([id]);
    await chrome.storage.local.set({ [STORAGE_KEY]: sortCaches(caches) });
    notifyChange('restore', { id });
    return true;
  } catch (error) {
    console.error('Failed to restore cache:', error);
    throw error;
  }
}

/**
 * permanentDeleteCache permanently removes a soft-deleted cache record
 * Unlike removeCache, this operates on all records including soft-deleted ones.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function permanentDeleteCache(id) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const idx = caches.findIndex(c => c.id === id);
    if (idx === -1) return false;
    caches.splice(idx, 1);
    // Track deletion for sync propagation
    await appendPendingDeleted([id]);
    await chrome.storage.local.set({ [STORAGE_KEY]: caches });
    notifyChange('permanentDelete', { id });
    return true;
  } catch (error) {
    console.error('Failed to permanently delete cache:', error);
    throw error;
  }
}

/**
 * purgeExpiredCaches permanently removes soft-deleted records older than ttlMs
 * @param {number} ttlMs - time-to-live in milliseconds (default 30 days)
 * @returns {Promise<number>} number of purged records
 */
export async function purgeExpiredCaches(ttlMs = 30 * 24 * 60 * 60 * 1000) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const now = Date.now();
    const before = caches.length;
    const remaining = caches.filter(item => {
      if (!item.deletedAt) return true;
      return (now - item.deletedAt) < ttlMs;
    });
    if (remaining.length < before) {
      await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
    }
    return before - remaining.length;
  } catch (error) {
    console.error('Failed to purge expired caches:', error);
    return 0;
  }
}

/**
 * restoreAllCaches restores all soft-deleted cache records back to active
 * @returns {Promise<number>} number of restored records
 */
export async function restoreAllCaches() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const restoredIds = [];
    const now = Date.now();
    for (const item of caches) {
      if (item.deletedAt) {
        item.deletedAt = 0;
        item.updatedAt = now;
        restoredIds.push(item.id);
      }
    }
    if (restoredIds.length === 0) return 0;
    await appendPendingRestored(restoredIds);
    await removePendingDeleted(restoredIds);
    await chrome.storage.local.set({ [STORAGE_KEY]: sortCaches(caches) });
    notifyChange('restoreAll', { count: restoredIds.length });
    return restoredIds.length;
  } catch (error) {
    console.error('Failed to restore all caches:', error);
    throw error;
  }
}

/**
 * permanentDeleteAllCaches permanently removes all soft-deleted cache records
 * @returns {Promise<number>} number of permanently deleted records
 */
export async function permanentDeleteAllCaches() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const deletedIds = [];
    const remaining = [];
    for (const item of caches) {
      if (item.deletedAt) {
        deletedIds.push(item.id);
      } else {
        remaining.push(item);
      }
    }
    if (deletedIds.length === 0) return 0;
    await appendPendingDeleted(deletedIds);
    await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
    notifyChange('permanentDeleteAll', { count: deletedIds.length });
    return deletedIds.length;
  } catch (error) {
    console.error('Failed to permanently delete all caches:', error);
    throw error;
  }
}

/**
 * updateCacheTags updates tags for a cache record
 * @param {string} id
 * @param {string[]} tags
 * @returns {Promise<boolean>}
 */
export async function updateCacheTags(id, tags) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const item = caches.find(c => c.id === id && !c.deletedAt);
    if (!item) return false;
    item.tags = tags;
    item.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: caches });
    notifyChange('updateTags', { id });
    return true;
  } catch (error) {
    console.error('Failed to update tags:', error);
    throw error;
  }
}

/**
 * togglePin toggles the pinned state of a record
 * @param {string} id
 * @returns {Promise<boolean>} the new pinned state
 */
export async function togglePin(id) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const item = caches.find(c => c.id === id && !c.deletedAt);
    if (!item) return false;
    const now = Date.now();
    item.pinned = !item.pinned;
    item.pinnedAt = item.pinned ? now : 0;
    item.updatedAt = now;
    await chrome.storage.local.set({ [STORAGE_KEY]: sortCaches(caches) });
    notifyChange('togglePin', { id });
    return item.pinned;
  } catch (error) {
    console.error('Failed to toggle pin:', error);
    throw error;
  }
}

/**
 * updateCacheContent updates the text content of a cache record
 * @param {string} id
 * @param {string} content
 * @returns {Promise<boolean>}
 */
export async function updateCacheContent(id, content) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const item = caches.find(c => c.id === id && !c.deletedAt);
    if (!item) return false;
    item.content = content;
    item.contentLength = [...content].length;
    item.contentHash = await computeContentHash(item.type || 'text', content);
    item.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: caches });
    notifyChange('updateContent', { id });
    return true;
  } catch (error) {
    console.error('Failed to update content:', error);
    throw error;
  }
}

/**
 * updateCacheLanguage updates the syntax language of a cache record
 * @param {string} id
 * @param {string|null} language
 * @returns {Promise<boolean>}
 */
export async function updateCacheLanguage(id, language) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    const item = caches.find(c => c.id === id && !c.deletedAt);
    if (!item) return false;
    item.language = language || null;
    item.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: caches });
    notifyChange('updateLanguage', { id });
    return true;
  } catch (error) {
    console.error('Failed to update language:', error);
    throw error;
  }
}

// ===== Search =====

/**
 * searchCaches filters caches by keyword (matches content or tags)
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchCaches(query) {
  try {
    const caches = await getCaches(); // Already excludes soft-deleted
    if (!query || !query.trim()) return caches;
    const q = query.toLowerCase().trim();
    return caches.filter(item => {
      if (item.content && item.content.toLowerCase().includes(q)) return true;
      if (item.tags && item.tags.some(tag => tag.toLowerCase().includes(q))) return true;
      return false;
    });
  } catch (error) {
    console.error('Failed to search caches:', error);
    return [];
  }
}

/**
 * getAllTags returns all unique tags in use
 * @returns {Promise<string[]>}
 */
export async function getAllTags() {
  const caches = await getCaches();
  const tagSet = new Set();
  for (const item of caches) {
    if (item.tags) {
      for (const tag of item.tags) tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}

// ===== Stats =====

/**
 * getStorageStats returns cache storage statistics
 * @returns {Promise<Object>}
 */
export async function getStorageStats() {
  const caches = await getCaches(); // Active only
  const settings = await getSettings();
  const jsonStr = JSON.stringify(caches);
  const totalBytes = new Blob([jsonStr]).size;

  return {
    count: caches.length,
    maxCount: settings.maxCacheSize,
    totalBytes,
    formattedSize: formatBytes(totalBytes)
  };
}

/**
 * formatBytes formats bytes to a human-readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ===== Export / Import =====

/**
 * toSnakeRecord converts an internal camelCase record to snake_case for export
 * @param {Object} rec
 * @returns {Object}
 */
function toSnakeRecord(rec) {
  const out = {
    id: rec.id,
    type: rec.type,
    content: rec.content,
    created_at: rec.createdAt,
    updated_at: rec.updatedAt,
  };
  if (rec.contentHash) out.content_hash = rec.contentHash;
  // Conditionally omit default/empty fields to reduce payload size
  if (Array.isArray(rec.tags) && rec.tags.length > 0) out.tags = rec.tags;
  if (rec.pinned) {
    out.pinned = true;
    out.pinned_at = rec.pinnedAt || 0;
  }
  if (rec.htmlContent) out.html_content = rec.htmlContent;
  if (rec.imageDataUrl) out.image_data_url = rec.imageDataUrl;
  if (rec.imageHash) out.image_hash = rec.imageHash;
  if (rec.language) out.language = rec.language;
  return out;
}

/**
 * fromSnakeRecord converts a snake_case record to internal camelCase
 * @param {Object} rec
 * @returns {Object}
 */
function fromSnakeRecord(rec) {
  const content = rec.content || '';
  const createdAt = rec.created_at || Date.now();
  const out = {
    id: rec.id || generateId(),
    type: rec.type || 'text',
    content,
    createdAt,
    updatedAt: rec.updated_at || createdAt,
    contentLength: content ? [...content].length : 0,
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    pinned: !!rec.pinned,
    pinnedAt: rec.pinned_at || 0
  };
  if (rec.content_hash) out.contentHash = rec.content_hash;
  if (rec.html_content) out.htmlContent = rec.html_content;
  if (rec.image_data_url) out.imageDataUrl = rec.image_data_url;
  if (rec.image_hash) out.imageHash = rec.image_hash;
  if (rec.language) out.language = rec.language;
  return out;
}

// ===== Sync Helpers (used by sync.js) =====

/**
 * getCachesRaw returns the raw caches array including soft-deleted records (for sync)
 * @returns {Promise<Array>}
 */
export { getAllCachesIncludingDeleted as getCachesRaw };

/**
 * setCachesRaw replaces all caches in storage (used during sync merge)
 * @param {Array} caches
 * @returns {Promise<void>}
 */
export async function setCachesRaw(caches) {
  await chrome.storage.local.set({ [STORAGE_KEY]: sortCaches(caches) });
}

/**
 * toSnakeRecordExport exports a record in snake_case format (used by sync)
 */
export { toSnakeRecord as toSnakeRecordExport };

/**
 * fromSnakeRecordImport imports a record from snake_case format (used by sync)
 */
export { fromSnakeRecord as fromSnakeRecordImport };

/**
 * computeContentHashExport computes a content hash (used by sync for migration)
 */
export { computeContentHash as computeContentHashExport };

/**
 * migrateContentHash backfills contentHash for existing records that lack it.
 * Should be called once on extension install/update. Skips records that already
 * have a contentHash. Safe to call multiple times (idempotent).
 * @returns {Promise<number>} number of records migrated
 */
export async function migrateContentHash() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const caches = data[STORAGE_KEY] || [];
    let migrated = 0;

    for (const item of caches) {
      if (item.contentHash) continue;
      if (item.type === 'image') {
        if (item.imageHash) {
          item.contentHash = item.imageHash;
          migrated++;
        }
        continue;
      }
      if (!item.content) continue;
      item.contentHash = await computeContentHash(item.type || 'text', item.content);
      if (item.contentHash) migrated++;
    }

    if (migrated > 0) {
      await chrome.storage.local.set({ [STORAGE_KEY]: caches });
      console.log(`[Storage] Migrated contentHash for ${migrated} records`);
    }
    return migrated;
  } catch (error) {
    console.error('[Storage] Failed to migrate contentHash:', error);
    return 0;
  }
}

// ===== Pending Deleted IDs (for sync propagation) =====

/**
 * appendPendingDeleted appends deleted record IDs to the pending list
 * @param {string[]} ids - array of record IDs that were deleted locally
 * @returns {Promise<void>}
 */
async function appendPendingDeleted(ids) {
  try {
    const data = await chrome.storage.local.get(PENDING_DELETED_KEY);
    const existing = data[PENDING_DELETED_KEY] || [];
    const now = Date.now();
    const newEntries = ids.map(id => ({ id, deleted_at: now }));
    await chrome.storage.local.set({
      [PENDING_DELETED_KEY]: [...existing, ...newEntries],
    });
  } catch (error) {
    console.error('Failed to append pending deleted:', error);
  }
}

/**
 * getPendingDeleted returns the list of locally-deleted record IDs pending sync
 * @returns {Promise<Array<{id: string, deleted_at: number}>>}
 */
export async function getPendingDeleted() {
  try {
    const data = await chrome.storage.local.get(PENDING_DELETED_KEY);
    return data[PENDING_DELETED_KEY] || [];
  } catch {
    return [];
  }
}

/**
 * clearPendingDeleted clears the pending deleted list after successful sync
 * @returns {Promise<void>}
 */
export async function clearPendingDeleted() {
  await chrome.storage.local.set({ [PENDING_DELETED_KEY]: [] });
}

/**
 * removePendingDeleted removes specific IDs from the pending deleted list
 * (used when a record is restored from trash)
 * @param {string[]} ids - array of record IDs to remove
 * @returns {Promise<void>}
 */
async function removePendingDeleted(ids) {
  try {
    const data = await chrome.storage.local.get(PENDING_DELETED_KEY);
    const existing = data[PENDING_DELETED_KEY] || [];
    const idSet = new Set(ids);
    const filtered = existing.filter(e => !idSet.has(e.id));
    await chrome.storage.local.set({ [PENDING_DELETED_KEY]: filtered });
  } catch (error) {
    console.error('Failed to remove pending deleted:', error);
  }
}

// ===== Pending Restored IDs (for sync: prevent cloud deleted_ids from re-deleting) =====

/**
 * appendPendingRestored appends restored record IDs to the pending list
 * @param {string[]} ids - array of record IDs that were restored locally
 * @returns {Promise<void>}
 */
async function appendPendingRestored(ids) {
  try {
    const data = await chrome.storage.local.get(PENDING_RESTORED_KEY);
    const existing = data[PENDING_RESTORED_KEY] || [];
    const existingSet = new Set(existing);
    for (const id of ids) {
      existingSet.add(id);
    }
    await chrome.storage.local.set({
      [PENDING_RESTORED_KEY]: [...existingSet],
    });
  } catch (error) {
    console.error('Failed to append pending restored:', error);
  }
}

/**
 * getPendingRestored returns the list of locally-restored record IDs pending sync
 * @returns {Promise<string[]>}
 */
export async function getPendingRestored() {
  try {
    const data = await chrome.storage.local.get(PENDING_RESTORED_KEY);
    return data[PENDING_RESTORED_KEY] || [];
  } catch {
    return [];
  }
}

/**
 * clearPendingRestored clears the pending restored list after successful sync
 * @returns {Promise<void>}
 */
export async function clearPendingRestored() {
  await chrome.storage.local.set({ [PENDING_RESTORED_KEY]: [] });
}

/**
 * exportCaches returns all caches as a JSON string (snake_case fields) for download
 * @returns {Promise<string>}
 */
export async function exportCaches() {
  try {
    const caches = await getCaches();
    const payload = {
      version: 1,
      exported_at: Date.now(),
      app: 'ClipStash',
      records: caches.map(toSnakeRecord)
    };
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    console.error('Failed to export caches:', error);
    throw error;
  }
}

/**
 * importCaches merges records from a JSON string (snake_case fields) into storage
 * @param {string} jsonStr
 * @returns {Promise<{total: number, added: number, duplicates: number}>}
 */
export async function importCaches(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    let records;
    if (parsed && parsed.records && Array.isArray(parsed.records)) {
      records = parsed.records;
    } else if (Array.isArray(parsed)) {
      records = parsed;
    } else {
      throw new Error('Invalid format');
    }

    // Read the full array (including soft-deleted) so we don't discard trash records
    const rawData = await chrome.storage.local.get(STORAGE_KEY);
    const allCaches = rawData[STORAGE_KEY] || [];
    const activeCaches = allCaches.filter(c => !c.deletedAt);
    const deletedCaches = allCaches.filter(c => !!c.deletedAt);

    const settings = await getSettings();
    let added = 0;
    let duplicates = 0;

    for (const raw of records) {
      const rec = fromSnakeRecord(raw);

      if (!rec.id || (!rec.content && !rec.imageDataUrl)) {
        continue;
      }

      // Check duplicate against active records only
      const isDup = activeCaches.some(c => {
        if (rec.type === 'image' && rec.imageDataUrl) {
          if (rec.imageHash && c.imageHash) return c.imageHash === rec.imageHash;
          if (rec.imageHash || c.imageHash) return false;
          return c.imageDataUrl === rec.imageDataUrl;
        }
        return c.content === rec.content;
      });

      if (isDup) {
        duplicates++;
        continue;
      }

      activeCaches.push(rec);
      added++;
    }

    // Trim to max (active records only)
    const sorted = sortCaches(activeCaches);
    while (sorted.length > settings.maxCacheSize) {
      const lastUnpinnedIdx = sorted.findLastIndex(c => !c.pinned);
      if (lastUnpinnedIdx !== -1) {
        sorted.splice(lastUnpinnedIdx, 1);
      } else {
        break;
      }
    }

    // Merge back: sorted active records + unchanged soft-deleted records
    const merged = [...sorted, ...deletedCaches];
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    if (added > 0) {
      notifyChange('import', { added });
    }
    return { total: records.length, added, duplicates };
  } catch (error) {
    console.error('Failed to import caches:', error);
    throw error;
  }
}
