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

Cursor plugin and docs/landing do not reimplement analysis.
