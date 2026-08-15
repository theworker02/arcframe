---
title: Troubleshooting
---

# Troubleshooting

| Symptom | Fix |
|---------|-----|
| `NOT_INITIALIZED` | `arc init` |
| Empty index | `arc index rebuild` |
| MCP tools fail | Set `ARCFRAME_ROOT`, rebuild `servers/mcp` |
| Plugin "CLI not built" | `pnpm build` in repo |
| Git branch missing | Unborn repo (no commits) — Arcframe reports branch via symbolic-ref |
| Watch unsupported | Platform may lack recursive `fs.watch`; use `arc index` manually |

```bash
arc doctor --json
arc validate --json
```
