# MCP

Arcframe MCP server (`arcframe-mcp`) exposes **precise, schema’d tools** over real engine APIs — not dump endpoints. No secret values are ever returned.

## Start

```bash
pnpm --filter @arcframe/mcp build
# ARCFRAME_ROOT=<project>  (defaults to cwd / CURSOR_PROJECT_DIR)
node ./servers/mcp/dist/index.js
```

Verify registration:

```bash
node ./scripts/count-mcp-tools.mjs
node ./scripts/verify-mcp-tools.mjs
node ./scripts/dogfood-mcp-list.mjs
```

## Inventory

**Exact registered tool count: 136**

| Category | Tools |
| --- | --- |
| repository | `repository_info`, `repository_summary`, `repository_tree`, `repository_file`, `repository_search`, `repository_languages`, `repository_frameworks`, `repository_packages`, `repository_scripts`, `repository_configs` |
| symbol | `symbol_search`, `symbol_in_file`, `symbol_definition`, `symbol_references`, `symbol_exports`, `symbol_imports`, `symbol_callers`, `symbol_callees`, `symbol_blame_history` |
| graph | `graph_stats`, `graph_neighbors`, `graph_rebuild`, `graph_dependencies`, `graph_dependents`, `graph_path`, `graph_cycles`, `graph_orphans`, `graph_explain` |
| impact | `impact_analyze`, `impact_file`, `impact_symbol`, `impact_package`, `impact_current_changes` |
| context | `context_pack`, `context_for_file`, `context_for_symbol`, `context_for_task`, `context_explain`, `context_budget` |
| memory | `memory_list`, `memory_search`, `memory_write`, `memory_get`, `memory_delete` |
| decision | `decision_list`, `decision_create`, `decision_accept`, `decision_get` |
| session | `session_list`, `session_create`, `session_get` |
| task | `task_list`, `task_create`, `task_update`, `task_get` |
| git | `git_status`, `git_log`, `git_diff`, `git_branches`, `git_blame`, `git_show` |
| tests | `tests_inventory`, `tests_run`, `tests_related` |
| validate | `validate_doctor`, `validate_project` |
| review / changes | `review_changes`, `changes_analyze`, `changes_risk` |
| debug | `debug_index_explain`, `debug_parse_stacktrace`, `debug_locate_error`, `debug_suspect_symbols` |
| deps / analyze | `deps_cycles`, `deps_unused_candidates`, `analyze_unused` |
| package / frameworks / command | `package_adapters`, `package_info`, `frameworks_detected`, `command_explain`, `command_detect`, `command_risk`, `terminal_risk` |
| api / db / env | `api_routes`, `api_compatibility`, `db_schema_files`, `db_migrations`, `db_models`, `env_keys`, `env_missing`, `env_usage` |
| config / docs | `config_show`, `config_get`, `docs_readme`, `docs_broken_commands`, `search_docs`, `search_unified` |
| security | `security_secrets_scan`, `security_secret_patterns`, `security_sensitive_files`, `security_insecure_config` |
| performance | `performance_index_stats`, `performance_hot_files`, `performance_large_files`, `performance_duplicate_imports`, `performance_heavy_imports` |
| build / ci / release | `build_scripts`, `build_run`, `ci_workflows`, `ci_detect`, `ci_local_equivalent`, `release_changelog`, `release_readiness`, `release_uncommitted`, `release_version` |
| rules / health / index | `rules_list`, `rules_get`, `rules_applicable`, `rules_generate`, `project_health_report`, `project_health_summary`, `index_status`, `index_rebuild` |
| ownership / workspace / adapters | `ownership_codeowners`, `ownership_for_path`, `ownership_uncovered`, `workspace_map`, `workspace_package`, `workspace_cross_deps`, `adapters_status`, `adapters_for_path` |
| flows / meta | `flows_list`, `flows_show`, `flows_inspect`, `flows_run`, `mcp_tool_count` |

Agent-facing highlights: ownership/CODEOWNERS, workspace map, `symbol_blame_history`, `command_risk`, `env_missing`/`env_usage`, `ci_local_equivalent`, `search_unified`, `security_sensitive_files`, `flows_inspect`/`flows_run`, plus prior cooler tools (`security_secret_patterns`, stacktrace debug, `analyze_unused`, …).

## Resources

`arcframe://project|architecture|graph|memory|decisions|tasks|session|rules|changes|validation|health|mcp-tools`

## Prompts

`investigate-bug`, `implement-feature`, `plan-refactor`, `review-changes`, `explain-system`, `trace-request`, `trace-data-flow`, `find-regression`, `prepare-release`, `write-tests`, `audit-package`, `document-module`, `analyze-performance`, `review-api-change`, `review-database-change`
