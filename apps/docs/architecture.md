---
title: Architecture
---

# Architecture

One engine — surfaces are thin:

| Package | Role |
|---------|------|
| `@arcframe/core` | Config, paths, cache, events, DI, permissions, process |
| `@arcframe/storage` | SQLite (`node:sqlite`) |
| `@arcframe/analyzer` | Arc Index + language adapters + FS watcher |
| `@arcframe/graph` | Arc Graph + impact |
| `@arcframe/memory` | Memory, sessions, tasks, decisions |
| `@arcframe/context` | Budgeted context packs |
| `@arcframe/engineering` | Git, health, doctor, test/build/validate/review/changes |
| `@arcframe/workflows` | Arc Flows |
| `cli` | `arc` / `arcframe` |
| `servers/mcp` | MCP tools, resources, prompts |

Optional accelerators live under `native/` (Rust `arcframe-hashwalk`, Go `arcframe-gitmeta`). TypeScript remains the control plane; binaries are discovered via `ARCFRAME_NATIVE_DIR` / `native/bin` with JS fallback. See [native/README.md](https://github.com/theworker02/arcframe/blob/main/native/README.md).

Cursor plugin and docs/landing do not reimplement analysis.
