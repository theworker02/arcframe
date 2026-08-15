import { defineConfig } from "vitepress";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const siteUrl = (process.env.ARCFRAME_SITE_URL || "https://arcframe.dev").replace(/\/$/, "");
const base = process.env.ARCFRAME_DOCS_BASE || "/docs/";
const normalizedBase = base.endsWith("/") ? base : `${base}/`;
const docsHome = new URL(normalizedBase, `${siteUrl}/`).href;
const asset = (name: string) => new URL(name.replace(/^\//, ""), docsHome).href;
const title = "Arcframe Docs";
const description =
  "Docs for Arcframe — local-first Cursor MCP, Arc Index, Arc Graph, blast-radius impact analysis, and repository intelligence for AI coding agents.";

const rootDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(rootDir, "../public");
const assetsDir = join(rootDir, "../../../assets");

mkdirSync(publicDir, { recursive: true });
for (const name of [
  "arcframe-favicon.svg",
  "arcframe-mark.svg",
  "arcframe-social-card.png",
  "arcframe-social-card.svg",
  "arcframe-horizontal.svg",
]) {
  const src = join(assetsDir, name);
  if (existsSync(src)) copyFileSync(src, join(publicDir, name));
}

writeFileSync(
  join(publicDir, "robots.txt"),
  `User-agent: *
Allow: /

Sitemap: ${docsHome}sitemap.xml
`,
);

writeFileSync(
  join(publicDir, "llms.txt"),
  `# Arcframe Docs

> Official documentation for Arcframe: engineering control plane for Cursor with local-first repository intelligence.

## Start here

- [Overview](${docsHome}): What Arcframe is
- [Installation](${docsHome}installation): Install and init
- [Quick Start](${docsHome}quick-start): First index, graph, and MCP
- [MCP](${docsHome}mcp): Cursor MCP server tools and resources
- [Arc Index](${docsHome}arc-index): Incremental repository index
- [Arc Graph](${docsHome}arc-graph): Dependency / import graph
- [Impact](${docsHome}impact): Blast radius and impact analysis
- [SEO](${docsHome}seo): Search positioning

## Source

- [GitHub](https://github.com/theworker02/arcframe)
`,
);

export default defineConfig({
  title,
  description,
  cleanUrls: true,
  lang: "en-US",
  base: normalizedBase,
  ignoreDeadLinks: true,
  sitemap: {
    hostname: siteUrl,
    transformItems: (items) =>
      items.map((item) => {
        let path = item.url;
        if (path.startsWith("http")) path = new URL(path).pathname;
        if (!path.startsWith("/")) path = `/${path}`;
        // Ensure /docs/ prefix when base is /docs/
        if (normalizedBase !== "/" && !path.startsWith(normalizedBase) && path !== normalizedBase.slice(0, -1)) {
          path = path === "/" ? normalizedBase : `${normalizedBase.replace(/\/$/, "")}${path}`;
        }
        return { ...item, url: path };
      }),
  },
  head: [
    ["link", { rel: "icon", href: `${normalizedBase}arcframe-favicon.svg`, type: "image/svg+xml" }],
    ["link", { rel: "canonical", href: docsHome }],
    ["meta", { name: "theme-color", content: "#090A0C" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "Cursor MCP, Arcframe, Arc Index, Arc Graph, repository intelligence, impact analysis, AI coding agents, local-first",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Arcframe" }],
    ["meta", { property: "og:title", content: `${title} — Cursor MCP & repository intelligence` }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:url", content: docsHome }],
    ["meta", { property: "og:image", content: asset("arcframe-social-card.png") }],
    ["meta", { property: "og:image:type", content: "image/png" }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:locale", content: "en_US" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: `${title} — Cursor MCP & repository intelligence` }],
    ["meta", { name: "twitter:description", content: description }],
    ["meta", { name: "twitter:image", content: asset("arcframe-social-card.png") }],
  ],
  themeConfig: {
    logo: "/arcframe-mark.svg",
    siteTitle: "Arcframe",
    nav: [
      { text: "Overview", link: "/" },
      { text: "CLI", link: "/cli" },
      { text: "MCP", link: "/mcp" },
      { text: "SEO", link: "/seo" },
      { text: "GitHub", link: "https://github.com/theworker02/arcframe" },
    ],
    sidebar: [
      {
        text: "Get started",
        items: [
          { text: "Overview", link: "/" },
          { text: "Installation", link: "/installation" },
          { text: "Quick Start", link: "/quick-start" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Arc Index", link: "/arc-index" },
          { text: "Arc Graph", link: "/arc-graph" },
          { text: "Arc Context", link: "/arc-context" },
          { text: "Arc Memory", link: "/arc-memory" },
          { text: "Impact", link: "/impact" },
        ],
      },
      {
        text: "Surfaces",
        items: [
          { text: "CLI", link: "/cli" },
          { text: "MCP", link: "/mcp" },
          { text: "Rules", link: "/rules" },
          { text: "Skills", link: "/skills" },
        ],
      },
      {
        text: "Ops",
        items: [
          { text: "Security", link: "/security" },
          { text: "Troubleshooting", link: "/troubleshooting" },
          { text: "SEO & discoverability", link: "/seo" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/theworker02/arcframe" }],
    footer: {
      message: "Local-first repository intelligence for Cursor MCP and AI coding agents.",
      copyright: "© Arcframe",
    },
  },
});
