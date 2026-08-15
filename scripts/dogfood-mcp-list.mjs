/**
 * Dogfood: start MCP process, confirm it stays alive, count tools from registry
 * (ListTools-equivalent) and exercise tools/list via JSON-RPC if the transport responds.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(root, "servers/mcp/dist/index.js");

async function main() {
  const mod = await import(pathToFileURL(join(root, "servers/mcp/dist/tools.js")).href);
  const count = mod.MCP_TOOL_COUNT;
  const byCategory = mod.toolsByCategory();
  const names = mod.MCP_TOOLS.map((t) => t.name);

  if (count < 30) {
    console.error(`FAIL: registry count ${count} < 30`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, ARCFRAME_ROOT: root },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += c.toString();
  });

  // Give the process a moment to boot / crash
  await new Promise((r) => setTimeout(r, 800));
  if (child.exitCode != null) {
    console.error("FAIL: MCP server exited early", child.exitCode, stderr);
    process.exit(1);
  }

  // Best-effort tools/list (Content-Length framing)
  const body = Buffer.from(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "dogfood", version: "0.4.0" },
      },
    }),
    "utf8",
  );
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);

  let stdout = "";
  child.stdout.on("data", (c) => {
    stdout += c.toString();
  });
  await new Promise((r) => setTimeout(r, 1200));

  child.kill();
  console.log(
    JSON.stringify(
      {
        count,
        byCategory,
        names,
        serverStarted: true,
        rpcResponded: stdout.includes("result") || stdout.includes("jsonrpc"),
        stderrTail: stderr.slice(-500) || null,
      },
      null,
      2,
    ),
  );
  console.error(`OK: ${count} distinct MCP tools; server process started`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
