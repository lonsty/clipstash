// ClipStash Desktop - Tauri bridge module
// Provides the communication layer between frontend and Rust backend

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open, save } = window.__TAURI__.dialog;
const { writeTextFile, readTextFile, BaseDirectory } = window.__TAURI__.fs;
const { sendNotification } = window.__TAURI__.notification;
const { open: openUrl } = window.__TAURI__.shell;

// ===== Clipboard =====

export async function readClipboard() {
  return await invoke('read_clipboard');
}

export async function writeClipboard(type, content, htmlContent, imageDataUrl) {
  return await invoke('write_clipboard', {
    contentType: type,
    content: content || '',
    htmlContent: htmlContent || null,
    imageDataUrl: imageDataUrl || null,
  });
}

// ===== Cache CRUD =====

export async function getCaches(offset = 0, limit = 12) {
  return await invoke('get_caches', { offset, limit });
}

export async function addCache(item) {
  return await invoke('add_cache', {
    id: item.id,
    cacheType: item.type || 'text',
    content: item.content || '',
    htmlContent: item.htmlContent || null,
    imageDataUrl: item.imageDataUrl || null,
    imageHash: item.imageHash || null,
    createdAt: item.createdAt || Date.now(),
    contentLength: item.contentLength || 0,
    tags: item.tags || [],
    pinned: item.pinned || false,
    pinnedAt: item.pinnedAt || null,
  });
}

export async function removeCache(id) {
  return await invoke('remove_cache', { id });
}

export async function clearAllCaches() {
  return await invoke('clear_all_caches');
}

export async function updateCacheTags(id, tags) {
  return await invoke('update_cache_tags', { id, tags });
}

export async function togglePin(id) {
  return await invoke('toggle_pin', { id });
}

export async function searchCaches(query, offset = 0, limit = 1000) {
  return await invoke('search_caches', { query: query || '', offset, limit });
}

export async function getAllTags() {
  return await invoke('get_all_tags');
}

export async function getStorageStats() {
  return await invoke('get_storage_stats');
}

// ===== Settings =====

export async function getSettings() {
  return await invoke('get_settings');
}

export async function saveSettings(settings) {
  return await invoke('save_settings', { settings });
}

// ===== Export / Import =====

export async function exportCaches() {
  return await invoke('export_caches');
}

export async function importCaches(json) {
  return await invoke('import_caches', { json });
}

// ===== Desktop Features =====

export async function getAutostart() {
  return await invoke('get_autostart');
}

export async function setAutostart(enabled) {
  return await invoke('set_autostart', { enabled });
}

export async function setClipboardMonitor(enabled) {
  return await invoke('set_clipboard_monitor', { enabled });
}

export async function getClipboardMonitor() {
  return await invoke('get_clipboard_monitor');
}

export async function registerHotkey(keys) {
  return await invoke('register_hotkey', { keys });
}

export async function showNotification(title, body) {
  return await invoke('show_notification', { title, body });
}

export async function openFullscreenWindow(htmlContent) {
  return await invoke('open_fullscreen_window', { htmlContent });
}

// ===== Events =====

export async function onEvent(eventName, callback) {
  return await listen(eventName, (event) => {
    callback(event.payload);
  });
}

// ===== Window Behavior =====

export async function setSuppressAutoHide(suppress) {
  return await invoke('set_suppress_auto_hide', { suppress });
}

// ===== File Dialogs =====

export async function showSaveDialog(defaultName) {
  return await save({
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
}

export async function showOpenDialog() {
  return await open({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    multiple: false,
  });
}

export { writeTextFile, readTextFile, BaseDirectory, openUrl };
