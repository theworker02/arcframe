import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const toolsSrc = readFileSync(join(root, "servers/mcp/src/tools.ts"), "utf8");
const handlersSrc = readFileSync(join(root, "servers/mcp/src/handlers.ts"), "utf8");
const tools = [...toolsSrc.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
const cases = new Set([...handlersSrc.matchAll(/case\s+"([^"]+)"/g)].map((m) => m[1]));
const missing = tools.filter((n) => !cases.has(n));
console.log(JSON.stringify({ tools: tools.length, cases: cases.size, missing }, null, 2));
if (missing.length) process.exit(1);
