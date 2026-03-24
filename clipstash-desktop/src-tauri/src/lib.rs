mod clipboard;
mod commands;
mod crypto;
mod db;
mod hotkey;
mod monitor;
mod sync;
mod tray;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// AppState holds shared application state.
pub struct AppState {
    pub db: Mutex<db::Database>,
    pub monitor_enabled: Mutex<bool>,
    pub last_clipboard_hash: Mutex<String>,
    /// Reference counter that tracks the number of active reasons to suppress
    /// auto-hide on the main window (e.g. open fullscreen/sticky windows, dialogs).
    /// When > 0 the main window will not auto-hide on focus loss.
    pub suppress_auto_hide_count: AtomicUsize,
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                ])
                .max_file_size(10_000_000) // 10 MB per log file
                .rotation_strategy(RotationStrategy::KeepSome(5))
                .level(log::LevelFilter::Info)
                .build(),
        )
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

            log::info!("ClipStash v{} starting", env!("CARGO_PKG_VERSION"));
            log::info!("Data dir: path={}", app_data_dir.display());

            app.manage(AppState {
                db: Mutex::new(database),
                monitor_enabled: Mutex::new(false),
                last_clipboard_hash: Mutex::new(String::new()),
                suppress_auto_hide_count: AtomicUsize::new(0),
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
                            .map(|s| s.suppress_auto_hide_count.load(Ordering::SeqCst) > 0)
                            .unwrap_or(false);
                        if !suppressed {
                            window.hide().ok();
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // When a fullscreen or sticky window is closed, decrement suppress counter
                    if window.label().starts_with("fullscreen_") || window.label().starts_with("sticky_") {
                        log::info!("Closing window: label={}", window.label());
                        if let Some(state) = window.app_handle().try_state::<AppState>() {
                            // Saturating decrement: never go below zero
                            state.suppress_auto_hide_count.fetch_update(
                                Ordering::SeqCst, Ordering::SeqCst,
                                |v| Some(v.saturating_sub(1))
                            ).ok();
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_clipboard,
            commands::write_clipboard,
            commands::get_cache_by_id,
            commands::get_caches,
            commands::add_cache,
            commands::remove_cache,
            commands::clear_all_caches,
            commands::update_cache_tags,
            commands::toggle_pin,
            commands::update_cache_content,
            commands::update_cache_language,
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
            commands::open_sticky_window,
            commands::set_suppress_auto_hide,
            commands::update_tray_menu,
            commands::get_sync_settings,
            commands::save_sync_settings,
            commands::validate_sync_token,
            commands::init_cloud_sync,
            commands::perform_cloud_sync,
            commands::disconnect_cloud_sync,
            commands::get_deleted_caches,
            commands::restore_cache,
            commands::permanent_delete_cache,
            commands::purge_expired_caches,
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
