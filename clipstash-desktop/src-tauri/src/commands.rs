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
pub fn get_cache_by_id(state: State<AppState>, id: String) -> Result<Option<CacheItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_cache_by_id(&id).map_err(|e| e.to_string())
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
        language: None,
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
pub fn update_cache_content(state: State<AppState>, id: String, content: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_cache_content(&id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_cache_language(
    state: State<AppState>,
    id: String,
    language: Option<String>,
) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_cache_language(&id, language.as_deref())
        .map_err(|e| e.to_string())
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
    item_id: String,
) -> Result<bool, String> {
    let label = format!("fullscreen_{}", db::generate_id());

    // Suppress auto-hide so the main window stays visible while fullscreen is open
    state.suppress_auto_hide_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    // Load the app's fullscreen.html page with the item ID as query parameter
    let url = WebviewUrl::App(format!("fullscreen.html?id={}", item_id).into());

    // Build and show the fullscreen window
    let window = WebviewWindowBuilder::new(&app, &label, url)
        .title("ClipStash - Fullscreen")
        .inner_size(900.0, 700.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    // Set focus after a brief delay to ensure content is loaded
    let window_clone = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let _ = window_clone.set_focus();
    });

    Ok(true)
}

#[tauri::command]
pub fn set_suppress_auto_hide(state: State<AppState>, suppress: bool) {
    if suppress {
        state.suppress_auto_hide_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    } else {
        state.suppress_auto_hide_count.fetch_update(
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
            |v| Some(v.saturating_sub(1))
        ).ok();
    }
}

#[tauri::command]
pub fn open_sticky_window(
    app: tauri::AppHandle,
    state: State<AppState>,
    html_content: String,
) -> Result<bool, String> {
    let label = format!("sticky_{}", db::generate_id());

    let temp_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_file = temp_dir.join(format!("{}.html", &label));
    std::fs::write(&temp_file, &html_content).map_err(|e| e.to_string())?;

    let file_url = tauri::Url::from_file_path(&temp_file)
        .map_err(|_| "failed to create file URL".to_string())?;

    state.suppress_auto_hide_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    // Build and show the sticky window
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(file_url))
        .title("ClipStash - Sticky Note")
        .inner_size(400.0, 350.0)
        .always_on_top(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    // Set focus after a brief delay to ensure content is loaded
    let window_clone = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let _ = window_clone.set_focus();
    });

    Ok(true)
}

#[tauri::command]
pub fn update_tray_menu(
    app: tauri::AppHandle,
    settings_text: String,
    quit_text: String,
) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem};

    if let Some(tray) = app.tray_by_id("clipstash-tray") {
        let open_settings =
            MenuItem::with_id(&app, "open_settings", settings_text, true, None::<&str>)
                .map_err(|e| e.to_string())?;
        let quit = MenuItem::with_id(&app, "quit", quit_text, true, None::<&str>)
            .map_err(|e| e.to_string())?;

        let menu = Menu::with_items(&app, &[&open_settings, &quit])
            .map_err(|e| e.to_string())?;

        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}
