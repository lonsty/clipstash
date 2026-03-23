// ClipStash Extension - Cloud sync module (GitHub Gist backend)

import {
  getCachesRaw,
  setCachesRaw,
  toSnakeRecordExport,
  fromSnakeRecordImport,
  getPendingDeleted,
  clearPendingDeleted,
  getPendingRestored,
  clearPendingRestored,
  softDeleteCache,
  purgeExpiredCaches,
} from './storage.js';

const GIST_DATA_FILE = 'clipstash-data.json';
const GIST_META_FILE = 'clipstash-meta.json';
const GIST_DESCRIPTION = 'ClipStash Cloud Sync Data (do not delete)';
const API_BASE = 'https://api.github.com';
const SYNC_SETTINGS_KEY = 'clipstash-sync';

// 30 days in ms — deleted_ids entries older than this are pruned
const DELETED_IDS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ===== Sync Settings Persistence =====

/**
 * getSyncSettings retrieves cloud sync settings from storage
 * @returns {Promise<Object>}
 */
export async function getSyncSettings() {
  try {
    const data = await chrome.storage.local.get(SYNC_SETTINGS_KEY);
    return {
      token: '',
      gistId: '',
      enabled: false,
      lastSyncAt: 0,
      autoSync: true,
      ...data[SYNC_SETTINGS_KEY],
    };
  } catch {
    return { token: '', gistId: '', enabled: false, lastSyncAt: 0, autoSync: true };
  }
}

/**
 * saveSyncSettings persists cloud sync settings
 * @param {Object} settings
 * @returns {Promise<void>}
 */
export async function saveSyncSettings(settings) {
  await chrome.storage.local.set({ [SYNC_SETTINGS_KEY]: settings });
}

// ===== GitHub API Helpers =====

/**
 * buildHeaders creates headers for GitHub API requests
 * @param {string} token
 * @returns {Object}
 */
function buildHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * validateToken tests whether the GitHub PAT is valid
 * @param {string} token
 * @returns {Promise<string>} GitHub username
 */
export async function validateToken(token) {
  const resp = await fetch(`${API_BASE}/user`, {
    headers: buildHeaders(token),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    let detail = '';
    try {
      const json = JSON.parse(body);
      detail = json.message || body;
    } catch {
      detail = body;
    }
    console.error('[Sync] validateToken failed:', resp.status, detail);
    throw new Error(resp.status === 401
      ? `Token unauthorized – ${detail || 'check if token is valid and not expired'}`
      : `Token invalid (HTTP ${resp.status}): ${detail}`);
  }
  const body = await resp.json();
  return body.login || 'unknown';
}

/**
 * findClipstashGist searches existing gists for the ClipStash sync gist
 * @param {string} token
 * @returns {Promise<string|null>} gist ID or null
 */
async function findClipstashGist(token) {
  const resp = await fetch(`${API_BASE}/gists?per_page=100`, {
    headers: buildHeaders(token),
  });
  if (!resp.ok) throw new Error(`Failed to list gists (HTTP ${resp.status})`);
  const gists = await resp.json();
  for (const gist of gists) {
    if (gist.description === GIST_DESCRIPTION && gist.id) {
      return gist.id;
    }
  }
  return null;
}

/**
 * createGist creates a new secret gist with empty data
 * @param {string} token
 * @returns {Promise<string>} gist ID
 */
async function createGist(token) {
  const emptyData = { version: 1, app: 'ClipStash', records: [] };
  const emptyMeta = { version: 1, last_sync_at: 0, record_count: 0, deleted_ids: [] };

  const resp = await fetch(`${API_BASE}/gists`, {
    method: 'POST',
    headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_DATA_FILE]: { content: JSON.stringify(emptyData, null, 2) },
        [GIST_META_FILE]: { content: JSON.stringify(emptyMeta, null, 2) },
      },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to create gist (HTTP ${resp.status}): ${text}`);
  }
  const result = await resp.json();
  return result.id;
}

/**
 * getGistFiles fetches gist file contents
 * @param {string} token
 * @param {string} gistId
 * @returns {Promise<Object>} map of filename → content
 */
async function getGistFiles(token, gistId) {
  const resp = await fetch(`${API_BASE}/gists/${gistId}`, {
    headers: buildHeaders(token),
  });
  if (resp.status === 404) throw new Error('Gist not found. It may have been deleted.');
  if (!resp.ok) throw new Error(`Failed to get gist (HTTP ${resp.status})`);
  const body = await resp.json();
  const files = {};
  if (body.files) {
    for (const [name, fileObj] of Object.entries(body.files)) {
      if (fileObj.content) files[name] = fileObj.content;
    }
  }
  return files;
}

/**
 * updateGist updates gist files
 * @param {string} token
 * @param {string} gistId
 * @param {string} dataContent
 * @param {string} metaContent
 * @returns {Promise<void>}
 */
async function updateGist(token, gistId, dataContent, metaContent) {
  const resp = await fetch(`${API_BASE}/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        [GIST_DATA_FILE]: { content: dataContent },
        [GIST_META_FILE]: { content: metaContent },
      },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to update gist (HTTP ${resp.status}): ${text}`);
  }
}

// ===== Merge Logic (Last-Write-Wins) =====

/**
 * mergeRecords performs LWW merge between local and remote records.
 * Records present in localDeletedIdSet are treated as intentionally deleted
 * and will NOT be pulled back from remote.
 * MVP: skips image records.
 * @param {Array} localCaches - local camelCase records
 * @param {Array} remoteRecords - remote snake_case JSON records
 * @param {Set<string>} localDeletedIdSet - IDs deleted locally since last sync
 * @returns {{merged: Array, pulled: number, pushed: number, conflicts: number}}
 */
function mergeRecords(localCaches, remoteRecords, localDeletedIdSet) {
  // Build local map (skip images for MVP)
  const localMap = new Map();
  for (const item of localCaches) {
    if (item.type !== 'image') {
      localMap.set(item.id, item);
    }
  }

  let pulled = 0;
  let conflicts = 0;
  let localUpdated = 0;

  // Build remote lookup for quick access
  const remoteMap = new Map();
  for (const remoteJson of remoteRecords) {
    const remoteItem = fromSnakeRecordImport(remoteJson);
    if (remoteItem.id && remoteItem.type !== 'image') {
      remoteMap.set(remoteItem.id, remoteItem);
    }
  }

  // Process remote records
  for (const [, remoteItem] of remoteMap) {
    // Skip records that were intentionally deleted locally
    if (localDeletedIdSet.has(remoteItem.id)) continue;

    if (localMap.has(remoteItem.id)) {
      const localItem = localMap.get(remoteItem.id);
      // LWW: remote wins if newer
      if ((remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
        localMap.set(remoteItem.id, remoteItem);
        conflicts++;
      } else if ((localItem.updatedAt || 0) > (remoteItem.updatedAt || 0)) {
        // Local wins — record has been modified locally (e.g. tags, language)
        localUpdated++;
      }
    } else {
      // Remote-only record → pull in
      localMap.set(remoteItem.id, remoteItem);
      pulled++;
    }
  }

  // Count pushed (local-only, not present in remote at all)
  const pushed = localCaches.filter(
    item => item.type !== 'image' && !remoteMap.has(item.id)
  ).length;

  // Rebuild merged list: include images unchanged + merged text/html
  const imageItems = localCaches.filter(item => item.type === 'image');
  const mergedTextItems = [...localMap.values()];
  const merged = [...imageItems, ...mergedTextItems];

  return { merged, pulled, pushed, conflicts, localUpdated };
}

// ===== Public Sync Operations =====

/**
 * initSync validates the token, finds or creates a gist, and saves settings
 * @param {string} token
 * @returns {Promise<Object>} sync settings
 */
export async function initSync(token) {
  const username = await validateToken(token);

  let gistId = await findClipstashGist(token);
  if (!gistId) {
    gistId = await createGist(token);
  }

  const settings = {
    token,
    gistId,
    enabled: true,
    lastSyncAt: 0,
  };
  await saveSyncSettings(settings);

  console.log(`[Sync] Initialized: user=${username}, gist=${gistId}`);
  return settings;
}

/**
 * performSync executes a full sync cycle: pull → merge → push
 * Properly handles local deletions by tracking them in pending_deleted_ids.
 * @returns {Promise<{pulled: number, pushed: number, merged: number}>}
 */
export async function performSync() {
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.token || !settings.gistId) {
    throw new Error('Sync not configured');
  }

  const { token, gistId } = settings;

  // 1. Pull: fetch remote data
  const files = await getGistFiles(token, gistId);
  let remoteRecords = [];
  if (files[GIST_DATA_FILE]) {
    try {
      const remoteData = JSON.parse(files[GIST_DATA_FILE]);
      remoteRecords = remoteData.records || [];
    } catch {
      remoteRecords = [];
    }
  }

  // Parse remote meta (for deleted_ids from other devices)
  let remoteDeletedIds = [];
  if (files[GIST_META_FILE]) {
    try {
      const remoteMeta = JSON.parse(files[GIST_META_FILE]);
      remoteDeletedIds = remoteMeta.deleted_ids || [];
    } catch {
      remoteDeletedIds = [];
    }
  }

  // 2. Load local caches + pending local deletions + pending local restorations
  const localCaches = await getCachesRaw();
  const pendingDeleted = await getPendingDeleted();
  const pendingRestored = await getPendingRestored();
  const localDeletedIdSet = new Set(pendingDeleted.map(e => e.id));
  const localRestoredIdSet = new Set(pendingRestored);

  // 3. Merge (respects local deletions — won't pull back deleted records)
  const { merged, pulled, pushed, conflicts, localUpdated } = mergeRecords(
    localCaches,
    remoteRecords,
    localDeletedIdSet
  );

  // 4. Apply remote deleted_ids: soft-delete records that were deleted on another device
  //    Instead of removing them, mark them with deletedAt so the user can recover.
  //    IMPORTANT: Skip IDs that were restored locally — the user intentionally restored
  //    them, so we must NOT re-apply the cloud deletion.
  const remoteDeletedIdSet = new Set(
    remoteDeletedIds.map(e => (typeof e === 'string' ? e : e.id))
  );
  // Build a lookup for the deleted_at timestamp from remote
  const remoteDeletedAtMap = new Map();
  for (const e of remoteDeletedIds) {
    if (typeof e === 'string') {
      remoteDeletedAtMap.set(e, Date.now());
    } else {
      remoteDeletedAtMap.set(e.id, e.deleted_at || Date.now());
    }
  }
  let softDeletedCount = 0;
  for (const item of merged) {
    // Skip locally-restored records — don't re-delete them
    if (localRestoredIdSet.has(item.id)) continue;
    if (remoteDeletedIdSet.has(item.id) && !item.deletedAt) {
      item.deletedAt = remoteDeletedAtMap.get(item.id) || Date.now();
      softDeletedCount++;
    }
  }

  // Remove only truly expired soft-deleted records (past TTL)
  const now = Date.now();
  const filteredMerged = merged.filter(item => {
    if (!item.deletedAt) return true;
    return (now - item.deletedAt) < DELETED_IDS_TTL_MS;
  });

  // 5. Save merged locally
  await setCachesRaw(filteredMerged);

  // 6. Combine deleted_ids: merge remote + local pending, then prune expired.
  //    Also remove any IDs that were restored locally — they should no longer
  //    be in the cloud deleted_ids list so other devices don't re-delete them.
  const normalizedRemote = remoteDeletedIds.map(e =>
    (typeof e === 'string' ? { id: e, deleted_at: 0 } : e)
  );
  // Merge remote + local pending, dedup by id (keep latest deleted_at)
  const deletedMap = new Map();
  for (const entry of normalizedRemote) {
    deletedMap.set(entry.id, entry);
  }
  for (const entry of pendingDeleted) {
    const existing = deletedMap.get(entry.id);
    if (!existing || entry.deleted_at > (existing.deleted_at || 0)) {
      deletedMap.set(entry.id, entry);
    }
  }
  // Remove restored IDs from deleted_ids so other devices see the restoration
  for (const restoredId of localRestoredIdSet) {
    deletedMap.delete(restoredId);
  }
  // Prune entries older than 30 days
  const combinedDeletedIds = [...deletedMap.values()]
    .filter(e => (now - (e.deleted_at || 0)) < DELETED_IDS_TTL_MS);

  // 7. Check if there are actual changes that require pushing to cloud
  const hasChanges = pulled > 0
    || pushed > 0
    || conflicts > 0
    || localUpdated > 0
    || softDeletedCount > 0
    || pendingDeleted.length > 0
    || pendingRestored.length > 0;

  if (hasChanges) {
    // 8. Push: upload merged data (exclude soft-deleted and image records)
    const uploadRecords = filteredMerged
      .filter(item => item.type !== 'image' && !item.deletedAt)
      .map(toSnakeRecordExport);

    const newData = { version: 1, app: 'ClipStash', records: uploadRecords };
    const newMeta = {
      version: 1,
      last_sync_at: now,
      record_count: uploadRecords.length,
      deleted_ids: combinedDeletedIds,
    };

    await updateGist(
      token,
      gistId,
      JSON.stringify(newData, null, 2),
      JSON.stringify(newMeta, null, 2)
    );

    // 9. Clear pending lists after successful push
    await clearPendingDeleted();
    await clearPendingRestored();

    console.log(`[Sync] Pushed: pulled=${pulled}, pushed=${pushed}, conflicts=${conflicts}, localUpdated=${localUpdated}, softDeleted=${softDeletedCount}`);
  } else {
    console.log('[Sync] No changes detected, skipping push');
  }

  // 10. Update last sync timestamp
  settings.lastSyncAt = now;
  await saveSyncSettings(settings);

  return { pulled, pushed, updated: conflicts, deleted: softDeletedCount };
}

/**
 * disconnectSync clears sync settings
 * @returns {Promise<void>}
 */
export async function disconnectSync() {
  await saveSyncSettings({ token: '', gistId: '', enabled: false, lastSyncAt: 0 });
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
