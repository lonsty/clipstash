// ClipStash - Storage utility for chrome.storage.local

const STORAGE_KEY = 'clipstash-caches';
const SETTINGS_KEY = 'clipstash-settings';
const THEME_KEY = 'clipstash-theme';
const DEFAULT_MAX_CACHE_SIZE = 100;

/**
 * generateId generates a unique identifier
 * @returns {string} format: timestamp_randomHex
 */
function generateId() {
  const ts = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  return `${ts}_${rand}`;
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
  const current = await getSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, ...settings }
  });
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
  await chrome.storage.local.set({ [THEME_KEY]: theme });
}

// ===== Cache CRUD =====

/**
 * getCaches retrieves all cached records
 * @returns {Promise<Array>} cache list, pinned first, then by createdAt desc
 */
export async function getCaches() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
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

  const caches = await getCaches();
  const isDuplicate = caches.some(item => {
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

  const newItem = {
    id: generateId(),
    type,
    content,
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

  caches.unshift(newItem);

  // Evict non-pinned oldest records
  while (caches.length > settings.maxCacheSize) {
    const lastUnpinnedIdx = caches.findLastIndex(c => !c.pinned);
    if (lastUnpinnedIdx !== -1) {
      caches.splice(lastUnpinnedIdx, 1);
    } else {
      break;
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: sortCaches(caches) });
  return { added: true, duplicate: false };
}

/**
 * removeCache removes a cache record by id
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function removeCache(id) {
  const caches = await getCaches();
  const idx = caches.findIndex(item => item.id === id);
  if (idx === -1) return false;
  caches.splice(idx, 1);
  await chrome.storage.local.set({ [STORAGE_KEY]: caches });
  return true;
}

/**
 * clearAllCaches removes all cache records
 * @returns {Promise<void>}
 */
export async function clearAllCaches() {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}

/**
 * updateCacheTags updates tags for a cache record
 * @param {string} id
 * @param {string[]} tags
 * @returns {Promise<boolean>}
 */
export async function updateCacheTags(id, tags) {
  const caches = await getCaches();
  const item = caches.find(c => c.id === id);
  if (!item) return false;
  item.tags = tags;
  await chrome.storage.local.set({ [STORAGE_KEY]: caches });
  return true;
}

/**
 * togglePin toggles the pinned state of a record
 * @param {string} id
 * @returns {Promise<boolean>} the new pinned state
 */
export async function togglePin(id) {
  const caches = await getCaches();
  const item = caches.find(c => c.id === id);
  if (!item) return false;
  item.pinned = !item.pinned;
  item.pinnedAt = item.pinned ? Date.now() : 0;
  await chrome.storage.local.set({ [STORAGE_KEY]: sortCaches(caches) });
  return item.pinned;
}

// ===== Search =====

/**
 * searchCaches filters caches by keyword (matches content or tags)
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchCaches(query) {
  const caches = await getCaches();
  if (!query || !query.trim()) return caches;
  const q = query.toLowerCase().trim();
  return caches.filter(item => {
    if (item.content && item.content.toLowerCase().includes(q)) return true;
    if (item.tags && item.tags.some(tag => tag.toLowerCase().includes(q))) return true;
    return false;
  });
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
  const caches = await getCaches();
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
    content_length: rec.contentLength,
    tags: rec.tags,
    pinned: rec.pinned,
    pinned_at: rec.pinnedAt
  };
  if (rec.htmlContent) out.html_content = rec.htmlContent;
  if (rec.imageDataUrl) out.image_data_url = rec.imageDataUrl;
  if (rec.imageHash) out.image_hash = rec.imageHash;
  return out;
}

/**
 * fromSnakeRecord converts a snake_case record to internal camelCase
 * @param {Object} rec
 * @returns {Object}
 */
function fromSnakeRecord(rec) {
  const content = rec.content || '';
  const out = {
    id: rec.id || generateId(),
    type: rec.type || 'text',
    content,
    createdAt: rec.created_at || Date.now(),
    contentLength: rec.content_length || (content ? [...content].length : 0),
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    pinned: !!rec.pinned,
    pinnedAt: rec.pinned_at || 0
  };
  if (rec.html_content) out.htmlContent = rec.html_content;
  if (rec.image_data_url) out.imageDataUrl = rec.image_data_url;
  if (rec.image_hash) out.imageHash = rec.image_hash;
  return out;
}

/**
 * exportCaches returns all caches as a JSON string (snake_case fields) for download
 * @returns {Promise<string>}
 */
export async function exportCaches() {
  const caches = await getCaches();
  const payload = {
    version: 1,
    exported_at: Date.now(),
    app: 'ClipStash',
    records: caches.map(toSnakeRecord)
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * importCaches merges records from a JSON string (snake_case fields) into storage
 * @param {string} jsonStr
 * @returns {Promise<{total: number, added: number, duplicates: number}>}
 */
export async function importCaches(jsonStr) {
  const parsed = JSON.parse(jsonStr);
  let records;
  if (parsed && parsed.records && Array.isArray(parsed.records)) {
    records = parsed.records;
  } else if (Array.isArray(parsed)) {
    records = parsed;
  } else {
    throw new Error('Invalid format');
  }

  const caches = await getCaches();
  const settings = await getSettings();
  let added = 0;
  let duplicates = 0;

  for (const raw of records) {
    const rec = fromSnakeRecord(raw);

    if (!rec.id || (!rec.content && !rec.imageDataUrl)) {
      continue;
    }

    // Check duplicate
    const isDup = caches.some(c => {
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

    caches.push(rec);
    added++;
  }

  // Trim to max
  const sorted = sortCaches(caches);
  while (sorted.length > settings.maxCacheSize) {
    const lastUnpinnedIdx = sorted.findLastIndex(c => !c.pinned);
    if (lastUnpinnedIdx !== -1) {
      sorted.splice(lastUnpinnedIdx, 1);
    } else {
      break;
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: sorted });
  return { total: records.length, added, duplicates };
}
