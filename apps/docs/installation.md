---
title: Installation
---

# Installation

Requires **Node.js ≥ 22.5** (built-in `node:sqlite`) and **pnpm 9**.

Arcframe is **GitHub-first** — not on the npm registry. Do not run `npm install -g @arcframe/…`.

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

Install from this repository (clone + `pnpm build`) or from [GitHub Releases](https://github.com/theworker02/arcframe/releases) (VSIX + CLI/MCP tarball).

See [DISTRIBUTION.md](https://github.com/theworker02/arcframe/blob/main/DISTRIBUTION.md) for MCP config, Open Plugin layout, VSIX packaging, and release checklist.

### Cursor Open Plugin

Install from [cursor.directory/plugins/arcframe](https://cursor.directory/plugins/arcframe), or add `https://github.com/theworker02/arcframe` in Cursor **Plugins** (or clone locally). Repo root includes:

- `rules/*.mdc`, `skills/*/SKILL.md`, `agents/*.md`, `commands/*.md`
- `mcp.json` / `.mcp.json`, `plugin.json`, `.cursor-plugin/plugin.json`

Then `pnpm install && pnpm build` so `servers/mcp/dist/index.js` exists. Validate with `pnpm sync:open-plugin`.

### Cursor plugin (VSIX)

From a Release: Extensions → Install from VSIX → `arcframe.vsix`.

Or build locally:

```bash
pnpm --filter ./apps/cursor-plugin build
pnpm --filter ./apps/cursor-plugin package:vsix
```

Then: Extensions → Install from VSIX → `apps/cursor-plugin/arcframe.vsix`.

### MCP

After build, register the local server path (also written to `.arcframe/mcp.json` on `arc init`), or use the Open Plugin `mcp.json` (`${PLUGIN_ROOT}/servers/mcp/dist/index.js`):

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
