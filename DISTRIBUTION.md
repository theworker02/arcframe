# Distribution

Arcframe is **GitHub-first**. Workspace packages (`@arcframe/*`) stay `"private": true` and are **never** published to the npm registry. Install via clone, GitHub Release artifacts, or VSIX — not `npm install -g @arcframe/…`.

pnpm workspaces remain for **local monorepo installs** only (`pnpm install` / `pnpm build`).

## Install (recommended)

Clone and build from source:

```bash
git clone https://github.com/theworker02/arcframe.git
cd arcframe
pnpm install
pnpm build
node ./cli/dist/bin.js init
```

Brand assets live in [`assets/`](./assets/). After changing SVGs/PNGs, run:

```bash
node ./scripts/sync-brand-assets.mjs
```

## Website

- Landing: https://theworker02.github.io/arcframe/
- Docs: https://theworker02.github.io/arcframe/docs/

Built by .github/workflows/pages.yml with `ARCFRAME_SITE_URL=https://theworker02.github.io/arcframe` and `ARCFRAME_DOCS_BASE=/arcframe/docs/`.

## Surfaces

| Surface | How to install / run | Artifact |
|---------|----------------------|----------|
| **CLI** | From repo: `node ./cli/dist/bin.js` (or root `pnpm arc`) | GitHub Release `arcframe-node-v*.tar.gz` |
| **MCP** | Local path in Cursor MCP settings | `servers/mcp/dist/index.js` after `pnpm build` (or Release tarball) |
| **Cursor / VS Code plugin** | Install `.vsix` from Releases (or build locally) | `arcframe.vsix` |
| **Docs** | `pnpm --filter @arcframe/docs build` | Static VitePress site under `apps/docs/.vitepress/dist` |
| **Dashboard** | `pnpm --filter @arcframe/dashboard build` | Static site under `apps/dashboard/dist` |

### MCP (Cursor)

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

There is no `npx @arcframe/mcp` / registry package. Prefer clone + build, or a Release tarball that includes `servers/mcp/dist` and workspace package `dist` folders.

### Plugin (VSIX)

```bash
pnpm --filter ./apps/cursor-plugin build
pnpm --filter ./apps/cursor-plugin package:vsix
# Install arcframe.vsix via Cursor/VS Code: Extensions → … → Install from VSIX
```

Or download `arcframe.vsix` from [GitHub Releases](https://github.com/theworker02/arcframe/releases).

Activity-bar icon: `apps/cursor-plugin/media/icon.svg`  
Marketplace icon: `apps/cursor-plugin/media/arcframe-icon-128.png`

### CLI / MCP tarball (GitHub Releases)

Tag-triggered workflow [`.github/workflows/release.yml`](./.github/workflows/release.yml) attaches:

1. `arcframe.vsix` — Cursor / VS Code extension
2. `arcframe-node-vX.Y.Z.tar.gz` — built `cli` / `packages` / `servers/mcp` tree
3. `SHA256SUMS.txt`

Manual equivalent:

1. `pnpm install && pnpm build`
2. Archive `cli/dist`, `packages/*/dist`, `servers/mcp/dist`, workspace `package.json` files, lockfile
3. Attach to a GitHub Release tagged `vX.Y.Z`
4. Document: extract → `node cli/dist/bin.js` / `node servers/mcp/dist/index.js`

## Why not npm

- Packages use `workspace:*` dependencies and assume a monorepo layout.
- Primary consumers install via GitHub (clone / Release tarball) and VSIX (plugin).
- Half-configured registry packaging confuses adopters; Arcframe does not ship npm packages.

**Do not** run `npm publish` / `pnpm publish` for any `@arcframe/*` package.

## GitHub Release checklist

See [`.github/workflows/release.yml`](./.github/workflows/release.yml) (tag-triggered). Manual checklist:

- [ ] `pnpm build` + `pnpm test` green on CI
- [ ] Sync brand: `node ./scripts/sync-brand-assets.mjs`
- [ ] Build VSIX; attach `arcframe.vsix`
- [ ] Attach CLI/MCP tarball (or full built tree)
- [ ] Release notes: clone install, MCP JSON snippet, VSIX install steps
- [ ] No npm / registry publish step

## Package privacy

| Package | Status |
|---------|--------|
| Root `arcframe` | `private: true` |
| `@arcframe/core` … `@arcframe/workflows` | `private: true` — workspace only |
| `@arcframe/cli` | `private: true` — clone / Release |
| `@arcframe/mcp` | `private: true` — clone / Release |
| `apps/cursor-plugin` (`arcframe`) | `private: true` — VSIX |
| `@arcframe/docs`, `@arcframe/dashboard` | `private: true` |
