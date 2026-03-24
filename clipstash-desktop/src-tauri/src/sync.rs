// ClipStash Desktop - Cloud sync module (GitHub Gist backend)

use crate::crypto;
use crate::db::{self, CacheItem, Database};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const GIST_DATA_FILE: &str = "clipstash-data.json";
const GIST_META_FILE: &str = "clipstash-meta.json";
const GIST_IMAGE_PREFIX: &str = "clipstash-img-";
const GIST_DESCRIPTION: &str = "ClipStash Cloud Sync Data (do not delete)";
const API_BASE: &str = "https://api.github.com";

/// Data format version — v2 uses base64(encrypt(gzip(json)))
const SYNC_DATA_V2: i32 = 2;

/// 30 days in milliseconds — entries older than this are pruned from deleted_ids.
const DELETED_IDS_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000;

/// 5 MB per image (original data URL size)
const SYNC_IMAGE_MAX_BYTES: usize = 5 * 1024 * 1024;

/// 50 MB total image sync quota
const SYNC_IMAGE_TOTAL_MAX_BYTES: usize = 50 * 1024 * 1024;

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
    #[serde(rename = "syncPassword", default)]
    pub sync_password: String,
    #[serde(rename = "syncImages", default)]
    pub sync_images: bool,
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
            sync_password: String::new(),
            sync_images: false,
        }
    }
}

// ===== Sync Metadata =====

/// ImageIndexEntry tracks an uploaded image in the Gist.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ImageIndexEntry {
    uploaded_at: i64,
    size: usize,
}

/// SyncMeta is stored in the Gist's meta file to track sync state.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncMeta {
    version: i32,
    last_sync_at: i64,
    record_count: usize,
    deleted_ids: Vec<DeletedEntry>,
    #[serde(default)]
    image_index: HashMap<String, ImageIndexEntry>,
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
        version: SYNC_DATA_V2,
        app: "ClipStash".to_string(),
        records: Vec::new(),
    };
    let empty_meta = SyncMeta {
        version: SYNC_DATA_V2,
        last_sync_at: 0,
        record_count: 0,
        deleted_ids: Vec::new(),
        image_index: HashMap::new(),
    };

    let body = serde_json::json!({
        "description": GIST_DESCRIPTION,
        "public": false,
        "files": {
            GIST_DATA_FILE: {
                "content": serde_json::to_string(&empty_data).unwrap_or_default()
            },
            GIST_META_FILE: {
                "content": serde_json::to_string(&empty_meta).unwrap_or_default()
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
/// For truncated files (>1 MB), fetches full content via raw_url.
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
            let truncated = file_obj
                .get("truncated")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if truncated {
                // File exceeds ~1 MB — fetch full content via raw_url.
                // No Authorization header needed: the URL contains an embedded token.
                if let Some(raw_url) = file_obj.get("raw_url").and_then(|v| v.as_str()) {
                    match client
                        .get(raw_url)
                        .send()
                        .await
                    {
                        Ok(raw_resp) if raw_resp.status().is_success() => {
                            if let Ok(raw_text) = raw_resp.text().await {
                                files.insert(name.clone(), raw_text);
                            } else {
                                log::warn!("Failed to read raw content for truncated file: {}", name);
                            }
                        }
                        Ok(raw_resp) => {
                            log::warn!(
                                "Failed to fetch raw_url for {}: HTTP {}",
                                name,
                                raw_resp.status()
                            );
                        }
                        Err(e) => {
                            log::warn!("Network error fetching raw_url for {}: {}", name, e);
                        }
                    }
                }
            } else if let Some(content) = file_obj.get("content").and_then(|v| v.as_str()) {
                files.insert(name.clone(), content.to_string());
            }
        }
    }

    Ok(files)
}

/// update_gist_files updates one or more gist files.
/// Pass None as content to delete a file.
async fn update_gist_files(
    client: &reqwest::Client,
    headers: &HeaderMap,
    gist_id: &str,
    files_map: &HashMap<String, Option<String>>,
) -> Result<(), String> {
    let mut files = serde_json::Map::new();
    for (name, content) in files_map {
        match content {
            Some(c) => {
                files.insert(
                    name.clone(),
                    serde_json::json!({ "content": c }),
                );
            }
            None => {
                files.insert(name.clone(), serde_json::Value::Null);
            }
        }
    }

    let body = serde_json::json!({ "files": files });

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

/// build_image_file_name returns the Gist filename for a given image hash.
fn build_image_file_name(image_hash: &str) -> String {
    format!("{}{}.json", GIST_IMAGE_PREFIX, image_hash)
}

// ===== V2 Data Format Helpers =====

/// parse_gist_content auto-detects v1 (plain JSON) vs v2 (encrypted+gzip) format.
/// v2 content is NOT valid JSON — it's a base64 string of encrypt(gzip(json)).
fn parse_gist_content(content: &str, sync_password: &str) -> Result<serde_json::Value, String> {
    // Try JSON parse first (v1 plain JSON)
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(content) {
        if parsed.is_object() || parsed.is_array() {
            return Ok(parsed);
        }
    }

    // v2: base64(encrypt(gzip(json))) — requires sync password
    if sync_password.is_empty() {
        return Err("syncPasswordRequired".to_string());
    }

    let json_str = crypto::unpack_sync_data(content, sync_password)?;
    serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error after decrypt: {}", e))
}

/// serialize_gist_content serializes data for upload.
/// If sync_password is set, uses v2 format: base64(encrypt(gzip(json))).
/// If no password, uses v1 plain JSON for backward compatibility.
fn serialize_gist_content(
    data: &serde_json::Value,
    sync_password: &str,
) -> Result<String, String> {
    let json_str =
        serde_json::to_string(data).map_err(|e| format!("Serialize error: {}", e))?;

    if sync_password.is_empty() {
        return Ok(json_str);
    }

    crypto::pack_sync_data(&json_str, sync_password)
}

// ===== Record Conversion =====

/// record_to_json converts a CacheItem to the export/sync JSON format (snake_case).
/// Omits content_length (receiver recomputes it), and conditionally omits
/// empty/default fields to reduce Gist payload size.
/// For image records, includes image_hash but NOT image_data_url (stored separately).
fn record_to_json(item: &CacheItem) -> serde_json::Value {
    let mut obj = serde_json::json!({
        "id": item.id,
        "type": item.cache_type,
        "content": item.content,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    });
    if let Some(ref ch) = item.content_hash {
        obj["content_hash"] = serde_json::Value::String(ch.clone());
    }
    if !item.tags.is_empty() {
        obj["tags"] = serde_json::json!(item.tags);
    }
    if item.pinned {
        obj["pinned"] = serde_json::Value::Bool(true);
        obj["pinned_at"] = serde_json::json!(item.pinned_at.unwrap_or(0));
    }
    if let Some(ref h) = item.html_content {
        obj["html_content"] = serde_json::Value::String(h.clone());
    }
    if let Some(ref l) = item.language {
        obj["language"] = serde_json::Value::String(l.clone());
    }
    // For image records: include image_hash reference (data stored in separate Gist files)
    if let Some(ref ih) = item.image_hash {
        obj["image_hash"] = serde_json::Value::String(ih.clone());
    }
    obj
}

/// json_to_record parses a sync JSON record back into a CacheItem.
/// Image records are now included (with image_hash only; image_data_url is pulled separately).
fn json_to_record(rec: &serde_json::Value) -> Option<CacheItem> {
    let id = rec.get("id").and_then(|v| v.as_str())?;
    let cache_type = rec
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("text");

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

    // Parse content_hash; compute if missing (backward compat with v1 data, skip for images)
    let content_hash = rec
        .get("content_hash")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            if cache_type == "image" {
                return None;
            }
            let h = db::compute_content_hash(cache_type, content, None);
            if h.is_empty() { None } else { Some(h) }
        });

    // Parse image_hash for image records
    let image_hash = rec
        .get("image_hash")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Some(CacheItem {
        id: id.to_string(),
        cache_type: cache_type.to_string(),
        content: content.to_string(),
        html_content: rec
            .get("html_content")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        image_data_url: None, // Image data pulled separately from image files
        image_hash,
        content_hash,
        created_at,
        // Recompute content_length locally (field removed from sync payload)
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
/// Matching order: 1) by ID  2) by content_hash/image_hash (cross-device dedup)  3) new record.
/// Records present in local_deleted_ids are treated as intentionally deleted
/// and will NOT be pulled back from remote.
/// When sync_images is true, image records are included (matched by image_hash).
/// Returns (merged_list, pulled, pushed, merged_conflicts, local_updated, deduplicated, loser_ids).
fn merge_records(
    local: &[CacheItem],
    remote: &[serde_json::Value],
    local_deleted_ids: &std::collections::HashSet<String>,
    sync_images: bool,
) -> (Vec<CacheItem>, i32, i32, i32, i32, i32, Vec<String>) {
    let mut local_map: HashMap<String, CacheItem> = HashMap::new();
    let mut local_hash_map: HashMap<String, String> = HashMap::new(); // content_hash → id
    let mut local_image_hash_map: HashMap<String, String> = HashMap::new(); // image_hash → id
    for item in local {
        if !sync_images && item.cache_type == "image" {
            continue;
        }
        if item.deleted_at != 0 {
            continue;
        }
        local_map.insert(item.id.clone(), item.clone());
        if item.cache_type != "image" {
            if let Some(ref ch) = item.content_hash {
                if !ch.is_empty() {
                    local_hash_map.insert(ch.clone(), item.id.clone());
                }
            }
        }
        if item.cache_type == "image" {
            if let Some(ref ih) = item.image_hash {
                if !ih.is_empty() {
                    local_image_hash_map.insert(ih.clone(), item.id.clone());
                }
            }
        }
    }

    let mut pulled = 0i32;
    let mut merged = 0i32;
    let mut local_updated = 0i32;
    let mut deduplicated = 0i32;
    let mut loser_ids: Vec<String> = Vec::new();

    // Build remote lookup
    let mut remote_map: HashMap<String, CacheItem> = HashMap::new();
    for rec_json in remote {
        if let Some(remote_item) = json_to_record(rec_json) {
            if !sync_images && remote_item.cache_type == "image" {
                continue;
            }
            remote_map.insert(remote_item.id.clone(), remote_item);
        }
    }

    // Process remote records
    for (_, remote_item) in &remote_map {
        if local_deleted_ids.contains(&remote_item.id) {
            continue;
        }

        if let Some(local_item) = local_map.get(&remote_item.id) {
            // 1) ID match → LWW
            if remote_item.updated_at > local_item.updated_at {
                local_map.insert(remote_item.id.clone(), remote_item.clone());
                merged += 1;
            } else if local_item.updated_at > remote_item.updated_at {
                local_updated += 1;
            }
        } else if remote_item.cache_type == "image" {
            // Image dedup by image_hash
            if let Some(ref remote_ih) = remote_item.image_hash {
                if !remote_ih.is_empty() {
                    if let Some(local_id) = local_image_hash_map.get(remote_ih) {
                        let local_id = local_id.clone();
                        if let Some(local_item) = local_map.get(&local_id) {
                            if remote_item.updated_at > local_item.updated_at {
                                local_map.remove(&local_id);
                                local_map.insert(remote_item.id.clone(), remote_item.clone());
                                loser_ids.push(local_id);
                            } else {
                                loser_ids.push(remote_item.id.clone());
                            }
                            deduplicated += 1;
                        } else {
                            local_map.insert(remote_item.id.clone(), remote_item.clone());
                            pulled += 1;
                        }
                    } else {
                        local_map.insert(remote_item.id.clone(), remote_item.clone());
                        pulled += 1;
                    }
                } else {
                    local_map.insert(remote_item.id.clone(), remote_item.clone());
                    pulled += 1;
                }
            } else {
                local_map.insert(remote_item.id.clone(), remote_item.clone());
                pulled += 1;
            }
        } else if let Some(ref remote_hash) = remote_item.content_hash {
            if !remote_hash.is_empty() {
                if let Some(local_id) = local_hash_map.get(remote_hash) {
                    // 2) contentHash match → same content on different devices
                    let local_id = local_id.clone();
                    if let Some(local_item) = local_map.get(&local_id) {
                        if remote_item.updated_at > local_item.updated_at {
                            // Remote wins
                            local_map.remove(&local_id);
                            local_map.insert(remote_item.id.clone(), remote_item.clone());
                            loser_ids.push(local_id);
                        } else {
                            // Local wins
                            loser_ids.push(remote_item.id.clone());
                        }
                        deduplicated += 1;
                    } else {
                        // local_id was already removed, treat as new
                        local_map.insert(remote_item.id.clone(), remote_item.clone());
                        pulled += 1;
                    }
                } else {
                    // No hash match → new record
                    local_map.insert(remote_item.id.clone(), remote_item.clone());
                    pulled += 1;
                }
            } else {
                // Empty hash → new record
                local_map.insert(remote_item.id.clone(), remote_item.clone());
                pulled += 1;
            }
        } else {
            // 3) No hash → new record
            local_map.insert(remote_item.id.clone(), remote_item.clone());
            pulled += 1;
        }
    }

    // Count local-only records that will be pushed
    let loser_set: std::collections::HashSet<&str> =
        loser_ids.iter().map(|s| s.as_str()).collect();
    let pushed = local
        .iter()
        .filter(|item| {
            if !sync_images && item.cache_type == "image" {
                return false;
            }
            item.deleted_at == 0
                && !remote_map.contains_key(&item.id)
                && !loser_set.contains(item.id.as_str())
        })
        .count() as i32;

    let merged_list: Vec<CacheItem> = local_map.into_values().collect();

    (merged_list, pulled, pushed, merged, local_updated, deduplicated, loser_ids)
}

// ===== Sync Settings Persistence =====

impl Database {
    /// get_sync_settings retrieves cloud sync settings from the settings table.
    /// Decrypts the token if it was stored encrypted (prefixed with "enc:").
    pub fn get_sync_settings(&self) -> SyncSettings {
        let mut settings = SyncSettings::default();

        let pairs = [
            "sync_token",
            "sync_gist_id",
            "sync_enabled",
            "sync_last_sync_at",
            "sync_auto_sync",
            "sync_password",
            "sync_images",
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
                    "sync_password" => settings.sync_password = val,
                    "sync_images" => settings.sync_images = val == "true",
                    _ => {}
                }
            }
        }

        // Decrypt token if stored encrypted
        if settings.token.starts_with("enc:") {
            match crypto::decrypt_token(&settings.token[4..], &settings.sync_password) {
                Ok(plain) => settings.token = plain,
                Err(e) => {
                    log::warn!("Failed to decrypt stored sync token: {}", e);
                    // Keep the encrypted form so it's not lost
                }
            }
        }

        settings
    }

    /// save_sync_settings persists cloud sync settings.
    /// Encrypts the token before storage for security.
    pub fn save_sync_settings(&self, settings: &SyncSettings) -> rusqlite::Result<()> {
        // Encrypt token before storing (skip if already encrypted or empty)
        let stored_token = if !settings.token.is_empty() && !settings.token.starts_with("enc:") {
            match crypto::encrypt_token(&settings.token, &settings.sync_password) {
                Ok(encrypted) => format!("enc:{}", encrypted),
                Err(e) => {
                    log::warn!("Failed to encrypt sync token: {}", e);
                    settings.token.clone()
                }
            }
        } else {
            settings.token.clone()
        };

        let pairs = [
            ("sync_token", stored_token),
            ("sync_gist_id", settings.gist_id.clone()),
            ("sync_enabled", settings.enabled.to_string()),
            ("sync_last_sync_at", settings.last_sync_at.to_string()),
            ("sync_auto_sync", settings.auto_sync.to_string()),
            ("sync_password", settings.sync_password.clone()),
            ("sync_images", settings.sync_images.to_string()),
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
                                            created_at, content_length, pinned, pinned_at, language, updated_at, deleted_at, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                item.content_hash,
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
/// `sync_password` is the user's sync password (empty = no encryption).
/// `sync_images` enables image cloud sync.
/// `local_pending_deleted` contains IDs deleted locally since last sync.
/// `local_pending_restored` contains IDs restored locally since last sync.
/// `force_push` skips remote data pull and pushes local data directly (password recovery).
pub async fn perform_sync(
    token: &str,
    gist_id: &str,
    sync_password: &str,
    sync_images: bool,
    local_caches: Vec<CacheItem>,
    local_pending_deleted: Vec<(String, i64)>,
    local_pending_restored: Vec<String>,
    force_push: bool,
) -> Result<(SyncResult, Vec<CacheItem>), String> {
    let client = reqwest::Client::new();
    let headers = build_headers(token)?;

    // 1. Pull: fetch remote data (auto-detects v1 JSON vs v2 encrypted)
    // In force_push mode, skip remote data — we'll overwrite everything
    let files: HashMap<String, String> = if force_push {
        HashMap::new()
    } else {
        get_gist_files(&client, &headers, gist_id).await?
    };

    let remote_data: RemoteData = if !force_push {
        if let Some(data_str) = files.get(GIST_DATA_FILE) {
            match parse_gist_content(data_str, sync_password) {
                Ok(val) => serde_json::from_value(val).unwrap_or(RemoteData {
                    version: SYNC_DATA_V2,
                    app: "ClipStash".to_string(),
                    records: Vec::new(),
                }),
                Err(e) => {
                    if !sync_password.is_empty() {
                        return Err("syncPasswordWrong".to_string());
                    }
                    log::warn!("Failed to parse remote data (no password set): {}", e);
                    RemoteData {
                        version: SYNC_DATA_V2,
                        app: "ClipStash".to_string(),
                        records: Vec::new(),
                    }
                }
            }
        } else {
            RemoteData {
                version: SYNC_DATA_V2,
                app: "ClipStash".to_string(),
                records: Vec::new(),
            }
        }
    } else {
        RemoteData {
            version: SYNC_DATA_V2,
            app: "ClipStash".to_string(),
            records: Vec::new(),
        }
    };

    // Parse remote meta (for deleted_ids and image_index from other devices)
    let remote_meta: SyncMeta = if !force_push {
        if let Some(meta_str) = files.get(GIST_META_FILE) {
            match parse_gist_content(meta_str, sync_password) {
                Ok(val) => serde_json::from_value(val).unwrap_or(SyncMeta {
                    version: SYNC_DATA_V2,
                    last_sync_at: 0,
                    record_count: 0,
                    deleted_ids: Vec::new(),
                    image_index: HashMap::new(),
                }),
                Err(_) => {
                    SyncMeta {
                        version: SYNC_DATA_V2,
                        last_sync_at: 0,
                        record_count: 0,
                        deleted_ids: Vec::new(),
                        image_index: HashMap::new(),
                    }
                }
            }
        } else {
            SyncMeta {
                version: SYNC_DATA_V2,
                last_sync_at: 0,
                record_count: 0,
                deleted_ids: Vec::new(),
                image_index: HashMap::new(),
            }
        }
    } else {
        SyncMeta {
            version: SYNC_DATA_V2,
            last_sync_at: 0,
            record_count: 0,
            deleted_ids: Vec::new(),
            image_index: HashMap::new(),
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
    let (mut merged_list, pulled, pushed, merged, local_updated, deduplicated, loser_ids) =
        merge_records(&local_caches, &remote_data.records, &local_deleted_ids, sync_images);

    // 3. Apply remote deleted_ids
    let now = db::chrono_now_ms();
    let remote_deleted_id_set: std::collections::HashSet<&str> = remote_meta
        .deleted_ids
        .iter()
        .map(|e| e.id.as_str())
        .collect();
    let before_count = merged_list.len();
    merged_list.retain(|item| {
        if local_restored_ids.contains(&item.id) {
            return true;
        }
        !remote_deleted_id_set.contains(item.id.as_str())
    });
    let deleted_count = before_count - merged_list.len();

    // 4. Image sync: on-demand pull + incremental push
    let mut image_files_to_upload: HashMap<String, Option<String>> = HashMap::new();
    let mut new_image_index = remote_meta.image_index.clone();
    let mut image_pulled = 0i32;

    if sync_images {
        // Collect all active image records
        let active_image_hashes: std::collections::HashSet<String> = merged_list
            .iter()
            .filter(|item| item.cache_type == "image" && item.deleted_at == 0)
            .filter_map(|item| item.image_hash.clone())
            .collect();

        for item in &mut merged_list {
            if item.cache_type != "image" || item.deleted_at != 0 {
                continue;
            }
            let image_hash = match &item.image_hash {
                Some(h) if !h.is_empty() => h.clone(),
                _ => continue,
            };

            // On-demand PULL: image record exists but has no local data
            if item.image_data_url.is_none() || item.image_data_url.as_ref().map_or(true, |u| u.is_empty()) {
                let img_file_name = build_image_file_name(&image_hash);
                if let Some(img_content) = files.get(&img_file_name) {
                    match parse_gist_content(img_content, sync_password) {
                        Ok(img_data) => {
                            if let Some(data_url) = img_data.get("image_data_url").and_then(|v| v.as_str()) {
                                item.image_data_url = Some(data_url.to_string());
                                item.content = String::new();
                                image_pulled += 1;
                            }
                        }
                        Err(e) => {
                            log::warn!("Failed to parse image file {}: {}", img_file_name, e);
                        }
                    }
                }
            }

            // Incremental PUSH: local image has data but not yet in remote image index
            if let Some(ref data_url) = item.image_data_url {
                if !data_url.is_empty() && !remote_meta.image_index.contains_key(&image_hash) {
                    // Enforce per-image size limit
                    let image_size = data_url.len();
                    if image_size > SYNC_IMAGE_MAX_BYTES {
                        log::warn!(
                            "Image {} exceeds size limit ({} > {}), skipping",
                            image_hash, image_size, SYNC_IMAGE_MAX_BYTES
                        );
                        continue;
                    }

                    let img_payload = serde_json::json!({ "image_data_url": data_url });
                    let img_val = serde_json::to_value(&img_payload)
                        .map_err(|e| format!("Serialize error: {}", e))?;
                    let img_content = serialize_gist_content(&img_val, sync_password)?;
                    image_files_to_upload.insert(
                        build_image_file_name(&image_hash),
                        Some(img_content),
                    );
                    new_image_index.insert(image_hash.clone(), ImageIndexEntry {
                        uploaded_at: now,
                        size: image_size,
                    });
                }
            }
        }

        // Enforce total image quota
        let total_size: usize = new_image_index.values().map(|e| e.size).sum();
        if total_size > SYNC_IMAGE_TOTAL_MAX_BYTES {
            log::warn!(
                "Image quota exceeded ({} > {}), skipping new image uploads",
                total_size, SYNC_IMAGE_TOTAL_MAX_BYTES
            );
            image_files_to_upload.clear();
            // Revert newly added entries
            for hash in new_image_index.keys().cloned().collect::<Vec<_>>() {
                if !remote_meta.image_index.contains_key(&hash) {
                    new_image_index.remove(&hash);
                }
            }
        }

        // Clean up orphaned image entries
        for hash in new_image_index.keys().cloned().collect::<Vec<_>>() {
            if !active_image_hashes.contains(&hash) {
                image_files_to_upload.insert(build_image_file_name(&hash), None);
                new_image_index.remove(&hash);
            }
        }
    }

    // 5. Combine deleted_ids
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
    // Add loser IDs from dedup to deleted_ids
    for loser_id in &loser_ids {
        let existing_ts = deleted_map.get(loser_id).map(|e| e.deleted_at).unwrap_or(0);
        if now > existing_ts {
            deleted_map.insert(
                loser_id.clone(),
                DeletedEntry {
                    id: loser_id.clone(),
                    deleted_at: now,
                },
            );
        }
    }
    // Remove restored IDs
    for restored_id in &local_restored_ids {
        deleted_map.remove(restored_id);
    }
    let combined_deleted_ids: Vec<DeletedEntry> = deleted_map
        .into_values()
        .filter(|e| (now - e.deleted_at) < DELETED_IDS_TTL_MS)
        .collect();

    // 6. Backfill content_hash for records that lack it
    for item in &mut merged_list {
        if item.content_hash.is_none() && item.cache_type != "image" && !item.content.is_empty() {
            let h = db::compute_content_hash(&item.cache_type, &item.content, None);
            if !h.is_empty() {
                item.content_hash = Some(h);
            }
        }
    }

    // 7. Check if there are actual changes that require pushing to cloud
    let image_changes = !image_files_to_upload.is_empty() || image_pulled > 0;
    let has_changes = force_push
        || pulled > 0
        || pushed > 0
        || merged > 0
        || local_updated > 0
        || deduplicated > 0
        || deleted_count > 0
        || !local_pending_deleted.is_empty()
        || !local_restored_ids.is_empty()
        || image_changes;

    if has_changes {
        // 8. Push: serialize and upload merged data
        let mut upload_items: Vec<&CacheItem> = merged_list
            .iter()
            .filter(|item| {
                if item.deleted_at != 0 {
                    return false;
                }
                if item.cache_type == "image" && !sync_images {
                    return false;
                }
                true
            })
            .collect();
        upload_items.sort_by(|a, b| {
            match (a.pinned, b.pinned) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                (true, true) => b.pinned_at.unwrap_or(0).cmp(&a.pinned_at.unwrap_or(0)),
                _ => b.created_at.cmp(&a.created_at),
            }
        });
        let upload_records: Vec<serde_json::Value> = upload_items
            .iter()
            .map(|item| record_to_json(item))
            .collect();

        let new_data = RemoteData {
            version: SYNC_DATA_V2,
            app: "ClipStash".to_string(),
            records: upload_records,
        };
        let new_meta = SyncMeta {
            version: SYNC_DATA_V2,
            last_sync_at: now,
            record_count: merged_list.len(),
            deleted_ids: combined_deleted_ids,
            image_index: if sync_images { new_image_index } else { HashMap::new() },
        };

        // Serialize
        let data_val = serde_json::to_value(&new_data)
            .map_err(|e| format!("Serialize error: {}", e))?;
        let meta_val = serde_json::to_value(&new_meta)
            .map_err(|e| format!("Serialize error: {}", e))?;

        let data_str = serialize_gist_content(&data_val, sync_password)?;
        let meta_str = serialize_gist_content(&meta_val, sync_password)?;

        // Build combined files map: data + meta + image files
        let mut all_files: HashMap<String, Option<String>> = HashMap::new();
        all_files.insert(GIST_DATA_FILE.to_string(), Some(data_str));
        all_files.insert(GIST_META_FILE.to_string(), Some(meta_str));
        for (name, content) in &image_files_to_upload {
            all_files.insert(name.clone(), content.clone());
        }

        update_gist_files(&client, &headers, gist_id, &all_files).await?;

        log::info!(
            "Sync pushed: pulled={}, pushed={}, merged={}, localUpdated={}, deduplicated={}, deleted={}, imgPulled={}, imgUploaded={}",
            pulled, pushed, merged, local_updated, deduplicated, deleted_count, image_pulled,
            image_files_to_upload.values().filter(|v| v.is_some()).count()
        );
    } else {
        log::info!("Sync: no changes detected, skipping push");
    }

    let result = SyncResult {
        pulled: pulled + image_pulled,
        pushed,
        updated: merged,
        deleted: deleted_count as i32,
        status: "success".to_string(),
    };

    Ok((result, merged_list))
}
