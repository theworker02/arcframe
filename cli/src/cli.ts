import {
  createRuntime,
  fileExists,
  formatError,
  getConfigValue,
  initConfig,
  isInitialized,
  loadConfig,
  NotInitializedError,
  setConfigValue,
  writeText,
} from "@arcframe/core";
import { openStore } from "@arcframe/storage";
import { createIndexer, listAdapters, startIndexWatcher } from "@arcframe/analyzer";
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
  findHeavyImports,
  findImportSccs,
  findInsecureConfig,
  findSensitiveFiles,
  findUnusedSymbols,
  gitDiff,
  gitLog,
  inspectGit,
  investigateStacktrace,
  mapWorkspace,
  ownersForPath,
  parseCodeowners,
  releaseUncommitted,
  reviewChanges,
  runBuild,
  runDoctor,
  runTests,
  runValidate,
  scanSecretPatterns,
  searchDocs,
  storeSecretScanFindings,
  uncoveredByCodeowners,
} from "@arcframe/engineering";
import { getFlow, listFlows, renderFlowPrompt } from "@arcframe/workflows";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stdin as input } from "node:process";

export interface CliContext {
  cwd: string;
  json: boolean;
  args: string[];
}

function print(ctx: CliContext, data: unknown): void {
  if (ctx.json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}


/** Copper (#B87333) ANSI — brand note for human-readable CLI output. */
const COPPER = "\x1b[38;2;184;115;51m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function printBanner(): void {
  console.log(
    COPPER +
      "\n      .·´¯`·.\n" +
      "     /  ARC  \\\n" +
      "    ●─────●\n" +
      "     \\ FRAME /\n" +
      "      `·._.·´\n" +
      RESET +
      DIM +
      "  copper on charcoal · local-first" +
      RESET +
      "\n",
  );
}

function requireInit(root: string): void {
  if (!isInitialized(root)) {
    throw new NotInitializedError(root);
  }
}

function parseFlags(argv: string[]): {
  args: string[];
  flags: Record<string, string | boolean>;
} {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith("-") && a.length === 2) {
      flags[a.slice(1)] = true;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

async function cmdInit(ctx: CliContext): Promise<void> {
  const runtime = createRuntime(ctx.cwd);

  const config = initConfig(runtime.root, {
    projectName: runtime.project.name,
  });

  // Seed ignore file
  const ignorePath = join(runtime.root, ".arcframeignore");
  if (!fileExists(ignorePath)) {
    const bundled = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../.arcframeignore",
    );
    if (existsSync(bundled)) {
      copyFileSync(bundled, ignorePath);
    } else {
      writeText(
        ignorePath,
        "node_modules/\n.git/\n.arcframe/\ndist/\nbuild/\ncoverage/\n",
      );
    }
  }

  const store = openStore(runtime.paths.dbPath);
  try {
    store.setMeta("initialized_at", new Date().toISOString());
    store.setMeta("project_name", runtime.project.name);

    const indexer = createIndexer({
      root: runtime.root,
      store,
      logger: runtime.logger,
      events: runtime.events,
      incremental: false,
    });
    const indexResult = await indexer.build(true);
    const graph = createGraphBuilder({
      store,
      logger: runtime.logger,
      events: runtime.events,
    });
    const graphStats = graph.build();

    // Write MCP config snippet for Cursor
    const mcpConfig = {
      mcpServers: {
        arcframe: {
          command: "node",
          args: [join(runtime.root, "servers", "mcp", "dist", "index.js")],
          env: {
            ARCFRAME_ROOT: runtime.root,
          },
        },
      },
    };
    writeText(
      join(runtime.paths.arcframeDir, "mcp.json"),
      JSON.stringify(mcpConfig, null, 2),
    );

    // Seed rules from repo pack when available
    const rulesSrc = join(runtime.root, "rules");
    if (existsSync(rulesSrc)) {
      const { readdirSync } = await import("node:fs");
      for (const file of readdirSync(rulesSrc)) {
        if (!file.endsWith(".md")) continue;
        const dest = join(runtime.paths.rulesDir, file);
        if (!existsSync(dest)) {
          copyFileSync(join(rulesSrc, file), dest);
        }
      }
    } else {
      writeText(
        join(runtime.paths.rulesDir, "01-local-first.md"),
        `# Local-first\n\nNever upload source to Arcframe servers. Prefer evidence over assumptions.\n`,
      );
    }

    print(ctx, {
      ok: true,
      project: runtime.project,
      config,
      index: indexResult.progress,
      graph: graphStats,
      paths: runtime.paths,
      message: "Arcframe initialized",
    });
  } finally {
    store.close();
  }
}

async function withStore<T>(
  cwd: string,
  fn: (runtime: ReturnType<typeof createRuntime>, store: ReturnType<typeof openStore>) => Promise<T> | T,
): Promise<T> {
  const runtime = createRuntime(cwd);
  requireInit(runtime.root);
  const store = openStore(runtime.paths.dbPath);
  try {
    return await fn(runtime, store);
  } finally {
    store.close();
  }
}

async function cmdStatus(ctx: CliContext): Promise<void> {
  await withStore(ctx.cwd, async (runtime, store) => {
    if (!ctx.json) printBanner();
    const git = await inspectGit(runtime.root);
    print(ctx, {
      project: runtime.project,
      config: runtime.config,
      index: store.stats(),
      lastIndex: store.getMeta("index:last_built"),
      lastGraph: store.getMeta("graph:last_built"),
      git,
    });
  });
}

async function cmdIndex(ctx: CliContext, flags: Record<string, string | boolean>): Promise<void> {
  const sub = ctx.args[1];
  await withStore(ctx.cwd, async (runtime, store) => {
    const indexer = createIndexer({
      root: runtime.root,
      store,
      logger: runtime.logger,
      events: runtime.events,
      incremental: runtime.config.index.incremental,
    });
    if (sub === "status") {
      print(ctx, indexer.status());
      return;
    }
    if (sub === "explain") {
      const file = ctx.args[2];
      if (!file) throw new Error("Usage: arc index explain <file>");
      print(ctx, indexer.explain(file));
      return;
    }
    if (sub === "clean") {
      store.db.exec("DELETE FROM symbols; DELETE FROM files; DELETE FROM edges;");
      print(ctx, { ok: true, message: "Index cleaned" });
      return;
    }
    if (sub === "watch") {
      const debounceMs = flags.debounce ? Number(flags.debounce) : 400;
      const maxWaitMs = flags["max-wait"] ? Number(flags["max-wait"]) : 2000;
      print(ctx, {
        message: "Watching for changes (Ctrl+C to stop)",
        root: runtime.root,
        debounceMs,
        maxWaitMs,
      });
      const watcher = startIndexWatcher({
        root: runtime.root,
        store,
        logger: runtime.logger,
        events: runtime.events,
        rebuildGraph: true,
        debounceMs,
        maxWaitMs,
      });
      print(ctx, { watching: true, mode: watcher.mode, debounceMs, maxWaitMs });
      await new Promise<void>((resolve) => {
        const stop = () => {
          watcher.close();
          resolve();
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
      return;
    }
    if (sub === "rebuild" || flags.full || flags.rebuild) {
      const result = await indexer.build(true);
      const graph = createGraphBuilder({ store, logger: runtime.logger });
      const graphStats = graph.build();
      print(ctx, { index: result, graph: graphStats });
      return;
    }
    const result = await indexer.build(false);
    print(ctx, result);
  });
}

async function cmdGraph(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1];
  await withStore(ctx.cwd, async (runtime, store) => {
    const graph = createGraphBuilder({ store, logger: runtime.logger });
    if (sub === "build" || !sub) {
      print(ctx, graph.build());
      return;
    }
    if (sub === "stats") {
      print(ctx, graph.stats());
      return;
    }
    if (sub === "neighbors") {
      const node = ctx.args[2];
      if (!node) throw new Error("Usage: arc graph neighbors <nodeId>");
      print(ctx, graph.neighbors(node.startsWith("file:") ? node : `file:${node}`));
      return;
    }
    throw new Error(`Unknown graph subcommand: ${sub}`);
  });
}

async function cmdImpact(ctx: CliContext): Promise<void> {
  const target = ctx.args[1];
  if (!target) throw new Error("Usage: arc impact <file-or-node>");
  await withStore(ctx.cwd, async (_runtime, store) => {
    const graph = createGraphBuilder({ store });
    const node = target.startsWith("file:") || target.startsWith("symbol:")
      ? target
      : `file:${target.replaceAll("\\", "/")}`;
    print(ctx, graph.impact(node, Number(ctx.args[2] ?? 2)));
  });
}

async function cmdContext(ctx: CliContext, flags: Record<string, string | boolean>): Promise<void> {
  const query = ctx.args.slice(1).join(" ") || String(flags.query || "");
  if (!query) throw new Error("Usage: arc context <query>");
  await withStore(ctx.cwd, async (runtime, store) => {
    const graph = createGraphBuilder({ store });
    const memory = new MemoryService(store, runtime.events);
    const builder = createContextBuilder({ store, graph, memory });
    const budget = (flags.budget as string) || runtime.config.context.defaultBudget;
    print(ctx, builder.build(query, budget as "tiny" | "small" | "normal" | "large" | "unlimited"));
  });
}

async function cmdMemory(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1];
  await withStore(ctx.cwd, async (runtime, store) => {
    const memory = new MemoryService(store, runtime.events);
    if (sub === "list" || !sub) {
      print(ctx, memory.list(ctx.args[2]));
      return;
    }
    if (sub === "search") {
      print(ctx, memory.search(ctx.args.slice(2).join(" ")));
      return;
    }
    if (sub === "add" || sub === "write") {
      const title = ctx.args[2];
      const content = ctx.args.slice(3).join(" ");
      if (!title || !content) throw new Error("Usage: arc memory add <title> <content...>");
      print(ctx, memory.write({ type: "note", title, content }));
      return;
    }
    if (sub === "get") {
      print(ctx, memory.get(ctx.args[2]!) ?? null);
      return;
    }
    if (sub === "delete") {
      print(ctx, { deleted: memory.delete(ctx.args[2]!) });
      return;
    }
    throw new Error(`Unknown memory subcommand: ${sub}`);
  });
}

async function cmdDecision(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1];
  await withStore(ctx.cwd, async (_runtime, store) => {
    const decisions = new DecisionService(store);
    if (sub === "list" || !sub) {
      print(ctx, decisions.list());
      return;
    }
    if (sub === "add") {
      const title = ctx.args[2];
      const decision = ctx.args.slice(3).join(" ");
      if (!title || !decision) {
        throw new Error("Usage: arc decision add <title> <decision...>");
      }
      print(ctx, decisions.create({ title, decision }));
      return;
    }
    if (sub === "get") {
      print(ctx, decisions.get(ctx.args[2]!) ?? null);
      return;
    }
    if (sub === "accept") {
      print(ctx, decisions.updateStatus(ctx.args[2]!, "accepted"));
      return;
    }
    throw new Error(`Unknown decision subcommand: ${sub}`);
  });
}

async function cmdSession(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1];
  await withStore(ctx.cwd, async (_runtime, store) => {
    const sessions = new SessionService(store);
    if (sub === "list" || !sub) {
      print(ctx, sessions.list());
      return;
    }
    if (sub === "create") {
      const title = ctx.args.slice(2).join(" ") || "Session";
      print(ctx, sessions.create(title));
      return;
    }
    if (sub === "get" || sub === "restore") {
      print(ctx, sessions.get(ctx.args[2]!) ?? null);
      return;
    }
    throw new Error(`Unknown session subcommand: ${sub}`);
  });
}

async function cmdTask(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1];
  await withStore(ctx.cwd, async (_runtime, store) => {
    const tasks = new TaskService(store);
    if (sub === "list" || !sub) {
      print(ctx, tasks.list());
      return;
    }
    if (sub === "add") {
      const title = ctx.args.slice(2).join(" ");
      if (!title) throw new Error("Usage: arc task add <title>");
      print(ctx, tasks.create(title));
      return;
    }
    if (sub === "done") {
      print(ctx, tasks.update(ctx.args[2]!, { status: "done" }));
      return;
    }
    if (sub === "start") {
      print(ctx, tasks.update(ctx.args[2]!, { status: "in_progress" }));
      return;
    }
    throw new Error(`Unknown task subcommand: ${sub}`);
  });
}

async function cmdGit(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "status";
  const runtime = createRuntime(ctx.cwd);
  if (sub === "status") {
    print(ctx, await inspectGit(runtime.root));
    return;
  }
  if (sub === "log") {
    print(ctx, await gitLog(runtime.root, Number(ctx.args[2] ?? 10)));
    return;
  }
  if (sub === "diff") {
    print(ctx, await gitDiff(runtime.root, Boolean(ctx.args.includes("--staged"))));
    return;
  }
  if (sub === "push") {
    throw new Error(
      "arc git push is disabled as an automatic path. Use your git client with explicit intent.",
    );
  }
  throw new Error(`Unknown git subcommand: ${sub}`);
}

async function cmdChanges(
  ctx: CliContext,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const aspect = (ctx.args[1] ?? "analyze") as "analyze" | "risk" | "tests" | "docs";
  await withStore(ctx.cwd, async (runtime, store) => {
    const graph = createGraphBuilder({ store });
    print(ctx, await analyzeChanges(runtime.root, store, graph, aspect));
  });
  void flags;
}

async function cmdTest(
  ctx: CliContext,
  flags: Record<string, string | boolean>,
): Promise<void> {
  await withStore(ctx.cwd, async (runtime, store) => {
    const graph = createGraphBuilder({ store });
    let mode = "all";
    let target: string | undefined;
    if (flags.related || ctx.args[1] === "related") {
      mode = "related";
      target = String(flags.related || ctx.args[2] || "");
      if (!target) throw new Error("Usage: arc test related <file>");
    } else if (flags.file || ctx.args[1] === "file") {
      mode = "file";
      target = String(flags.file || ctx.args[2] || "");
      if (!target) throw new Error("Usage: arc test file <path>");
    } else if (flags.package || ctx.args[1] === "package") {
      mode = "package";
      target = String(flags.package || ctx.args[2] || "");
      if (!target) throw new Error("Usage: arc test package <path-prefix>");
    }
    const result = await runTests(runtime.root, store, graph, { mode, target });
    print(ctx, result);
    if (result.ran && result.result && !result.result.ok) process.exitCode = 1;
  });
}

async function cmdBuild(ctx: CliContext): Promise<void> {
  const runtime = createRuntime(ctx.cwd);
  const result = await runBuild(runtime.root);
  print(ctx, result);
  if (result.ran && result.result && !result.result.ok) process.exitCode = 1;
}

async function cmdValidate(ctx: CliContext): Promise<void> {
  await withStore(ctx.cwd, async (runtime, store) => {
    const graph = createGraphBuilder({ store });
    const result = await runValidate(runtime.root, store, graph);
    print(ctx, result);
    if (!result.ok) process.exitCode = 1;
  });
}

async function cmdReview(
  ctx: CliContext,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const staged = Boolean(flags.staged);
  await withStore(ctx.cwd, async (runtime, store) => {
    const graph = createGraphBuilder({ store });
    print(ctx, await reviewChanges(runtime.root, store, graph, staged));
  });
}

async function cmdApi(ctx: CliContext): Promise<void> {
  await withStore(ctx.cwd, async (_runtime, store) => {
    print(ctx, analyzeApiCompatibility(store));
  });
}

async function cmdDocs(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "commands";
  const runtime = createRuntime(ctx.cwd);
  if (sub === "commands" || sub === "broken") {
    print(ctx, findBrokenDocCommands(runtime.root));
    return;
  }
  throw new Error("Usage: arc docs commands");
}

async function cmdHealth(ctx: CliContext): Promise<void> {
  await withStore(ctx.cwd, async (runtime, store) => {
    const graph = createGraphBuilder({ store });
    print(ctx, await buildHealthReport(runtime.root, store, graph));
  });
}

async function cmdDoctor(ctx: CliContext): Promise<void> {
  const runtime = createRuntime(ctx.cwd);
  let store = null as ReturnType<typeof openStore> | null;
  try {
    if (isInitialized(runtime.root)) {
      store = openStore(runtime.paths.dbPath);
    }
    const result = await runDoctor(runtime.root, store ?? undefined);
    print(ctx, result);
    if (!result.ok) process.exitCode = 1;
  } finally {
    store?.close();
  }
}

async function cmdSearch(ctx: CliContext): Promise<void> {
  const kind = ctx.args[1] ?? "symbol";
  const query = ctx.args.slice(2).join(" ");
  if (!query) {
    throw new Error("Usage: arc search <symbol|file|text|memory|decision|docs|unified> <query>");
  }
  await withStore(ctx.cwd, async (runtime, store) => {
    if (kind === "symbol") {
      print(ctx, store.findSymbols(query));
      return;
    }
    if (kind === "file") {
      print(
        ctx,
        store.listFiles().filter((f) => f.path.toLowerCase().includes(query.toLowerCase())),
      );
      return;
    }
    if (kind === "memory") {
      print(ctx, new MemoryService(store).search(query));
      return;
    }
    if (kind === "decision") {
      print(
        ctx,
        new DecisionService(store)
          .list()
          .filter(
            (d) =>
              d.title.toLowerCase().includes(query.toLowerCase()) ||
              d.decision.toLowerCase().includes(query.toLowerCase()),
          ),
      );
      return;
    }
    if (kind === "docs") {
      print(ctx, searchDocs(runtime.root, query));
      return;
    }
    if (kind === "unified" || kind === "text") {
      const symbols = store.findSymbols(query);
      const memory = new MemoryService(store).search(query);
      const docs = searchDocs(runtime.root, query);
      print(ctx, { symbols, memory, docs: docs.hits, confidence: "strongly_inferred" });
      return;
    }
    throw new Error(`Unknown search kind: ${kind}`);
  });
}

async function cmdDeps(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "cycles";
  await withStore(ctx.cwd, async (_runtime, store) => {
    if (sub === "cycles") {
      print(ctx, {
        cycles: findDependencyCycles(store),
        sccs: findImportSccs(store, 3),
        confidence: "strongly_inferred",
      });
      return;
    }
    if (sub === "unused") {
      print(ctx, findUnusedSymbols(store));
      return;
    }
    if (sub === "duplicates") {
      print(ctx, findDuplicateImports(store));
      return;
    }
    if (sub === "heavy") {
      print(ctx, findHeavyImports(store));
      return;
    }
    throw new Error(`Unknown deps subcommand: ${sub}`);
  });
}

async function cmdSecurity(
  ctx: CliContext,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const sub = ctx.args[1] ?? "scan";
  if (sub === "scan") {
    await withStore(ctx.cwd, async (runtime, store) => {
      const result = scanSecretPatterns(runtime.root, {
        maxFiles: flags["max-files"] ? Number(flags["max-files"]) : undefined,
        includeEntropy: !flags["no-entropy"],
      });
      storeSecretScanFindings(store, result);
      print(ctx, {
        findings: result.findings.map((f) => ({
          path: f.path,
          line: f.line,
          kind: f.kind,
          label: f.label,
          confidence: f.confidence,
        })),
        summary: result.summary,
        scannedFiles: result.scannedFiles,
        confidence: result.confidence,
        note: result.note,
        stored: "security:last_scan",
      });
    });
    return;
  }
  if (sub === "sensitive") {
    await withStore(ctx.cwd, async (_runtime, store) => {
      print(ctx, findSensitiveFiles(store));
    });
    return;
  }
  if (sub === "config") {
    await withStore(ctx.cwd, async (runtime, store) => {
      print(ctx, findInsecureConfig(runtime.root, store));
    });
    return;
  }
  throw new Error("Usage: arc security <scan|sensitive|config>");
}

async function readStackInput(ctx: CliContext, flags: Record<string, string | boolean>): Promise<string> {
  if (typeof flags.file === "string") {
    return readFileSync(flags.file, "utf8");
  }
  const pasted = ctx.args.slice(2).join(" ").trim();
  if (pasted) return pasted.replace(/\\n/g, "\n");
  // Allow piping stack traces via stdin when not a TTY
  if (!input.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error(
    'Usage: arc debug stack "<paste>" | arc debug stack --file stack.txt | pipe via stdin',
  );
}

async function cmdDebug(
  ctx: CliContext,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const sub = ctx.args[1];
  if (sub !== "stack") {
    throw new Error('Usage: arc debug stack "<paste>" | --file <path>');
  }
  const stackText = await readStackInput(ctx, flags);
  await withStore(ctx.cwd, async (_runtime, store) => {
    print(ctx, investigateStacktrace(store, stackText));
  });
}

async function cmdAnalyze(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1];
  if (sub === "unused") {
    await withStore(ctx.cwd, async (_runtime, store) => {
      print(ctx, findUnusedSymbols(store));
    });
    return;
  }
  throw new Error("Usage: arc analyze unused");
}

async function cmdCommand(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1];
  if (sub === "explain") {
    const cmdStr = ctx.args.slice(2).join(" ").trim();
    if (!cmdStr) throw new Error('Usage: arc command explain "<cmd>"');
    const runtime = createRuntime(ctx.cwd);
    print(ctx, explainCommand(cmdStr, { root: runtime.root }));
    return;
  }
  if (sub === "detect") {
    const runtime = createRuntime(ctx.cwd);
    print(ctx, detectPackageScripts(runtime.root));
    return;
  }
  if (sub === "risk") {
    const cmdStr = ctx.args.slice(2).join(" ").trim();
    if (!cmdStr) throw new Error('Usage: arc command risk "<cmd>"');
    print(ctx, classifyCommandRisk(cmdStr));
    return;
  }
  throw new Error('Usage: arc command explain|detect|risk "<cmd>"');
}

async function cmdAdapters(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "list";
  if (sub === "status") {
    await withStore(ctx.cwd, async (_runtime, store) => {
      print(
        ctx,
        adaptersStatus(
          store,
          listAdapters().map((a) => ({
            id: a.id,
            name: a.name,
            extensions: a.extensions,
          })),
        ),
      );
    });
    return;
  }
  print(
    ctx,
    listAdapters().map((a) => ({
      id: a.id,
      name: a.name,
      extensions: a.extensions,
    })),
  );
}

async function cmdOwnership(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "list";
  await withStore(ctx.cwd, async (runtime, store) => {
    if (sub === "list" || sub === "codeowners") {
      print(ctx, parseCodeowners(runtime.root));
      return;
    }
    if (sub === "path") {
      const path = ctx.args[2];
      if (!path) throw new Error("Usage: arc ownership path <path>");
      print(ctx, ownersForPath(runtime.root, path));
      return;
    }
    if (sub === "uncovered") {
      print(ctx, uncoveredByCodeowners(runtime.root, store));
      return;
    }
    throw new Error("Usage: arc ownership <list|path|uncovered>");
  });
}

async function cmdWorkspace(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "map";
  const runtime = createRuntime(ctx.cwd);
  if (sub === "map") {
    print(ctx, mapWorkspace(runtime.root));
    return;
  }
  throw new Error("Usage: arc workspace map");
}

async function cmdEnv(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "missing";
  await withStore(ctx.cwd, async (runtime, store) => {
    if (sub === "missing") {
      print(ctx, findEnvMissing(runtime.root, store));
      return;
    }
    throw new Error("Usage: arc env missing");
  });
}

async function cmdDb(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "migrations";
  await withStore(ctx.cwd, async (_runtime, store) => {
    if (sub === "migrations") {
      print(ctx, findDbMigrations(store));
      return;
    }
    if (sub === "models") {
      print(ctx, findDbModels(store));
      return;
    }
    throw new Error("Usage: arc db <migrations|models>");
  });
}

async function cmdRelease(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "version";
  const runtime = createRuntime(ctx.cwd);
  if (sub === "version") {
    print(ctx, await detectReleaseVersion(runtime.root));
    return;
  }
  if (sub === "uncommitted") {
    print(ctx, await releaseUncommitted(runtime.root));
    return;
  }
  throw new Error("Usage: arc release <version|uncommitted>");
}

async function cmdCi(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "local";
  const runtime = createRuntime(ctx.cwd);
  if (sub === "local" || sub === "equivalent") {
    print(ctx, ciLocalEquivalent(runtime.root));
    return;
  }
  throw new Error("Usage: arc ci local");
}

async function cmdConfig(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "show";
  const runtime = createRuntime(ctx.cwd);
  requireInit(runtime.root);
  if (sub === "show") {
    print(ctx, loadConfig(runtime.root));
    return;
  }
  if (sub === "get") {
    print(ctx, { key: ctx.args[2], value: getConfigValue(runtime.root, ctx.args[2]!) });
    return;
  }
  if (sub === "set") {
    print(ctx, setConfigValue(runtime.root, ctx.args[2]!, ctx.args[3]!));
    return;
  }
  throw new Error(`Unknown config subcommand: ${sub}`);
}

async function cmdCache(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "status";
  const runtime = createRuntime(ctx.cwd);
  if (sub === "clear") {
    runtime.permissions.assert(
      {
        action: "delete",
        resource: "cache.clear",
        reason: "Clear cache",
        destructive: true,
      },
      Boolean(ctx.args.includes("--yes") || ctx.args.includes("--intent")),
    );
    runtime.cache.clear();
    print(ctx, { ok: true, message: "Cache cleared (memory layer)" });
    return;
  }
  print(ctx, { cacheDir: runtime.paths.cacheDir });
}

async function cmdClean(ctx: CliContext): Promise<void> {
  await withStore(ctx.cwd, async (_runtime, store) => {
    store.db.exec("DELETE FROM symbols; DELETE FROM files; DELETE FROM edges;");
    print(ctx, { ok: true, message: "Index and graph data cleaned" });
  });
}

async function cmdFlow(ctx: CliContext): Promise<void> {
  const sub = ctx.args[1] ?? "list";
  if (sub === "list") {
    print(
      ctx,
      listFlows().map((f) => ({ id: f.id, name: f.name, description: f.description })),
    );
    return;
  }
  if (sub === "show" || sub === "inspect") {
    const id = ctx.args[2];
    const flow = id ? getFlow(id) : undefined;
    if (!flow) throw new Error("Usage: arc flow show|inspect <id>");
    print(ctx, { ...flow, prompt: renderFlowPrompt(flow) });
    return;
  }
  throw new Error(`Unknown flow subcommand: ${sub}`);
}

function cmdHelp(): void {
  printBanner();
  console.log(`Arcframe — the engineering control plane for Cursor

Usage: arc <command> [options]

Core:
  init                 Initialize Arcframe in the current project
  status               Project + index + git status
  doctor               Environment and project diagnostics
  health               Evidence-based health report

Intelligence:
  index [rebuild|status|explain|clean|watch]
  index watch [--debounce ms] [--max-wait ms]
  graph [build|stats|neighbors]
  impact <file> [depth]
  search <symbol|file|text|memory|decision|docs|unified> <query>
  analyze unused       Dead-code candidates with confidence
  adapters [list|status]
  security <scan|sensitive|config>
  debug stack          Map pasted stack traces to index suspects
  command explain|detect|risk
  ownership <list|path|uncovered>
  workspace map
  env missing
  db <migrations|models>
  release <version|uncommitted>
  ci local

Context & memory:
  context <query> [--budget tiny|small|normal|large|unlimited]
  memory <list|add|search|get|delete>
  decision <list|add|get|accept>
  session <list|create|get>
  task <list|add|start|done>

Engineering:
  git <status|log|diff>
  changes <analyze|risk|tests|docs>
  test [related|file|package <target>]
  build
  validate
  review [--staged]
  api
  docs commands
  deps <cycles|unused|duplicates|heavy>
  config <show|get|set>
  cache <status|clear --intent>
  clean
  flow <list|show|inspect>

Global flags:
  --json               Machine-readable output
  --cwd <path>         Working directory
`);
}

export async function runCli(argv: string[]): Promise<void> {
  const { args, flags } = parseFlags(argv);
  const cwd = typeof flags.cwd === "string" ? flags.cwd : process.cwd();
  const ctx: CliContext = {
    cwd,
    json: Boolean(flags.json),
    args,
  };

  const cmd = args[0];
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    cmdHelp();
    return;
  }

  try {
    switch (cmd) {
      case "init":
        await cmdInit(ctx);
        break;
      case "status":
        await cmdStatus(ctx);
        break;
      case "index":
        await cmdIndex(ctx, flags);
        break;
      case "analyze":
        await cmdAnalyze(ctx);
        break;
      case "security":
        await cmdSecurity(ctx, flags);
        break;
      case "debug":
        await cmdDebug(ctx, flags);
        break;
      case "command":
        await cmdCommand(ctx);
        break;
      case "graph":
        await cmdGraph(ctx);
        break;
      case "impact":
        await cmdImpact(ctx);
        break;
      case "context":
        await cmdContext(ctx, flags);
        break;
      case "memory":
        await cmdMemory(ctx);
        break;
      case "decision":
        await cmdDecision(ctx);
        break;
      case "session":
        await cmdSession(ctx);
        break;
      case "task":
        await cmdTask(ctx);
        break;
      case "git":
        await cmdGit(ctx);
        break;
      case "changes":
        await cmdChanges(ctx, flags);
        break;
      case "test":
        await cmdTest(ctx, flags);
        break;
      case "build":
        await cmdBuild(ctx);
        break;
      case "validate":
        await cmdValidate(ctx);
        break;
      case "review":
        await cmdReview(ctx, flags);
        break;
      case "api":
        await cmdApi(ctx);
        break;
      case "docs":
        await cmdDocs(ctx);
        break;
      case "health":
        await cmdHealth(ctx);
        break;
      case "doctor":
        await cmdDoctor(ctx);
        break;
      case "search":
        await cmdSearch(ctx);
        break;
      case "deps":
        await cmdDeps(ctx);
        break;
      case "adapters":
        await cmdAdapters(ctx);
        break;
      case "ownership":
        await cmdOwnership(ctx);
        break;
      case "workspace":
        await cmdWorkspace(ctx);
        break;
      case "env":
        await cmdEnv(ctx);
        break;
      case "db":
        await cmdDb(ctx);
        break;
      case "release":
        await cmdRelease(ctx);
        break;
      case "ci":
        await cmdCi(ctx);
        break;
      case "config":
        await cmdConfig(ctx);
        break;
      case "cache":
        await cmdCache(ctx);
        break;
      case "clean":
        await cmdClean(ctx);
        break;
      case "flow":
        await cmdFlow(ctx);
        break;
      case "version":
      case "--version":
        print(ctx, { version: "0.1.0" });
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        cmdHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(formatError(err));
    process.exitCode = 1;
  }
}
