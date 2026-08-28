mod ollama;
mod proxy;
mod scan;
mod store;
mod tray;

use serde::Serialize;
use std::hash::{BuildHasher, Hasher, RandomState};
use std::sync::OnceLock;
use tauri::{Emitter, Manager};

static RUNTIME: OnceLock<RuntimeInfo> = OnceLock::new();

#[derive(Serialize, Clone)]
pub struct RuntimeInfo {
    /// Base URL the frontend should call instead of Ollama directly.
    api_base: String,
    /// Where that bridge forwards to.
    ollama_base: String,
    token_header: String,
    token: String,
}

/// 128 bits from the OS-seeded hasher — enough to keep other local processes
/// from guessing their way onto the bridge.
fn session_token() -> String {
    let mut out = String::with_capacity(32);
    for salt in 0..2u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(salt);
        h.write_u128(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0),
        );
        h.write_u32(std::process::id());
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

#[tauri::command]
fn runtime_info() -> Result<RuntimeInfo, String> {
    RUNTIME
        .get()
        .cloned()
        .ok_or_else(|| "Lwen's local bridge did not start.".to_string())
}

#[tauri::command]
async fn ollama_status() -> ollama::ServerStatus {
    ollama::status().await
}

#[tauri::command]
async fn start_ollama() -> Result<ollama::ServerStatus, String> {
    ollama::start_server().await
}

#[tauri::command]
async fn stop_ollama() -> Result<ollama::ServerStatus, String> {
    ollama::stop_server().await
}

/// Whether this run of Lwen started the server that is answering — the UI warns
/// before stopping one it did not start.
#[tauri::command]
fn ollama_ownership() -> ollama::OwnedBy {
    ollama::ownership()
}

/// Mirrors the frontend's poll into the tray. Cheap and idempotent: it only
/// rebuilds the menu, and only while the server is up.
#[tauri::command]
fn sync_tray(
    app: tauri::AppHandle,
    running: bool,
    version: Option<String>,
    loaded: usize,
) -> Result<(), String> {
    tray::sync(&app, running, version, loaded)
}

#[tauri::command]
async fn run_model(model: String, keep_alive: Option<String>) -> Result<(), String> {
    let keep = keep_alive.unwrap_or_else(|| "30m".into());
    ollama::load_model(&model, &keep).await
}

#[tauri::command]
async fn stop_model(model: String) -> Result<(), String> {
    ollama::unload_model(&model).await
}

#[tauri::command]
async fn loaded_models() -> Result<Vec<ollama::LoadedModel>, String> {
    ollama::loaded_models().await
}

#[tauri::command]
async fn scan_folder(path: String) -> Result<scan::ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || scan::scan(&path))
        .await
        .map_err(|e| format!("The folder scan did not finish: {e}"))?
}

#[tauri::command]
async fn read_files(paths: Vec<String>, max_bytes: Option<usize>) -> Result<Vec<scan::FileText>, String> {
    let cap = max_bytes.unwrap_or(512 * 1024);
    tauri::async_runtime::spawn_blocking(move || scan::read_files(paths, cap))
        .await
        .map_err(|e| format!("Reading project files failed: {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    scan::read_text(&path)
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    const MAX: u64 = 64 * 1024 * 1024;
    let meta = std::fs::metadata(&path).map_err(|e| format!("Could not open that file: {e}"))?;
    if meta.len() > MAX {
        return Err("That file is larger than 64 MB.".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read that file: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn path_kind(path: String) -> String {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        "dir".into()
    } else if p.is_file() {
        "file".into()
    } else {
        "missing".into()
    }
}

#[tauri::command]
fn app_ready(window: tauri::Window) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let token = session_token();
            let upstream = ollama::base_url();
            match proxy::spawn(upstream.clone(), token) {
                Ok(handle) => {
                    let _ = RUNTIME.set(RuntimeInfo {
                        api_base: format!("http://127.0.0.1:{}", handle.port),
                        ollama_base: upstream,
                        token_header: proxy::TOKEN_HEADER.into(),
                        token: handle.token,
                    });
                }
                Err(e) => {
                    eprintln!("lwen: {e}");
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("lwen://bridge-failed", e);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            ollama_status,
            start_ollama,
            stop_ollama,
            ollama_ownership,
            sync_tray,
            run_model,
            stop_model,
            loaded_models,
            scan_folder,
            read_files,
            read_text_file,
            read_file_bytes,
            path_kind,
            store::load_users,
            store::save_users,
            store::load_library,
            store::save_library,
            store::load_trash,
            store::save_trash,
            store::load_stats,
            store::save_stats,
            store::user_folder,
            store::adopt_legacy_library,
            app_ready,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Lwen")
        .run(|_app, event| {
            // A server Lwen started is Lwen's to clean up; one that was already
            // running when Lwen opened is left exactly as it was found.
            if let tauri::RunEvent::Exit = event {
                ollama::stop_spawned_blocking();
            }
        });
}
