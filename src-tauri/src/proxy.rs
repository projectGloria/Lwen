//! A loopback pass-through to the Ollama API.
//!
//! Ollama's CORS allowlist accepts `http://localhost:<port>` (which is what the
//! Vite dev server serves from) but rejects `http://tauri.localhost`, the origin
//! of the packaged webview on Windows. Rather than asking every user to set
//! `OLLAMA_ORIGINS`, Lwen forwards `/api/*` through this proxy, which answers
//! preflights itself and streams response bodies straight through unbuffered so
//! token-by-token rendering still works.
//!
//! The listener binds to loopback only, and every request must carry the
//! session token below — a custom header, which forces any cross-origin caller
//! into a preflight it cannot satisfy without knowing the token.

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use std::sync::Arc;
use std::time::Duration;

pub const TOKEN_HEADER: &str = "x-lwen-token";
const MAX_REQUEST_BYTES: usize = 64 * 1024 * 1024;

/// Headers that describe a single hop and must not be forwarded verbatim.
const STRIPPED: [&str; 8] = [
    "host",
    "origin",
    "referer",
    "connection",
    "content-length",
    "accept-encoding",
    "keep-alive",
    "transfer-encoding",
];

struct Ctx {
    upstream: String,
    token: String,
    client: reqwest::Client,
}

pub struct Handle {
    pub port: u16,
    pub token: String,
}

pub fn spawn(upstream: String, token: String) -> Result<Handle, String> {
    // Bind synchronously so the port is known before the frontend boots.
    let std_listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Could not bind the local Ollama bridge: {e}"))?;
    std_listener
        .set_nonblocking(true)
        .map_err(|e| format!("Could not configure the local Ollama bridge: {e}"))?;
    let port = std_listener
        .local_addr()
        .map_err(|e| format!("Could not read the bridge address: {e}"))?
        .port();

    let client = reqwest::Client::builder()
        // No global timeout: a long generation is a long-lived response body.
        .connect_timeout(Duration::from_secs(5))
        .pool_idle_timeout(Duration::from_secs(90))
        .no_proxy()
        .build()
        .map_err(|e| format!("Could not create the bridge HTTP client: {e}"))?;

    let ctx = Arc::new(Ctx {
        upstream,
        token: token.clone(),
        client,
    });

    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(std_listener) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("lwen: bridge listener failed: {e}");
                return;
            }
        };
        let app = Router::new().fallback(any(handle)).with_state(ctx);
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("lwen: bridge stopped: {e}");
        }
    });

    Ok(Handle { port, token })
}

fn cors(headers: &mut HeaderMap) {
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST, DELETE, HEAD, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("content-type, x-lwen-token"),
    );
    headers.insert(
        header::ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_static("600"),
    );
}

fn error(status: StatusCode, message: &str) -> Response {
    let body = serde_json::json!({ "error": message }).to_string();
    let mut res = (status, body).into_response();
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    cors(res.headers_mut());
    res
}

async fn handle(State(ctx): State<Arc<Ctx>>, req: Request) -> Response {
    if req.method() == Method::OPTIONS {
        let mut res = StatusCode::NO_CONTENT.into_response();
        cors(res.headers_mut());
        return res;
    }

    let presented = req
        .headers()
        .get(TOKEN_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if presented != ctx.token {
        return error(StatusCode::FORBIDDEN, "Invalid bridge token.");
    }

    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| "/".into());
    let url = format!("{}{}", ctx.upstream, path_and_query);
    let method = req.method().clone();
    let in_headers = req.headers().clone();

    let body_bytes = match axum::body::to_bytes(req.into_body(), MAX_REQUEST_BYTES).await {
        Ok(b) => b,
        Err(_) => {
            return error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "The request was larger than Lwen's bridge allows.",
            )
        }
    };

    let mut out_headers = reqwest::header::HeaderMap::new();
    for (name, value) in in_headers.iter() {
        let key = name.as_str();
        if STRIPPED.contains(&key) || key == TOKEN_HEADER {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            reqwest::header::HeaderName::from_bytes(name.as_ref()),
            reqwest::header::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            out_headers.insert(n, v);
        }
    }
    // Identity encoding keeps the stream chunk-for-chunk with what Ollama emits.
    out_headers.insert(
        reqwest::header::ACCEPT_ENCODING,
        reqwest::header::HeaderValue::from_static("identity"),
    );

    let upstream = ctx
        .client
        .request(method, &url)
        .headers(out_headers)
        .body(body_bytes)
        .send()
        .await;

    let upstream = match upstream {
        Ok(r) => r,
        Err(e) => {
            let message = if e.is_connect() {
                "Ollama is not reachable. Start the server from the model menu, or run `ollama serve`."
            } else if e.is_timeout() {
                "Ollama did not respond in time."
            } else {
                "The request to Ollama failed."
            };
            return error(StatusCode::BAD_GATEWAY, message);
        }
    };

    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut res_headers = HeaderMap::new();
    for (name, value) in upstream.headers().iter() {
        let key = name.as_str();
        if key == "content-length"
            || key == "transfer-encoding"
            || key == "connection"
            || key.starts_with("access-control-")
        {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(name.as_ref()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            res_headers.insert(n, v);
        }
    }
    cors(&mut res_headers);

    let mut res = Response::builder().status(status);
    if let Some(h) = res.headers_mut() {
        *h = res_headers;
    }
    res.body(Body::from_stream(upstream.bytes_stream()))
        .unwrap_or_else(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Malformed upstream response."))
}
