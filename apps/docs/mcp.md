---
title: MCP
---

# MCP

Arcframe MCP (`arcframe-mcp`) registers **136** distinct tools with precise schemas wired to real engines (no stubs; secrets never returned).

```bash
pnpm --filter @arcframe/mcp build
# ARCFRAME_ROOT=<project>
node ./servers/mcp/dist/index.js
```

Verify:

```bash
node ./scripts/count-mcp-tools.mjs
node ./scripts/verify-mcp-tools.mjs
node ./scripts/dogfood-mcp-list.mjs
```

See [docs/mcp.md](../../docs/mcp.md) for the full inventory by category.

**Resources:** `arcframe://project|architecture|graph|memory|decisions|tasks|session|rules|changes|validation|health|mcp-tools`

**Prompts:** investigate-bug, implement-feature, plan-refactor, review-changes, and more.
