/**
 * MCP tool handlers — all wired to real Arcframe engine APIs.
 */
import {
  CONTEXT_BUDGET_TOKENS,
  createIgnoreMatcher,
  createRuntime,
  dirExists,
  fileExists,
  getConfigValue,
  isInitialized,
  listFilesRecursive,
  readText,
  relativePosix,
} from "@arcframe/core";
import { openStore, type ArcStore } from "@arcframe/storage";
import { createIndexer, listAdapters } from "@arcframe/analyzer";
import { createGraphBuilder } from "@arcframe/graph";
import {
  DecisionService,
  MemoryService,
  SessionService,
  TaskService,
} from "@arcframe/memory";
import { createContextBuilder } from "@arcframe/context";
import {
  analyzeApiCompatibility,
  analyzeChanges,
  adapterForFilePath,
  adaptersStatus,
  buildHealthReport,
  ciLocalEquivalent,
  classifyCommandRisk,
  detectPackageScripts,
  detectReleaseVersion,
  explainCommand,
  findBrokenDocCommands,
  findDbMigrations,
  findDbModels,
  findDependencyCycles,
  findDuplicateImports,
  findEnvMissing,
  findEnvUsage,
  findHeavyImports,
  findImportSccs,
  findInsecureConfig,
  findSensitiveFiles,
  findUnusedExportCandidates,
  findUnusedSymbols,
  generateRuleStub,
  gitBlame,
  gitBranches,
  gitDiff,
  gitLog,
  gitShow,
  inspectGit,
  investigateStacktrace,
  mapWorkspace,
  ownersForPath,
  parseCodeowners,
  parseStacktrace,
  releaseUncommitted,
  reviewChanges,
  rulesApplicable,
  runBuild,
  runDoctor,
  runTests,
  runValidate,
  scanSecretPatterns,
  searchDocs,
  searchUnified,
  storeSecretScanFindings,
  symbolBlameHistory,
  uncoveredByCodeowners,
  workspaceCrossDeps,
  workspacePackageInfo,
} from "@arcframe/engineering";
import { getFlow, listFlows, renderFlowPrompt } from "@arcframe/workflows";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MCP_TOOL_COUNT, MCP_TOOLS, toolsByCategory } from "./tools.js";

const root =
  process.env.ARCFRAME_ROOT ||
  process.env.CURSOR_PROJECT_DIR ||
  process.cwd();

function getStore(): { runtime: ReturnType<typeof createRuntime>; store: ArcStore } {
  const runtime = createRuntime(root);
  if (!isInitialized(runtime.root)) {
    throw new Error(`Arcframe not initialized at ${runtime.root}. Run \`arc init\`.`);
  }
  return { runtime, store: openStore(runtime.paths.dbPath) };
}

export function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function withStore<T>(fn: (ctx: {
  runtime: ReturnType<typeof createRuntime>;
  store: ArcStore;
}) => T | Promise<T>): Promise<ReturnType<typeof json>> {
  return (async () => {
    const { runtime, store } = getStore();
    try {
      const result = await fn({ runtime, store });
      return json(result);
    } finally {
      store.close();
    }
  })();
}

function fileNode(path: string): string {
  return path.includes(":") ? path : `file:${path.replaceAll("\\", "/")}`;
}

function shortestPath(
  store: ArcStore,
  from: string,
  to: string,
): { path: string[]; found: boolean } {
  const start = fileNode(from);
  const goal = fileNode(to);
  if (start === goal) return { path: [start], found: true };
  const queue = [start];
  const prev = new Map<string, string | null>([[start, null]]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of store.edgesFrom(cur)) {
      if (e.edge_type !== "IMPORTS" && e.edge_type !== "DEPENDS_ON") continue;
      if (prev.has(e.to_id)) continue;
      prev.set(e.to_id, cur);
      if (e.to_id === goal) {
        const path: string[] = [goal];
        let p: string | null | undefined = cur;
        while (p) {
          path.push(p);
          p = prev.get(p) ?? null;
        }
        return { path: path.reverse(), found: true };
      }
      queue.push(e.to_id);
    }
  }
  return { path: [], found: false };
}

function readPkg(rootDir: string): Record<string, unknown> | null {
  const p = join(rootDir, "package.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readText(p)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function handleTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "repository_info":
      return withStore(({ runtime }) => ({
        project: runtime.project,
        confidence: "confirmed",
      }));
    case "repository_summary":
      return withStore(async ({ runtime, store }) => {
        const git = await inspectGit(runtime.root);
        const st = store.stats();
        return {
          name: runtime.project.name,
          root: runtime.root,
          languages: runtime.project.languages,
          frameworks: runtime.project.frameworks,
          index: st,
          git: { branch: git.branch, clean: git.clean, available: git.available },
          confidence: "confirmed",
        };
      });
    case "repository_tree":
      return withStore(({ runtime }) => {
        const ignore = createIgnoreMatcher(runtime.root);
        const files = listFilesRecursive(runtime.root, {
          filter: (p) => !ignore.ignores(p, runtime.root),
        }).map((p) => relativePosix(runtime.root, p));
        const max = Number(args.max ?? 500);
        return { count: files.length, files: files.slice(0, max), confidence: "confirmed" };
      });
    case "repository_file":
      return withStore(({ runtime }) => {
        const path = String(args.path);
        const abs = join(runtime.root, path);
        if (!existsSync(abs)) return { error: "not found", path };
        return { path, content: readText(abs), confidence: "confirmed" };
      });
    case "repository_search":
      return withStore(({ store }) => {
        const q = String(args.query).toLowerCase();
        const limit = Number(args.limit ?? 50);
        const files = store
          .listFiles()
          .filter((f) => f.path.toLowerCase().includes(q))
          .slice(0, limit);
        return { files, confidence: "confirmed" };
      });
    case "repository_languages":
      return withStore(({ store, runtime }) => {
        const counts: Record<string, number> = {};
        for (const f of store.listFiles()) {
          const lang = f.language || "unknown";
          counts[lang] = (counts[lang] ?? 0) + 1;
        }
        return {
          detected: runtime.project.languages,
          indexedCounts: counts,
          confidence: "confirmed",
        };
      });
    case "repository_frameworks":
      return withStore(({ store, runtime }) => {
        const byFile: Array<{ file: string; frameworks: unknown }> = [];
        for (const f of store.listFiles()) {
          const raw = store.getMeta(`frameworks:${f.path}`);
          if (!raw) continue;
          try {
            byFile.push({ file: f.path, frameworks: JSON.parse(raw) });
          } catch {
            /* ignore */
          }
        }
        return {
          project: runtime.project.frameworks,
          files: byFile,
          confidence: "strongly_inferred",
        };
      });
    case "repository_packages":
      return withStore(({ runtime }) => ({
        packageManagers: runtime.project.packageManagers,
        monorepo: runtime.project.monorepo,
        confidence: "confirmed",
      }));
    case "repository_scripts":
    case "build_scripts":
      return withStore(({ runtime }) => {
        const pkg = readPkg(runtime.root);
        return { scripts: (pkg?.scripts as Record<string, string>) ?? {}, confidence: "confirmed" };
      });
    case "repository_configs":
      return withStore(({ runtime }) => {
        const names = [
          "tsconfig.json",
          "jsconfig.json",
          "package.json",
          "pnpm-workspace.yaml",
          "Cargo.toml",
          "go.mod",
          "pyproject.toml",
          "requirements.txt",
          "Dockerfile",
          ".eslintrc.cjs",
          "eslint.config.js",
          "vitest.config.ts",
          "vite.config.ts",
          "next.config.js",
          "next.config.mjs",
        ];
        const present = names.filter((n) => fileExists(join(runtime.root, n)));
        return { present, confidence: "confirmed" };
      });

    case "symbol_search":
      return withStore(({ store }) => ({
        symbols: store.findSymbols(String(args.query), Number(args.limit ?? 50)),
        confidence: "confirmed",
      }));
    case "symbol_in_file":
      return withStore(({ store }) => ({
        symbols: store.listSymbols(String(args.path).replaceAll("\\", "/")),
        confidence: "confirmed",
      }));
    case "symbol_definition":
      return withStore(({ store }) => {
        const hits = store.findSymbols(String(args.name), 20);
        const exact = hits.filter((s) => s.name === args.name);
        return { definitions: exact.length ? exact : hits.slice(0, 5), confidence: "confirmed" };
      });
    case "symbol_references":
      return withStore(({ store }) => {
        const name = String(args.name);
        const defs = store.findSymbols(name, 10);
        const files = new Set<string>();
        for (const f of store.listFiles()) {
          const raw = store.getMeta(`imports:${f.path}`);
          if (raw && raw.includes(name)) files.add(f.path);
        }
        for (const d of defs) files.add(d.file_path);
        return { name, files: [...files].slice(0, 100), confidence: "weakly_inferred" };
      });
    case "symbol_exports":
      return withStore(({ store }) => {
        const path = String(args.path).replaceAll("\\", "/");
        const symbols = store
          .listSymbols(path)
          .filter((s) => /export|function|class|const|type|interface|route/i.test(s.kind));
        return { path, symbols, confidence: "strongly_inferred" };
      });
    case "symbol_imports":
      return withStore(({ store }) => {
        const path = String(args.path).replaceAll("\\", "/");
        const raw = store.getMeta(`imports:${path}`);
        let imports: unknown[] = [];
        if (raw) {
          try {
            imports = JSON.parse(raw) as unknown[];
          } catch {
            /* ignore */
          }
        }
        return { path, imports, confidence: "confirmed" };
      });
    case "symbol_callers":
      return withStore(({ store }) => {
        const id = fileNode(String(args.path));
        const inbound = store
          .edgesTo(id)
          .filter((e) => e.edge_type === "IMPORTS" || e.edge_type === "DEPENDS_ON");
        return { node: id, callers: inbound, confidence: "strongly_inferred" };
      });
    case "symbol_callees":
      return withStore(({ store }) => {
        const id = fileNode(String(args.path));
        const outbound = store
          .edgesFrom(id)
          .filter((e) => e.edge_type === "IMPORTS" || e.edge_type === "DEPENDS_ON");
        return { node: id, callees: outbound, confidence: "strongly_inferred" };
      });
    case "symbol_blame_history":
      return withStore(async ({ runtime, store }) =>
        symbolBlameHistory(runtime.root, store, String(args.name), {
          limit: args.limit ? Number(args.limit) : undefined,
        }),
      );

    case "graph_stats":
      return withStore(({ store }) => createGraphBuilder({ store }).stats());
    case "graph_neighbors":
      return withStore(({ store }) => {
        const id = fileNode(String(args.node));
        return createGraphBuilder({ store }).neighbors(id, args.edgeType as never);
      });
    case "graph_rebuild":
      return withStore(({ store, runtime }) =>
        createGraphBuilder({ store, logger: runtime.logger }).build(),
      );
    case "graph_dependencies":
      return withStore(({ store }) => {
        const id = fileNode(String(args.path));
        return {
          node: id,
          edges: store.edgesFrom(id).filter((e) => e.edge_type === "DEPENDS_ON" || e.edge_type === "IMPORTS"),
          confidence: "confirmed",
        };
      });
    case "graph_dependents":
      return withStore(({ store }) => {
        const id = fileNode(String(args.path));
        return {
          node: id,
          edges: store.edgesTo(id).filter((e) => e.edge_type === "DEPENDS_ON" || e.edge_type === "IMPORTS"),
          confidence: "confirmed",
        };
      });
    case "graph_path":
      return withStore(({ store }) => {
        const result = shortestPath(store, String(args.from), String(args.to));
        return { ...result, confidence: result.found ? "confirmed" : "unknown" };
      });
    case "graph_cycles":
      return withStore(({ store }) => ({
        cycles: findDependencyCycles(store),
        sccs: findImportSccs(store, 3),
        confidence: "strongly_inferred",
      }));
    case "graph_orphans":
      return withStore(({ store }) => {
        const limit = Number(args.limit ?? 50);
        const orphans = store
          .listFiles()
          .filter((f) => {
            const id = `file:${f.path}`;
            const inE = store.edgesTo(id).some((e) => e.edge_type === "IMPORTS");
            const outE = store.edgesFrom(id).some((e) => e.edge_type === "IMPORTS");
            return !inE && !outE;
          })
          .slice(0, limit)
          .map((f) => f.path);
        return { orphans, confidence: "strongly_inferred" };
      });
    case "graph_explain":
      return withStore(({ store }) => {
        const id = fileNode(String(args.node));
        return {
          node: id,
          outbound: store.edgesFrom(id),
          inbound: store.edgesTo(id),
          confidence: "confirmed",
        };
      });

    case "impact_analyze":
      return withStore(({ store }) => {
        const node = fileNode(String(args.target));
        return createGraphBuilder({ store }).impact(node, Number(args.depth ?? 2));
      });
    case "impact_file":
      return withStore(({ store }) => {
        const node = fileNode(String(args.path));
        return createGraphBuilder({ store }).impact(node, Number(args.depth ?? 2));
      });
    case "impact_symbol":
      return withStore(({ store }) => {
        const hits = store.findSymbols(String(args.name), 5);
        const path = hits[0]?.file_path;
        if (!path) return { error: "symbol not found", name: args.name };
        return {
          symbol: hits[0],
          impact: createGraphBuilder({ store }).impact(
            `file:${path}`,
            Number(args.depth ?? 2),
          ),
        };
      });
    case "impact_package":
      return withStore(({ store }) => {
        const prefix = String(args.prefix).replaceAll("\\", "/");
        const depth = Number(args.depth ?? 1);
        const graph = createGraphBuilder({ store });
        const files = store.listFiles().filter((f) => f.path.startsWith(prefix));
        const dependents = new Set<string>();
        const dependencies = new Set<string>();
        for (const f of files.slice(0, 80)) {
          const imp = graph.impact(`file:${f.path}`, depth);
          for (const d of imp.dependents) dependents.add(d);
          for (const d of imp.dependencies) dependencies.add(d);
        }
        return {
          prefix,
          fileCount: files.length,
          dependents: [...dependents].slice(0, 200),
          dependencies: [...dependencies].slice(0, 200),
          confidence: "strongly_inferred",
        };
      });
    case "impact_current_changes":
      return withStore(async ({ runtime, store }) => {
        const git = await inspectGit(runtime.root);
        const files = [...new Set([...git.staged, ...git.unstaged, ...git.untracked])];
        const graph = createGraphBuilder({ store });
        const impacts = files.slice(0, 40).map((f) => ({
          file: f,
          ...graph.impact(fileNode(f), 2),
        }));
        return { files, impacts, confidence: "strongly_inferred" };
      });

    case "context_pack":
      return withStore(({ store, runtime }) => {
        const graph = createGraphBuilder({ store });
        const memory = new MemoryService(store, runtime.events);
        return createContextBuilder({ store, graph, memory }).build(
          String(args.query),
          (args.budget as "normal") || runtime.config.context.defaultBudget,
        );
      });
    case "context_for_file":
      return withStore(({ store, runtime }) => {
        const path = String(args.path);
        const graph = createGraphBuilder({ store });
        const memory = new MemoryService(store, runtime.events);
        return createContextBuilder({ store, graph, memory }).build(
          `file ${path}`,
          (args.budget as "normal") || runtime.config.context.defaultBudget,
        );
      });
    case "context_for_symbol":
      return withStore(({ store, runtime }) => {
        const graph = createGraphBuilder({ store });
        const memory = new MemoryService(store, runtime.events);
        return createContextBuilder({ store, graph, memory }).build(
          `symbol ${String(args.name)}`,
          (args.budget as "normal") || runtime.config.context.defaultBudget,
        );
      });
    case "context_for_task":
      return withStore(({ store, runtime }) => {
        const task = new TaskService(store).get(String(args.taskId));
        if (!task) return { error: "task not found", id: args.taskId };
        const graph = createGraphBuilder({ store });
        const memory = new MemoryService(store, runtime.events);
        const query = `${task.title}\n${task.description}`;
        return {
          task,
          pack: createContextBuilder({ store, graph, memory }).build(
            query,
            (args.budget as "normal") || runtime.config.context.defaultBudget,
          ),
        };
      });
    case "context_explain":
      return withStore(({ store, runtime }) => {
        const graph = createGraphBuilder({ store });
        const memory = new MemoryService(store, runtime.events);
        const pack = createContextBuilder({ store, graph, memory }).build(
          String(args.query),
          (args.budget as "normal") || runtime.config.context.defaultBudget,
        );
        return {
          query: args.query,
          itemCount: pack.items.length,
          reasons: pack.items.map((i) => ({
            path: i.path,
            title: i.title,
            reasons: i.reasons,
          })),
          pack,
          confidence: "strongly_inferred",
        };
      });
    case "context_budget":
      return withStore(({ runtime }) => ({
        budgets: CONTEXT_BUDGET_TOKENS,
        defaultBudget: runtime.config.context.defaultBudget,
        confidence: "confirmed",
      }));

    case "memory_list":
      return withStore(({ store }) => new MemoryService(store).list(args.type as string | undefined));
    case "memory_search":
      return withStore(({ store }) => new MemoryService(store).search(String(args.query)));
    case "memory_write":
      return withStore(({ store, runtime }) =>
        new MemoryService(store, runtime.events).write({
          type: (args.type as string) || "note",
          title: String(args.title),
          content: String(args.content),
          tags: (args.tags as string[]) || [],
        }),
      );
    case "memory_get":
      return withStore(({ store }) => new MemoryService(store).get(String(args.id)) ?? null);
    case "memory_delete":
      return withStore(({ store }) => {
        if (!args.intent) {
          return {
            error: "destructive op requires intent:true",
            confidence: "confirmed",
          };
        }
        return { deleted: new MemoryService(store).delete(String(args.id)) };
      });
    case "decision_list":
      return withStore(({ store }) => new DecisionService(store).list());
    case "decision_create":
      return withStore(({ store }) =>
        new DecisionService(store).create({
          title: String(args.title),
          decision: String(args.decision),
          context: args.context ? String(args.context) : "",
          consequences: args.consequences ? String(args.consequences) : "",
        }),
      );
    case "decision_accept":
      return withStore(({ store }) =>
        new DecisionService(store).updateStatus(String(args.id), "accepted"),
      );
    case "decision_get":
      return withStore(({ store }) => new DecisionService(store).get(String(args.id)) ?? null);
    case "session_list":
      return withStore(({ store }) => new SessionService(store).list());
    case "session_create":
      return withStore(({ store }) => new SessionService(store).create(String(args.title)));
    case "session_get":
      return withStore(({ store }) => new SessionService(store).get(String(args.id)) ?? null);
    case "task_list":
      return withStore(({ store }) =>
        new TaskService(store).list(args.status as never),
      );
    case "task_create":
      return withStore(({ store }) =>
        new TaskService(store).create(String(args.title), String(args.description ?? "")),
      );
    case "task_update":
      return withStore(({ store }) =>
        new TaskService(store).update(String(args.id), {
          status: args.status as "todo" | "in_progress" | "done" | "blocked" | "cancelled",
        }),
      );
    case "task_get":
      return withStore(({ store }) => new TaskService(store).get(String(args.id)) ?? null);

    case "git_status":
      return withStore(async ({ runtime }) => inspectGit(runtime.root));
    case "git_log":
      return withStore(async ({ runtime }) => gitLog(runtime.root, Number(args.limit ?? 10)));
    case "git_diff":
      return withStore(async ({ runtime }) => ({
        diff: await gitDiff(runtime.root, Boolean(args.staged)),
        confidence: "confirmed",
      }));
    case "git_branches":
      return withStore(async ({ runtime }) => gitBranches(runtime.root));
    case "git_blame":
      return withStore(async ({ runtime }) => gitBlame(runtime.root, String(args.path)));
    case "git_show":
      return withStore(async ({ runtime }) => gitShow(runtime.root, String(args.ref)));

    case "tests_inventory":
      return withStore(({ store }) => ({
        files: store.listFiles().filter(
          (f) =>
            /\.(test|spec)\./.test(f.path) ||
            /_test\./.test(f.path) ||
            /(^|\/)tests?\//.test(f.path),
        ),
        confidence: "strongly_inferred",
      }));
    case "tests_run":
      return withStore(async ({ runtime, store }) => {
        const graph = createGraphBuilder({ store });
        return runTests(runtime.root, store, graph, {
          mode: String(args.mode ?? "all"),
          target: args.target ? String(args.target) : undefined,
        });
      });
    case "tests_related":
      return withStore(({ store }) => {
        const id = fileNode(String(args.path));
        const related = store
          .edgesTo(id)
          .filter((e) => e.edge_type === "TESTS")
          .map((e) => e.from_id);
        const heuristic = store
          .listFiles()
          .filter(
            (f) =>
              (/\.(test|spec)\./.test(f.path) || /_test\./.test(f.path)) &&
              f.path.includes(
                String(args.path)
                  .replace(/\.[^.]+$/, "")
                  .split("/")
                  .pop() ?? "",
              ),
          )
          .map((f) => f.path);
        return {
          path: args.path,
          relatedEdges: related,
          heuristic,
          confidence: "strongly_inferred",
        };
      });
    case "validate_doctor":
      return withStore(async ({ runtime, store }) => runDoctor(runtime.root, store));
    case "validate_project":
      return withStore(async ({ runtime, store }) =>
        runValidate(runtime.root, store, createGraphBuilder({ store })),
      );
    case "review_changes":
      return withStore(async ({ runtime, store }) =>
        reviewChanges(runtime.root, store, createGraphBuilder({ store }), Boolean(args.staged)),
      );
    case "changes_analyze":
      return withStore(async ({ runtime, store }) =>
        analyzeChanges(
          runtime.root,
          store,
          createGraphBuilder({ store }),
          (args.aspect as "analyze" | "risk" | "tests" | "docs") || "analyze",
        ),
      );
    case "changes_risk":
      return withStore(async ({ runtime, store }) =>
        analyzeChanges(runtime.root, store, createGraphBuilder({ store }), "risk"),
      );
    case "debug_index_explain":
      return withStore(({ store, runtime }) =>
        createIndexer({ root: runtime.root, store }).explain(String(args.path)),
      );
    case "debug_parse_stacktrace":
      return withStore(({ store }) => {
        const stack = String(args.stack);
        const investigation = investigateStacktrace(store, stack);
        return {
          parsedFrames: parseStacktrace(stack),
          ...investigation,
        };
      });
    case "debug_locate_error":
      return withStore(({ store }) => {
        const message = String(args.message);
        const stack = args.stack ? String(args.stack) : message;
        const investigation = investigateStacktrace(store, stack);
        const symbolHits = store.findSymbols(message.split(/[\s:]+/)[0] ?? message, 10);
        return {
          message,
          investigation,
          symbolHits,
          confidence: investigation.confidence,
        };
      });
    case "debug_suspect_symbols":
      return withStore(({ store }) => {
        const path = String(args.path).replaceAll("\\", "/");
        const line = Number(args.line);
        const symbols = store.listSymbols(path);
        const nearby = symbols
          .map((s) => ({
            ...s,
            distance: Math.abs((s.line ?? 0) - line),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 15);
        return { path, line, suspects: nearby, confidence: "strongly_inferred" };
      });

    case "deps_cycles":
      return withStore(({ store }) => ({
        cycles: findDependencyCycles(store),
        sccs: findImportSccs(store, 3),
        confidence: "strongly_inferred",
      }));
    case "deps_unused_candidates":
      return withStore(({ store }) => ({
        candidates: findUnusedExportCandidates(store),
        confidence: "weakly_inferred",
      }));
    case "analyze_unused":
      return withStore(({ store }) =>
        findUnusedSymbols(store, {
          limit: args.limit ? Number(args.limit) : undefined,
          includePrivate: Boolean(args.includePrivate),
        }),
      );
    case "package_adapters":
      return json(
        listAdapters().map((a) => ({ id: a.id, name: a.name, extensions: a.extensions })),
      );
    case "package_info":
      return withStore(({ runtime }) => {
        const pkg = readPkg(runtime.root);
        if (!pkg) return { present: false };
        return {
          name: pkg.name,
          version: pkg.version,
          private: pkg.private,
          scripts: Object.keys((pkg.scripts as object) ?? {}),
          confidence: "confirmed",
        };
      });
    case "frameworks_detected":
      return withStore(({ store }) => {
        const byFile: Array<{ file: string; frameworks: unknown }> = [];
        for (const f of store.listFiles()) {
          const raw = store.getMeta(`frameworks:${f.path}`);
          if (!raw) continue;
          try {
            byFile.push({ file: f.path, frameworks: JSON.parse(raw) });
          } catch {
            /* ignore */
          }
        }
        return { files: byFile, confidence: "strongly_inferred" };
      });
    case "command_explain":
      return withStore(({ runtime }) => {
        const pkg = readPkg(runtime.root);
        return explainCommand(String(args.command), {
          root: runtime.root,
          scripts: (pkg?.scripts as Record<string, string>) ?? undefined,
        });
      });
    case "command_detect":
      return withStore(({ runtime }) =>
        detectPackageScripts(runtime.root, {
          maxPackages: args.maxPackages ? Number(args.maxPackages) : undefined,
        }),
      );
    case "command_risk":
    case "terminal_risk":
      return json(classifyCommandRisk(String(args.command)));

    case "api_routes":
      return withStore(({ store }) => {
        const routes: unknown[] = [];
        for (const f of store.listFiles()) {
          const raw = store.getMeta(`routes:${f.path}`);
          if (!raw) continue;
          try {
            routes.push({ file: f.path, routes: JSON.parse(raw) });
          } catch {
            /* ignore */
          }
        }
        return { routes, confidence: "strongly_inferred" };
      });
    case "api_compatibility":
      return withStore(({ store }) => analyzeApiCompatibility(store));
    case "db_schema_files":
      return withStore(({ store }) => ({
        files: store.listFiles().filter((f) =>
          /(schema\.prisma|drizzle|migrations\/|\.sql$)/i.test(f.path),
        ),
        confidence: "strongly_inferred",
        note: "Never exposes credentials",
      }));
    case "db_migrations":
      return withStore(({ store }) => findDbMigrations(store));
    case "db_models":
      return withStore(({ store }) => findDbModels(store));
    case "env_keys":
      return withStore(({ runtime }) => {
        const keys: string[] = [];
        for (const name of [".env.example", ".env.sample", ".env.template"]) {
          const p = join(runtime.root, name);
          if (!existsSync(p)) continue;
          for (const line of readText(p).split(/\r?\n/)) {
            const m = /^([A-Z0-9_]+)=/.exec(line);
            if (m) keys.push(m[1]);
          }
        }
        return { keys: [...new Set(keys)], confidence: "confirmed", note: "Values never returned" };
      });
    case "env_missing":
      return withStore(({ runtime, store }) => findEnvMissing(runtime.root, store));
    case "env_usage":
      return withStore(({ runtime, store }) =>
        findEnvUsage(runtime.root, store, {
          maxFiles: args.maxFiles ? Number(args.maxFiles) : undefined,
        }),
      );

    case "config_show":
      return withStore(({ runtime }) => runtime.config);
    case "config_get":
      return withStore(({ runtime }) => ({
        key: args.key,
        value: getConfigValue(runtime.root, String(args.key)),
        confidence: "confirmed",
      }));
    case "docs_readme":
      return withStore(({ runtime }) => {
        const p = join(runtime.root, "README.md");
        if (!existsSync(p)) return { present: false };
        return { present: true, content: readText(p).slice(0, 20_000), confidence: "confirmed" };
      });
    case "docs_broken_commands":
      return withStore(({ runtime }) => findBrokenDocCommands(runtime.root));
    case "search_docs":
      return withStore(({ runtime }) =>
        searchDocs(runtime.root, String(args.query), {
          limit: args.limit ? Number(args.limit) : undefined,
        }),
      );
    case "search_unified":
      return withStore(({ runtime, store }) => {
        const memory = new MemoryService(store).search(String(args.query));
        return searchUnified(
          runtime.root,
          store,
          String(args.query),
          memory.map((m) => ({ id: m.id, title: m.title, type: m.type })),
          { limit: args.limit ? Number(args.limit) : undefined },
        );
      });
    case "security_secrets_scan":
      return withStore(({ runtime }) => {
        const findings: Array<{ file: string; key: string }> = [];
        for (const name of [".env.example", ".env.sample"]) {
          const p = join(runtime.root, name);
          if (!existsSync(p)) continue;
          for (const line of readText(p).split(/\r?\n/)) {
            const m =
              /^([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE)[A-Z0-9_]*)=/i.exec(
                line,
              );
            if (m) findings.push({ file: name, key: m[1] });
          }
        }
        return {
          findings,
          confidence: "strongly_inferred",
          note: "Defensive only — key names from example files, never values",
        };
      });
    case "security_secret_patterns":
      return withStore(({ runtime, store }) => {
        const result = scanSecretPatterns(runtime.root, {
          maxFiles: args.maxFiles ? Number(args.maxFiles) : undefined,
          includeEntropy:
            args.includeEntropy === undefined ? true : Boolean(args.includeEntropy),
        });
        storeSecretScanFindings(store, result);
        return result;
      });
    case "security_sensitive_files":
      return withStore(({ store }) =>
        findSensitiveFiles(store, {
          limit: args.limit ? Number(args.limit) : undefined,
        }),
      );
    case "security_insecure_config":
      return withStore(({ runtime, store }) => findInsecureConfig(runtime.root, store));
    case "performance_index_stats":
      return withStore(({ store }) => ({
        stats: store.stats(),
        lastBuilt: store.getMeta("index:last_built"),
        confidence: "confirmed",
      }));
    case "performance_hot_files":
      return withStore(({ store }) => {
        const limit = Number(args.limit ?? 20);
        const scored = store.listFiles().map((f) => {
          const id = `file:${f.path}`;
          const fanIn = store
            .edgesTo(id)
            .filter((e) => e.edge_type === "IMPORTS" || e.edge_type === "DEPENDS_ON").length;
          return { path: f.path, fanIn };
        });
        scored.sort((a, b) => b.fanIn - a.fanIn);
        return { hot: scored.slice(0, limit), confidence: "strongly_inferred" };
      });
    case "performance_large_files":
      return withStore(({ store }) => {
        const limit = Number(args.limit ?? 20);
        const files = [...store.listFiles()]
          .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
          .slice(0, limit)
          .map((f) => ({ path: f.path, size: f.size, language: f.language }));
        return { files, confidence: "confirmed" };
      });
    case "performance_duplicate_imports":
      return withStore(({ store }) =>
        findDuplicateImports(store, {
          limit: args.limit ? Number(args.limit) : undefined,
        }),
      );
    case "performance_heavy_imports":
      return withStore(({ store }) =>
        findHeavyImports(store, {
          limit: args.limit ? Number(args.limit) : undefined,
        }),
      );

    case "build_run":
      return withStore(async ({ runtime }) => runBuild(runtime.root));
    case "ci_workflows":
      return withStore(({ runtime }) => {
        const dir = join(runtime.root, ".github", "workflows");
        if (!existsSync(dir)) return { workflows: [] };
        return {
          workflows: readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f)),
          confidence: "confirmed",
        };
      });
    case "ci_detect":
      return withStore(({ runtime }) => {
        const systems: Array<{ id: string; present: boolean; path?: string }> = [
          {
            id: "github_actions",
            present: dirExists(join(runtime.root, ".github", "workflows")),
            path: ".github/workflows",
          },
          {
            id: "gitlab_ci",
            present: fileExists(join(runtime.root, ".gitlab-ci.yml")),
            path: ".gitlab-ci.yml",
          },
          {
            id: "azure_pipelines",
            present: fileExists(join(runtime.root, "azure-pipelines.yml")),
            path: "azure-pipelines.yml",
          },
          {
            id: "circleci",
            present: dirExists(join(runtime.root, ".circleci")),
            path: ".circleci",
          },
          {
            id: "buildkite",
            present: fileExists(join(runtime.root, ".buildkite")),
            path: ".buildkite",
          },
        ];
        return {
          systems: systems.filter((s) => s.present),
          all: systems,
          confidence: "confirmed",
        };
      });
    case "ci_local_equivalent":
      return withStore(({ runtime }) => ciLocalEquivalent(runtime.root));
    case "release_changelog":
      return withStore(({ runtime }) => {
        const p = join(runtime.root, "CHANGELOG.md");
        if (!existsSync(p)) return { present: false };
        return { present: true, content: readText(p).slice(0, 20_000), confidence: "confirmed" };
      });
    case "release_readiness":
      return withStore(async ({ runtime, store }) => {
        const health = await buildHealthReport(
          runtime.root,
          store,
          createGraphBuilder({ store }),
        );
        const git = await inspectGit(runtime.root);
        const changelog = fileExists(join(runtime.root, "CHANGELOG.md"));
        const license = fileExists(join(runtime.root, "LICENSE"));
        const checks = [
          { id: "health_grade", ok: ["A", "B"].includes(String(health.grade)), detail: health.grade },
          { id: "git_clean", ok: Boolean(git.clean), detail: git.clean },
          { id: "changelog", ok: changelog, detail: changelog },
          { id: "license", ok: license, detail: license },
          {
            id: "index_present",
            ok: store.stats().files > 0,
            detail: store.stats().files,
          },
        ];
        return {
          ready: checks.every((c) => c.ok),
          checks,
          health,
          confidence: "strongly_inferred",
        };
      });
    case "release_uncommitted":
      return withStore(async ({ runtime }) => releaseUncommitted(runtime.root));
    case "release_version":
      return withStore(async ({ runtime }) => detectReleaseVersion(runtime.root));

    case "rules_list":
      return withStore(({ runtime }) => {
        const dir = runtime.paths.rulesDir;
        if (!existsSync(dir)) return { rules: [] };
        const rules = readdirSync(dir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => ({
            file: f,
            content: readText(join(dir, f)).slice(0, 4000),
          }));
        return { rules, confidence: "confirmed" };
      });
    case "rules_get":
      return withStore(({ runtime }) => {
        const name = String(args.name);
        const dir = runtime.paths.rulesDir;
        const candidates = [
          join(dir, name),
          join(dir, name.endsWith(".md") ? name : `${name}.md`),
        ];
        const hit = candidates.find((p) => existsSync(p));
        if (!hit) return { error: "not found", name };
        return { name, content: readText(hit), confidence: "confirmed" };
      });
    case "rules_applicable":
      return withStore(({ runtime }) =>
        rulesApplicable(runtime.root, runtime.paths.rulesDir, String(args.path)),
      );
    case "rules_generate":
      return json(
        generateRuleStub({
          title: String(args.title),
          scope: args.scope ? String(args.scope) : undefined,
          guidance: args.guidance ? String(args.guidance) : undefined,
        }),
      );
    case "project_health_report":
      return withStore(async ({ runtime, store }) =>
        buildHealthReport(runtime.root, store, createGraphBuilder({ store })),
      );
    case "project_health_summary":
      return withStore(async ({ runtime, store }) => {
        const report = await buildHealthReport(
          runtime.root,
          store,
          createGraphBuilder({ store }),
        );
        const failing = report.checks.filter((c) => !c.ok);
        return {
          grade: report.grade,
          score: report.score,
          failing,
          confidence: "confirmed",
        };
      });
    case "index_status":
      return withStore(({ store, runtime }) =>
        createIndexer({ root: runtime.root, store }).status(),
      );
    case "index_rebuild":
      return withStore(async ({ store, runtime }) => {
        const indexer = createIndexer({
          root: runtime.root,
          store,
          logger: runtime.logger,
          incremental: false,
        });
        const index = await indexer.build(true);
        let graph = null;
        if (args.graph !== false) {
          graph = createGraphBuilder({ store, logger: runtime.logger }).build();
        }
        return { index, graph };
      });
    case "flows_list":
      return json({ flows: listFlows(), confidence: "confirmed" });
    case "flows_show":
      return json({
        flow: getFlow(String(args.id)) ?? null,
        confidence: "confirmed",
      });
    case "flows_inspect":
      return json((() => {
        const flow = getFlow(String(args.id));
        if (!flow) return { error: "flow not found", id: args.id };
        const toolNames = new Set(MCP_TOOLS.map((t) => t.name));
        return {
          flow,
          prompt: renderFlowPrompt(flow),
          steps: flow.steps.map((s) => ({
            ...s,
            toolsAvailable: s.tools.map((t) => ({
              tool: t,
              registered: toolNames.has(t),
            })),
          })),
          confidence: "confirmed",
        };
      })());
    case "flows_run":
      return withStore(async ({ runtime, store }) => {
        const flow = getFlow(String(args.id));
        if (!flow) return { error: "flow not found", id: args.id };
        const dryRun = args.dryRun !== false;
        const git = await inspectGit(runtime.root);
        const health = await buildHealthReport(
          runtime.root,
          store,
          createGraphBuilder({ store }),
        );
        return {
          flowId: flow.id,
          dryRun,
          note: dryRun
            ? "Plan only — no write steps executed. Set dryRun:false is still non-mutating in this release."
            : "Inspect-mode run: returns evidence checklist without mutating the repo",
          plan: flow.steps.map((s, i) => ({
            order: i + 1,
            id: s.id,
            title: s.title,
            description: s.description,
            tools: s.tools,
          })),
          evidence: {
            gitClean: git.clean,
            branch: git.branch,
            healthGrade: health.grade,
            indexFiles: store.stats().files,
          },
          prompt: renderFlowPrompt(flow),
          confidence: "strongly_inferred",
        };
      });
    case "ownership_codeowners":
      return withStore(({ runtime }) => parseCodeowners(runtime.root));
    case "ownership_for_path":
      return withStore(({ runtime }) => ownersForPath(runtime.root, String(args.path)));
    case "ownership_uncovered":
      return withStore(({ runtime, store }) =>
        uncoveredByCodeowners(runtime.root, store, {
          limit: args.limit ? Number(args.limit) : undefined,
        }),
      );
    case "workspace_map":
      return withStore(({ runtime }) => mapWorkspace(runtime.root));
    case "workspace_package":
      return withStore(({ runtime }) => workspacePackageInfo(runtime.root, String(args.name)));
    case "workspace_cross_deps":
      return withStore(({ runtime }) => workspaceCrossDeps(runtime.root));
    case "adapters_status":
      return withStore(({ store }) =>
        adaptersStatus(
          store,
          listAdapters().map((a) => ({
            id: a.id,
            name: a.name,
            extensions: a.extensions,
          })),
        ),
      );
    case "adapters_for_path":
      return json(
        adapterForFilePath(
          String(args.path),
          listAdapters().map((a) => ({
            id: a.id,
            name: a.name,
            extensions: a.extensions,
          })),
        ),
      );
    case "mcp_tool_count":
      return json({
        count: MCP_TOOL_COUNT,
        byCategory: toolsByCategory(),
        names: MCP_TOOLS.map((t) => t.name),
        confidence: "confirmed",
      });
    default:
      return json({ error: `Unknown tool: ${name}` });
  }
}
