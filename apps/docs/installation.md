---
title: Installation
---

# Installation

Requires **Node.js ≥ 20** and **pnpm 9**.

```bash
git clone https://github.com/theworker02/arcframe.git
cd arcframe
pnpm install
pnpm build
```

Verify:

```bash
node ./cli/dist/bin.js --version
node ./cli/dist/bin.js doctor --json
```

## Distribution

Arcframe packages are **private** and **not published to npm**. Install from this repository (clone + `pnpm build`) or from [GitHub Releases](https://github.com/theworker02/arcframe/releases) (VSIX + CLI/MCP tarball).

See [DISTRIBUTION.md](https://github.com/theworker02/arcframe/blob/master/DISTRIBUTION.md) for MCP config, VSIX packaging, and release checklist.

### Cursor plugin (VSIX)

```bash
pnpm --filter ./apps/cursor-plugin build
pnpm --filter ./apps/cursor-plugin package:vsix
```

Then: Extensions → Install from VSIX → `apps/cursor-plugin/arcframe.vsix` (or the Release asset).

### MCP

After build, register the local server path (also written to `.arcframe/mcp.json` on `arc init`):

```json
{
  "mcpServers": {
    "arcframe": {
      "command": "node",
      "args": ["<path-to-repo>/servers/mcp/dist/index.js"],
      "env": { "ARCFRAME_ROOT": "<path-to-project>" }
    }
  }
}
```

