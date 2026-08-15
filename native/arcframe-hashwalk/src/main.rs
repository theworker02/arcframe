//! Parallel filesystem walk + SHA-256 hashing for Arcframe index invalidation.
//!
//! Why Rust: rayon + the `ignore` crate give fast parallel walks with gitignore
//! semantics that are hard to match cheaply in single-threaded Node walks.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use clap::Parser;
use ignore::WalkBuilder;
use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};

/// Default directory names ignored even without a gitignore entry.
pub const DEFAULT_IGNORES: &[&str] = &[
    "node_modules",
    ".git",
    ".arcframe",
    "dist",
    "build",
    "out",
    "coverage",
    ".turbo",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "target",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
    ".cache",
    "tmp",
    "temp",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileEntry {
    pub path: String,
    pub hash: String,
    pub size: u64,
    pub mtime: u64,
}

#[derive(Parser, Debug)]
#[command(
    name = "arcframe-hashwalk",
    about = "Parallel walk + SHA-256 for Arcframe incremental index invalidation"
)]
struct Cli {
    /// Project root to walk
    #[arg(value_name = "ROOT")]
    root: PathBuf,

    /// Extra ignore file (in addition to .gitignore / .arcframeignore)
    #[arg(long)]
    ignore_file: Option<PathBuf>,

    /// Cap parallel hash workers (0 = rayon default)
    #[arg(long, default_value_t = 0)]
    threads: usize,
}

fn main() {
    let cli = Cli::parse();
    if cli.threads > 0 {
        rayon::ThreadPoolBuilder::new()
            .num_threads(cli.threads)
            .build_global()
            .ok();
    }

    match walk_and_hash(&cli.root, cli.ignore_file.as_deref()) {
        Ok(entries) => {
            let stdout = io::stdout();
            let mut out = stdout.lock();
            for entry in entries {
                if let Ok(line) = serde_json::to_string(&entry) {
                    let _ = writeln!(out, "{line}");
                }
            }
        }
        Err(err) => {
            eprintln!("arcframe-hashwalk: {err}");
            std::process::exit(1);
        }
    }
}

/// Walk `root`, applying ignore rules, and return hashed file entries (POSIX paths).
pub fn walk_and_hash(
    root: &Path,
    extra_ignore: Option<&Path>,
) -> Result<Vec<FileEntry>, String> {
    let root = fs::canonicalize(root).map_err(|e| format!("canonicalize root: {e}"))?;

    let mut builder = WalkBuilder::new(&root);
    builder.hidden(false);
    builder.git_ignore(true);
    builder.git_global(false);
    builder.git_exclude(true);
    builder.require_git(false);

    // Project ignore files (gitignore format)
    let arcframe_ignore = root.join(".arcframeignore");
    if arcframe_ignore.is_file() {
        builder.add_ignore(arcframe_ignore);
    }
    if let Some(extra) = extra_ignore {
        let path = if extra.is_absolute() {
            extra.to_path_buf()
        } else {
            root.join(extra)
        };
        if path.is_file() {
            builder.add_ignore(path);
        }
    }

    // Filter default ignore names via filter_entry
    let root_for_filter = root.clone();
    builder.filter_entry(move |entry| {
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(&root_for_filter) else {
            return true;
        };
        for component in rel.components() {
            let name = component.as_os_str().to_string_lossy();
            if DEFAULT_IGNORES.iter().any(|d| *d == name) {
                return false;
            }
        }
        true
    });

    // Collect file paths first (sequential walk is already filtered/fast)
    let mut paths: Vec<PathBuf> = Vec::new();
    for result in builder.build() {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            paths.push(entry.into_path());
        }
    }

    let root_ref = &root;
    let mut entries: Vec<FileEntry> = paths
        .par_iter()
        .filter_map(|path| hash_file(root_ref, path).ok())
        .collect();

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

fn hash_file(root: &Path, path: &Path) -> Result<FileEntry, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = hex_encode(&hasher.finalize());

    let rel = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");

    Ok(FileEntry {
        path: rel,
        hash,
        size,
        mtime,
    })
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0xf) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn hashes_and_ignores_defaults() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("a.txt"), b"hello").unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules").join("skip.js"), b"nope").unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src").join("b.txt"), b"world").unwrap();

        let mut ignore = fs::File::create(root.join(".arcframeignore")).unwrap();
        writeln!(ignore, "secret.bin").unwrap();
        fs::write(root.join("secret.bin"), b"x").unwrap();

        let entries = walk_and_hash(root, None).unwrap();
        let paths: Vec<_> = entries.iter().map(|e| e.path.as_str()).collect();
        assert!(paths.contains(&"a.txt"));
        assert!(paths.contains(&"src/b.txt"));
        assert!(!paths.iter().any(|p| p.contains("node_modules")));
        assert!(!paths.contains(&"secret.bin"));

        let a = entries.iter().find(|e| e.path == "a.txt").unwrap();
        assert_eq!(a.size, 5);
        assert_eq!(a.hash.len(), 64);
        // sha256("hello")
        assert_eq!(
            a.hash,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn posix_paths_in_entries() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("nested")).unwrap();
        fs::write(dir.path().join("nested").join("c.txt"), b"c").unwrap();
        let entries = walk_and_hash(dir.path(), None).unwrap();
        assert_eq!(entries[0].path, "nested/c.txt");
        assert!(!entries[0].path.contains('\\'));
    }
}
