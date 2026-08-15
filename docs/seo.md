# SEO & discoverability

Arcframe targets search for **Cursor MCP**, **engineering control plane**, and **repository intelligence** (Arc Index, Arc Graph, blast-radius impact analysis, AI coding agent context, local-first tools).

Canonical write-up for maintainers: [apps/docs/seo.md](../apps/docs/seo.md) (also published on the VitePress docs site).

## Build with a real origin

```bash
# Windows PowerShell
$env:ARCFRAME_SITE_URL = "https://your-domain.example"
pnpm --filter @arcframe/dashboard build
pnpm --filter @arcframe/docs build
```

Default placeholder origin is `https://arcframe.dev`. Docs default `base` is `/docs/` (`ARCFRAME_DOCS_BASE=/` for root hosting).

## Key meta assets

| Asset | Location |
|-------|----------|
| Social card PNG | `assets/arcframe-social-card.png` |
| Favicon | `assets/arcframe-favicon.svg` |
| Root robots / llms | `robots.txt`, `llms.txt` at repo root |
