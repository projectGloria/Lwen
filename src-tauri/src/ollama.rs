use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The `ollama serve` process id, when this run of Lwen is the one that started
/// it. Stopping a server Lwen did not start is possible but never automatic —
/// on Windows it is usually a background service someone else depends on.
static SPAWNED: Mutex<Option<u32>> = Mutex::new(None);

pub fn spawned_pid() -> Option<u32> {
    SPAWNED.lock().ok().and_then(|g| *g)
}

fn remember_spawn(pid: u32) {
    if let Ok(mut g) = SPAWNED.lock() {
        *g = Some(pid);
    }
}

fn forget_spawn() {
    if let Ok(mut g) = SPAWNED.lock() {
        *g = None;
    }
}

/// Resolves the Ollama endpoint, honouring `OLLAMA_HOST` the same way the CLI does.
pub fn base_url() -> String {
    match std::env::var("OLLAMA_HOST") {
        Ok(raw) => {
            let host = raw.trim();
            if host.is_empty() {
                return "http://127.0.0.1:11434".into();
            }
            if host.starts_with("http://") || host.starts_with("https://") {
                host.trim_end_matches('/').to_string()
            } else if host.contains(':') {
                format!("http://{host}")
            } else {
                format!("http://{host}:11434")
            }
        }
        Err(_) => "http://127.0.0.1:11434".into(),
    }
}

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .no_proxy()
        .build()
        .map_err(|e| format!("Could not create an HTTP client: {e}"))
}

#[derive(Serialize, Clone)]
pub struct ServerStatus {
    pub reachable: bool,
    pub version: Option<String>,
    pub base_url: String,
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct VersionBody {
    version: String,
}

pub async fn status() -> ServerStatus {
    let base = base_url();
    let out = async {
        let res = client(Duration::from_millis(2500))?
            .get(format!("{base}/api/version"))
            .send()
            .await
            .map_err(|e| friendly_net_error(&e))?;
        let body: VersionBody = res
            .json()
            .await
            .map_err(|_| "Ollama responded with an unexpected payload.".to_string())?;
        Ok::<String, String>(body.version)
    }
    .await;

    match out {
        Ok(version) => ServerStatus {
            reachable: true,
            version: Some(version),
            base_url: base,
            error: None,
        },
        Err(error) => ServerStatus {
            reachable: false,
            version: None,
            base_url: base,
            error: Some(error),
        },
    }
}

fn friendly_net_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "Ollama did not respond in time.".into()
    } else if e.is_connect() {
        "Could not connect to Ollama.".into()
    } else {
        format!("Request to Ollama failed: {e}")
    }
}

/// Starts `ollama serve` as a detached, window-less background process and waits
/// until the HTTP API answers. No-op when a server is already listening.
pub async fn start_server() -> Result<ServerStatus, String> {
    let current = status().await;
    if current.reachable {
        return Ok(current);
    }

    let mut cmd = Command::new("ollama");
    cmd.arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Ollama is not installed, or `ollama` is not on your PATH. Install it from ollama.com, then try again.".to_string()
        } else {
            format!("Could not start Ollama: {e}")
        }
    })?;
    remember_spawn(child.id());

    // The server needs a moment to bind. Poll rather than sleeping a fixed amount.
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(400)).await;
        let s = status().await;
        if s.reachable {
            return Ok(s);
        }
    }

    Err("Ollama was launched but never became reachable. Try running `ollama serve` in a terminal to see what it reports.".into())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LoadedModel {
    pub name: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub size_vram: u64,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Deserialize)]
struct PsBody {
    #[serde(default)]
    models: Vec<LoadedModel>,
}

pub async fn loaded_models() -> Result<Vec<LoadedModel>, String> {
    let base = base_url();
    let res = client(Duration::from_millis(3000))?
        .get(format!("{base}/api/ps"))
        .send()
        .await
        .map_err(|e| friendly_net_error(&e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama returned {} for /api/ps.", res.status()));
    }
    let body: PsBody = res
        .json()
        .await
        .map_err(|e| format!("Could not read the loaded-model list: {e}"))?;
    Ok(body.models)
}

#[derive(Serialize)]
struct GenerateReq<'a> {
    model: &'a str,
    prompt: &'a str,
    stream: bool,
    keep_alive: &'a str,
}

/// llama-server reports a failed load as a raw C++ diagnostic —
/// `alloc_tensor_range: failed to allocate CUDA_Host buffer of size 885035008`.
/// Accurate, and useless in a toast. The common causes get a sentence saying
/// what to do about them, with the original kept on the end for a bug report.
fn explain_load_failure(model: &str, message: &str) -> String {
    let lower = message.to_ascii_lowercase();
    let out_of_memory = lower.contains("out-of-memory")
        || lower.contains("out of memory")
        || lower.contains("failed to allocate")
        || lower.contains("unable to allocate")
        || lower.contains("cudamalloc")
        || lower.contains("insufficient memory");

    if out_of_memory {
        return format!(
            "`{model}` did not fit in memory. Close what is using your GPU or RAM, \
             lower the context window, or pick a smaller model. On Windows a small \
             fixed page file causes this even when RAM looks free — letting Windows \
             manage it usually fixes it.\n\nOllama said: {}",
            trim_detail(message)
        );
    }

    message.to_string()
}

/// Keeps the diagnostic readable: one line, and not the whole stack of them.
fn trim_detail(message: &str) -> String {
    let first = message.lines().next().unwrap_or(message).trim();
    if first.chars().count() > 200 {
        format!("{}…", first.chars().take(200).collect::<String>())
    } else {
        first.to_string()
    }
}

/// Loads a model into memory without producing any output — the API-level
/// equivalent of `ollama run <model>`, minus the console window.
pub async fn load_model(model: &str, keep_alive: &str) -> Result<(), String> {
    let base = base_url();
    let res = client(Duration::from_secs(600))?
        .post(format!("{base}/api/generate"))
        .json(&GenerateReq {
            model,
            prompt: "",
            stream: false,
            keep_alive,
        })
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!("`{model}` took too long to load.")
            } else {
                friendly_net_error(&e)
            }
        })?;

    if res.status().is_success() {
        return Ok(());
    }

    let code = res.status();
    let detail = res.text().await.unwrap_or_default();
    let message = serde_json::from_str::<serde_json::Value>(&detail)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
        .unwrap_or(detail);

    if code == reqwest::StatusCode::NOT_FOUND {
        Err(format!(
            "`{model}` is not installed. Pull it first with `ollama pull {model}`."
        ))
    } else if message.is_empty() {
        Err(format!("Ollama returned {code} while loading `{model}`."))
    } else {
        Err(explain_load_failure(model, &message))
    }
}

/// Unloads a model by asking Ollama to keep it alive for zero seconds.
pub async fn unload_model(model: &str) -> Result<(), String> {
    let base = base_url();
    let res = client(Duration::from_secs(30))?
        .post(format!("{base}/api/generate"))
        .json(&GenerateReq {
            model,
            prompt: "",
            stream: false,
            keep_alive: "0",
        })
        .send()
        .await
        .map_err(|e| friendly_net_error(&e))?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Ollama returned {} while unloading `{model}`.",
            res.status()
        ))
    }
}

/// Whether Lwen is the one that started the server currently answering.
#[derive(Serialize, Clone)]
pub struct OwnedBy {
    pub ours: bool,
    pub pid: Option<u32>,
}

pub fn ownership() -> OwnedBy {
    let pid = spawned_pid();
    OwnedBy {
        ours: pid.is_some(),
        pid,
    }
}

fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let out = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("Could not stop Ollama: {e}"))?;
        // 128 is "no such process": it is already gone, which is the goal.
        if out.success() || out.code() == Some(128) {
            return Ok(());
        }
        Err(format!("taskkill returned {}.", out.code().unwrap_or(-1)))
    }
    #[cfg(not(windows))]
    {
        let out = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("Could not stop Ollama: {e}"))?;
        if out.success() {
            Ok(())
        } else {
            Err("The Ollama process did not accept a stop signal.".into())
        }
    }
}

/// Stops every `ollama serve` on this machine, not only ours. Only ever reached
/// from an explicit click, never from app shutdown.
fn kill_any_serve() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let status = Command::new("taskkill")
            .args(["/IM", "ollama.exe", "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("Could not stop Ollama: {e}"))?;
        if status.success() || status.code() == Some(128) {
            return Ok(());
        }
        Err("Windows would not stop the Ollama process. It may be running as another user.".into())
    }
    #[cfg(not(windows))]
    {
        let status = Command::new("pkill")
            .args(["-f", "ollama serve"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("Could not stop Ollama: {e}"))?;
        // pkill exits 1 when nothing matched, which is not a failure here.
        if status.success() || status.code() == Some(1) {
            Ok(())
        } else {
            Err("Could not stop the Ollama process.".into())
        }
    }
}

/// Stops the server and waits for the port to actually go quiet, so the UI does
/// not flip back to "running" on the next poll.
pub async fn stop_server() -> Result<ServerStatus, String> {
    let current = status().await;
    if !current.reachable && spawned_pid().is_none() {
        return Ok(current);
    }

    let result = match spawned_pid() {
        Some(pid) => kill_pid(pid).or_else(|_| kill_any_serve()),
        None => kill_any_serve(),
    };
    forget_spawn();
    result?;

    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let s = status().await;
        if !s.reachable {
            return Ok(s);
        }
    }
    Err("Ollama was asked to stop but is still answering. It may be running as a system service.".into())
}

/// Best-effort shutdown from the app's exit handler, where nothing may await.
/// Only touches a server this run of Lwen started.
pub fn stop_spawned_blocking() {
    if let Some(pid) = spawned_pid() {
        let _ = kill_pid(pid);
        forget_spawn();
    }
}
