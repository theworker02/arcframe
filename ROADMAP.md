# Roadmap

Honest status after the 0.4 MCP expansion toward v1.0.

## Done (ships in 0.3–0.4)

- [x] Local-first core + SQLite storage
- [x] Incremental index + graph (TS/JS/Rust/Python/Go)
- [x] CLI + MCP + memory/context/flows
- [x] `test` / `build` / `validate` / `review` / `changes` / `api` / `docs`
- [x] Cross-platform FS watch: native + **polling fallback** (Linux prefers poll/hybrid)
- [x] Hunk/symbol-aware `arc review` (scope, API, tests, security, docs, generated, impact + evidence)
- [x] Framework depth: React/Next.js App Router, Express/Fastify, FastAPI/Flask/Django, Axum/Actix routes with confidence
- [x] Fixture CI matrix (`typescript-app`, `nextjs-monorepo`, `rust-workspace`, `python-api`, `go-service`, `mixed-language-project`)
- [x] MCP tools wired to engineering ops (`tests_run`, `validate_project`, `review_changes`, `changes_analyze`, `build_run`, `api_compatibility`, `docs_broken_commands`, `frameworks_detected`, SCC deps)
- [x] **MCP ≥30 tools hard gate** — **108** distinct tools registered + dogfood (`security_secret_patterns`, `analyze_unused`, `command_explain`/`command_detect`, `debug_*`, `performance_*`, `release_readiness`, …)
- [x] VitePress docs + Cursor sidebar sections
- [x] Dogfood on Arcframe repo (health A, validate ok)

## Post-1.0 / still open

- [ ] Line-accurate symbol↔hunk mapping when `end_line` is missing (currently window heuristic)
- [ ] Full AST-based adapters (tree-sitter / TS compiler API) instead of regex
- [ ] Polling watcher CPU tuning / ignore hot paths under very large monorepos
- [ ] Cursor sidebar as separate TreeView hosts (still one webview with sections — by design given public APIs)
- [ ] Release automation beyond changelog + health checks
- [x] Broader secret detection (entropy) — defensive, never print values (`security_secret_patterns` / `arc security scan`)

## Non-goals

- Hosted cloud that uploads source
- Auto git push
- Undocumented Cursor private APIs
