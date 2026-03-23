// ClipStash Desktop - Cloud sync module (GitHub Gist backend)

use crate::db::{self, CacheItem, Database};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const GIST_DATA_FILE: &str = "clipstash-data.json";
const GIST_META_FILE: &str = "clipstash-meta.json";
const GIST_DESCRIPTION: &str = "ClipStash Cloud Sync Data (do not delete)";
const API_BASE: &str = "https://api.github.com";

/// 30 days in milliseconds — entries older than this are pruned from deleted_ids.
const DELETED_IDS_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000;

// ===== Deleted Entry =====

/// DeletedEntry tracks a deleted record ID with a timestamp.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeletedEntry {
    id: String,
    deleted_at: i64,
}

// ===== Sync Settings =====

/// SyncSettings holds user cloud sync configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSettings {
    pub token: String,
    #[serde(rename = "gistId")]
    pub gist_id: String,
    pub enabled: bool,
    #[serde(rename = "lastSyncAt")]
    pub last_sync_at: i64,
    #[serde(rename = "autoSync", default = "default_auto_sync")]
    pub auto_sync: bool,
}

fn default_auto_sync() -> bool {
    true
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            token: String::new(),
            gist_id: String::new(),
            enabled: false,
            last_sync_at: 0,
            auto_sync: true,
        }
    }
}

// ===== Sync Metadata =====

/// SyncMeta is stored in the Gist's meta file to track sync state.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncMeta {
    version: i32,
    last_sync_at: i64,
    record_count: usize,
    deleted_ids: Vec<DeletedEntry>,
}

// ===== Remote Data Format =====

/// RemoteData is the JSON structure stored in the Gist data file.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemoteData {
    version: i32,
    app: String,
    records: Vec<serde_json::Value>,
}

// ===== Sync Result =====

/// SyncResult reports the outcome of a sync operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub pulled: i32,
    pub pushed: i32,
    pub updated: i32,
    pub deleted: i32,
    pub status: String,
}

// ===== Gist API Client =====

/// build_headers creates HTTP headers for GitHub API requests.
fn build_headers(token: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|e| format!("Invalid token: {}", e))?,
    );
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(USER_AGENT, HeaderValue::from_static("ClipStash-Desktop"));
    headers.insert(
        "X-GitHub-Api-Version",
        HeaderValue::from_static("2022-11-28"),
    );
    Ok(headers)
}

/// validate_token tests whether the GitHub PAT is valid by calling /user.
pub async fn validate_token(token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let headers = build_headers(token)?;

    let resp = client
        .get(format!("{}/user", API_BASE))
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Token invalid (HTTP {})", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let login = body
        .get("login")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(login)
}

/// find_clipstash_gist searches existing gists for the ClipStash sync gist.
async fn find_clipstash_gist(
    client: &reqwest::Client,
    headers: &HeaderMap,
) -> Result<Option<String>, String> {
    let resp = client
        .get(format!("{}/gists?per_page=100", API_BASE))
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to list gists (HTTP {})", resp.status()));
    }

    let gists: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    for gist in &gists {
        let desc = gist
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if desc == GIST_DESCRIPTION {
            if let Some(id) = gist.get("id").and_then(|v| v.as_str()) {
                return Ok(Some(id.to_string()));
            }
        }
    }

    Ok(None)
}

/// create_gist creates a new secret gist with empty data.
async fn create_gist(
    client: &reqwest::Client,
    headers: &HeaderMap,
) -> Result<String, String> {
    let empty_data = RemoteData {
        version: 1,
        app: "ClipStash".to_string(),
        records: Vec::new(),
    };
    let empty_meta = SyncMeta {
        version: 1,
        last_sync_at: 0,
        record_count: 0,
        deleted_ids: Vec::new(),
    };

    let body = serde_json::json!({
        "description": GIST_DESCRIPTION,
        "public": false,
        "files": {
            GIST_DATA_FILE: {
                "content": serde_json::to_string_pretty(&empty_data).unwrap_or_default()
            },
            GIST_META_FILE: {
                "content": serde_json::to_string_pretty(&empty_meta).unwrap_or_default()
            }
        }
    });

    let resp = client
        .post(format!("{}/gists", API_BASE))
        .headers(headers.clone())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Failed to create gist (HTTP {}): {}", status, text));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    result
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Gist created but no ID returned".to_string())
}

/// get_gist_files fetches the content of a gist's files.
async fn get_gist_files(
    client: &reqwest::Client,
    headers: &HeaderMap,
    gist_id: &str,
) -> Result<HashMap<String, String>, String> {
    let resp = client
        .get(format!("{}/gists/{}", API_BASE, gist_id))
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Gist not found. It may have been deleted.".to_string());
    }

    if !resp.status().is_success() {
        return Err(format!("Failed to get gist (HTTP {})", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let mut files = HashMap::new();
    if let Some(file_map) = body.get("files").and_then(|v| v.as_object()) {
        for (name, file_obj) in file_map {
            if let Some(content) = file_obj.get("content").and_then(|v| v.as_str()) {
                files.insert(name.clone(), content.to_string());
            }
        }
    }

    Ok(files)
}

/// update_gist updates the content of a gist's files.
async fn update_gist(
    client: &reqwest::Client,
    headers: &HeaderMap,
    gist_id: &str,
    data_content: &str,
    meta_content: &str,
) -> Result<(), String> {
    let body = serde_json::json!({
        "files": {
            GIST_DATA_FILE: { "content": data_content },
            GIST_META_FILE: { "content": meta_content }
        }
    });

    let resp = client
        .patch(format!("{}/gists/{}", API_BASE, gist_id))
        .headers(headers.clone())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Failed to update gist (HTTP {}): {}", status, text));
    }

    Ok(())
}

// ===== Record Conversion =====

/// record_to_json converts a CacheItem to the export/sync JSON format (snake_case).
fn record_to_json(item: &CacheItem) -> serde_json::Value {
    let mut obj = serde_json::json!({
        "id": item.id,
        "type": item.cache_type,
        "content": item.content,
        "created_at": item.created_at,
        "content_length": item.content_length,
        "tags": item.tags,
        "pinned": item.pinned,
        "pinned_at": item.pinned_at.unwrap_or(0),
        "updated_at": item.updated_at,
    });
    if let Some(ref h) = item.html_content {
        obj["html_content"] = serde_json::Value::String(h.clone());
    }
    if let Some(ref l) = item.language {
        obj["language"] = serde_json::Value::String(l.clone());
    }
    // MVP: skip image fields (image records not synced)
    obj
}

/// json_to_record parses a sync JSON record back into a CacheItem.
fn json_to_record(rec: &serde_json::Value) -> Option<CacheItem> {
    let id = rec.get("id").and_then(|v| v.as_str())?;
    let cache_type = rec
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("text");

    // MVP: skip image records
    if cache_type == "image" {
        return None;
    }

    let content = rec
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let created_at = rec
        .get("created_at")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let updated_at = rec
        .get("updated_at")
        .and_then(|v| v.as_i64())
        .unwrap_or(created_at);

    Some(CacheItem {
        id: id.to_string(),
        cache_type: cache_type.to_string(),
        content: content.to_string(),
        html_content: rec
            .get("html_content")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        image_data_url: None,
        image_hash: None,
        created_at,
        content_length: rec
            .get("content_length")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| content.chars().count() as i64),
        tags: rec
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        pinned: rec
            .get("pinned")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        pinned_at: rec.get("pinned_at").and_then(|v| v.as_i64()),
        language: rec
            .get("language")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        updated_at,
        deleted_at: 0, // Remote records are always active
    })
}

// ===== Merge Logic (Last-Write-Wins) =====

/// merge_records performs LWW merge between local and remote records.
/// Records present in local_deleted_ids are treated as intentionally deleted
/// and will NOT be pulled back from remote.
/// Returns the merged record list.
fn merge_records(
    local: &[CacheItem],
    remote: &[serde_json::Value],
    local_deleted_ids: &std::collections::HashSet<String>,
) -> (Vec<CacheItem>, i32, i32, i32, i32) {
    let mut local_map: HashMap<String, CacheItem> = HashMap::new();
    for item in local {
        // MVP: skip image records
        if item.cache_type == "image" {
            continue;
        }
        // Skip soft-deleted local records — they shouldn't participate in merge
        if item.deleted_at != 0 {
            continue;
        }
        local_map.insert(item.id.clone(), item.clone());
    }

    let mut pulled = 0i32;
    let mut merged = 0i32;
    let mut local_updated = 0i32;

    // Build remote lookup
    let mut remote_map: HashMap<String, CacheItem> = HashMap::new();
    for rec_json in remote {
        if let Some(remote_item) = json_to_record(rec_json) {
            remote_map.insert(remote_item.id.clone(), remote_item);
        }
    }

    // Process remote records
    for (_, remote_item) in &remote_map {
        // Skip records that were intentionally deleted locally
        if local_deleted_ids.contains(&remote_item.id) {
            continue;
        }

        if let Some(local_item) = local_map.get(&remote_item.id) {
            // Both sides have this record — LWW
            if remote_item.updated_at > local_item.updated_at {
                local_map.insert(remote_item.id.clone(), remote_item.clone());
                merged += 1;
            } else if local_item.updated_at > remote_item.updated_at {
                // Local wins — record has been modified locally (e.g. tags, language)
                local_updated += 1;
            }
        } else {
            // Remote-only record — pull in
            local_map.insert(remote_item.id.clone(), remote_item.clone());
            pulled += 1;
        }
    }

    // Count local-only records that will be pushed (not present in remote at all)
    let pushed = local
        .iter()
        .filter(|item| {
            item.cache_type != "image"
                && item.deleted_at == 0
                && !remote_map.contains_key(&item.id)
        })
        .count() as i32;

    let merged_list: Vec<CacheItem> = local_map.into_values().collect();

    (merged_list, pulled, pushed, merged, local_updated)
}

// ===== Sync Settings Persistence =====

impl Database {
    /// get_sync_settings retrieves cloud sync settings from the settings table.
    pub fn get_sync_settings(&self) -> SyncSettings {
        let mut settings = SyncSettings::default();

        let pairs = [
            "sync_token",
            "sync_gist_id",
            "sync_enabled",
            "sync_last_sync_at",
            "sync_auto_sync",
        ];

        for key in &pairs {
            let value: Option<String> = self
                .conn
                .query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    rusqlite::params![key],
                    |row: &rusqlite::Row| row.get(0),
                )
                .ok();
            if let Some(val) = value {
                match *key {
                    "sync_token" => settings.token = val,
                    "sync_gist_id" => settings.gist_id = val,
                    "sync_enabled" => settings.enabled = val == "true",
                    "sync_last_sync_at" => {
                        settings.last_sync_at = val.parse().unwrap_or(0);
                    }
                    "sync_auto_sync" => settings.auto_sync = val == "true",
                    _ => {}
                }
            }
        }

        settings
    }

    /// save_sync_settings persists cloud sync settings.
    pub fn save_sync_settings(&self, settings: &SyncSettings) -> rusqlite::Result<()> {
        let pairs = [
            ("sync_token", settings.token.clone()),
            ("sync_gist_id", settings.gist_id.clone()),
            ("sync_enabled", settings.enabled.to_string()),
            ("sync_last_sync_at", settings.last_sync_at.to_string()),
            ("sync_auto_sync", settings.auto_sync.to_string()),
        ];

        for (key, value) in &pairs {
            self.conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![key, value],
            )?;
        }

        Ok(())
    }

    /// upsert_cache inserts or replaces a cache record (used during sync merge).
    pub fn upsert_cache(&self, item: &CacheItem) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO caches (id, cache_type, content, html_content, image_data_url, image_hash,
                                            created_at, content_length, pinned, pinned_at, language, updated_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                item.id,
                item.cache_type,
                item.content,
                item.html_content,
                item.image_data_url,
                item.image_hash,
                item.created_at,
                item.content_length,
                item.pinned as i32,
                item.pinned_at,
                item.language,
                item.updated_at,
                item.deleted_at,
            ],
        )?;

        // Replace tags
        self.conn.execute(
            "DELETE FROM cache_tags WHERE cache_id = ?1",
            rusqlite::params![item.id],
        )?;
        for tag in &item.tags {
            self.conn.execute(
                "INSERT OR IGNORE INTO cache_tags (cache_id, tag) VALUES (?1, ?2)",
                rusqlite::params![item.id, tag],
            )?;
        }

        Ok(())
    }
}

// ===== Public Sync Operations =====

/// init_sync validates the token and finds or creates the ClipStash gist.
/// Returns (gist_id, github_username).
pub async fn init_sync(token: &str) -> Result<(String, String), String> {
    let username = validate_token(token).await?;

    let client = reqwest::Client::new();
    let headers = build_headers(token)?;

    // Try to find existing gist
    let gist_id = match find_clipstash_gist(&client, &headers).await? {
        Some(id) => {
            log::info!("Found existing ClipStash gist: id={}", id);
            id
        }
        None => {
            let id = create_gist(&client, &headers).await?;
            log::info!("Created new ClipStash gist: id={}", id);
            id
        }
    };

    Ok((gist_id, username))
}

/// perform_sync executes a full sync cycle: pull → merge → push.
/// `local_pending_deleted` contains IDs deleted locally since last sync.
/// `local_pending_restored` contains IDs restored locally since last sync;
/// these IDs will be excluded from remote deleted_ids application and
/// removed from the cloud deleted_ids list.
pub async fn perform_sync(
    token: &str,
    gist_id: &str,
    local_caches: Vec<CacheItem>,
    local_pending_deleted: Vec<(String, i64)>,
    local_pending_restored: Vec<String>,
) -> Result<(SyncResult, Vec<CacheItem>), String> {
    let client = reqwest::Client::new();
    let headers = build_headers(token)?;

    // 1. Pull: fetch remote data
    let files = get_gist_files(&client, &headers, gist_id).await?;

    let remote_data: RemoteData = if let Some(data_str) = files.get(GIST_DATA_FILE) {
        serde_json::from_str(data_str).unwrap_or(RemoteData {
            version: 1,
            app: "ClipStash".to_string(),
            records: Vec::new(),
        })
    } else {
        RemoteData {
            version: 1,
            app: "ClipStash".to_string(),
            records: Vec::new(),
        }
    };

    // Parse remote meta (for deleted_ids from other devices)
    let remote_meta: SyncMeta = if let Some(meta_str) = files.get(GIST_META_FILE) {
        serde_json::from_str(meta_str).unwrap_or(SyncMeta {
            version: 1,
            last_sync_at: 0,
            record_count: 0,
            deleted_ids: Vec::new(),
        })
    } else {
        SyncMeta {
            version: 1,
            last_sync_at: 0,
            record_count: 0,
            deleted_ids: Vec::new(),
        }
    };

    // Build local deleted ID set
    let local_deleted_ids: std::collections::HashSet<String> = local_pending_deleted
        .iter()
        .map(|(id, _)| id.clone())
        .collect();

    // Build local restored ID set
    let local_restored_ids: std::collections::HashSet<String> =
        local_pending_restored.into_iter().collect();

    // 2. Merge: LWW merge (respects local deletions)
    let (mut merged_list, pulled, pushed, merged, local_updated) =
        merge_records(&local_caches, &remote_data.records, &local_deleted_ids);

    // 3. Apply remote deleted_ids: remove records that were deleted on another device
    //    IMPORTANT: Skip IDs that were restored locally — the user intentionally
    //    restored them, so we must NOT re-apply the cloud deletion.
    let now = db::chrono_now_ms();
    let remote_deleted_id_set: std::collections::HashSet<&str> = remote_meta
        .deleted_ids
        .iter()
        .map(|e| e.id.as_str())
        .collect();
    let before_count = merged_list.len();
    merged_list.retain(|item| {
        // If locally restored, keep regardless of remote deleted_ids
        if local_restored_ids.contains(&item.id) {
            return true;
        }
        !remote_deleted_id_set.contains(item.id.as_str())
    });
    let deleted_count = before_count - merged_list.len();

    // 4. Combine deleted_ids: merge remote + local pending, dedup by id (keep latest)
    //    Also remove any IDs that were restored locally.
    let mut deleted_map: HashMap<String, DeletedEntry> = HashMap::new();
    for entry in &remote_meta.deleted_ids {
        deleted_map.insert(entry.id.clone(), entry.clone());
    }
    for (id, deleted_at) in &local_pending_deleted {
        let existing_ts = deleted_map.get(id).map(|e| e.deleted_at).unwrap_or(0);
        if *deleted_at > existing_ts {
            deleted_map.insert(
                id.clone(),
                DeletedEntry {
                    id: id.clone(),
                    deleted_at: *deleted_at,
                },
            );
        }
    }
    // Remove restored IDs from deleted_ids so other devices see the restoration
    for restored_id in &local_restored_ids {
        deleted_map.remove(restored_id);
    }
    // Prune entries older than 30 days
    let combined_deleted_ids: Vec<DeletedEntry> = deleted_map
        .into_values()
        .filter(|e| (now - e.deleted_at) < DELETED_IDS_TTL_MS)
        .collect();

    // 5. Check if there are actual changes that require pushing to cloud
    let has_changes = pulled > 0
        || pushed > 0
        || merged > 0
        || local_updated > 0
        || deleted_count > 0
        || !local_pending_deleted.is_empty()
        || !local_restored_ids.is_empty();

    if has_changes {
        // 6. Push: serialize and upload merged data (exclude soft-deleted records)
        let upload_records: Vec<serde_json::Value> = merged_list
            .iter()
            .filter(|item| item.deleted_at == 0)
            .map(record_to_json)
            .collect();

        let new_data = RemoteData {
            version: 1,
            app: "ClipStash".to_string(),
            records: upload_records,
        };
        let new_meta = SyncMeta {
            version: 1,
            last_sync_at: now,
            record_count: merged_list.len(),
            deleted_ids: combined_deleted_ids,
        };

        let data_str = serde_json::to_string_pretty(&new_data)
            .map_err(|e| format!("Serialize error: {}", e))?;
        let meta_str = serde_json::to_string_pretty(&new_meta)
            .map_err(|e| format!("Serialize error: {}", e))?;

        update_gist(&client, &headers, gist_id, &data_str, &meta_str).await?;

        log::info!(
            "Sync pushed: pulled={}, pushed={}, merged={}, localUpdated={}, deleted={}",
            pulled, pushed, merged, local_updated, deleted_count
        );
    } else {
        log::info!("Sync: no changes detected, skipping push");
    }

    let result = SyncResult {
        pulled,
        pushed,
        updated: merged,
        deleted: deleted_count as i32,
        status: "success".to_string(),
    };

    Ok((result, merged_list))
}
