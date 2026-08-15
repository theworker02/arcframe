# Native accelerators

Small optional Rust and Go binaries that speed up specific jobs. TypeScript
(`@arcframe/core`, CLI, MCP) remains the control plane — natives are **never
required**. If a binary is missing, Arcframe falls back to the existing JS path.

| Binary | Language | Job | Why not TypeScript |
|--------|----------|-----|--------------------|
| `arcframe-hashwalk` | Rust | Parallel filesystem walk + SHA-256 + ignore rules | Rayon + `ignore` crate beat single-threaded Node walks on large trees; used for incremental index invalidation |
| `arcframe-gitmeta` | Go | Structured `status` / `blame` / `log` JSON | Fast porcelain/blame parsing into a stable JSON contract for engineering/MCP git helpers |

## Build

Prerequisites (optional): recent [Rust](https://rustup.rs/) (`cargo`) and/or [Go](https://go.dev/) (`go`).

From the repo root:

```bash
pnpm native:build
# or
node ./scripts/native-build.mjs
```

The script skips whichever toolchain is missing and always exits 0.

Manual builds:

```bash
# Rust
cd native/arcframe-hashwalk
cargo build --release
cargo test
# binary: target/release/arcframe-hashwalk[.exe]

# Go
cd native/arcframe-gitmeta
go test ./...
go build -o arcframe-gitmeta[.exe] .
```

`pnpm native:build` also copies release binaries into `native/bin/`.

## Discovery

TypeScript resolves binaries in this order (`@arcframe/core` → `resolveNativeBinary`):

1. **`ARCFRAME_NATIVE_DIR`** — directory containing the binaries
2. **`native/bin/`** under a repo root found by walking up from `cwd`
3. Per-crate outputs (`native/arcframe-hashwalk/target/release`, `native/arcframe-gitmeta/`)
4. **`PATH`**

Example:

```bash
export ARCFRAME_NATIVE_DIR=/path/to/arcframe/native/bin
arc index rebuild
```

## CLI contracts

### `arcframe-hashwalk <root> [--ignore-file PATH]`

Stdout: **JSON lines** (one object per file):

```json
{"path":"src/a.ts","hash":"<sha256 hex>","size":123,"mtime":1700000000000}
```

- `path` — POSIX path relative to root
- `hash` — SHA-256 of raw file bytes (matches `@arcframe/core` `hashContent` on buffers)
- Respects `.gitignore`, `.arcframeignore`, and Arcframe default ignore dirs

### `arcframe-gitmeta` (cwd = project root)

```text
arcframe-gitmeta status
arcframe-gitmeta blame <path>
arcframe-gitmeta log [limit]
```

Stdout: single JSON object matching the TypeScript `GitStatus` / blame / log shapes.

## Wiring

- **Index** — `@arcframe/analyzer` `Indexer` tries hashwalk first; on failure uses `listFilesRecursive` + `hashContent`
- **Git** — `@arcframe/engineering` `inspectGit` / `gitBlame` / `gitLog` try gitmeta first; on failure use `git` via `execCommand`

## CI

A dedicated `native` GitHub Actions job builds and tests these crates when Rust/Go are installed. The main Node matrix does not require them.
