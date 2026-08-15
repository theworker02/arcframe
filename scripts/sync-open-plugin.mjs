#!/usr/bin/env node
/**
 * Sync / validate Cursor Open Plugins + Agent Plugins layout at the repo root.
 *
 * Canonical sources:
 *   - rules/*.mdc                 (Open Plugins / Cursor rules)
 *   - skills/<name>/SKILL.md      (Agent Skills)
 *   - agents/*.md
 *   - commands/*.md
 *   - mcp.json                    (Agent Plugins MCP schema; also mirrored to .mcp.json)
 *   - plugin.json                 (Agent Plugins manifest)
 *   - .cursor-plugin/plugin.json  (Cursor Plugin manifest)
 *
 * Usage:
 *   node ./scripts/sync-open-plugin.mjs           # validate + mirror mcp
 *   node ./scripts/sync-open-plugin.mjs --write    # write mirrors / fixups
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");

const DISCOVERY = [
  { label: "rules/*.mdc", check: () => globEndsWith(join(root, "rules"), ".mdc") },
  { label: "mcp.json", check: () => existsSync(join(root, "mcp.json")) },
  { label: ".mcp.json", check: () => existsSync(join(root, ".mcp.json")) },
  {
    label: "skills/<name>/SKILL.md",
    check: () =>
      existsSync(join(root, "skills")) &&
      readdirSync(join(root, "skills"), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .some((d) => existsSync(join(root, "skills", d.name, "SKILL.md"))),
  },
  { label: "agents/*.md", check: () => globEndsWith(join(root, "agents"), ".md") },
  { label: "commands/*.md", check: () => globEndsWith(join(root, "commands"), ".md") },
  {
    label: ".cursor-plugin/plugin.json",
    check: () => existsSync(join(root, ".cursor-plugin", "plugin.json")),
  },
  { label: "plugin.json", check: () => existsSync(join(root, "plugin.json")) },
];

function globEndsWith(dir, ext) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(ext) && statSync(join(dir, f)).isFile());
}

function mirrorMcp() {
  const src = join(root, "mcp.json");
  const dest = join(root, ".mcp.json");
  if (!existsSync(src)) {
    throw new Error("mcp.json missing — create Open Plugins MCP config first");
  }
  const body = readFileSync(src, "utf8");
  // Validate Agent Plugins-ish shape
  const parsed = JSON.parse(body);
  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
    throw new Error("mcp.json must contain mcpServers");
  }
  if (write || !existsSync(dest) || readFileSync(dest, "utf8") !== body) {
    if (!write && existsSync(dest) && readFileSync(dest, "utf8") !== body) {
      console.error("FAIL: .mcp.json is out of sync with mcp.json (re-run with --write)");
      process.exitCode = 1;
      return;
    }
    if (write) {
      writeFileSync(dest, body);
      console.log("Wrote .mcp.json (mirror of mcp.json)");
    }
  } else {
    console.log("OK: .mcp.json mirrors mcp.json");
  }
}

function reportDiscovery() {
  console.log("Open Plugins discovery paths:");
  let ok = true;
  for (const item of DISCOVERY) {
    const pass = item.check();
    console.log(`  ${pass ? "✓" : "✗"} ${item.label}`);
    if (!pass) ok = false;
  }
  // Explicitly note omitted optional paths
  console.log("  · hooks/hooks.json — omitted (no Arcframe hook scripts yet)");
  console.log("  · .lsp.json — omitted (no Arcframe LSP server)");
  if (!ok) {
    console.error("\nDiscovery incomplete — Cursor will report 'No plugin components found'.");
    process.exitCode = 1;
  } else {
    console.log("\nAt least one discoverable component exists; layout is valid.");
  }
}

function listComponents() {
  const rules = existsSync(join(root, "rules"))
    ? readdirSync(join(root, "rules")).filter((f) => f.endsWith(".mdc"))
    : [];
  const skills = existsSync(join(root, "skills"))
    ? readdirSync(join(root, "skills"), { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(root, "skills", d.name, "SKILL.md")))
        .map((d) => d.name)
    : [];
  const agents = existsSync(join(root, "agents"))
    ? readdirSync(join(root, "agents")).filter((f) => f.endsWith(".md"))
    : [];
  const commands = existsSync(join(root, "commands"))
    ? readdirSync(join(root, "commands")).filter((f) => f.endsWith(".md"))
    : [];
  console.log(`\nComponent counts: rules=${rules.length} skills=${skills.length} agents=${agents.length} commands=${commands.length}`);
  console.log(`Rules: ${rules.join(", ") || "(none)"}`);
  console.log(`Skills: ${skills.join(", ") || "(none)"}`);
  console.log(`Agents: ${agents.join(", ") || "(none)"}`);
  console.log(`Commands: ${commands.join(", ") || "(none)"}`);
}

try {
  mirrorMcp();
  reportDiscovery();
  listComponents();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
