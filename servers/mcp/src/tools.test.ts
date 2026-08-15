import { describe, expect, it } from "vitest";
import { MCP_TOOL_COUNT, MCP_TOOLS, toolsByCategory } from "./tools.js";

describe("MCP tool registry", () => {
  it("registers at least 30 distinct tools", () => {
    expect(MCP_TOOL_COUNT).toBeGreaterThanOrEqual(30);
    expect(MCP_TOOLS.length).toBe(MCP_TOOL_COUNT);
  });

  it("has unique tool names", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers required categories", () => {
    const cats = new Set(Object.keys(toolsByCategory()));
    for (const required of [
      "repository",
      "symbol",
      "graph",
      "impact",
      "context",
      "memory",
      "decision",
      "session",
      "task",
      "git",
      "tests",
      "validate",
      "debug",
      "deps",
      "api",
      "db",
      "env",
      "config",
      "docs",
      "security",
      "performance",
      "build",
      "ci",
      "release",
      "rules",
      "health",
      "package",
      "review",
      "changes",
      "frameworks",
      "ownership",
      "workspace",
      "adapters",
      "flows",
      "command",
    ]) {
      expect(cats.has(required), `missing category ${required}`).toBe(true);
    }
  });

  it("includes cooler agent-facing tools", () => {
    const names = new Set(MCP_TOOLS.map((t) => t.name));
    for (const t of [
      "security_secret_patterns",
      "performance_hot_files",
      "performance_large_files",
      "debug_parse_stacktrace",
      "debug_locate_error",
      "debug_suspect_symbols",
      "analyze_unused",
      "command_explain",
      "command_detect",
      "ci_detect",
      "release_readiness",
      "project_health_summary",
      "mcp_tool_count",
      "ownership_codeowners",
      "ownership_for_path",
      "workspace_map",
      "adapters_status",
      "flows_inspect",
      "flows_run",
      "rules_applicable",
      "performance_duplicate_imports",
      "performance_heavy_imports",
      "security_sensitive_files",
      "security_insecure_config",
      "env_missing",
      "env_usage",
      "db_migrations",
      "db_models",
      "ci_local_equivalent",
      "release_uncommitted",
      "release_version",
      "search_docs",
      "search_unified",
      "command_risk",
      "symbol_blame_history",
    ]) {
      expect(names.has(t), t).toBe(true);
    }
  });

  it("registers at least 130 tools after agent expansion", () => {
    expect(MCP_TOOL_COUNT).toBeGreaterThanOrEqual(130);
  });

  it("every tool has a non-empty description and object schema", () => {
    for (const t of MCP_TOOLS) {
      expect(t.description.length).toBeGreaterThan(5);
      expect(t.inputSchema.type).toBe("object");
    }
  });
});
