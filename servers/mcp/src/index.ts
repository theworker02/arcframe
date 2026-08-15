#!/usr/bin/env node
/**
 * Arcframe MCP Server
 * Precise tools over Arcframe engines — no generic dump endpoints.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCP_TOOLS, MCP_TOOL_COUNT } from "./tools.js";
import { handleTool } from "./handlers.js";

export { MCP_TOOLS, MCP_TOOL_COUNT, toolsByCategory } from "./tools.js";

const PROMPTS = [
  { name: "investigate-bug", description: "Investigate a bug with evidence-first workflow" },
  { name: "implement-feature", description: "Implement a feature using Arc context packs" },
  { name: "plan-refactor", description: "Plan a refactor with impact analysis" },
  { name: "review-changes", description: "Review current git changes" },
  { name: "explain-system", description: "Explain system architecture from the graph" },
  { name: "trace-request", description: "Trace an HTTP/request path through routes" },
  { name: "trace-data-flow", description: "Trace data flow via imports/dependencies" },
  { name: "find-regression", description: "Find likely regression surfaces from recent changes" },
  { name: "prepare-release", description: "Prepare a release checklist from health + changelog" },
  { name: "write-tests", description: "Propose tests for a module using gaps heuristic" },
  { name: "audit-package", description: "Audit a package for cycles and unused exports" },
  { name: "document-module", description: "Document a module from symbols + neighbors" },
  { name: "analyze-performance", description: "Analyze performance hotspots from index stats" },
  { name: "review-api-change", description: "Review API/route changes" },
  { name: "review-database-change", description: "Review database/schema file changes" },
];

const server = new Server(
  { name: "arcframe", version: "0.4.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await handleTool(
      req.params.name,
      (req.params.arguments ?? {}) as Record<string, unknown>,
    );
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: "arcframe://project", name: "Project", mimeType: "application/json" },
    { uri: "arcframe://architecture", name: "Architecture", mimeType: "application/json" },
    { uri: "arcframe://graph", name: "Graph", mimeType: "application/json" },
    { uri: "arcframe://memory", name: "Memory", mimeType: "application/json" },
    { uri: "arcframe://decisions", name: "Decisions", mimeType: "application/json" },
    { uri: "arcframe://tasks", name: "Tasks", mimeType: "application/json" },
    { uri: "arcframe://session", name: "Sessions", mimeType: "application/json" },
    { uri: "arcframe://rules", name: "Rules", mimeType: "application/json" },
    { uri: "arcframe://changes", name: "Changes", mimeType: "application/json" },
    { uri: "arcframe://validation", name: "Validation", mimeType: "application/json" },
    { uri: "arcframe://health", name: "Health", mimeType: "application/json" },
    { uri: "arcframe://mcp-tools", name: "MCP Tools Inventory", mimeType: "application/json" },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  const map: Record<string, string> = {
    "arcframe://project": "repository_info",
    "arcframe://architecture": "graph_stats",
    "arcframe://graph": "graph_stats",
    "arcframe://memory": "memory_list",
    "arcframe://decisions": "decision_list",
    "arcframe://tasks": "task_list",
    "arcframe://session": "session_list",
    "arcframe://rules": "rules_list",
    "arcframe://changes": "git_status",
    "arcframe://validation": "validate_doctor",
    "arcframe://health": "project_health_report",
    "arcframe://mcp-tools": "mcp_tool_count",
  };
  const tool = map[uri];
  if (!tool) {
    return { contents: [{ uri, text: JSON.stringify({ error: "unknown resource" }) }] };
  }
  const result = await handleTool(tool, {});
  const text = result.content[0]?.text ?? "{}";
  return { contents: [{ uri, mimeType: "application/json", text }] };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS.map((p) => ({ name: p.name, description: p.description })),
}));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  const name = req.params.name;
  const argText = JSON.stringify(req.params.arguments ?? {});
  const body = `You are using Arcframe (local-first engineering control plane).
Prompt: ${name}
Arguments: ${argText}

Rules:
- Prefer Confirmed evidence; label Strongly/Weakly inferred and Unknown.
- Use Arcframe MCP tools (${MCP_TOOL_COUNT} registered: context_pack, impact_*, graph_*, git_*, memory_*, security_secret_patterns, project_health_summary, …).
- Do not invent Cursor APIs or push to remotes.
- Reads are fine; destructive ops need explicit user intent.
`;
  return {
    description: PROMPTS.find((p) => p.name === name)?.description,
    messages: [{ role: "user", content: { type: "text", text: body } }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
