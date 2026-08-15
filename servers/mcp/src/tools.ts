/**
 * Canonical MCP tool registry — keep schemas precise; handlers live in handlers.ts.
 * Count is exported for doctor/tests/docs.
 */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  category: string;
}

export const MCP_TOOLS: McpToolDef[] = [
  // —— repository ——
  { name: "repository_info", category: "repository", description: "Project identity, languages, frameworks, package managers", inputSchema: { type: "object", properties: {} } },
  { name: "repository_summary", category: "repository", description: "Compact project + index + git summary", inputSchema: { type: "object", properties: {} } },
  { name: "repository_tree", category: "repository", description: "List project files respecting ignore rules", inputSchema: { type: "object", properties: { max: { type: "number" } } } },
  { name: "repository_file", category: "repository", description: "Read a project file by relative path", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "repository_search", category: "repository", description: "Search indexed file paths by substring", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "repository_languages", category: "repository", description: "Detected languages and indexed file counts", inputSchema: { type: "object", properties: {} } },
  { name: "repository_frameworks", category: "repository", description: "Detected frameworks (project + per-file hints)", inputSchema: { type: "object", properties: {} } },
  { name: "repository_packages", category: "repository", description: "Workspace/package roots discovered", inputSchema: { type: "object", properties: {} } },
  { name: "repository_scripts", category: "repository", description: "package.json scripts", inputSchema: { type: "object", properties: {} } },
  { name: "repository_configs", category: "repository", description: "Common config files present (tsconfig, cargo, go.mod, …)", inputSchema: { type: "object", properties: {} } },

  // —— symbol ——
  { name: "symbol_search", category: "symbol", description: "Search indexed symbols by name", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "symbol_in_file", category: "symbol", description: "List symbols in a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "symbol_definition", category: "symbol", description: "Best definition match for a symbol name", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "symbol_references", category: "symbol", description: "Files that import or reference a symbol name (heuristic)", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "symbol_exports", category: "symbol", description: "Exported symbols in a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "symbol_imports", category: "symbol", description: "Import edges recorded for a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "symbol_callers", category: "symbol", description: "Inbound DEPENDS_ON/IMPORTS neighbors for a file node", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "symbol_callees", category: "symbol", description: "Outbound DEPENDS_ON/IMPORTS neighbors for a file node", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "symbol_blame_history", category: "symbol", description: "Blame-enriched recent history for a symbol (git log -L / file fallback)", inputSchema: { type: "object", properties: { name: { type: "string" }, limit: { type: "number" } }, required: ["name"] } },

  // —— graph ——
  { name: "graph_stats", category: "graph", description: "Arc Graph statistics", inputSchema: { type: "object", properties: {} } },
  { name: "graph_neighbors", category: "graph", description: "Neighbors of a graph node", inputSchema: { type: "object", properties: { node: { type: "string" }, edgeType: { type: "string" } }, required: ["node"] } },
  { name: "graph_rebuild", category: "graph", description: "Rebuild the Arc Graph from index", inputSchema: { type: "object", properties: {} } },
  { name: "graph_dependencies", category: "graph", description: "Outbound dependency edges for a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "graph_dependents", category: "graph", description: "Inbound dependent edges for a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "graph_path", category: "graph", description: "Shortest IMPORTS/DEPENDS_ON path between two file nodes", inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] } },
  { name: "graph_cycles", category: "graph", description: "Mutual import pairs and SCCs", inputSchema: { type: "object", properties: {} } },
  { name: "graph_orphans", category: "graph", description: "Indexed files with no IMPORTS edges", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "graph_explain", category: "graph", description: "Explain edges attached to a node", inputSchema: { type: "object", properties: { node: { type: "string" } }, required: ["node"] } },

  // —— impact ——
  { name: "impact_analyze", category: "impact", description: "Impact analysis for a file or node", inputSchema: { type: "object", properties: { target: { type: "string" }, depth: { type: "number" } }, required: ["target"] } },
  { name: "impact_file", category: "impact", description: "Impact for a file path", inputSchema: { type: "object", properties: { path: { type: "string" }, depth: { type: "number" } }, required: ["path"] } },
  { name: "impact_symbol", category: "impact", description: "Impact for a symbol's containing file", inputSchema: { type: "object", properties: { name: { type: "string" }, depth: { type: "number" } }, required: ["name"] } },
  { name: "impact_package", category: "impact", description: "Aggregate impact for files under a path prefix", inputSchema: { type: "object", properties: { prefix: { type: "string" }, depth: { type: "number" } }, required: ["prefix"] } },
  { name: "impact_current_changes", category: "impact", description: "Impact summary for current git changeset", inputSchema: { type: "object", properties: { staged: { type: "boolean" } } } },

  // —— context ——
  { name: "context_pack", category: "context", description: "Build a budgeted context pack from a query", inputSchema: { type: "object", properties: { query: { type: "string" }, budget: { type: "string" } }, required: ["query"] } },
  { name: "context_for_file", category: "context", description: "Context pack focused on a file", inputSchema: { type: "object", properties: { path: { type: "string" }, budget: { type: "string" } }, required: ["path"] } },
  { name: "context_for_symbol", category: "context", description: "Context pack focused on a symbol name", inputSchema: { type: "object", properties: { name: { type: "string" }, budget: { type: "string" } }, required: ["name"] } },
  { name: "context_for_task", category: "context", description: "Context pack from a task title/description", inputSchema: { type: "object", properties: { taskId: { type: "string" }, budget: { type: "string" } }, required: ["taskId"] } },
  { name: "context_explain", category: "context", description: "Explain why items were selected in a pack", inputSchema: { type: "object", properties: { query: { type: "string" }, budget: { type: "string" } }, required: ["query"] } },
  { name: "context_budget", category: "context", description: "Show context budget token limits", inputSchema: { type: "object", properties: {} } },

  // —— memory / decision / session / task ——
  { name: "memory_list", category: "memory", description: "List Arc Memory entries", inputSchema: { type: "object", properties: { type: { type: "string" } } } },
  { name: "memory_search", category: "memory", description: "Search Arc Memory", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "memory_write", category: "memory", description: "Write an Arc Memory entry", inputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, type: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title", "content"] } },
  { name: "memory_get", category: "memory", description: "Get memory by id", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "memory_delete", category: "memory", description: "Delete memory by id (requires intent)", inputSchema: { type: "object", properties: { id: { type: "string" }, intent: { type: "boolean" } }, required: ["id"] } },
  { name: "decision_list", category: "decision", description: "List ADRs / decisions", inputSchema: { type: "object", properties: {} } },
  { name: "decision_create", category: "decision", description: "Create a decision record", inputSchema: { type: "object", properties: { title: { type: "string" }, decision: { type: "string" }, context: { type: "string" }, consequences: { type: "string" } }, required: ["title", "decision"] } },
  { name: "decision_accept", category: "decision", description: "Mark decision accepted", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "decision_get", category: "decision", description: "Get decision by id", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "session_list", category: "session", description: "List sessions", inputSchema: { type: "object", properties: {} } },
  { name: "session_create", category: "session", description: "Create a session", inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
  { name: "session_get", category: "session", description: "Restore a session by id", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "task_list", category: "task", description: "List tasks", inputSchema: { type: "object", properties: { status: { type: "string" } } } },
  { name: "task_create", category: "task", description: "Create a task", inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title"] } },
  { name: "task_update", category: "task", description: "Update task status", inputSchema: { type: "object", properties: { id: { type: "string" }, status: { type: "string" } }, required: ["id", "status"] } },
  { name: "task_get", category: "task", description: "Get task by id", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },

  // —— git ——
  { name: "git_status", category: "git", description: "Inspect git status", inputSchema: { type: "object", properties: {} } },
  { name: "git_log", category: "git", description: "Recent git commits", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "git_diff", category: "git", description: "Show git diff", inputSchema: { type: "object", properties: { staged: { type: "boolean" } } } },
  { name: "git_branches", category: "git", description: "List local branches", inputSchema: { type: "object", properties: {} } },
  { name: "git_blame", category: "git", description: "git blame for a file (read-only)", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "git_show", category: "git", description: "Show a commit by ref", inputSchema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] } },

  // —— tests / validate / review / changes / debug ——
  { name: "tests_inventory", category: "tests", description: "List indexed test-related files", inputSchema: { type: "object", properties: {} } },
  { name: "tests_run", category: "tests", description: "Run project tests (all|related|file|package)", inputSchema: { type: "object", properties: { mode: { type: "string" }, target: { type: "string" } } } },
  { name: "tests_related", category: "tests", description: "Infer related tests for a file without running", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "validate_doctor", category: "validate", description: "Run Arcframe doctor diagnostics", inputSchema: { type: "object", properties: {} } },
  { name: "validate_project", category: "validate", description: "Run evidence-based validation suite", inputSchema: { type: "object", properties: {} } },
  { name: "review_changes", category: "review", description: "Hunk/symbol-aware review of working or staged diff", inputSchema: { type: "object", properties: { staged: { type: "boolean" } } } },
  { name: "changes_analyze", category: "changes", description: "Analyze changeset (analyze|risk|tests|docs)", inputSchema: { type: "object", properties: { aspect: { type: "string" } } } },
  { name: "changes_risk", category: "changes", description: "Risk findings for current changes", inputSchema: { type: "object", properties: {} } },
  { name: "debug_index_explain", category: "debug", description: "Explain how a file was indexed", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "debug_parse_stacktrace", category: "debug", description: "Parse a stack trace and map frames to indexed files/symbols", inputSchema: { type: "object", properties: { stack: { type: "string" } }, required: ["stack"] } },
  { name: "debug_locate_error", category: "debug", description: "Locate error from message + optional stack via index suspects", inputSchema: { type: "object", properties: { message: { type: "string" }, stack: { type: "string" } }, required: ["message"] } },
  { name: "debug_suspect_symbols", category: "debug", description: "List suspect symbols near a file:line from the index", inputSchema: { type: "object", properties: { path: { type: "string" }, line: { type: "number" } }, required: ["path", "line"] } },

  // —— deps / analyze / package / frameworks / command ——
  { name: "deps_cycles", category: "deps", description: "Find mutual import cycles and SCCs", inputSchema: { type: "object", properties: {} } },
  { name: "deps_unused_candidates", category: "deps", description: "Heuristic unused export name candidates", inputSchema: { type: "object", properties: {} } },
  { name: "analyze_unused", category: "analyze", description: "Heuristic unused/dead-code symbols with confidence labels", inputSchema: { type: "object", properties: { limit: { type: "number" }, includePrivate: { type: "boolean" } } } },
  { name: "package_adapters", category: "package", description: "List language adapters", inputSchema: { type: "object", properties: {} } },
  { name: "package_info", category: "package", description: "Root package.json name/version/scripts summary", inputSchema: { type: "object", properties: {} } },
  { name: "frameworks_detected", category: "frameworks", description: "Framework hints from indexed files", inputSchema: { type: "object", properties: {} } },
  { name: "command_explain", category: "command", description: "Explain a shell/package-manager command (no execution)", inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  { name: "command_detect", category: "command", description: "Detect package.json scripts across the workspace", inputSchema: { type: "object", properties: { maxPackages: { type: "number" } } } },
  { name: "command_risk", category: "command", description: "Classify terminal/command risk (destructive/network/writes) — no execution", inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  { name: "terminal_risk", category: "command", description: "Alias of command_risk for agent terminal planning", inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },

  // —— api / db / env ——
  { name: "api_routes", category: "api", description: "List inferred HTTP routes from index", inputSchema: { type: "object", properties: {} } },
  { name: "api_compatibility", category: "api", description: "Route inventory + duplicate path detection", inputSchema: { type: "object", properties: {} } },
  { name: "db_schema_files", category: "db", description: "Find likely schema files (never credentials)", inputSchema: { type: "object", properties: {} } },
  { name: "db_migrations", category: "db", description: "Find migration dirs/files (Prisma/Drizzle/Alembic/SQL)", inputSchema: { type: "object", properties: {} } },
  { name: "db_models", category: "db", description: "Find model/entity/schema definition files and symbols", inputSchema: { type: "object", properties: {} } },
  { name: "env_keys", category: "env", description: "List env KEY names only — never values", inputSchema: { type: "object", properties: {} } },
  { name: "env_missing", category: "env", description: "Compare .env.example keys vs code references — never values", inputSchema: { type: "object", properties: {} } },
  { name: "env_usage", category: "env", description: "Where env KEY names are referenced in code — never values", inputSchema: { type: "object", properties: { maxFiles: { type: "number" } } } },

  // —— config / docs / security / performance ——
  { name: "config_show", category: "config", description: "Show Arcframe config", inputSchema: { type: "object", properties: {} } },
  { name: "config_get", category: "config", description: "Get a config key", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "docs_readme", category: "docs", description: "Read README if present", inputSchema: { type: "object", properties: {} } },
  { name: "docs_broken_commands", category: "docs", description: "Scan markdown fences for likely-broken commands", inputSchema: { type: "object", properties: {} } },
  { name: "search_docs", category: "docs", description: "Search markdown docs/README for a query string", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "search_unified", category: "docs", description: "Unified search across symbols, files, docs, and memory", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "security_secrets_scan", category: "security", description: "Defensive scan of .env.example key names", inputSchema: { type: "object", properties: {} } },
  { name: "security_secret_patterns", category: "security", description: "Entropy/pattern secret scan — paths/labels only, never values", inputSchema: { type: "object", properties: { maxFiles: { type: "number" }, includeEntropy: { type: "boolean" } } } },
  { name: "security_sensitive_files", category: "security", description: "Classify sensitive-looking paths (env/keys/pem) — never values", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "security_insecure_config", category: "security", description: "Defensive insecure-config heuristics (CORS *, privileged, TLS off)", inputSchema: { type: "object", properties: {} } },
  { name: "performance_index_stats", category: "performance", description: "Index size / timing metadata", inputSchema: { type: "object", properties: {} } },
  { name: "performance_hot_files", category: "performance", description: "Files with highest fan-in (dependents)", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "performance_large_files", category: "performance", description: "Largest indexed files by size", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "performance_duplicate_imports", category: "performance", description: "Files that import the same module more than once", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "performance_heavy_imports", category: "performance", description: "Files with the most outbound imports", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },

  // —— build / ci / release ——
  { name: "build_scripts", category: "build", description: "List package.json scripts", inputSchema: { type: "object", properties: {} } },
  { name: "build_run", category: "build", description: "Execute the project build script", inputSchema: { type: "object", properties: {} } },
  { name: "ci_workflows", category: "ci", description: "List GitHub Actions workflow files", inputSchema: { type: "object", properties: {} } },
  { name: "ci_detect", category: "ci", description: "Detect CI systems present (.github, .gitlab-ci, …)", inputSchema: { type: "object", properties: {} } },
  { name: "ci_local_equivalent", category: "ci", description: "Map CI workflow steps to local package scripts", inputSchema: { type: "object", properties: {} } },
  { name: "release_changelog", category: "release", description: "Read CHANGELOG if present", inputSchema: { type: "object", properties: {} } },
  { name: "release_readiness", category: "release", description: "Evidence-based release readiness checklist", inputSchema: { type: "object", properties: {} } },
  { name: "release_uncommitted", category: "release", description: "List uncommitted changes that block a clean release", inputSchema: { type: "object", properties: {} } },
  { name: "release_version", category: "release", description: "Detect version from package.json / Cargo.toml / git tags", inputSchema: { type: "object", properties: {} } },

  // —— rules / health / index / flows ——
  { name: "rules_list", category: "rules", description: "List Arcframe rules", inputSchema: { type: "object", properties: {} } },
  { name: "rules_get", category: "rules", description: "Read a rule file by name", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "rules_applicable", category: "rules", description: "Which rules likely apply to a path", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "rules_generate", category: "rules", description: "Generate a rule stub (not written to disk)", inputSchema: { type: "object", properties: { title: { type: "string" }, scope: { type: "string" }, guidance: { type: "string" } }, required: ["title"] } },
  { name: "project_health_report", category: "health", description: "Evidence-based health report", inputSchema: { type: "object", properties: {} } },
  { name: "project_health_summary", category: "health", description: "Compact health score + failing checks", inputSchema: { type: "object", properties: {} } },
  { name: "index_status", category: "index", description: "Arc Index status", inputSchema: { type: "object", properties: {} } },
  { name: "index_rebuild", category: "index", description: "Rebuild Arc Index (and optionally graph)", inputSchema: { type: "object", properties: { graph: { type: "boolean" } } } },
  { name: "flows_list", category: "flows", description: "List built-in Arc Flows", inputSchema: { type: "object", properties: {} } },
  { name: "flows_show", category: "flows", description: "Show an Arc Flow definition", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "flows_inspect", category: "flows", description: "Inspect a flow with rendered prompt and tool checklist", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "flows_run", category: "flows", description: "Plan a flow run — returns steps + evidence hooks (does not auto-execute writes)", inputSchema: { type: "object", properties: { id: { type: "string" }, dryRun: { type: "boolean" } }, required: ["id"] } },
  { name: "ownership_codeowners", category: "ownership", description: "Parse CODEOWNERS rules", inputSchema: { type: "object", properties: {} } },
  { name: "ownership_for_path", category: "ownership", description: "Resolve CODEOWNERS for a path", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "ownership_uncovered", category: "ownership", description: "Indexed files with no CODEOWNERS match", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "workspace_map", category: "workspace", description: "Monorepo workspace package map", inputSchema: { type: "object", properties: {} } },
  { name: "workspace_package", category: "workspace", description: "Info for one workspace package by name or path", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "workspace_cross_deps", category: "workspace", description: "Internal package dependency edges in the monorepo", inputSchema: { type: "object", properties: {} } },
  { name: "adapters_status", category: "adapters", description: "Language adapter coverage vs indexed files", inputSchema: { type: "object", properties: {} } },
  { name: "adapters_for_path", category: "adapters", description: "Which language adapter handles a file path", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "mcp_tool_count", category: "meta", description: "Return registered MCP tool count and names by category", inputSchema: { type: "object", properties: {} } },
];

export const MCP_TOOL_COUNT = MCP_TOOLS.length;

export function toolsByCategory(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of MCP_TOOLS) {
    (out[t.category] ??= []).push(t.name);
  }
  return out;
}
