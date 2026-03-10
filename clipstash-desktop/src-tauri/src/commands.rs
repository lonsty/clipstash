use crate::clipboard as clip;
use crate::db::{self, CacheItem, ImportResult, Settings, StorageStats};
use crate::AppState;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn read_clipboard() -> Option<clip::ClipboardContent> {
    clip::read_clipboard()
}

#[tauri::command]
pub fn write_clipboard(
    content_type: String,
    content: String,
    html_content: Option<String>,
    image_data_url: Option<String>,
) -> Result<bool, String> {
    match content_type.as_str() {
        "image" => {
            if let Some(ref data_url) = image_data_url {
                clip::write_image(data_url)?;
            }
        }
        "html" => {
            if let Some(ref html) = html_content {
                clip::write_html(html, &content)?;
            } else {
                clip::write_text(&content)?;
            }
        }
        _ => {
            clip::write_text(&content)?;
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn get_caches(state: State<AppState>, offset: i64, limit: i64) -> Result<Vec<CacheItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_caches(offset, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_cache(
    state: State<AppState>,
    id: String,
    cache_type: String,
    content: String,
    html_content: Option<String>,
    image_data_url: Option<String>,
    image_hash: Option<String>,
    created_at: i64,
    content_length: i64,
    tags: Vec<String>,
    pinned: bool,
    pinned_at: Option<i64>,
) -> Result<bool, String> {
    let item = CacheItem {
        id,
        cache_type,
        content,
        html_content,
        image_data_url,
        image_hash,
        created_at,
        content_length,
        tags,
        pinned,
        pinned_at,
    };
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_cache(&item).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_cache(state: State<AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_cache(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_all_caches(state: State<AppState>) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.clear_all_caches().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn update_cache_tags(state: State<AppState>, id: String, tags: Vec<String>) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_cache_tags(&id, &tags).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_pin(state: State<AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.toggle_pin(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_caches(
    state: State<AppState>,
    query: String,
    offset: i64,
    limit: i64,
) -> Result<Vec<CacheItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.search_caches(&query, offset, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_tags(state: State<AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_all_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_storage_stats(state: State<AppState>) -> Result<StorageStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_storage_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: Settings) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn export_caches(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.export_caches().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_caches(state: State<AppState>, json: String) -> Result<ImportResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.import_caches(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    Ok(enabled)
}

#[tauri::command]
pub fn set_clipboard_monitor(
    app: tauri::AppHandle,
    state: State<AppState>,
    enabled: bool,
) -> Result<bool, String> {
    {
        let mut monitor = state.monitor_enabled.lock().map_err(|e| e.to_string())?;
        *monitor = enabled;
    }

    if enabled {
        crate::monitor::start_monitor(app);
    }

    Ok(enabled)
}

#[tauri::command]
pub fn get_clipboard_monitor(state: State<AppState>) -> Result<bool, String> {
    let monitor = state.monitor_enabled.lock().map_err(|e| e.to_string())?;
    Ok(*monitor)
}

#[tauri::command]
pub fn register_hotkey(app: tauri::AppHandle, keys: String) -> Result<bool, String> {
    crate::hotkey::register_custom_hotkey(&app, &keys)
}

#[tauri::command]
pub fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<bool, String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn open_fullscreen_window(
    app: tauri::AppHandle,
    state: State<AppState>,
    html_content: String,
) -> Result<bool, String> {
    let label = format!("fullscreen_{}", db::generate_id());

    // Write HTML to a temp file and use a proper file:// URL
    let temp_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_file = temp_dir.join(format!("{}.html", &label));
    std::fs::write(&temp_file, &html_content).map_err(|e| e.to_string())?;

    // Use url::Url::from_file_path for correct cross-platform file:// URLs
    // (e.g. file:///C:/... on Windows, file:///Users/... on macOS)
    let file_url = tauri::Url::from_file_path(&temp_file)
        .map_err(|_| "failed to create file URL".to_string())?;

    // Suppress auto-hide so the main window stays visible while fullscreen is open
    if let Ok(mut flag) = state.suppress_auto_hide.lock() {
        *flag = true;
    }

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(file_url))
        .title("ClipStash - Fullscreen")
        .inner_size(900.0, 700.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn set_suppress_auto_hide(state: State<AppState>, suppress: bool) {
    if let Ok(mut flag) = state.suppress_auto_hide.lock() {
        *flag = suppress;
    }
}
