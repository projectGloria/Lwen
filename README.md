# Lwen

A local-first desktop client for [Ollama](https://ollama.com). Chat with models
running on your own machine, attach documents, or point a conversation at a
folder of code and ask questions about it.

Built with Tauri 2 (Rust) + React 19 + Vite. It uses the OS webview rather than
bundling a browser engine, so idle memory sits in the tens of megabytes instead
of the hundreds.

---

## Prerequisites

| | |
|---|---|
| **Node.js** | 18 or newer (`node --version`) |
| **Rust** | stable toolchain via [rustup](https://rustup.rs) (`rustc --version`) |
| **Ollama** | installed and on your `PATH` — [ollama.com/download](https://ollama.com/download) |
| **Windows** | WebView2 runtime (preinstalled on Windows 10 21H2+ and Windows 11) |
| **Linux** | `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `build-essential` |
| **macOS** | Xcode Command Line Tools (`xcode-select --install`) |

The Tauri CLI comes in as a dev dependency — there is nothing to install
globally.

Pull at least one model before you start:

```bash
ollama pull qwen2.5-coder:7b
```

Lwen never starts Ollama on its own — not at launch, and not on your first
message. Start it from the Ollama pill in the top bar when you want it, and it
launches with no console window. Stop it from the same place. If Lwen was what
started the server, it also stops it when you close Lwen; a server that was
already running when Lwen opened is left exactly as it was found.

While the server is up, Lwen puts an entry in the system tray with the running
version, how many models are resident, and a way to stop it or quit.

## Install

```bash
npm install
```

## Run in development

```bash
npm run tauri dev
```

Vite serves the frontend on port 1420 with hot reload; the Rust side rebuilds
on change. The first run compiles the Rust dependencies and takes a few
minutes — after that it is seconds.

## Build the .exe

```bash
npm run tauri build
```

Output lands in `src-tauri/target/release/`:

- `Lwen.exe` — the standalone executable
- `bundle/nsis/Lwen_1.0.0_x64-setup.exe` — an installer

To produce an MSI as well, add `"msi"` to `bundle.targets` in
`src-tauri/tauri.conf.json`. On macOS and Linux, replace it with `"dmg"` or
`"deb"`/`"appimage"`.

---

## Validation

Run `npm test` for regression checks covering persistence, project indexing,
worker cancellation, and attachment retries. Run `npm run build` to check the
production frontend, including its indexing worker. Desktop smoke tests require
`src-tauri/`, which is not included in this checkout.

## How it works

### The Ollama bridge

Ollama enforces a CORS allowlist. It accepts `http://localhost:1420` (the dev
server) but **rejects `http://tauri.localhost`**, which is the origin a packaged
Tauri app serves from on Windows — a request from the built `.exe` gets a bare
`403`. Rather than asking you to set `OLLAMA_ORIGINS` by hand, Lwen's Rust side
opens a small forwarder on a random loopback port, answers CORS preflights
itself, and streams response bodies straight through without buffering.

The frontend still does an ordinary `fetch()` and reads `response.body` as a
`ReadableStream`, token by token — it just points at the bridge. This also works
when Ollama runs as a background service you did not start, which is the usual
case on Windows.

The bridge binds to `127.0.0.1` only and requires a per-run secret header, so a
web page in your browser cannot reach it even if it guesses the port.

### Starting and stopping Ollama

The tray entry exists *only* while Ollama is reachable, so the icon means one
thing and one thing only: the server is running. It is driven from the poll the
frontend already runs, rather than a second timer in Rust.

Stopping is asymmetric on purpose. A server Lwen started is Lwen's to clean up,
and it goes away on exit without asking. A server Lwen found already running
might belong to the Ollama desktop app, a terminal, or another client — stopping
that one is possible, but only from an explicit click, and it asks first.

### Rust surface

The Rust side is deliberately small — process control, filesystem, and
scanning only. All chat logic, file parsing and UI live in React.

| Command | Purpose |
|---|---|
| `runtime_info` | Bridge URL and session token |
| `ollama_status` / `start_ollama` / `stop_ollama` | Health check; spawn `ollama serve` window-less; stop it again |
| `ollama_ownership` | Whether this run of Lwen is what started the server |
| `sync_tray` | Show, update or remove the tray entry |
| `run_model` / `stop_model` / `loaded_models` | Load a model into memory, unload it, list what is resident |
| `scan_folder` | Walk a project, honouring `.gitignore` and common build dirs |
| `read_files` / `read_text_file` / `read_file_bytes` | Bulk text for indexing; bytes for attachments |
| `path_kind` | Distinguish file, directory, missing |
| `load_users` / `save_users` | The local account list |
| `load_library` / `save_library` | One account's projects and conversations |
| `load_trash` / `save_trash` | One account's deleted conversations and projects |
| `load_stats` / `save_stats` | One account's usage counters |
| `user_folder` / `adopt_legacy_library` | Locate an account's folder; hand a pre-accounts library to the first account |

### File relevance

With a folder open, Lwen indexes every text file into an inverted index of
terms → (file, frequency), splitting `camelCase` and `snake_case` into parts so
`getUserName` also matches "user" and "name".

For each question it scores files by IDF-weighted term frequency, then adds:

- a large boost when the question names a file literally ("what does `login.js` do")
- a boost when a query term appears at a definition site (`function x`, `class x`, `def x`)
- smaller boosts for entry-point names and shallow paths
- a length penalty so big files do not crowd out precise ones

Files you pin in the sidebar are always included first. The rest are packed in
by score until the token budget runs out, and every reply lists exactly which
files were used — and how many were left out.

This is deliberately **not** an embeddings pipeline. Keyword matching costs
nothing at query time, needs no model call, and is easy to reason about when it
picks the wrong file. Semantic search over Ollama's `/api/embed` would be the
natural upgrade if the keyword approach starts missing things — it is an
additive change to `src/lib/relevance.js` and would not disturb the rest.

### Context budget

Token counts are estimated (Ollama exposes no tokenizer), erring slightly high.
The budget is spent in priority order: system prompt, your message, attachments,
pinned files, ranked project files, then conversation history. If your
attachments alone will not fit, Lwen **tells you before you send** rather than
quietly dropping half the prompt.

Conversation history is replayed as your raw text — the file context attached to
an earlier turn is not re-sent, which would otherwise compound every message.

### Supported attachments

Code and config files, `.txt`, `.md`, `.json`, `.csv`/`.tsv`, `.pdf`, `.docx`.

PDFs are plain text extraction only. A scanned PDF has no text layer, and Lwen
does not run OCR — it will say so rather than attaching an empty file.

Attachment text is saved with its message so **Regenerate** can reuse the
original files. Older messages that saved only attachment names require you to
reattach the files in a new message; their existing replies are kept.

### Projects and conversations

A project groups conversations, a codebase folder, an icon and its model
settings. **Right-click** anything in the library — a card on the dashboard, a
row in the sidebar, the project name in the chat breadcrumb — for the same menu:
edit, change icon, open the folder, duplicate, delete.

*Open in detailed view* (also the project name in the breadcrumb, or `/grid`)
lays every conversation in that project out as a grid, with the first thing you
said as the preview, and search across their contents.

Icons are an emoji from the built-in palette or any image file, cropped square
and shrunk to a 96px thumbnail before it is stored. Projects, conversations and
models all take one; a model's icon overrides the family mark Lwen guesses from
its name, which is useful for fine-tunes and local builds.

### Slash commands

Type `/` at the start of an empty message. Built-ins cover the app — `/new`,
`/clear`, `/retry`, `/files`, `/model`, `/run`, `/unload`, `/settings`, `/grid`,
`/stats`, `/commands`, `/help` — and you can add your own from *Slash commands*
in the account menu.

A command of your own is a saved piece of text. Picking it drops that text into
the composer so you can read and edit it before sending, rather than firing a
request you did not see. `{input}` inside it is replaced by whatever you typed
after the command; without it, that text is appended.

### Statistics

*Statistics* in the account menu shows time spent in Lwen, keystrokes, questions
asked and replies received, with a two-week activity strip. The session clock
also sits above the account row in the sidebar, next to the project and
conversation counts.

Time only accrues while the window is on screen and something has been touched
in the last five minutes, so an app left open overnight does not count as use.
None of it leaves the machine.

## Accounts

Several people can share one desktop without sharing a library. On first launch
Lwen asks for a name; a passcode is optional and, when set, is stored as a
PBKDF2-SHA256 hash rather than as text. **Nothing here is encryption** — an
account keeps libraries apart, it does not protect them from anyone with access
to the disk.

*Switch user* from the account row at the foot of the sidebar (or the chip in
the dashboard's top bar) returns to that screen. Profile pictures are square
cropped to 256px and stored inline with the account.

## Where data lives

Each account gets a folder of its own, named after the account, under the app
data directory:

- Windows — `%APPDATA%\com.lwen.desktop\`
- macOS — `~/Library/Application Support/com.lwen.desktop/`
- Linux — `~/.local/share/com.lwen.desktop/`

```
users.json          every account: name, picture, passcode hash
Nihil/
  library.json      projects, conversations, per-project settings, preferences
  trash.json        deleted conversations and projects, kept 30 days
  stats.json        usage counters
Ada/
  library.json
  trash.json
  stats.json
```

Statistics are kept apart from the library because they change on every
keystroke; folding them in would rewrite the whole history several times a
minute.

*Open my folder* in the account menu reveals it in the file manager. Deleting a
conversation or a project moves it to `trash.json`, where **Recently deleted**
offers it back until you empty it or 30 days pass.

Library writes checkpoint continuous edits and flush before switching accounts or
closing the window. Failed reads stop loading without overwriting saved data. Project file indexes are **not** persisted —
they are rebuilt when you open a project, which also picks up any edits made
outside Lwen. An install that predates accounts hands its old
`library.json` to the first account created, keeping the original as
`library.json.pre-accounts`.

Nothing leaves your machine.

## Keyboard

| | |
|---|---|
| `Enter` | Send |
| `Shift` + `Enter` | New line |
| `/` | Commands, at the start of an empty message |
| `Ctrl` + `N` | New conversation |
| `Ctrl` + `B` | Show or hide the sidebar |
| `Ctrl` + `/` | Shortcuts and commands |
| `Ctrl` + `K` or `/` | Search projects (dashboard) |
| Right-click | Menu for a project, conversation or model |
| `Esc` | Close dialog or panel |

## Project layout

```
src/
  lib/         backend bridge, ollama client, file extraction, relevance
               scoring, context assembly, token estimates, icons, commands
  state/       store (library), auth (accounts), stats (usage),
               library (shared project/chat actions and their dialogs)
  hooks/       ollama lifecycle, project index, chat streaming, model icons,
               toasts
  components/
    dashboard/ project grid
    project/   one project's conversations as a grid
    library/   project modal, icon modal, commands modal, shared menus
    chat/      ChatView, Sidebar, FolderTree, MessageList, ChatMessage,
               Markdown, CodeBlock, MessageInput, CommandPalette,
               ModelSelector, ModelControls, OllamaPill, ConfigPanel,
               FileViewer, ShortcutsModal
    ui/        toasts, menus, context menus, popovers, modals, icon picker
src-tauri/
  src/         lib.rs (commands), ollama.rs, proxy.rs, scan.rs, store.rs,
               tray.rs
```

## Troubleshooting

**"Ollama offline"** — click the status bar at the bottom of the sidebar to
start it. If that fails, run `ollama serve` in a terminal to see what it
reports. If `OLLAMA_HOST` is set, Lwen honours it.

**"No models installed"** — `ollama pull qwen2.5-coder:7b`, then hit Refresh in
the model popover.

**A reply stops early** — the model hit its context window. Raise it in the
Configuration panel, or unpin some files.

**Folder scan finds nothing** — Lwen skips binaries, files over 512 KB, and
anything matched by `.gitignore` or a common build directory.
