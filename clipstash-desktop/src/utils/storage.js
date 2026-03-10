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
} from './bridge.js';

function generateId() {
  const ts = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  return `${ts}_${rand}`;
}

// ===== Settings =====

export async function getSettings() {
  try {
    return await bridgeGetSettings();
  } catch {
    return {
      cacheLimit: 100,
      theme: 'system',
      language: 'en',
      hotkey: 'Alt+Shift+C',
      clipboardMonitor: false,
      autostart: false,
      showNotification: true,
      closeToTray: true,
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
      return { added: true, duplicate: false };
    }
    return { added: false, duplicate: true };
  } catch {
    return { added: false, duplicate: false };
  }
}

export async function removeCache(id) {
  return await bridgeRemoveCache(id);
}

export async function clearAllCaches() {
  return await bridgeClearAll();
}

export async function updateCacheTags(id, tags) {
  return await bridgeUpdateTags(id, tags);
}

export async function togglePin(id) {
  return await bridgeTogglePin(id);
}

export async function updateCacheContent(id, content) {
  return await bridgeUpdateCacheContent(id, content);
}

export async function updateCacheLanguage(id, language) {
  return await bridgeUpdateCacheLanguage(id, language);
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
  return {
    total: result.added + result.skipped,
    added: result.added,
    duplicates: result.skipped,
  };
}
