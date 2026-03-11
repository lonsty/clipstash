use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};

/// CacheItem represents a single cached clipboard record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheItem {
    pub id: String,
    #[serde(rename = "type")]
    pub cache_type: String,
    pub content: String,
    #[serde(rename = "htmlContent")]
    pub html_content: Option<String>,
    #[serde(rename = "imageDataUrl")]
    pub image_data_url: Option<String>,
    #[serde(rename = "imageHash")]
    pub image_hash: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "contentLength")]
    pub content_length: i64,
    pub tags: Vec<String>,
    pub pinned: bool,
    #[serde(rename = "pinnedAt")]
    pub pinned_at: Option<i64>,
    /// language holds the user-selected syntax highlighting language (e.g. "json", "python").
    pub language: Option<String>,
}

/// Settings represents user application settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(rename = "cacheLimit")]
    pub cache_limit: i32,
    pub theme: String,
    pub language: String,
    pub hotkey: String,
    #[serde(rename = "clipboardMonitor")]
    pub clipboard_monitor: bool,
    pub autostart: bool,
    #[serde(rename = "showNotification")]
    pub show_notification: bool,
    #[serde(rename = "closeToTray")]
    pub close_to_tray: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            cache_limit: 100,
            theme: "system".to_string(),
            language: "en".to_string(),
            hotkey: "Alt+Shift+C".to_string(),
            clipboard_monitor: false,
            autostart: false,
            show_notification: true,
            close_to_tray: true,
        }
    }
}

/// StorageStats holds storage usage statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    #[serde(rename = "totalRecords")]
    pub total_records: i64,
    #[serde(rename = "totalSize")]
    pub total_size: i64,
    #[serde(rename = "dbFileSize")]
    pub db_file_size: i64,
}

/// ImportResult reports the outcome of an import operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub added: i32,
    pub skipped: i32,
}

/// Database wraps a SQLite connection and provides all data operations.
pub struct Database {
    conn: Connection,
    db_path: String,
}

impl Database {
    /// new creates a new Database, opening or creating the SQLite file at path.
    pub fn new(path: &str) -> SqlResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS caches (
                id TEXT PRIMARY KEY,
                cache_type TEXT NOT NULL DEFAULT 'text',
                content TEXT NOT NULL,
                html_content TEXT,
                image_data_url TEXT,
                image_hash TEXT,
                created_at INTEGER NOT NULL,
                content_length INTEGER NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                pinned_at INTEGER,
                language TEXT
            );

            CREATE TABLE IF NOT EXISTS cache_tags (
                cache_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (cache_id, tag),
                FOREIGN KEY (cache_id) REFERENCES caches(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_caches_created_at ON caches(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_caches_pinned ON caches(pinned, pinned_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cache_tags_tag ON cache_tags(tag);",
        )?;

        // Migration: add language column if missing (for existing databases)
        let has_language: bool = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('caches') WHERE name='language'")?
            .query_row([], |row| row.get::<_, i64>(0))
            .map(|c| c > 0)
            .unwrap_or(false);
        if !has_language {
            conn.execute_batch("ALTER TABLE caches ADD COLUMN language TEXT")?;
        }

        Ok(Self {
            conn,
            db_path: path.to_string(),
        })
    }

    /// get_caches returns cached records with pagination, pinned first.
    pub fn get_caches(&self, offset: i64, limit: i64) -> SqlResult<Vec<CacheItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, cache_type, content, html_content, image_data_url, image_hash,
                    created_at, content_length, pinned, pinned_at, language
             FROM caches
             ORDER BY pinned DESC, CASE WHEN pinned = 1 THEN pinned_at ELSE created_at END DESC
             LIMIT ?1 OFFSET ?2",
        )?;

        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(CacheItem {
                id: row.get(0)?,
                cache_type: row.get(1)?,
                content: row.get(2)?,
                html_content: row.get(3)?,
                image_data_url: row.get(4)?,
                image_hash: row.get(5)?,
                created_at: row.get(6)?,
                content_length: row.get(7)?,
                tags: Vec::new(),
                pinned: row.get::<_, i32>(8)? != 0,
                pinned_at: row.get(9)?,
                language: row.get(10)?,
            })
        })?;

        let mut items: Vec<CacheItem> = Vec::new();
        for row in rows {
            let mut item = row?;
            item.tags = self.get_tags_for_cache(&item.id)?;
            items.push(item);
        }

        Ok(items)
    }

    /// get_all_caches returns all cached records.
    pub fn get_all_caches(&self) -> SqlResult<Vec<CacheItem>> {
        let count: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM caches", [], |row| row.get(0))?;
        self.get_caches(0, count.max(1))
    }

    fn get_tags_for_cache(&self, cache_id: &str) -> SqlResult<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT tag FROM cache_tags WHERE cache_id = ?1 ORDER BY tag")?;
        let tags = stmt
            .query_map(params![cache_id], |row| row.get(0))?
            .collect::<SqlResult<Vec<String>>>()?;
        Ok(tags)
    }

    /// add_cache inserts a new cache record with deduplication.
    pub fn add_cache(&self, item: &CacheItem) -> SqlResult<bool> {
        // Check dedup
        let is_dup = match item.cache_type.as_str() {
            "image" => {
                if let Some(ref hash) = item.image_hash {
                    let count: i64 = self.conn.query_row(
                        "SELECT COUNT(*) FROM caches WHERE cache_type='image' AND image_hash=?1",
                        params![hash],
                        |row| row.get(0),
                    )?;
                    count > 0
                } else if let Some(ref data_url) = item.image_data_url {
                    let count: i64 = self.conn.query_row(
                        "SELECT COUNT(*) FROM caches WHERE cache_type='image' AND image_data_url=?1",
                        params![data_url],
                        |row| row.get(0),
                    )?;
                    count > 0
                } else {
                    false
                }
            }
            _ => {
                let count: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM caches WHERE content=?1",
                    params![item.content],
                    |row| row.get(0),
                )?;
                count > 0
            }
        };

        if is_dup {
            return Ok(false);
        }

        self.conn.execute(
            "INSERT INTO caches (id, cache_type, content, html_content, image_data_url, image_hash,
                                 created_at, content_length, pinned, pinned_at, language)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
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
            ],
        )?;

        for tag in &item.tags {
            self.conn.execute(
                "INSERT OR IGNORE INTO cache_tags (cache_id, tag) VALUES (?1, ?2)",
                params![item.id, tag],
            )?;
        }

        // Evict old non-pinned records beyond limit
        let settings = self.get_settings()?;
        self.evict_old_records(settings.cache_limit as i64)?;

        Ok(true)
    }

    fn evict_old_records(&self, limit: i64) -> SqlResult<()> {
        let count: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM caches", [], |row| row.get(0))?;
        if count <= limit {
            return Ok(());
        }

        let to_remove = count - limit;
        self.conn.execute(
            "DELETE FROM caches WHERE id IN (
                SELECT id FROM caches WHERE pinned = 0
                ORDER BY created_at ASC
                LIMIT ?1
            )",
            params![to_remove],
        )?;

        Ok(())
    }

    /// remove_cache deletes a single cache record by id.
    pub fn remove_cache(&self, id: &str) -> SqlResult<bool> {
        let affected = self
            .conn
            .execute("DELETE FROM caches WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    /// clear_all_caches removes all cache records.
    pub fn clear_all_caches(&self) -> SqlResult<()> {
        self.conn.execute("DELETE FROM cache_tags", [])?;
        self.conn.execute("DELETE FROM caches", [])?;
        Ok(())
    }

    /// update_cache_tags replaces all tags for a given cache record.
    pub fn update_cache_tags(&self, id: &str, tags: &[String]) -> SqlResult<bool> {
        let exists: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM caches WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Ok(false);
        }

        self.conn
            .execute("DELETE FROM cache_tags WHERE cache_id = ?1", params![id])?;
        for tag in tags {
            self.conn.execute(
                "INSERT OR IGNORE INTO cache_tags (cache_id, tag) VALUES (?1, ?2)",
                params![id, tag],
            )?;
        }
        Ok(true)
    }

    /// update_cache_content updates the content and content_length of a cache record.
    pub fn update_cache_content(&self, id: &str, content: &str) -> SqlResult<bool> {
        let content_length = content.chars().count() as i64;
        let affected = self.conn.execute(
            "UPDATE caches SET content = ?1, content_length = ?2 WHERE id = ?3",
            params![content, content_length, id],
        )?;
        Ok(affected > 0)
    }

    /// update_cache_language updates the syntax highlighting language of a cache record.
    pub fn update_cache_language(&self, id: &str, language: Option<&str>) -> SqlResult<bool> {
        let affected = self.conn.execute(
            "UPDATE caches SET language = ?1 WHERE id = ?2",
            params![language, id],
        )?;
        Ok(affected > 0)
    }

    /// toggle_pin toggles the pinned state of a cache record.
    pub fn toggle_pin(&self, id: &str) -> SqlResult<bool> {
        let current_pinned: i32 = self.conn.query_row(
            "SELECT pinned FROM caches WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        let new_pinned = if current_pinned == 0 { 1 } else { 0 };
        let pinned_at = if new_pinned == 1 {
            Some(chrono_now_ms())
        } else {
            None
        };

        self.conn.execute(
            "UPDATE caches SET pinned = ?1, pinned_at = ?2 WHERE id = ?3",
            params![new_pinned, pinned_at, id],
        )?;

        Ok(new_pinned == 1)
    }

    /// search_caches finds records matching query in content or tags.
    pub fn search_caches(
        &self,
        query: &str,
        offset: i64,
        limit: i64,
    ) -> SqlResult<Vec<CacheItem>> {
        if query.trim().is_empty() {
            return self.get_caches(offset, limit);
        }

        // Escape LIKE special characters to prevent SQL injection
        let escaped = query
            .to_lowercase()
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{}%", escaped);

        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT c.id, c.cache_type, c.content, c.html_content, c.image_data_url,
                    c.image_hash, c.created_at, c.content_length, c.pinned, c.pinned_at, c.language
             FROM caches c
             LEFT JOIN cache_tags ct ON c.id = ct.cache_id
             WHERE LOWER(c.content) LIKE ?1 OR LOWER(ct.tag) LIKE ?1
             ORDER BY c.pinned DESC,
                      CASE WHEN c.pinned = 1 THEN c.pinned_at ELSE c.created_at END DESC
             LIMIT ?2 OFFSET ?3",
        )?;

        let rows = stmt.query_map(params![pattern, limit, offset], |row| {
            Ok(CacheItem {
                id: row.get(0)?,
                cache_type: row.get(1)?,
                content: row.get(2)?,
                html_content: row.get(3)?,
                image_data_url: row.get(4)?,
                image_hash: row.get(5)?,
                created_at: row.get(6)?,
                content_length: row.get(7)?,
                tags: Vec::new(),
                pinned: row.get::<_, i32>(8)? != 0,
                pinned_at: row.get(9)?,
                language: row.get(10)?,
            })
        })?;

        let mut items: Vec<CacheItem> = Vec::new();
        for row in rows {
            let mut item = row?;
            item.tags = self.get_tags_for_cache(&item.id)?;
            items.push(item);
        }

        Ok(items)
    }

    /// search_all_caches returns all matching records (no pagination limit).
    pub fn search_all_caches(&self, query: &str) -> SqlResult<Vec<CacheItem>> {
        let count: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM caches", [], |row| row.get(0))?;
        self.search_caches(query, 0, count.max(1000))
    }

    /// get_all_tags returns all unique tags in use.
    pub fn get_all_tags(&self) -> SqlResult<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT tag FROM cache_tags ORDER BY tag")?;
        let tags = stmt
            .query_map([], |row| row.get(0))?
            .collect::<SqlResult<Vec<String>>>()?;
        Ok(tags)
    }

    /// get_storage_stats returns storage usage information.
    pub fn get_storage_stats(&self) -> SqlResult<StorageStats> {
        let total_records: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM caches", [], |row| row.get(0))?;

        let total_size: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(LENGTH(content) + COALESCE(LENGTH(html_content),0) + COALESCE(LENGTH(image_data_url),0)), 0) FROM caches",
            [],
            |row| row.get(0),
        )?;

        let db_file_size = std::fs::metadata(&self.db_path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);

        Ok(StorageStats {
            total_records,
            total_size,
            db_file_size,
        })
    }

    /// get_settings retrieves user settings, returning defaults if not set.
    pub fn get_settings(&self) -> SqlResult<Settings> {
        let mut settings = Settings::default();

        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (key, value) = row?;
            match key.as_str() {
                "cache_limit" => settings.cache_limit = value.parse().unwrap_or(100),
                "theme" => settings.theme = value,
                "language" => settings.language = value,
                "hotkey" => settings.hotkey = value,
                "clipboard_monitor" => settings.clipboard_monitor = value == "true",
                "autostart" => settings.autostart = value == "true",
                "show_notification" => settings.show_notification = value == "true",
                "close_to_tray" => settings.close_to_tray = value == "true",
                _ => {}
            }
        }

        Ok(settings)
    }

    /// save_settings persists user settings.
    pub fn save_settings(&self, settings: &Settings) -> SqlResult<()> {
        let pairs = [
            ("cache_limit", settings.cache_limit.to_string()),
            ("theme", settings.theme.clone()),
            ("language", settings.language.clone()),
            ("hotkey", settings.hotkey.clone()),
            ("clipboard_monitor", settings.clipboard_monitor.to_string()),
            ("autostart", settings.autostart.to_string()),
            ("show_notification", settings.show_notification.to_string()),
            ("close_to_tray", settings.close_to_tray.to_string()),
        ];

        for (key, value) in &pairs {
            self.conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            )?;
        }

        Ok(())
    }

    /// export_caches returns all caches as a JSON string.
    pub fn export_caches(&self) -> SqlResult<String> {
        let caches = self.get_all_caches()?;
        let payload = serde_json::json!({
            "version": 1,
            "exported_at": chrono_now_ms(),
            "app": "ClipStash",
            "records": caches.iter().map(|c| {
                let mut obj = serde_json::json!({
                    "id": c.id,
                    "type": c.cache_type,
                    "content": c.content,
                    "created_at": c.created_at,
                    "content_length": c.content_length,
                    "tags": c.tags,
                    "pinned": c.pinned,
                    "pinned_at": c.pinned_at.unwrap_or(0),
                });
                if let Some(ref h) = c.html_content {
                    obj["html_content"] = serde_json::Value::String(h.clone());
                }
                if let Some(ref d) = c.image_data_url {
                    obj["image_data_url"] = serde_json::Value::String(d.clone());
                }
                if let Some(ref h) = c.image_hash {
                    obj["image_hash"] = serde_json::Value::String(h.clone());
                }
                if let Some(ref l) = c.language {
                    obj["language"] = serde_json::Value::String(l.clone());
                }
                obj
            }).collect::<Vec<_>>()
        });
        Ok(serde_json::to_string_pretty(&payload).unwrap_or_default())
    }

    /// import_caches merges records from a JSON string into the database.
    pub fn import_caches(&self, json_str: &str) -> SqlResult<ImportResult> {
        let parsed: serde_json::Value = serde_json::from_str(json_str)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let records = if let Some(recs) = parsed.get("records").and_then(|v| v.as_array()) {
            recs.clone()
        } else if let Some(arr) = parsed.as_array() {
            arr.clone()
        } else {
            return Ok(ImportResult {
                added: 0,
                skipped: 0,
            });
        };

        let mut added = 0i32;
        let mut skipped = 0i32;

        for rec in &records {
            let item = parse_import_record(rec);
            if item.content.is_empty() && item.image_data_url.is_none() {
                continue;
            }

            if self.add_cache(&item)? {
                added += 1;
            } else {
                skipped += 1;
            }
        }

        Ok(ImportResult { added, skipped })
    }
}

fn parse_import_record(rec: &serde_json::Value) -> CacheItem {
    let id = rec
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let cache_type = rec
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("text")
        .to_string();
    let content = rec
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let id = if id.is_empty() {
        generate_id()
    } else {
        id
    };

    CacheItem {
        id,
        cache_type: cache_type.clone(),
        content: content.clone(),
        html_content: rec
            .get("html_content")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        image_data_url: rec
            .get("image_data_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        image_hash: rec
            .get("image_hash")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        created_at: rec
            .get("created_at")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(chrono_now_ms),
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
    }
}

/// generate_id creates a unique ID in format: timestamp_randomHex
pub fn generate_id() -> String {
    let ts = chrono_now_ms();
    let rand: u64 = rand_u64();
    format!("{}_{:08x}", ts, rand & 0xFFFFFFFF)
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn rand_u64() -> u64 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    RandomState::new().build_hasher().finish()
}
