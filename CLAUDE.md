# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                 # once; the Tauri CLI is a dev dependency, nothing global
npm run tauri dev           # full app: Vite on :1420 + Rust rebuild (first run compiles Rust, minutes)
npm run tauri build         # -> src-tauri/target/release/Lwen.exe + bundle/nsis/*-setup.exe
npm run dev                 # frontend only in a browser; every backend call fails (no Tauri IPC)
cargo check                 # from src-tauri/, fastest way to check Rust without a webview build
```

There is no test runner, linter, or formatter configured. Do not add one unasked; verify changes by running the app.

Requires Ollama on `PATH` and at least one pulled model (`ollama pull qwen2.5-coder:7b`).

## Architecture

Tauri 2 (Rust) + React 19 + Vite 7 + Tailwind 4. The Rust side is deliberately thin — process control, filesystem, scanning, and an HTTP forwarder. **All chat logic, context assembly, relevance scoring, and file parsing live in JS.** When adding a feature, the default is that it belongs in `src/`, not `src-tauri/`.

### The Ollama bridge (why `fetch` does not go to :11434)

Ollama's CORS allowlist rejects `http://tauri.localhost`, the origin a packaged Tauri app serves from on Windows, so a built `.exe` calling Ollama directly gets a bare `403`. `src-tauri/src/proxy.rs` opens an axum listener on a random loopback port that answers preflights itself and streams bodies through unbuffered. `runtime_info` hands the frontend `{ api_base, token_header, token }`; every request must carry the per-run token header, which forces any other origin into a preflight it cannot satisfy.

Consequence for frontend code: **never build a URL against `ollama_base` or a hardcoded port.** Use `apiBase()` + `authHeaders()` from `src/lib/backend.js`. `initRuntime()` runs once in `App.jsx` before anything renders; a failure there is a hard error screen, not a degraded mode.

### Frontend layering

- `src/lib/backend.js` — the *only* place that calls `invoke()`. Its `call()` wrapper converts Rust's `Result<T, String>` rejections (bare strings) into real `Error`s, so `e.message` works everywhere upstream. Add new Tauri commands to the `backend` object here rather than importing `invoke` elsewhere.
- `src/lib/ollama.js` — `/api/tags`, `/api/show`, and `streamChat` (NDJSON reader over `response.body`). Throws `OllamaError` with a `kind` (`offline` | `model` | `memory` | `http` | `network`); the UI branches on `kind`, and out-of-memory / model-not-installed messages are rewritten into actionable text here.
- `src/lib/relevance.js` — inverted index over identifier tokens (`getUserName` also indexes `get`/`user`/`name`), IDF-weighted scoring plus boosts for literal filename mentions, definition sites, entry-point names, and shallow paths. Explicitly *not* embeddings; a semantic upgrade would be additive inside this file.
- `src/lib/context.js` — `buildRequest()` assembles the `/api/chat` payload against the token budget in priority order: system prompt → user message → attachments → pinned files → ranked project files → history. Two invariants: history is replayed as the user's **raw** text (earlier turns' file context is never re-sent, which would compound every message), and overflow surfaces as a `warnings[]` entry shown to the user rather than a silent truncation.
- `src/lib/tokens.js` — heuristic estimator, biased high on purpose (Ollama has no tokenizer endpoint). Under-estimating truncates conversations silently; over-estimating just wastes a little context.

### State

Four React contexts, nested in `App.jsx` as auth → store → stats → library:

- `src/state/auth.jsx` — the account list (`users.json`). Passcodes are PBKDF2-SHA256 hashes via WebCrypto; this separates libraries, it is not encryption.
- `src/state/store.jsx` — one account's library, a `useReducer` over projects → chats → messages, plus account-wide `prefs` (model icons, custom slash commands). `StoreProvider` is keyed on the account name, so switching users tears the tree down and reloads from that account's folder. Writes are debounced (700ms library, 500ms trash), diffed against the last write, and tagged with an `owner` ref so a save scheduled just before a switch cannot land in the next account's folder. Trash lives in its own file so a deletion survives a crash mid-write of the much larger library. `serialize()` strips `streaming`/`pending` fields — never persist transient message state.
- `src/state/stats.jsx` — usage counters in `stats.json`. **Held in a ref, read through `snapshot()`, never in React state**: counting keystrokes would otherwise re-render the whole app on every key. Screens that display these poll on their own 1s interval. Writes are debounced 15s and flushed on hide/unmount.
- `src/state/library.jsx` — every dialog-opening or destructive action on a project or conversation, with the dialogs themselves mounted once. Four surfaces (dashboard grid, sidebar tree, project detail, chat breadcrumb) offer the same menu; put a new library action here rather than giving a fifth component its own modal state. `components/library/Menus.jsx` holds the shared menu bodies.

### Views

`state.view` is `dashboard` | `project` | `chat`, resolved by `Router` in `App.jsx`. `project` is the detail grid of one project's conversations (`components/project/ProjectView.jsx`).

Project file indexes are **not** persisted. `useProjectIndex` rebuilds them on open (module-level `cache` keyed by folder root), which also picks up edits made outside Lwen.

### Streaming a turn

`src/hooks/useChat.js` owns one turn. Tokens accumulate in a ref and flush to the store on `requestAnimationFrame` — a fast local model emits far more tokens than React should re-render for. Follow that pattern for any other high-frequency stream. `useOllama` polls every 6s and compares status/loaded-model shape before calling `setState`, because a new-but-equal object would re-render the whole app on a timer.

Resident-model state has two traps. Ollama loads a model on demand at the first request, so the `/api/ps` list is stale for up to a poll interval after a reply starts — `ChatView` calls `ollama.refreshLoaded()` on every `streaming` transition to close that gap. And `/api/tags` and `/api/ps` do not always spell a model the same way, so compare names through `sameModel()` in `useOllama`, never with `===`.

### Ollama lifecycle

**Lwen never starts Ollama implicitly** — not at launch, not on the first message. `startServer()` is only ever reached from a click in `OllamaPill`/`OllamaControls`. Keep it that way.

Stopping is asymmetric and deliberate: `ollama.rs` records the child pid when Lwen spawns the server, `stop_spawned_blocking()` on `RunEvent::Exit` kills only that one, and stopping a server Lwen did not start requires an explicit click and a confirmation. The tray entry (`src-tauri/src/tray.rs`) exists only while the server is reachable, driven by the frontend's poll through `sync_tray` rather than a second timer in Rust.

### Rust modules

`lib.rs` (command registration, session token, window reveal via `app_ready`, exit hook) · `ollama.rs` (status, window-less `ollama serve` spawn, spawned-pid tracking, stop, `/api/ps`, honours `OLLAMA_HOST`) · `proxy.rs` (the bridge) · `tray.rs` (the tray entry, created and torn down by `sync_tray`) · `scan.rs` (`ignore`-crate walk honouring `.gitignore` plus a build-dir denylist; 6000 files / 512 KB per file / 64 MB total caps, binary probe) · `store.rs` (per-account folders, atomic temp-file-then-rename writes, `folder_name()` sanitizes an account name to one path component and dodges Windows reserved device names).

New Tauri command checklist: write it in the right module, add it to `generate_handler!` in `lib.rs`, add a wrapper to `backend` in `src/lib/backend.js`. Plugin permissions go in `src-tauri/capabilities/default.json`; the CSP in `tauri.conf.json` already allows loopback `connect-src` for the bridge.

### Menus, dialogs and icons

`Menu` in `ui/Overlays.jsx` takes either an element (hangs under it) or a `{x, y}` point — `useContextMenu()` turns a right-click into the latter. Right-click menus are expected on every library row; wire them through `useContextMenu` rather than hand-rolling positioning. A dialog opened from inside a menu or popover is that overlay's *child*, so both close-on-outside-click handlers ignore clicks landing in a `.modal-veil`.

An icon is `{ kind: 'emoji' | 'image', value }` or null, rendered by `IconGlyph` and picked by `IconPicker` (`ui/IconPicker.jsx`). Images are cropped square and shrunk to `ICON_PX` (96) before storage because they live inside `library.json`. Model icons are keyed by full model name in `prefs.modelIcons` via `useModelIcons`, deliberately not stored beside the model — Ollama owns that list.

### Slash commands

`src/lib/commands.js` defines built-in **actions** (handled by `runCommand` in `ChatView`) and user **prompts** (saved text). A prompt is dropped into the composer to be read and edited, never sent directly — keep that distinction when adding commands. Adding a built-in means adding to `BUILT_INS` *and* a case in `ChatView.runCommand`.

## Conventions

- Styling is a hand-written stylesheet, `src/styles/index.css` (~1050 lines) with semantic class names (`.view`, `.topnav`, `.card`) over CSS variables. Tailwind 4 is installed and its `@theme` tokens mirror the same palette, but components mostly use the semantic classes. Match whichever the file you are editing already uses; put new colors in both variable blocks.
- Dark theme only, fixed palette (`#1C1C1A` ground, `#D97757` accent). The Tauri window declares the same background so there is no white flash.
- User-facing error strings are full sentences that say what to do next ("Lower the context window in Configuration…"), not error codes. This is a consistent, deliberate voice across both Rust and JS — keep it.
- Comments in this codebase explain *why* a non-obvious decision was made, and are load-bearing. Preserve them when editing nearby code.
- `README.md` documents the same architecture for end users; update it when behavior described there changes.
