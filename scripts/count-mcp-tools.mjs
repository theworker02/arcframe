import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "servers/mcp/src/tools.ts"), "utf8");
const names = [...src.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
const unique = [...new Set(names)];
const dups = names.filter((x, i) => names.indexOf(x) !== i);
console.log("count", names.length);
console.log("unique", unique.length);
if (dups.length) console.log("duplicates", [...new Set(dups)]);
else console.log("unique ok");
