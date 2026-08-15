import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "dist");
const siteUrl = (process.env.ARCFRAME_SITE_URL || "https://arcframe.dev").replace(/\/$/, "");
const sitePath = new URL(`${siteUrl}/`).pathname.replace(/\/$/, "") || "";
const assetBase = sitePath ? `${sitePath}/` : "./";

mkdirSync(out, { recursive: true });

for (const f of ["styles.css", "motion.js"]) {
  cpSync(join(root, f), join(out, f));
}

let html = readFileSync(join(root, "index.html"), "utf8");
html = html.replaceAll("__SITE_URL__", siteUrl);
// Rewrite root-relative and ./ asset paths so GitHub project pages (/arcframe/) resolve correctly
if (sitePath) {
  html = html.replace(/(href|src)="\.\/(assets\/[^"]+|styles\.css|motion\.js)"/g, `$1="${sitePath}/$2"`);
}
writeFileSync(join(out, "index.html"), html);

const assetsSrc = join(root, "../../assets");
const assetsOut = join(out, "assets");
if (existsSync(assetsSrc)) {
  mkdirSync(assetsOut, { recursive: true });
  cpSync(assetsSrc, assetsOut, { recursive: true });
}

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
writeFileSync(join(out, "robots.txt"), robots);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/docs/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`;
writeFileSync(join(out, "sitemap.xml"), sitemap);

const llms = `# Arcframe

> Local-first engineering control plane for Cursor — repository intelligence via Arc Index, Arc Graph, impact analysis, and a Cursor MCP server for AI coding agents.

## Primary

- [Home](${siteUrl}/): Product overview
- [Documentation](${siteUrl}/docs/): Install, architecture, Arc Index, Arc Graph, MCP
- [GitHub](https://github.com/theworker02/arcframe): Source and releases
- [SEO positioning](${siteUrl}/docs/seo): How Arcframe is described for search

## Optional

- Set ARCFRAME_SITE_URL when building to replace the default site origin (${siteUrl}).
`;
writeFileSync(join(out, "llms.txt"), llms);

console.log(`dashboard built -> apps/dashboard/dist (site: ${siteUrl}, assets: ${assetBase})`);
