use std::str::FromStr;

use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// register_default_hotkey registers the default Alt+Shift+C global shortcut.
pub fn register_default_hotkey(app: &tauri::AppHandle) {
    register_custom_hotkey(app, "Alt+Shift+C").ok();
}

/// register_custom_hotkey registers a custom global shortcut.
pub fn register_custom_hotkey(app: &tauri::AppHandle, keys: &str) -> Result<bool, String> {
    let global_shortcut = app.global_shortcut();

    // Unregister all existing shortcuts first
    global_shortcut.unregister_all().map_err(|e| e.to_string())?;

    let shortcut = Shortcut::from_str(keys).map_err(|e| e.to_string())?;
    let app_handle = app.clone();

    global_shortcut
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                app_handle.emit("hotkey-cache-clipboard", ()).ok();
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(true)
}
