use ignore::WalkBuilder;
use serde::Serialize;
use std::path::Path;

/// Directories that are almost never worth indexing, on top of whatever
/// `.gitignore` already excludes.
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "dist",
    "build",
    "out",
    "target",
    "venv",
    ".venv",
    "__pycache__",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".cache",
    ".turbo",
    ".parcel-cache",
    "coverage",
    "vendor",
    "bower_components",
    "jspm_packages",
    "site-packages",
    ".mypy_cache",
    ".pytest_cache",
    ".tox",
    ".gradle",
    ".terraform",
    ".idea",
    "Pods",
    "obj",
    "bin",
];

/// Extensions Lwen will read as text.
const TEXT_EXTS: &[&str] = &[
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "py", "pyi", "java", "kt", "kts", "c",
    "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "go", "rs", "rb", "php", "swift", "m", "mm",
    "scala", "clj", "cljs", "ex", "exs", "erl", "hs", "lua", "dart", "r", "jl", "pl", "pm", "vb",
    "fs", "fsx", "html", "htm", "vue", "svelte", "astro", "css", "scss", "sass", "less", "json",
    "jsonc", "json5", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties", "xml",
    "svg", "md", "mdx", "markdown", "rst", "txt", "sql", "graphql", "gql", "prisma", "proto",
    "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd", "makefile", "mk", "cmake",
    "dockerfile", "gitignore", "editorconfig", "gradle", "tf", "tfvars", "csv", "tsv", "lock",
    "log", "patch", "diff", "s", "asm", "zig", "nim", "v", "sol", "tex", "bib", "adoc", "org",
];

/// Extension-less files worth including by name.
const TEXT_NAMES: &[&str] = &[
    "makefile",
    "dockerfile",
    "readme",
    "license",
    "licence",
    "changelog",
    "contributing",
    "authors",
    "notice",
    "codeowners",
    "procfile",
    "gemfile",
    "rakefile",
    "brewfile",
    "justfile",
    "vagrantfile",
];

const MAX_FILES: usize = 6000;
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
const BINARY_PROBE: usize = 8192;

#[derive(Serialize)]
pub struct ScanEntry {
    pub path: String,
    pub rel: String,
    pub size: u64,
    pub ext: String,
}

#[derive(Serialize)]
pub struct ScanResult {
    pub root: String,
    pub name: String,
    pub files: Vec<ScanEntry>,
    pub total_bytes: u64,
    /// Hit the file-count ceiling; `files` is a prefix of what is on disk.
    pub truncated: bool,
    pub skipped_large: usize,
    pub skipped_binary: usize,
}

fn is_text_candidate(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if TEXT_EXTS.contains(&ext.to_ascii_lowercase().as_str()) {
            return true;
        }
    }
    // `.gitignore`, `.env.local`, `Dockerfile.dev`, `README` …
    let stem = name.split('.').next().unwrap_or_default();
    if TEXT_NAMES.contains(&stem) {
        return true;
    }
    if name.starts_with('.') {
        let bare = name.trim_start_matches('.');
        let bare = bare.split('.').next().unwrap_or_default();
        return TEXT_EXTS.contains(&bare) || TEXT_NAMES.contains(&bare);
    }
    false
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .take(BINARY_PROBE)
        .any(|b| *b == 0)
}

pub fn scan(root: &str) -> Result<ScanResult, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("`{root}` is not a folder, or is no longer available."));
    }

    let mut files = Vec::new();
    let mut total_bytes = 0u64;
    let mut skipped_large = 0usize;
    let mut truncated = false;

    let walker = WalkBuilder::new(root_path)
        .hidden(true)
        .parents(false)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(true)
        // Honour .gitignore even when the folder is not a git repository.
        .require_git(false)
        .follow_links(false)
        .max_depth(Some(24))
        .filter_entry(|entry| {
            if entry.file_type().is_some_and(|t| t.is_dir()) {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                return !IGNORED_DIRS.iter().any(|d| d.eq_ignore_ascii_case(&name));
            }
            true
        })
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // unreadable path: skip rather than fail the scan
        };
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let path = entry.path();
        if !is_text_candidate(path) {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        if size > MAX_FILE_BYTES {
            skipped_large += 1;
            continue;
        }
        if total_bytes + size > MAX_TOTAL_BYTES {
            truncated = true;
            break;
        }
        if files.len() >= MAX_FILES {
            truncated = true;
            break;
        }

        let rel = path
            .strip_prefix(root_path)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        total_bytes += size;
        files.push(ScanEntry {
            path: path.to_string_lossy().to_string(),
            rel,
            size,
            ext,
        });
    }

    files.sort_by(|a, b| a.rel.cmp(&b.rel));

    let name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string());

    Ok(ScanResult {
        root: root_path.to_string_lossy().to_string(),
        name,
        files,
        total_bytes,
        truncated,
        skipped_large,
        skipped_binary: 0,
    })
}

#[derive(Serialize)]
pub struct FileText {
    pub path: String,
    pub text: String,
    pub truncated: bool,
    pub error: Option<String>,
}

fn read_one(path: &str, max_bytes: usize) -> FileText {
    match std::fs::read(path) {
        Ok(bytes) => {
            if looks_binary(&bytes) {
                return FileText {
                    path: path.to_string(),
                    text: String::new(),
                    truncated: false,
                    error: Some("binary".into()),
                };
            }
            let truncated = bytes.len() > max_bytes;
            let slice = if truncated {
                // Cut on a char boundary so lossy decoding stays clean.
                let mut end = max_bytes;
                while end > 0 && (bytes[end] & 0xC0) == 0x80 {
                    end -= 1;
                }
                &bytes[..end]
            } else {
                &bytes[..]
            };
            FileText {
                path: path.to_string(),
                text: String::from_utf8_lossy(slice).into_owned(),
                truncated,
                error: None,
            }
        }
        Err(e) => FileText {
            path: path.to_string(),
            text: String::new(),
            truncated: false,
            error: Some(e.to_string()),
        },
    }
}

pub fn read_files(paths: Vec<String>, max_bytes: usize) -> Vec<FileText> {
    paths.iter().map(|p| read_one(p, max_bytes)).collect()
}

pub fn read_text(path: &str) -> Result<String, String> {
    let out = read_one(path, 4 * 1024 * 1024);
    match out.error {
        Some(e) if e == "binary" => Err("That file is not text.".into()),
        Some(e) => Err(e),
        None => Ok(out.text),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // Each test gets its own directory: these run in parallel in one process,
    // so a shared name would let one test wipe another's fixture mid-scan.
    fn fixture(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("lwen-scan-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(dir.join("dist")).unwrap();
        fs::create_dir_all(dir.join("secret")).unwrap();

        fs::write(dir.join(".gitignore"), "secret/\n*.tmp\n").unwrap();
        fs::write(dir.join("src/main.rs"), "fn main() { println!(\"hi\"); }").unwrap();
        fs::write(dir.join("src/app.js"), "export const x = 1").unwrap();
        fs::write(dir.join("README.md"), "# readme").unwrap();
        fs::write(dir.join("Makefile"), "all:\n\techo hi").unwrap();
        fs::write(dir.join("node_modules/pkg/index.js"), "module.exports = {}").unwrap();
        fs::write(dir.join("dist/bundle.js"), "minified").unwrap();
        fs::write(dir.join("secret/keys.json"), "{}").unwrap();
        fs::write(dir.join("scratch.tmp"), "temp").unwrap();
        fs::write(dir.join("logo.png"), [0x89u8, 0x50, 0x4e, 0x47]).unwrap();
        fs::write(dir.join("data.bin"), [0x01u8, 0x00, 0x02, 0x00]).unwrap();
        dir
    }

    #[test]
    fn scan_applies_every_exclusion_rule() {
        let dir = fixture("exclusions");
        let result = scan(dir.to_str().unwrap()).unwrap();
        let rels: Vec<&str> = result.files.iter().map(|f| f.rel.as_str()).collect();

        assert!(rels.contains(&"src/main.rs"), "source files are included");
        assert!(rels.contains(&"src/app.js"));
        assert!(rels.contains(&"README.md"));
        assert!(rels.contains(&"Makefile"), "extension-less known names are included");

        assert!(!rels.iter().any(|r| r.starts_with("node_modules")), "node_modules is skipped");
        assert!(!rels.iter().any(|r| r.starts_with("dist")), "build output is skipped");
        assert!(!rels.iter().any(|r| r.starts_with("secret")), ".gitignore dir rule is honoured");
        assert!(!rels.contains(&"scratch.tmp"), ".gitignore glob rule is honoured");
        assert!(!rels.contains(&"logo.png"), "binary extensions are skipped");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reader_rejects_binary_and_reports_paths() {
        let dir = fixture("reader");
        let bin = dir.join("data.bin").to_string_lossy().to_string();
        let src = dir.join("src/main.rs").to_string_lossy().to_string();

        let out = read_files(vec![bin, src.clone()], 512 * 1024);
        assert_eq!(out[0].error.as_deref(), Some("binary"));
        assert!(out[1].error.is_none());
        assert!(out[1].text.contains("fn main"));
        assert_eq!(out[1].path, src);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn truncation_stops_on_a_char_boundary() {
        let dir = std::env::temp_dir().join(format!("lwen-utf8-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("wide.txt");
        // Multi-byte characters straddling the cut point must not corrupt output.
        fs::write(&path, "é".repeat(100)).unwrap();

        let out = read_files(vec![path.to_string_lossy().to_string()], 51);
        assert!(out[0].truncated);
        assert!(!out[0].text.contains('\u{FFFD}'), "no replacement characters");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_folder_is_an_error_not_a_panic() {
        assert!(scan("Z:/definitely/not/here").is_err());
    }
}
