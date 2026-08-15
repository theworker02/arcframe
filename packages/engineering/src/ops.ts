import { dirname, join, relative } from "node:path";
import {
  commandExists,
  execCommand,
  fileExists,
  listFilesRecursive,
  readText,
  toPosixPath,
  type ConfidenceLevel,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";
import type { GraphBuilder } from "@arcframe/graph";
import { inspectGit } from "./git.js";
import { findDependencyCycles } from "./deps.js";
import { reviewChanges } from "./review.js";

function readPkgScripts(root: string): Record<string, string> {
  const pkgPath = join(root, "package.json");
  if (!fileExists(pkgPath)) return {};
  try {
    const pkg = JSON.parse(readText(pkgPath)) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

function detectPackageManager(root: string): "pnpm" | "npm" | "yarn" {
  if (fileExists(join(root, "pnpm-lock.yaml")) || fileExists(join(root, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (fileExists(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

async function runScript(
  root: string,
  script: string,
  extraArgs: string[] = [],
  timeoutMs = 120_000,
): Promise<{
  ok: boolean;
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  confidence: ConfidenceLevel;
  note?: string;
}> {
  const pm = detectPackageManager(root);
  // Windows shims are .cmd — spawn without shell cannot exec them
  const command =
    process.platform === "win32"
      ? pm === "pnpm"
        ? "pnpm.cmd"
        : pm === "yarn"
          ? "yarn.cmd"
          : "npm.cmd"
      : pm;
  const args =
    pm === "yarn" ? [script, ...extraArgs] : ["run", script, ...extraArgs];
  const start = Date.now();
  try {
    const result = await execCommand(command, args, {
      cwd: root,
      timeoutMs,
      shell: process.platform === "win32",
    });
    return {
      ok: result.exitCode === 0,
      command,
      args,
      exitCode: result.exitCode,
      stdout: result.stdout.slice(-20_000),
      stderr: result.stderr.slice(-10_000),
      durationMs: Date.now() - start,
      confidence: "confirmed",
    };
  } catch (err) {
    return {
      ok: false,
      command,
      args,
      exitCode: -1,
      stdout: "",
      stderr: (err as Error).message,
      durationMs: Date.now() - start,
      confidence: "confirmed",
      note: "Failed to spawn package manager — is it on PATH?",
    };
  }
}

export interface TestRunResult {
  mode: "all" | "related" | "file" | "package";
  target?: string;
  relatedTests: string[];
  script: string | null;
  ran: boolean;
  result?: Awaited<ReturnType<typeof runScript>>;
  note?: string;
  confidence: ConfidenceLevel;
}

export async function runTests(
  root: string,
  store: ArcStore,
  graph: GraphBuilder,
  options: { mode?: string; target?: string } = {},
): Promise<TestRunResult> {
  const scripts = readPkgScripts(root);
  const script = scripts.test ? "test" : null;
  const mode = (options.mode ?? "all") as TestRunResult["mode"];
  const target = options.target;

  const allTestFiles = store.listFiles().filter(
    (f) =>
      /\.(test|spec)\./.test(f.path) ||
      /_test\./.test(f.path) ||
      /(^|\/)tests?\//.test(f.path),
  );

  let relatedTests: string[] = [];

  if (mode === "file" && target) {
    const rel = target.replaceAll("\\", "/");
    relatedTests = allTestFiles
      .filter((f) => f.path.includes(rel) || rel.includes(f.path))
      .map((f) => f.path);
    // Also find TESTS edges
    const impact = graph.impact(`file:${rel}`, 2);
    relatedTests = [
      ...new Set([
        ...relatedTests,
        ...impact.dependents
          .filter((d) => d.startsWith("file:"))
          .map((d) => d.slice(5))
          .filter((p) => allTestFiles.some((t) => t.path === p)),
        ...allTestFiles
          .filter((t) => {
            const edges = store.edgesFrom(`file:${t.path}`);
            return edges.some(
              (e) => e.edge_type === "TESTS" && e.to_id === `file:${rel}`,
            );
          })
          .map((t) => t.path),
      ]),
    ];
  } else if (mode === "related" && target) {
    const rel = target.replaceAll("\\", "/");
    const impact = graph.impact(`file:${rel}`, 2);
    const nodes = new Set([`file:${rel}`, ...impact.dependents, ...impact.dependencies]);
    relatedTests = allTestFiles
      .filter((t) => {
        if (nodes.has(`file:${t.path}`)) return true;
        const edges = store.edgesFrom(`file:${t.path}`);
        return edges.some((e) => e.edge_type === "TESTS" && nodes.has(e.to_id));
      })
      .map((t) => t.path);
  } else if (mode === "package" && target) {
    const pkg = target.replaceAll("\\", "/");
    relatedTests = allTestFiles.filter((f) => f.path.startsWith(pkg)).map((f) => f.path);
  } else {
    relatedTests = allTestFiles.map((f) => f.path);
  }

  if (!script) {
    return {
      mode,
      target,
      relatedTests,
      script: null,
      ran: false,
      note: "No `test` script in package.json — listing related test files only",
      confidence: "confirmed",
    };
  }

  // For file/related: pass filter args when vitest/jest style is detectable
  // For package: run via pnpm --filter when possible
  const extraArgs: string[] = [];
  let overrideArgs: string[] | null = null;
  let overrideCommand: string | null = null;

  if (mode === "package" && target) {
    const pm = detectPackageManager(root);
    if (pm === "pnpm") {
      overrideCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      overrideArgs = ["--filter", `./${target.replace(/\\/g, "/")}`, "test"];
    }
  } else if ((mode === "file" || mode === "related") && relatedTests.length > 0) {
    const testScript = scripts.test ?? "";
    if (/vitest/i.test(testScript)) {
      extraArgs.push(...relatedTests.slice(0, 20));
    } else if (/jest/i.test(testScript)) {
      extraArgs.push("--testPathPattern", relatedTests.slice(0, 5).join("|"));
    }
  }

  if (overrideCommand && overrideArgs) {
    const start = Date.now();
    try {
      const result = await execCommand(overrideCommand, overrideArgs, {
        cwd: root,
        timeoutMs: 120_000,
        shell: process.platform === "win32",
      });
      return {
        mode,
        target,
        relatedTests,
        script: "test",
        ran: true,
        result: {
          ok: result.exitCode === 0,
          command: overrideCommand,
          args: overrideArgs,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(-20_000),
          stderr: result.stderr.slice(-10_000),
          durationMs: Date.now() - start,
          confidence: "confirmed" as const,
        },
        confidence: "confirmed",
      };
    } catch (err) {
      return {
        mode,
        target,
        relatedTests,
        script: "test",
        ran: true,
        result: {
          ok: false,
          command: overrideCommand,
          args: overrideArgs,
          exitCode: -1,
          stdout: "",
          stderr: (err as Error).message,
          durationMs: Date.now() - start,
          confidence: "confirmed" as const,
        },
        confidence: "confirmed",
      };
    }
  }

  const result = await runScript(root, script, extraArgs);
  return {
    mode,
    target,
    relatedTests,
    script,
    ran: true,
    result,
    confidence: "confirmed",
  };
}

export async function runBuild(root: string): Promise<{
  script: string | null;
  ran: boolean;
  result?: Awaited<ReturnType<typeof runScript>>;
  note?: string;
  confidence: ConfidenceLevel;
}> {
  const scripts = readPkgScripts(root);
  const script = scripts.build ? "build" : scripts["build:all"] ? "build:all" : null;
  if (!script) {
    return {
      script: null,
      ran: false,
      note: "No build script in package.json",
      confidence: "confirmed",
    };
  }
  const result = await runScript(root, script, [], 180_000);
  return { script, ran: true, result, confidence: "confirmed" };
}

export interface ValidateReport {
  ok: boolean;
  checks: Array<{
    id: string;
    ok: boolean;
    detail: string;
    confidence: ConfidenceLevel;
  }>;
}

export async function runValidate(
  root: string,
  store: ArcStore,
  graph: GraphBuilder,
): Promise<ValidateReport> {
  const checks: ValidateReport["checks"] = [];
  const stats = store.stats();

  checks.push({
    id: "index",
    ok: stats.files > 0,
    detail: `${stats.files} files indexed`,
    confidence: "confirmed",
  });
  checks.push({
    id: "graph",
    ok: stats.edges > 0,
    detail: `${stats.edges} edges`,
    confidence: "confirmed",
  });

  const cycles = findDependencyCycles(store);
  checks.push({
    id: "deps-cycles",
    ok: cycles.length === 0,
    detail:
      cycles.length === 0
        ? "no mutual import pairs"
        : `${cycles.length} mutual pairs (e.g. ${cycles[0]?.[0]} ↔ ${cycles[0]?.[1]})`,
    confidence: "strongly_inferred",
  });

  const brokenDocs = findBrokenDocCommands(root);
  checks.push({
    id: "docs-commands",
    ok: brokenDocs.broken.length === 0,
    detail:
      brokenDocs.broken.length === 0
        ? `scanned ${brokenDocs.scanned} command fences`
        : `${brokenDocs.broken.length} likely-broken commands`,
    confidence: "weakly_inferred",
  });

  const api = analyzeApiCompatibility(store);
  checks.push({
    id: "api-routes",
    ok: true,
    detail: `${api.routes.length} inferred routes across ${api.files} files`,
    confidence: "strongly_inferred",
  });

  const scripts = readPkgScripts(root);
  if (scripts.typecheck) {
    const tc = await runScript(root, "typecheck", [], 120_000);
    checks.push({
      id: "typecheck",
      ok: tc.ok,
      detail: tc.ok ? `typecheck passed (${tc.durationMs}ms)` : `typecheck failed (exit ${tc.exitCode})`,
      confidence: "confirmed",
    });
  } else {
    checks.push({
      id: "typecheck",
      ok: true,
      detail: "no typecheck script — skipped",
      confidence: "confirmed",
    });
  }

  void graph;
  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}

export async function analyzeChanges(
  root: string,
  store: ArcStore,
  graph: GraphBuilder,
  aspect: "analyze" | "risk" | "tests" | "docs" = "analyze",
): Promise<Record<string, unknown>> {
  const git = await inspectGit(root);
  const files = [...new Set([...git.staged, ...git.unstaged, ...git.untracked])].map((f) =>
    f.replaceAll("\\", "/"),
  );

  if (aspect === "risk") {
    const review = await reviewChanges(root, store, graph, false);
    return {
      aspect: "risk",
      risks: review.findings.filter((f) => f.severity === "risk" || f.severity === "warn"),
      confidence: "strongly_inferred",
    };
  }

  if (aspect === "tests") {
    const testHits: Array<{ file: string; relatedTests: string[] }> = [];
    for (const file of files.filter((f) => /\.(ts|tsx|js|jsx|rs|py|go)$/.test(f)).slice(0, 30)) {
      const result = await runTests(root, store, graph, { mode: "related", target: file });
      testHits.push({ file, relatedTests: result.relatedTests });
    }
    return {
      aspect: "tests",
      files: testHits,
      note: "Related tests inferred from graph TESTS/IMPORTS edges — not executed",
      confidence: "strongly_inferred",
    };
  }

  if (aspect === "docs") {
    const docFiles = files.filter((f) => /\.(md|mdx)$/i.test(f));
    const broken = findBrokenDocCommands(root, docFiles.length ? docFiles : undefined);
    return { aspect: "docs", changedDocs: docFiles, ...broken };
  }

  // analyze
  const impactSummary = [];
  for (const file of files.filter((f) => store.getFile(f)).slice(0, 40)) {
    const impact = graph.impact(`file:${file}`, 1);
    impactSummary.push({
      file,
      dependents: impact.dependents.length,
      dependencies: impact.dependencies.length,
    });
  }
  return {
    aspect: "analyze",
    git: {
      branch: git.branch,
      staged: git.staged.length,
      unstaged: git.unstaged.length,
      untracked: git.untracked.length,
    },
    files,
    impactSummary,
    confidence: "strongly_inferred",
  };
}

export function findBrokenDocCommands(
  root: string,
  onlyFiles?: string[],
): {
  scanned: number;
  broken: Array<{ file: string; command: string; reason: string }>;
  confidence: ConfidenceLevel;
} {
  const mdFiles =
    onlyFiles?.map((f) => join(root, f)) ??
    listFilesRecursive(root, {
      filter: (p) => /\.(md|mdx)$/i.test(p) && !p.includes("node_modules"),
    }).slice(0, 80);

  const broken: Array<{ file: string; command: string; reason: string }> = [];
  let scanned = 0;
  // Require an explicit shell language tag. Bare ``` fences (e.g. closing mermaid)
  // must not be treated as shell or they swallow following markdown (tables, prose).
  const fenceRe = /```(?:bash|sh|shell|powershell|pwsh|console)\r?\n([\s\S]*?)```/gi;

  for (const abs of mdFiles) {
    let content: string;
    try {
      content = readText(abs);
    } catch {
      continue;
    }
    const rel = toPosixPath(relative(root, abs));
    let m: RegExpExecArray | null;
    while ((m = fenceRe.exec(content))) {
      const block = m[1];
      for (const line of block.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
        // Skip markdown tables / prose accidentally left in fences
        if (trimmed.startsWith("|") || trimmed.startsWith("---")) continue;
        // Strip prompts
        const cmd = trimmed.replace(/^\$\s+/, "").replace(/^>\s+/, "");
        if (!cmd) continue;
        scanned++;
        // Check for obvious broken arc subcommands / missing binaries referenced
        if (/^arc\s+(\w+)/.test(cmd)) {
          const sub = /^arc\s+(\w+)/.exec(cmd)?.[1];
          const known = new Set([
            "init",
            "status",
            "doctor",
            "index",
            "graph",
            "impact",
            "context",
            "memory",
            "decision",
            "session",
            "task",
            "git",
            "changes",
            "test",
            "validate",
            "build",
            "review",
            "search",
            "deps",
            "health",
            "adapters",
            "config",
            "cache",
            "clean",
            "flow",
            "help",
            "analyze",
            "security",
            "debug",
            "command",
            "version",
          ]);
          if (sub && !known.has(sub)) {
            broken.push({
              file: rel,
              command: cmd,
              reason: `unknown arc subcommand '${sub}'`,
            });
          }
        }
        // Dead relative script refs (strip trailing markdown punctuation / backticks)
        const scriptRef = /(?:node|pnpm|npm|npx)\s+(\.\/[^\s]+)/.exec(cmd);
        if (scriptRef) {
          const pathPart = scriptRef[1]
            .replace(/^\.\//, "")
            .replace(/[`'".,;:)\]]+$/g, "");
          // resolve relative to doc file dir or root
          const candidates = [
            join(root, pathPart),
            join(dirname(abs), pathPart),
          ];
          if (!candidates.some((c) => fileExists(c))) {
            broken.push({
              file: rel,
              command: cmd,
              reason: `path not found: ./${pathPart}`,
            });
          }
        }
      }
    }
  }

  return { scanned, broken, confidence: "weakly_inferred" };
}

export function analyzeApiCompatibility(store: ArcStore): {
  files: number;
  routes: Array<{ file: string; method: string; path: string }>;
  duplicatePaths: Array<{ path: string; methods: string[]; files: string[] }>;
  confidence: ConfidenceLevel;
} {
  const routes: Array<{ file: string; method: string; path: string }> = [];
  for (const f of store.listFiles()) {
    const raw = store.getMeta(`routes:${f.path}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Array<{ method: string; path: string }>;
      for (const r of parsed) {
        routes.push({ file: f.path, method: r.method, path: r.path });
      }
    } catch {
      /* ignore */
    }
  }

  const byPath = new Map<string, Array<{ method: string; file: string }>>();
  for (const r of routes) {
    const list = byPath.get(r.path) ?? [];
    list.push({ method: r.method, file: r.file });
    byPath.set(r.path, list);
  }
  const duplicatePaths: Array<{ path: string; methods: string[]; files: string[] }> = [];
  for (const [path, entries] of byPath) {
    const files = [...new Set(entries.map((e) => e.file))];
    if (files.length > 1) {
      duplicatePaths.push({
        path,
        methods: [...new Set(entries.map((e) => e.method))],
        files,
      });
    }
  }

  return {
    files: new Set(routes.map((r) => r.file)).size,
    routes,
    duplicatePaths,
    confidence: "strongly_inferred",
  };
}

export async function ensurePackageManager(root: string): Promise<string | null> {
  const pm = detectPackageManager(root);
  if (await commandExists(pm)) return pm;
  if (pm !== "npm" && (await commandExists("npm"))) return "npm";
  return null;
}
