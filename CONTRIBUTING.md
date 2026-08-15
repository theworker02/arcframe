# Contributing to Arcframe

Thanks for helping build a local-first engineering control plane.

## Setup

```bash
pnpm install
pnpm build
pnpm test
node ./cli/dist/bin.js init
```

## Principles

1. Prefer shared engines in `@arcframe/core` — no duplicate analyzers in CLI vs MCP
2. Evidence levels on analytical claims
3. Cross-platform (Windows/macOS/Linux) — no Bash-only scripts in core paths
4. Never invent Cursor APIs — inspect current extension capabilities first
5. Destructive automation needs explicit intent

## Commit style

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.

## Pull requests

- Keep PRs focused
- Include dogfood notes when touching index/graph/MCP (`arc status`, `arc health`)
- Update README/docs when CLI or MCP surfaces change

## Package layout

See README Architecture section. Consolidate thin wrappers rather than adding folder theater.
