use crate::clipboard as clip;
use crate::AppState;
use tauri::{Emitter, Manager};

/// start_monitor begins polling the clipboard for changes in a background thread.
pub fn start_monitor(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Check if monitor is still enabled
            let state = app.state::<AppState>();
            let enabled = {
                let monitor = state.monitor_enabled.lock().unwrap_or_else(|e| e.into_inner());
                *monitor
            };
            if !enabled {
                break;
            }

            // Read current clipboard
            let clip_data = match clip::read_clipboard() {
                Some(data) => data,
                None => continue,
            };

            // Compute a hash for dedup
            let current_hash = match clip_data.content_type.as_str() {
                "image" => clip_data.image_hash.clone().unwrap_or_default(),
                _ => clip::get_text_hash(&clip_data.content),
            };

            if current_hash.is_empty() {
                continue;
            }

            // Check if this is the same as last clipboard content
            {
                let mut last_hash = state
                    .last_clipboard_hash
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                if *last_hash == current_hash {
                    continue;
                }
                *last_hash = current_hash;
            }

            // Emit event to frontend to handle the caching
            app.emit("monitor-clipboard-changed", &clip_data).ok();
        }
    });
}
