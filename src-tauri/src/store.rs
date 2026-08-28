//! On-disk layout for accounts and their libraries.
//!
//! ```text
//! <app data>/
//!   users.json          every account: name, avatar, password hash
//!   Nihil/              one folder per account, named after the account
//!     library.json      projects and their conversations
//!     trash.json        deleted conversations and projects
//!     stats.json        usage counters, written far more often than the rest
//! ```
//!
//! Account names come from the frontend, so every path is rebuilt here from a
//! sanitized single component — a name can never reach outside the data folder.

use std::path::PathBuf;
use tauri::Manager;

/// Device names Windows refuses to use for a directory, whatever the extension.
const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// One path component for an account name, keeping it recognisable where the
/// filesystem allows it: `Nihil` stays `Nihil`.
pub fn folder_name(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => out.push('-'),
            c if (c as u32) < 0x20 => {}
            c => out.push(c),
        }
    }
    // Windows silently drops trailing dots and spaces, which would leave the
    // folder pointing somewhere other than what we wrote down.
    let trimmed = out.trim().trim_end_matches('.').trim();
    let mut safe: String = trimmed.chars().take(48).collect();
    if safe.is_empty() || safe == "." || safe == ".." {
        safe = "account".into();
    }
    let stem = safe.split('.').next().unwrap_or(&safe).to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        safe.insert(0, '_');
    }
    safe
}

fn data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not locate the app data folder: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create the app data folder: {e}"))?;
    Ok(dir)
}

fn user_root(app: &tauri::AppHandle, user: &str) -> Result<PathBuf, String> {
    let dir = data_root(app)?.join(folder_name(user));
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create your account folder: {e}"))?;
    Ok(dir)
}

fn read_opt(path: &PathBuf, what: &str) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {what}: {e}")),
    }
}

/// Write through a temporary file so an interrupted save cannot truncate the
/// only copy of someone's history.
fn write_atomic(path: &PathBuf, body: &str, what: &str) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, body.as_bytes()).map_err(|e| format!("Could not save {what}: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Could not save {what}: {e}"))
}

#[tauri::command]
pub fn load_users(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_opt(&data_root(&app)?.join("users.json"), "the account list")
}

#[tauri::command]
pub fn save_users(app: tauri::AppHandle, json: String) -> Result<(), String> {
    write_atomic(&data_root(&app)?.join("users.json"), &json, "the account list")
}

#[tauri::command]
pub fn load_library(app: tauri::AppHandle, user: String) -> Result<Option<String>, String> {
    read_opt(&user_root(&app, &user)?.join("library.json"), "saved conversations")
}

#[tauri::command]
pub fn save_library(app: tauri::AppHandle, user: String, json: String) -> Result<(), String> {
    write_atomic(&user_root(&app, &user)?.join("library.json"), &json, "conversations")
}

#[tauri::command]
pub fn load_trash(app: tauri::AppHandle, user: String) -> Result<Option<String>, String> {
    read_opt(&user_root(&app, &user)?.join("trash.json"), "deleted conversations")
}

#[tauri::command]
pub fn save_trash(app: tauri::AppHandle, user: String, json: String) -> Result<(), String> {
    write_atomic(&user_root(&app, &user)?.join("trash.json"), &json, "deleted conversations")
}

/// Usage counters live apart from the library because they change on every
/// keystroke: folding them into `library.json` would rewrite the whole history
/// several times a minute.
#[tauri::command]
pub fn load_stats(app: tauri::AppHandle, user: String) -> Result<Option<String>, String> {
    read_opt(&user_root(&app, &user)?.join("stats.json"), "your usage statistics")
}

#[tauri::command]
pub fn save_stats(app: tauri::AppHandle, user: String, json: String) -> Result<(), String> {
    write_atomic(&user_root(&app, &user)?.join("stats.json"), &json, "usage statistics")
}

/// Absolute path of an account's folder, for showing and revealing in the UI.
#[tauri::command]
pub fn user_folder(app: tauri::AppHandle, user: String) -> Result<String, String> {
    Ok(user_root(&app, &user)?.to_string_lossy().into_owned())
}

/// Hands the pre-accounts `library.json` to the first account created, so an
/// existing install keeps its projects instead of opening empty.
#[tauri::command]
pub fn adopt_legacy_library(app: tauri::AppHandle, user: String) -> Result<bool, String> {
    let legacy = data_root(&app)?.join("library.json");
    if !legacy.is_file() {
        return Ok(false);
    }
    let target = user_root(&app, &user)?.join("library.json");
    if target.exists() {
        return Ok(false);
    }
    std::fs::copy(&legacy, &target).map_err(|e| format!("Could not move your library: {e}"))?;
    // Kept, renamed, rather than deleted: it is the only copy of that history.
    let _ = std::fs::rename(&legacy, legacy.with_extension("json.pre-accounts"));
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::folder_name;

    #[test]
    fn keeps_plain_names() {
        assert_eq!(folder_name("Nihil"), "Nihil");
    }

    #[test]
    fn refuses_to_escape_the_data_folder() {
        assert_eq!(folder_name(".."), "account");
        assert_eq!(folder_name("../../etc"), "..-..-etc");
        assert!(!folder_name("a/b\\c").contains(['/', '\\']));
    }

    #[test]
    fn works_around_windows_quirks() {
        assert_eq!(folder_name("name."), "name");
        assert_eq!(folder_name("  "), "account");
        assert_eq!(folder_name("CON"), "_CON");
        assert_eq!(folder_name("nul.txt"), "_nul.txt");
    }
}
