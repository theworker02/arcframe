/**
 * Dogfood: import built registry and assert ListTools-equivalent count.
 * Run after `pnpm --filter @arcframe/mcp build`.
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const mod = await import(pathToFileURL(join(root, "servers/mcp/dist/tools.js")).href);
  const count = mod.MCP_TOOL_COUNT;
  const byCat = mod.toolsByCategory();
  const names = mod.MCP_TOOLS.map((t) => t.name);
  console.log(JSON.stringify({ count, byCategory: byCat, names }, null, 2));
  if (count < 30) {
    console.error(`FAIL: expected >= 30 tools, got ${count}`);
    process.exit(1);
  }
  if (new Set(names).size !== names.length) {
    console.error("FAIL: duplicate tool names");
    process.exit(1);
  }
  console.error(`OK: ${count} distinct MCP tools registered`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
