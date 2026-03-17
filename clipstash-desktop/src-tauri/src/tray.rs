use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    Emitter, Manager,
};

/// setup_tray creates and configures the system tray icon and menu.
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Setting up tray");
    let open_settings =
        MenuItem::with_id(app, "open_settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&open_settings, &quit],
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
                        // Position the window near the tray icon, adapting to taskbar position
                        if let Ok(win_size) = window.outer_size() {
                            let scale = window.scale_factor().unwrap_or(1.0);
                            let win_w = win_size.width as f64;
                            let win_h = win_size.height as f64;

                            let tray_pos = rect.position.to_physical::<f64>(scale);
                            let tray_size = rect.size.to_physical::<f64>(scale);

                            // Get the monitor where the tray icon is located
                            let monitor = window.available_monitors()
                                .ok()
                                .and_then(|monitors| {
                                    monitors.into_iter().find(|m| {
                                        let pos = m.position();
                                        let size = m.size();
                                        let mx = pos.x as f64;
                                        let my = pos.y as f64;
                                        let mw = size.width as f64;
                                        let mh = size.height as f64;
                                        tray_pos.x >= mx && tray_pos.x < mx + mw
                                            && tray_pos.y >= my && tray_pos.y < my + mh
                                    })
                                });

                            // Center window horizontally on tray icon
                            let x = tray_pos.x + (tray_size.width / 2.0) - (win_w / 2.0);

                            // Determine if tray is at the bottom of the screen:
                            // If the space below the tray icon is less than the window height,
                            // expand upward (taskbar at bottom); otherwise expand downward.
                            let y = if let Some(ref mon) = monitor {
                                let mon_pos = mon.position();
                                let mon_size = mon.size();
                                let mon_bottom = mon_pos.y as f64 + mon_size.height as f64;
                                let space_below = mon_bottom - (tray_pos.y + tray_size.height);

                                if space_below < win_h {
                                    // Taskbar at bottom or not enough space below: expand upward
                                    tray_pos.y - win_h
                                } else {
                                    // Taskbar at top or enough space below: expand downward
                                    tray_pos.y + tray_size.height
                                }
                            } else {
                                // Fallback: expand downward
                                tray_pos.y + tray_size.height
                            };

                            // Clamp x to stay within screen bounds
                            let x = if let Some(ref mon) = monitor {
                                let mon_x = mon.position().x as f64;
                                let mon_w = mon.size().width as f64;
                                x.max(mon_x).min(mon_x + mon_w - win_w)
                            } else {
                                x
                            };

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
