use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    Emitter, Manager,
};

/// setup_tray creates and configures the system tray icon and menu.
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let cache_clipboard =
        MenuItem::with_id(app, "cache_clipboard", "Cache clipboard", true, None::<&str>)?;
    let open_clipstash =
        MenuItem::with_id(app, "open_clipstash", "Open ClipStash", true, None::<&str>)?;
    let open_settings =
        MenuItem::with_id(app, "open_settings", "Settings...", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep", "─────────", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&cache_clipboard, &open_clipstash, &open_settings, &separator, &quit],
    )?;

    // Always build our own tray so we can control show_menu_on_left_click.
    // Remove any auto-created tray first.
    if let Some(existing) = app.tray_by_id("main") {
        existing.set_visible(false).ok();
    }

    let tray = tauri::tray::TrayIconBuilder::with_id("clipstash-tray")
        .tooltip("ClipStash")
        .icon(app.default_window_icon().cloned().unwrap())
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        window.hide().ok();
                    } else {
                        // Position the window below the tray icon, centered horizontally
                        if let Ok(win_size) = window.outer_size() {
                            let scale = window.scale_factor().unwrap_or(1.0);
                            let win_w = win_size.width as f64;

                            // Convert Position/Size enums to physical pixels
                            let tray_pos = rect.position.to_physical::<f64>(scale);
                            let tray_size = rect.size.to_physical::<f64>(scale);

                            // Center window horizontally on tray icon
                            let x = tray_pos.x + (tray_size.width / 2.0) - (win_w / 2.0);
                            // Position just below the tray icon (below the menu bar)
                            let y = tray_pos.y + tray_size.height;

                            use tauri::PhysicalPosition;
                            window
                                .set_position(PhysicalPosition::new(x as i32, y as i32))
                                .ok();
                        }
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "cache_clipboard" => {
                app.emit("tray-cache-clipboard", ()).ok();
            }
            "open_clipstash" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.show().ok();
                    window.set_focus().ok();
                }
            }
            "open_settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.show().ok();
                    window.set_focus().ok();
                }
                app.emit("tray-open-settings", ()).ok();
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    // Keep the tray handle alive (it's already registered via the builder)
    drop(tray);

    Ok(())
}
