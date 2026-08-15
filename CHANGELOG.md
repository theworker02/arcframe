# Changelog

All notable changes to Arcframe will be documented here.

## [0.4.0] — 2026-08-14

### Added

- Optional native accelerators under `native/`: Rust `arcframe-hashwalk` (parallel walk + SHA-256 for index invalidation) and Go `arcframe-gitmeta` (structured git status/blame/log JSON), with TS discovery (`ARCFRAME_NATIVE_DIR` / `native/bin`) and JS fallback; `pnpm native:build`
- MCP: **108** distinct tools registered (`servers/mcp` tools.ts + handlers.ts); ListTools/dogfood scripts verify â‰¥30
- Cooler MCP tools: `security_secret_patterns`, `performance_*`, `debug_parse_stacktrace`, `debug_locate_error`, `debug_suspect_symbols`, `analyze_unused`, `command_explain`, `command_detect`, `ci_detect`, `release_readiness`, `project_health_summary`, `mcp_tool_count`
- `arc security scan` â€” secret pattern + entropy scan (path/line/pattern only; values never printed); findings stored in `security:last_scan` meta
- `arc debug stack` â€” parse pasted stack traces â†’ file/line/symbol suspects via index
- `arc analyze unused` â€” heuristic dead-code candidates with confidence labels
- `arc command explain "<cmd>"` / `arc command detect` â€” command intelligence + package script detection
- Watch debounce: adaptive trailing debounce, `maxWaitMs` forced flush, batch directory coalescing (`--debounce` / `--max-wait` on `index watch`)
- Package APIs for MCP wiring: `scanSecretPatterns`, `investigateStacktrace`, `findUnusedSymbols`, `explainCommand`, `detectPackageScripts`, `gitBranches`/`gitBlame`/`gitShow`

## [0.3.0] â€” 2026-08-14

### Added

- FS watch **polling fallback** (Linux default poll/hybrid; native retained on Windows/macOS; error â†’ poll)
- Deep `arc review`: unified-diff hunk parsing, symbol touch inference, categories (scope/api/tests/security/docs/generated/impact) with evidence + confidence
- Framework route/handler extraction: Next.js App Router, Express/Fastify chains, FastAPI/Flask/Django urlpatterns, Axum/Actix
- Per-file framework hints stored in index meta
- GitHub Actions `fixture-smoke` matrix for all six fixtures
- MCP: `tests_run`, `validate_project`, `review_changes`, `changes_analyze`, `build_run`, `api_compatibility`, `docs_broken_commands`, `frameworks_detected`, deps SCCs

### Fixed

- Comment/regex-source false positives in framework route extraction
- Fixture roots for `python-api` / `mixed-language-project` (own project markers so init does not walk to monorepo root)

## [0.2.0] â€” 2026-08-14

### Added

- CLI: `test`, `build`, `validate`, `review`, `changes`, `api`, `docs commands`, `index watch`
- Cursor plugin sidebar sections; VitePress docs
- Windows package-manager spawn via `.cmd`

## [0.1.0] â€” 2026-08-14

### Added

- Foundation monorepo, index/graph, MCP, adapters, brand, CI dogfood
