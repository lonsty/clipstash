// ClipStash Extension - Cloud sync module (GitHub Gist backend)
// Sync data is always encrypted: base64(encrypt(gzip(json)))

import {
  getCachesRaw,
  setCachesRaw,
  toSnakeRecordExport,
  fromSnakeRecordImport,
  computeContentHashExport,
  getPendingDeleted,
  clearPendingDeleted,
  getPendingRestored,
  clearPendingRestored,
} from './storage.js';
import { packSyncData, unpackSyncData, encryptToken, decryptToken } from '../shared/crypto.js';
import { DEFAULT_AUTO_SYNC, DEFAULT_SYNC_IMAGES } from '../shared/constants.js';

const GIST_DATA_FILE = 'clipstash-data.json';
const GIST_META_FILE = 'clipstash-meta.json';
const GIST_IMAGE_PREFIX = 'clipstash-img-';
const GIST_DESCRIPTION = 'ClipStash Cloud Sync Data (do not delete)';
const API_BASE = 'https://api.github.com';
const SYNC_SETTINGS_KEY = 'clipstash-sync';
const SYNC_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image
const SYNC_IMAGE_TOTAL_MAX_BYTES = 50 * 1024 * 1024; // 50 MB total quota

// 30 days in ms — deleted_ids entries older than this are pruned
const DELETED_IDS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ===== Sync Settings Persistence =====

/**
 * getSyncSettings retrieves cloud sync settings from storage.
 * If the token is encrypted (prefixed with 'enc:'), it is decrypted before returning.
 * @returns {Promise<Object>}
 */
export async function getSyncSettings() {
  try {
    const data = await chrome.storage.local.get(SYNC_SETTINGS_KEY);
    const raw = {
      token: '',
      gistId: '',
      enabled: false,
      lastSyncAt: 0,
      autoSync: DEFAULT_AUTO_SYNC,
      syncPassword: '',
      syncImages: DEFAULT_SYNC_IMAGES,
      ...data[SYNC_SETTINGS_KEY],
    };

    // Decrypt token if stored encrypted
    if (raw.token && raw.token.startsWith('enc:')) {
      try {
        raw.token = await decryptToken(raw.token.slice(4), raw.syncPassword);
      } catch {
        // Decryption failed — likely password changed or corrupted; keep encrypted form
        console.warn('[Sync] Failed to decrypt stored token');
      }
    }

    return raw;
  } catch {
    return { token: '', gistId: '', enabled: false, lastSyncAt: 0, autoSync: DEFAULT_AUTO_SYNC, syncPassword: '', syncImages: DEFAULT_SYNC_IMAGES };
  }
}

/**
 * saveSyncSettings persists cloud sync settings.
 * The token is encrypted before storage for security.
 * @param {Object} settings
 * @returns {Promise<void>}
 */
export async function saveSyncSettings(settings) {
  const toStore = { ...settings };

  // Encrypt token before storing (skip if already encrypted or empty)
  if (toStore.token && !toStore.token.startsWith('enc:')) {
    try {
      const encrypted = await encryptToken(toStore.token, toStore.syncPassword);
      toStore.token = `enc:${encrypted}`;
    } catch {
      // Fallback: store as-is if encryption fails (should not happen)
      console.warn('[Sync] Failed to encrypt token for storage');
    }
  }

  await chrome.storage.local.set({ [SYNC_SETTINGS_KEY]: toStore });
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
async function createGist(token, syncPassword) {
  const emptyData = { app: 'ClipStash', records: [] };
  const emptyMeta = { last_sync_at: 0, record_count: 0, deleted_ids: [] };

  const dataContent = await serializeGistContent(emptyData, syncPassword);
  const metaContent = await serializeGistContent(emptyMeta, syncPassword);

  const resp = await fetch(`${API_BASE}/gists`, {
    method: 'POST',
    headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_DATA_FILE]: { content: dataContent },
        [GIST_META_FILE]: { content: metaContent },
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
 * getGistFiles fetches gist file contents.
 * For truncated files (>1 MB), fetches full content via raw_url.
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
      if (fileObj.truncated && fileObj.raw_url) {
        // File exceeds ~1 MB — fetch full content via raw_url.
        // Do NOT send Authorization header here: raw_url points to
        // gist.githubusercontent.com which rejects CORS preflight
        // triggered by custom headers. The URL already contains an
        // embedded access token.
        try {
          const rawResp = await fetch(fileObj.raw_url);
          if (rawResp.ok) {
            files[name] = await rawResp.text();
          } else {
            console.warn(`[Sync] Failed to fetch raw_url for ${name}: HTTP ${rawResp.status}`);
          }
        } catch (e) {
          console.warn(`[Sync] Network error fetching raw_url for ${name}:`, e);
        }
      } else if (fileObj.content) {
        files[name] = fileObj.content;
      }
    }
  }
  return files;
}

/**
 * updateGistFiles updates one or more gist files.
 * @param {string} token
 * @param {string} gistId
 * @param {Object} filesMap - map of filename → content string (or null to delete)
 * @returns {Promise<void>}
 */
async function updateGistFiles(token, gistId, filesMap) {
  const files = {};
  for (const [name, content] of Object.entries(filesMap)) {
    files[name] = content === null ? null : { content };
  }
  const resp = await fetch(`${API_BASE}/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...buildHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to update gist (HTTP ${resp.status}): ${text}`);
  }
}

/**
 * buildImageFileName returns the Gist filename for a given image hash.
 * @param {string} imageHash
 * @returns {string}
 */
function buildImageFileName(imageHash) {
  return `${GIST_IMAGE_PREFIX}${imageHash}.json`;
}

/**
 * formatBytes returns a human-readable byte size string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ===== Encrypted Data Format Helpers =====

/**
 * parseGistContent decrypts and decompresses Gist file content.
 * Content format: base64(encrypt(gzip(json)))
 * @param {string} content - raw gist file content
 * @param {string} syncPassword - user's sync password (required)
 * @returns {Promise<Object>} parsed JSON object
 */
async function parseGistContent(content, syncPassword) {
  if (!syncPassword) throw new Error('syncPasswordRequired');
  const jsonStr = await unpackSyncData(content, syncPassword);
  return JSON.parse(jsonStr);
}

/**
 * serializeGistContent compresses and encrypts data for upload.
 * Output format: base64(encrypt(gzip(json)))
 * @param {Object} data - the data object to serialize
 * @param {string} syncPassword - user's sync password (required)
 * @returns {Promise<string>} serialized content string
 */
async function serializeGistContent(data, syncPassword) {
  if (!syncPassword) throw new Error('syncPasswordRequired');
  const jsonStr = JSON.stringify(data);
  return packSyncData(jsonStr, syncPassword);
}

// ===== Merge Logic (Last-Write-Wins) =====

/**
 * mergeRecords performs LWW merge between local and remote records.
 * Matching order: 1) by ID  2) by contentHash (cross-device dedup)  3) new record.
 * Records present in localDeletedIdSet are treated as intentionally deleted
 * and will NOT be pulled back from remote.
 * When syncImages is true, image records are included in the merge (matched by imageHash).
 * @param {Array} localCaches - local camelCase records
 * @param {Array} remoteRecords - remote snake_case JSON records
 * @param {Set<string>} localDeletedIdSet - IDs deleted locally since last sync
 * @param {boolean} syncImages - whether to include images in merge
 * @returns {{merged: Array, pulled: number, pushed: number, conflicts: number, localUpdated: number, deduplicated: number, mergedLoserIds: Set}}
 */
function mergeRecords(localCaches, remoteRecords, localDeletedIdSet, syncImages = false) {
  // Build local map
  const localMap = new Map();
  const localHashMap = new Map(); // contentHash → id (for cross-device dedup)
  const localImageHashMap = new Map(); // imageHash → id (for image dedup)
  for (const item of localCaches) {
    if (!syncImages && item.type === 'image') continue;
    localMap.set(item.id, item);
    if (item.type !== 'image' && item.contentHash) {
      localHashMap.set(item.contentHash, item.id);
    }
    if (item.type === 'image' && item.imageHash) {
      localImageHashMap.set(item.imageHash, item.id);
    }
  }

  let pulled = 0;
  let conflicts = 0;
  let localUpdated = 0;
  let deduplicated = 0;

  // Build remote lookup for quick access
  const remoteMap = new Map();
  for (const remoteJson of remoteRecords) {
    const remoteItem = fromSnakeRecordImport(remoteJson);
    if (!remoteItem.id) continue;
    if (!syncImages && remoteItem.type === 'image') continue;
    remoteMap.set(remoteItem.id, remoteItem);
  }

  // Track IDs that were merged via contentHash so we can clean up the loser ID
  const mergedLoserIds = new Set();

  // Process remote records
  for (const [, remoteItem] of remoteMap) {
    // Skip records that were intentionally deleted locally
    if (localDeletedIdSet.has(remoteItem.id)) continue;

    if (localMap.has(remoteItem.id)) {
      // 1) ID match → LWW
      const localItem = localMap.get(remoteItem.id);
      if ((remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
        localMap.set(remoteItem.id, remoteItem);
        conflicts++;
      } else if ((localItem.updatedAt || 0) > (remoteItem.updatedAt || 0)) {
        localUpdated++;
      }
    } else if (remoteItem.type === 'image' && remoteItem.imageHash && localImageHashMap.has(remoteItem.imageHash)) {
      // Image dedup: same imageHash on different devices → LWW merge
      const localId = localImageHashMap.get(remoteItem.imageHash);
      const localItem = localMap.get(localId);
      if (localItem) {
        if ((remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
          localMap.delete(localId);
          localMap.set(remoteItem.id, remoteItem);
          mergedLoserIds.add(localId);
        } else {
          mergedLoserIds.add(remoteItem.id);
        }
        deduplicated++;
      }
    } else if (remoteItem.type !== 'image' && remoteItem.contentHash && localHashMap.has(remoteItem.contentHash)) {
      // 2) contentHash match → same content on different devices, LWW merge
      const localId = localHashMap.get(remoteItem.contentHash);
      const localItem = localMap.get(localId);
      if (localItem) {
        // LWW: pick the winner, discard the loser's ID
        if ((remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
          // Remote wins: adopt remote record, remove local
          localMap.delete(localId);
          localMap.set(remoteItem.id, remoteItem);
          mergedLoserIds.add(localId);
        } else {
          // Local wins: keep local, mark remote ID as loser
          mergedLoserIds.add(remoteItem.id);
        }
        deduplicated++;
      }
    } else {
      // 3) No match → remote-only record, pull in
      localMap.set(remoteItem.id, remoteItem);
      pulled++;
    }
  }

  // Count pushed (local-only, not present in remote at all)
  const pushed = localCaches.filter(
    item => {
      if (!syncImages && item.type === 'image') return false;
      return !remoteMap.has(item.id) && !mergedLoserIds.has(item.id);
    }
  ).length;

  // Rebuild merged list: include unsynced images unchanged + merged records
  const unsyncedImages = syncImages ? [] : localCaches.filter(item => item.type === 'image');
  const mergedItems = [...localMap.values()];
  const merged = [...unsyncedImages, ...mergedItems];

  return { merged, pulled, pushed, conflicts, localUpdated, deduplicated, mergedLoserIds };
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
    // Preserve existing syncPassword if reconnecting
    const existing = await getSyncSettings();
    gistId = await createGist(token, existing.syncPassword);
  }

  // Preserve existing syncPassword and syncImages if reconnecting
  const existing = await getSyncSettings();
  const settings = {
    token,
    gistId,
    enabled: true,
    lastSyncAt: 0,
    syncPassword: existing.syncPassword || '',
    syncImages: existing.syncImages || false,
  };
  await saveSyncSettings(settings);

  console.log(`[Sync] Initialized: user=${username}, gist=${gistId}`);
  return settings;
}

/**
 * performSync executes a full sync cycle: pull → merge → push
 * Properly handles local deletions by tracking them in pending_deleted_ids.
 * When syncImages is enabled, also handles image file upload/download via Gist.
 * @param {Object} [options]
 * @param {boolean} [options.forcePush=false] - Skip remote data pull, push local data directly (used when password is wrong)
 * @returns {Promise<{pulled: number, pushed: number, merged: number}>}
 */
export async function performSync(options = {}) {
  const { forcePush = false } = options;
  const settings = await getSyncSettings();
  if (!settings.enabled || !settings.token || !settings.gistId) {
    throw new Error('Sync not configured');
  }

  const { token, gistId, syncPassword, syncImages } = settings;

  // 1. Pull: fetch and decrypt remote data
  // In forcePush mode, we still fetch files for image index but skip data/meta parse
  const files = forcePush ? {} : await getGistFiles(token, gistId);
  let remoteRecords = [];
  if (!forcePush && files[GIST_DATA_FILE]) {
    try {
      const parsed = await parseGistContent(files[GIST_DATA_FILE], syncPassword);
      remoteRecords = parsed.records || [];
    } catch {
      // Decryption failed — likely wrong password
      throw new Error('syncPasswordWrong');
    }
  }

  // Parse remote meta (for deleted_ids and image_index from other devices)
  let remoteDeletedIds = [];
  let remoteImageIndex = {};
  if (!forcePush && files[GIST_META_FILE]) {
    try {
      const parsed = await parseGistContent(files[GIST_META_FILE], syncPassword);
      remoteDeletedIds = parsed.deleted_ids || [];
      remoteImageIndex = parsed.image_index || {};
    } catch {
      // Meta-only failure is tolerable
      remoteDeletedIds = [];
      remoteImageIndex = {};
    }
  }

  // 2. Load local caches + pending local deletions + pending local restorations
  const localCaches = await getCachesRaw();
  const pendingDeleted = await getPendingDeleted();
  const pendingRestored = await getPendingRestored();
  const localDeletedIdSet = new Set(pendingDeleted.map(e => e.id));
  const localRestoredIdSet = new Set(pendingRestored);

  // 3. Merge (respects local deletions — won't pull back deleted records)
  const { merged, pulled, pushed, conflicts, localUpdated, deduplicated, mergedLoserIds } = mergeRecords(
    localCaches,
    remoteRecords,
    localDeletedIdSet,
    syncImages
  );

  // 4. Apply remote deleted_ids: soft-delete records that were deleted on another device
  const remoteDeletedIdSet = new Set(
    remoteDeletedIds.map(e => (typeof e === 'string' ? e : e.id))
  );
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

  // 5. Image sync: on-demand pull + incremental push
  let imageFilesToUpload = {};
  let newImageIndex = { ...remoteImageIndex };
  let imagePulled = 0;

  if (syncImages) {
    // Collect all active image records and their hashes
    const activeImages = filteredMerged.filter(item => item.type === 'image' && !item.deletedAt);
    const activeImageHashes = new Set();

    for (const img of activeImages) {
      if (!img.imageHash) continue;
      activeImageHashes.add(img.imageHash);

      // On-demand PULL: image record exists but has no local data — download from Gist
      if (!img.imageDataUrl) {
        const imgFileName = buildImageFileName(img.imageHash);
        if (files[imgFileName]) {
          try {
            const imgData = await parseGistContent(files[imgFileName], syncPassword);
            if (imgData.image_data_url) {
              img.imageDataUrl = imgData.image_data_url;
              img.content = ''; // image records use imageDataUrl, not content
              imagePulled++;
            }
          } catch {
            console.warn(`[Sync] Failed to parse image file: ${imgFileName}`);
          }
        }
      }

      // Incremental PUSH: local image has data but not yet in remote image index
      if (img.imageDataUrl && !remoteImageIndex[img.imageHash]) {
        // Enforce per-image size limit
        const imageSize = img.imageDataUrl.length;
        if (imageSize > SYNC_IMAGE_MAX_BYTES) {
          console.warn(`[Sync] Image ${img.imageHash} exceeds size limit (${formatBytes(imageSize)} > ${formatBytes(SYNC_IMAGE_MAX_BYTES)}), skipping`);
          continue;
        }

        const imgPayload = { image_data_url: img.imageDataUrl };
        const imgContent = await serializeGistContent(imgPayload, syncPassword);
        imageFilesToUpload[buildImageFileName(img.imageHash)] = imgContent;
        newImageIndex[img.imageHash] = { uploaded_at: now, size: imageSize };
      }
    }

    // Enforce total image quota
    let totalSize = 0;
    for (const hash of Object.keys(newImageIndex)) {
      totalSize += (newImageIndex[hash].size || 0);
    }
    if (totalSize > SYNC_IMAGE_TOTAL_MAX_BYTES) {
      console.warn(`[Sync] Image quota exceeded (${formatBytes(totalSize)} > ${formatBytes(SYNC_IMAGE_TOTAL_MAX_BYTES)}), skipping new image uploads`);
      imageFilesToUpload = {};
      // Revert newly added entries
      for (const hash of Object.keys(newImageIndex)) {
        if (!remoteImageIndex[hash]) {
          delete newImageIndex[hash];
        }
      }
    }

    // Clean up orphaned image entries (images whose records are deleted)
    for (const hash of Object.keys(newImageIndex)) {
      if (!activeImageHashes.has(hash)) {
        // Mark for deletion from Gist (null = delete file)
        imageFilesToUpload[buildImageFileName(hash)] = null;
        delete newImageIndex[hash];
      }
    }
  }

  // 6. Save merged locally
  await setCachesRaw(filteredMerged);

  // 7. Combine deleted_ids
  const normalizedRemote = remoteDeletedIds.map(e =>
    (typeof e === 'string' ? { id: e, deleted_at: 0 } : e)
  );
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
  for (const restoredId of localRestoredIdSet) {
    deletedMap.delete(restoredId);
  }

  // 8. Check if there are actual changes that require pushing to cloud
  const imageChanges = Object.keys(imageFilesToUpload).length > 0 || imagePulled > 0;
  const hasChanges = forcePush
    || pulled > 0
    || pushed > 0
    || conflicts > 0
    || localUpdated > 0
    || deduplicated > 0
    || softDeletedCount > 0
    || pendingDeleted.length > 0
    || pendingRestored.length > 0
    || imageChanges;

  if (hasChanges) {
    // 9. Backfill contentHash for records that lack it (migration for existing data)
    for (const item of filteredMerged) {
      if (!item.contentHash && item.type !== 'image' && item.content) {
        item.contentHash = await computeContentHashExport(item.type || 'text', item.content);
      }
    }

    // Add loser IDs from contentHash dedup to deleted_ids
    for (const loserId of mergedLoserIds) {
      const existing = deletedMap.get(loserId);
      if (!existing || now > (existing.deleted_at || 0)) {
        deletedMap.set(loserId, { id: loserId, deleted_at: now });
      }
    }
    // Compute final deleted_ids list (including loser IDs, pruning expired)
    const finalDeletedIds = [...deletedMap.values()]
      .filter(e => (now - (e.deleted_at || 0)) < DELETED_IDS_TTL_MS);

    // 10. Push: upload merged data
    // For image records in data.json, only include image_hash (not image_data_url)
    // Sort to match display order: pinned first (by pinnedAt desc), then by createdAt desc
    const uploadRecords = filteredMerged
      .filter(item => !item.deletedAt)
      .filter(item => {
        // Exclude images if sync images is off
        if (item.type === 'image' && !syncImages) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        if (a.pinned && b.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0);
        return (b.createdAt || 0) - (a.createdAt || 0);
      })
      .map(item => {
        const exported = toSnakeRecordExport(item);
        // For image records in sync data, strip the full data URL — only keep hash reference
        if (item.type === 'image') {
          delete exported.image_data_url;
        }
        return exported;
      });

    const newData = { app: 'ClipStash', records: uploadRecords };
    const newMeta = {
      last_sync_at: now,
      record_count: uploadRecords.length,
      deleted_ids: finalDeletedIds,
      ...(syncImages ? { image_index: newImageIndex } : {}),
    };

    const dataStr = await serializeGistContent(newData, syncPassword);
    const metaStr = await serializeGistContent(newMeta, syncPassword);

    // Build combined files map: data + meta + image files
    const allFiles = {
      [GIST_DATA_FILE]: dataStr,
      [GIST_META_FILE]: metaStr,
      ...imageFilesToUpload,
    };

    await updateGistFiles(token, gistId, allFiles);

    // 11. Clear pending lists after successful push
    await clearPendingDeleted();
    await clearPendingRestored();

    console.log(`[Sync] Pushed: pulled=${pulled}, pushed=${pushed}, conflicts=${conflicts}, localUpdated=${localUpdated}, deduplicated=${deduplicated}, softDeleted=${softDeletedCount}, imgPulled=${imagePulled}, imgUploaded=${Object.keys(imageFilesToUpload).filter(k => imageFilesToUpload[k] !== null).length}`);
  } else {
    console.log('[Sync] No changes detected, skipping push');
  }

  // 12. Update last sync timestamp
  settings.lastSyncAt = now;
  await saveSyncSettings(settings);

  return { pulled: pulled + imagePulled, pushed, updated: conflicts, deleted: softDeletedCount };
}

/**
 * disconnectSync clears sync settings
 * @returns {Promise<void>}
 */
export async function disconnectSync() {
  await saveSyncSettings({ token: '', gistId: '', enabled: false, lastSyncAt: 0, syncPassword: '', syncImages: false });
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
  const seconds = Math.floor(diff / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  const d = new Date(ts);
  return d.toLocaleDateString();
}
