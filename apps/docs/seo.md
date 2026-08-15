---
title: SEO & discoverability
description: How Arcframe is positioned for search — Cursor MCP, repository intelligence, Arc Index, Arc Graph, and local-first developer tools.
---

# SEO & discoverability

Arcframe is positioned for people searching for **Cursor MCP**, **engineering control plane**, and **repository intelligence** tools — not generic “AI coding” chat wrappers.

## Positioning (natural language)

| Theme | How we say it |
|-------|----------------|
| Cursor MCP | Precise MCP server for Cursor agents (not a dump-everything tool) |
| Control plane | Engineering control plane over the repo: index, graph, memory, ops |
| Repository intelligence | Arc Index + Arc Graph + evidence-labeled claims |
| Impact | Blast radius / impact analysis before refactors |
| Agent context | Budgeted context packs for AI coding agents |
| Trust | Local-first — analysis on your machine, no required Arcframe cloud upload |

Avoid keyword stuffing. Prefer clear product sentences that still include the phrases people type into Google.

## Site surfaces

| Surface | Path / build | Meta |
|---------|----------------|------|
| Landing | `apps/dashboard` → `apps/dashboard/dist` | Unique title/description, OG + Twitter (`arcframe-social-card.png`), canonical via `ARCFRAME_SITE_URL` |
| Docs | `apps/docs` → `apps/docs/.vitepress/dist` | VitePress `title` / `description` / `head` OG tags, favicon, sitemap, `robots.txt`, `llms.txt` |
| Agents | `llms.txt` (landing dist + docs public) | Points humans/agents at docs and MCP overview |

Default site origin placeholder: `https://arcframe.dev`. Override when building:

```bash
# Landing
set ARCFRAME_SITE_URL=https://your-domain.example
pnpm --filter @arcframe/dashboard build

# Docs (co-deploy under /docs/ by default)
set ARCFRAME_SITE_URL=https://your-domain.example
# optional: set ARCFRAME_DOCS_BASE=/   for docs at site root
pnpm --filter @arcframe/docs build
```

## Assets

Brand files live in repo `assets/`:

- `arcframe-favicon.svg` — browser tab
- `arcframe-mark.svg` / `arcframe-horizontal.svg` — UI
- `arcframe-social-card.png` (and `.svg`) — Open Graph / Twitter (`1200×630`)

Dashboard and docs builds copy these into their publish output so favicons and social images resolve on the built sites.

## robots & sitemap

- Landing: `apps/dashboard/dist/robots.txt` + `sitemap.xml` (generated at build)
- Docs: `public/robots.txt` (copied into dist) + VitePress `sitemap` (`hostname` = `ARCFRAME_SITE_URL`)

After deploy, submit the sitemap URL in Google Search Console and verify the social card with a link preview debugger.
