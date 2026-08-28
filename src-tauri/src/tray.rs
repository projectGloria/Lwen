//! The system tray entry, which exists only while Ollama is reachable.
//!
//! Lwen is a desktop window, not a background agent, so a tray icon that is
//! always there would be noise. It appears when the server comes up — started
//! by Lwen or by anything else — and disappears when the server goes away, so
//! the icon means exactly one thing: *Ollama is running*.
//!
//! The frontend already polls the server every few seconds; rather than
//! duplicating that timer in Rust, it calls `sync_tray` with what it just saw.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

const TRAY_ID: &str = "lwen-ollama";

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    version: Option<&str>,
    loaded: usize,
) -> tauri::Result<Menu<R>> {
    let heading = match version {
        Some(v) => format!("Ollama {v} — running"),
        None => "Ollama — running".to_string(),
    };
    let resident = match loaded {
        0 => "No model in memory".to_string(),
        1 => "1 model in memory".to_string(),
        n => format!("{n} models in memory"),
    };

    // Disabled items are the status readout; everything below acts.
    let status = MenuItem::with_id(app, "status", heading, false, None::<&str>)?;
    let mem = MenuItem::with_id(app, "mem", resident, false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Lwen", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop-ollama", "Stop Ollama", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Lwen", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &status,
            &mem,
            &PredefinedMenuItem::separator(app)?,
            &open,
            &stop,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

/// Creates, updates, or removes the tray to match `running`.
pub fn sync<R: Runtime>(
    app: &AppHandle<R>,
    running: bool,
    version: Option<String>,
    loaded: usize,
) -> Result<(), String> {
    let existing = app.tray_by_id(TRAY_ID);

    if !running {
        if existing.is_some() {
            app.remove_tray_by_id(TRAY_ID);
        }
        return Ok(());
    }

    let menu = build_menu(app, version.as_deref(), loaded)
        .map_err(|e| format!("Could not build the tray menu: {e}"))?;
    let tooltip = match &version {
        Some(v) => format!("Ollama {v} is running — Lwen"),
        None => "Ollama is running — Lwen".to_string(),
    };

    if let Some(tray) = existing {
        tray.set_menu(Some(menu))
            .map_err(|e| format!("Could not update the tray menu: {e}"))?;
        let _ = tray.set_tooltip(Some(&tooltip));
        return Ok(());
    }

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        // The menu is the whole point of the icon; a left click that only
        // focuses the window would hide the controls behind a right click.
        .show_menu_on_left_click(true)
        .tooltip(&tooltip)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "stop-ollama" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let outcome = crate::ollama::stop_server().await;
                    let _ = handle.emit_to_main("lwen://ollama-stopped", outcome.is_ok());
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder
        .build(app)
        .map(|_| ())
        .map_err(|e| format!("Could not create the tray icon: {e}"))
}

/// `Emitter` lives on the app handle, but only the main window cares.
trait EmitToMain {
    fn emit_to_main(&self, event: &str, payload: bool) -> tauri::Result<()>;
}

impl<R: Runtime> EmitToMain for AppHandle<R> {
    fn emit_to_main(&self, event: &str, payload: bool) -> tauri::Result<()> {
        use tauri::Emitter;
        match self.get_webview_window("main") {
            Some(w) => w.emit(event, payload),
            None => Ok(()),
        }
    }
}
