---
title: Quick Start
---

# Quick Start

```bash
pnpm build
node ./cli/dist/bin.js init
node ./cli/dist/bin.js status
node ./cli/dist/bin.js health
node ./cli/dist/bin.js validate
```

MCP for Cursor:

```bash
node ./servers/mcp/dist/index.js
```

Point Cursor MCP config at that binary with `ARCFRAME_ROOT` set to your project (also written to `.arcframe/mcp.json` on init).
