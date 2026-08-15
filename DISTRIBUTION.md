# Distribution

Arcframe is **not** published to the npm registry as the primary install channel.
All `@arcframe/*` packages and the Cursor plugin are marked `"private": true` until an intentional npm release is decided.

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
| **CLI** | From repo: `node ./cli/dist/bin.js` (or root `pnpm arc`) | Optional: GitHub Release tarball of the built monorepo / `cli` + `packages` |
| **MCP** | Local path in Cursor MCP settings | `servers/mcp/dist/index.js` after `pnpm build` |
| **Cursor / VS Code plugin** | Load unpacked or install `.vsix` from Releases | `apps/cursor-plugin` → `pnpm --filter ./apps/cursor-plugin package:vsix` |
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

Do **not** expect `npx @arcframe/mcp` until packages are published. Prefer clone + build, or a Release asset that includes `servers/mcp/dist` and workspace package `dist` folders.

### Plugin (VSIX)

```bash
pnpm --filter ./apps/cursor-plugin build
pnpm --filter ./apps/cursor-plugin package:vsix
# Install arcframe.vsix via Cursor/VS Code: Extensions → … → Install from VSIX
```

Activity-bar icon: `apps/cursor-plugin/media/icon.svg`  
Marketplace icon: `apps/cursor-plugin/media/arcframe-icon-128.png`

### CLI binary / tarball (GitHub Releases)

Until standalone binaries exist, release a source-built tarball:

1. `pnpm install && pnpm build`
2. Archive the repo (or at minimum `cli/dist`, `packages/*/dist`, `servers/mcp/dist`, `package.json`, `pnpm-lock.yaml`)
3. Attach to a GitHub Release tagged `vX.Y.Z`
4. Document: extract → `pnpm install --prod` (if needed) → `node cli/dist/bin.js`

## Why not npm (yet)

- Packages use `workspace:*` dependencies and assume a monorepo layout.
- Half-configured `files`/`exports` without a real publish pipeline confuses adopters.
- Primary consumers today install via GitHub (CLI + MCP path) and VSIX (plugin).

When npm is intentional later: remove `"private": true` only from packages you mean to publish, add `publishConfig`, and ship a real Changesets/semantic-release workflow. Until then, **do not** `npm publish`.

## GitHub Release checklist

See [`.github/workflows/release.yml`](./.github/workflows/release.yml) (tag-triggered). Manual checklist:

- [ ] `pnpm build` + `pnpm test` green on CI
- [ ] Sync brand: `node ./scripts/sync-brand-assets.mjs`
- [ ] Build VSIX; attach `arcframe.vsix`
- [ ] Attach CLI/MCP tarball (or full built tree)
- [ ] Release notes: clone install, MCP JSON snippet, VSIX install steps
- [ ] No npm publish step

## Package privacy

| Package | Status |
|---------|--------|
| Root `arcframe` | `private: true` |
| `@arcframe/core` … `@arcframe/workflows` | `private: true` (unpublished) |
| `@arcframe/cli` | `private: true` — distribute via clone / Release |
| `@arcframe/mcp` | `private: true` — distribute via clone / Release |
| `apps/cursor-plugin` (`arcframe`) | `private: true` — distribute via VSIX |
| `@arcframe/docs`, `@arcframe/dashboard` | `private: true` |
