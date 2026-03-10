mod clipboard;
mod commands;
mod db;
mod hotkey;
mod monitor;
mod tray;

use std::sync::Mutex;
use tauri::Manager;

/// AppState holds shared application state.
pub struct AppState {
    pub db: Mutex<db::Database>,
    pub monitor_enabled: Mutex<bool>,
    pub last_clipboard_hash: Mutex<String>,
    /// When true, the main window will not auto-hide on focus loss.
    /// Used to keep the window visible while native dialogs (file open/save) are shown.
    pub suppress_auto_hide: Mutex<bool>,
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("clipstash.db");
            let database =
                db::Database::new(db_path.to_str().unwrap()).expect("failed to open database");

            app.manage(AppState {
                db: Mutex::new(database),
                monitor_enabled: Mutex::new(false),
                last_clipboard_hash: Mutex::new(String::new()),
                suppress_auto_hide: Mutex::new(false),
            });

            // Setup system tray
            tray::setup_tray(app)?;

            // Setup global shortcut
            let app_handle = app.handle().clone();
            hotkey::register_default_hotkey(&app_handle);

            // Hide the window on macOS dock if close to tray
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Only hide the main window; let other windows (e.g. fullscreen) close normally
                    if window.label() == "main" {
                        api.prevent_close();
                        window.hide().ok();
                    }
                }
                tauri::WindowEvent::Focused(false) => {
                    // Hide main window on focus loss (popover behavior),
                    // unless auto-hide is suppressed (e.g. during file dialog or fullscreen window).
                    if window.label() == "main" {
                        let suppressed = window
                            .app_handle()
                            .try_state::<AppState>()
                            .map(|s| *s.suppress_auto_hide.lock().unwrap())
                            .unwrap_or(false);
                        if !suppressed {
                            window.hide().ok();
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // When a fullscreen window is closed, restore auto-hide behavior
                    if window.label().starts_with("fullscreen_") {
                        if let Some(state) = window.app_handle().try_state::<AppState>() {
                            if let Ok(mut flag) = state.suppress_auto_hide.lock() {
                                *flag = false;
                            }
                        }
                        // Clean up the temp HTML file
                        if let Ok(temp_dir) = window.app_handle().path().app_data_dir() {
                            let temp_file = temp_dir.join(format!("{}.html", window.label()));
                            std::fs::remove_file(temp_file).ok();
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_clipboard,
            commands::write_clipboard,
            commands::get_caches,
            commands::add_cache,
            commands::remove_cache,
            commands::clear_all_caches,
            commands::update_cache_tags,
            commands::toggle_pin,
            commands::search_caches,
            commands::get_all_tags,
            commands::get_storage_stats,
            commands::get_settings,
            commands::save_settings,
            commands::export_caches,
            commands::import_caches,
            commands::get_autostart,
            commands::set_autostart,
            commands::set_clipboard_monitor,
            commands::get_clipboard_monitor,
            commands::register_hotkey,
            commands::show_notification,
            commands::open_fullscreen_window,
            commands::set_suppress_auto_hide,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            // Allow explicit exit (e.g. tray Quit → app.exit(0));
            // only prevent implicit exit caused by all windows closing.
            if code.is_none() {
                api.prevent_exit();
            }
        }
    });
}
