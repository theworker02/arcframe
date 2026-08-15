import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import {
  Events,
  type ConfidenceLevel,
  type EventBus,
  type Logger,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";

export type EdgeType =
  | "IMPORTS"
  | "CALLS"
  | "DEPENDS_ON"
  | "TESTS"
  | "ROUTES_TO"
  | "IMPLEMENTS"
  | "EXTENDS"
  | "CONTAINS"
  | "REFERENCES";

export interface GraphStats {
  nodes: number;
  edges: number;
  byType: Record<string, number>;
}

function edgeId(from: string, to: string, type: string): string {
  return createHash("sha1")
    .update(`${from}|${to}|${type}`)
    .digest("hex")
    .slice(0, 20);
}

function resolveImportTarget(
  fromFile: string,
  source: string,
  knownFiles: Set<string>,
): string | null {
  // External package
  if (
    !source.startsWith(".") &&
    !source.startsWith("/") &&
    !source.startsWith("\\")
  ) {
    return `pkg:${source.split("/")[0]}`;
  }

  const fromDir = dirname(fromFile).replaceAll("\\", "/");
  let candidate = join(fromDir, source).replaceAll("\\", "/");
  // Normalize ./ and ../
  const parts: string[] = [];
  for (const part of candidate.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  candidate = parts.join("/");

  // NodeNext: TS imports often use .js while files are .ts/.tsx
  const stripped = candidate.replace(/\.(js|jsx|mjs|cjs|mts|cts)$/i, "");

  const candidates = new Set<string>([
    candidate,
    stripped,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}.js`,
    `${stripped}.jsx`,
    `${stripped}.mjs`,
    `${stripped}.cjs`,
    `${stripped}.mts`,
    `${stripped}.cts`,
    `${stripped}.rs`,
    `${stripped}.py`,
    `${stripped}.go`,
    `${stripped}/index.ts`,
    `${stripped}/index.tsx`,
    `${stripped}/index.js`,
    `${stripped}/mod.rs`,
    `${stripped}/__init__.py`,
  ]);

  for (const path of candidates) {
    if (knownFiles.has(path)) return path;
  }
  return stripped;
}

export interface GraphBuilderOptions {
  store: ArcStore;
  logger?: Logger;
  events?: EventBus;
}

export class GraphBuilder {
  constructor(private readonly options: GraphBuilderOptions) {}

  build(): GraphStats {
    const { store, logger, events } = this.options;
    const files = store.listFiles();
    const known = new Set(files.map((f) => f.path));

    store.clearEdges();
    const byType: Record<string, number> = {};

    store.transaction(() => {
      for (const file of files) {
        // CONTAINS: file -> symbols
        const symbols = store.listSymbols(file.path);
        for (const sym of symbols) {
          this.addEdge(
            store,
            `file:${file.path}`,
            `symbol:${sym.id}`,
            "CONTAINS",
            "confirmed",
            byType,
          );
          if (sym.kind === "route") {
            this.addEdge(
              store,
              `file:${file.path}`,
              `route:${sym.name}`,
              "ROUTES_TO",
              "strongly_inferred",
              byType,
            );
          }
        }

        const importsRaw = store.getMeta(`imports:${file.path}`);
        if (!importsRaw) continue;
        let imports: Array<{ source: string; confidence?: ConfidenceLevel }> = [];
        try {
          imports = JSON.parse(importsRaw) as typeof imports;
        } catch {
          continue;
        }

        for (const imp of imports) {
          const target = resolveImportTarget(file.path, imp.source, known);
          if (!target) continue;
          const toId = target.startsWith("pkg:")
            ? target
            : known.has(target)
              ? `file:${target}`
              : `unresolved:${target}`;
          const confidence: ConfidenceLevel = target.startsWith("pkg:")
            ? "confirmed"
            : known.has(target)
              ? "confirmed"
              : "weakly_inferred";
          this.addEdge(
            store,
            `file:${file.path}`,
            toId,
            "IMPORTS",
            confidence,
            byType,
          );
          this.addEdge(
            store,
            `file:${file.path}`,
            toId,
            "DEPENDS_ON",
            confidence,
            byType,
          );
        }

        // TESTS heuristic: *.test.* / *_test.* / test_*.py imports the module under test
        if (
          /\.(test|spec)\./.test(file.path) ||
          /_test\./.test(file.path) ||
          /(^|\/)test_/.test(file.path)
        ) {
          for (const imp of imports) {
            const target = resolveImportTarget(file.path, imp.source, known);
            if (target && known.has(target)) {
              this.addEdge(
                store,
                `file:${file.path}`,
                `file:${target}`,
                "TESTS",
                "strongly_inferred",
                byType,
              );
            }
          }
        }
      }
    });

    const edges = store.listEdges();
    const stats: GraphStats = {
      nodes: known.size + store.listSymbols().length,
      edges: edges.length,
      byType,
    };

    store.setMeta("graph:last_built", new Date().toISOString());
    store.setMeta("graph:stats", JSON.stringify(stats));
    void events?.emit(Events.GRAPH_UPDATED, stats);
    logger?.info("Graph build complete", { ...stats });
    return stats;
  }

  private addEdge(
    store: ArcStore,
    from: string,
    to: string,
    type: EdgeType,
    confidence: ConfidenceLevel,
    byType: Record<string, number>,
  ): void {
    store.upsertEdge({
      id: edgeId(from, to, type),
      from_id: from,
      to_id: to,
      edge_type: type,
      confidence,
      meta: null,
    });
    byType[type] = (byType[type] ?? 0) + 1;
  }

  neighbors(nodeId: string, edgeType?: EdgeType): {
    outbound: ReturnType<ArcStore["edgesFrom"]>;
    inbound: ReturnType<ArcStore["edgesTo"]>;
  } {
    const { store } = this.options;
    let outbound = store.edgesFrom(nodeId);
    let inbound = store.edgesTo(nodeId);
    if (edgeType) {
      outbound = outbound.filter((e) => e.edge_type === edgeType);
      inbound = inbound.filter((e) => e.edge_type === edgeType);
    }
    return { outbound, inbound };
  }

  impact(nodeId: string, depth = 2): {
    node: string;
    dependents: string[];
    dependencies: string[];
    confidence: ConfidenceLevel;
  } {
    const deps = new Set<string>();
    const dependents = new Set<string>();
    const queue: Array<{ id: string; d: number; dir: "up" | "down" }> = [
      { id: nodeId, d: 0, dir: "up" },
      { id: nodeId, d: 0, dir: "down" },
    ];
    const seen = new Set<string>();

    while (queue.length) {
      const cur = queue.shift()!;
      const key = `${cur.dir}:${cur.id}:${cur.d}`;
      if (seen.has(key) || cur.d >= depth) continue;
      seen.add(key);

      if (cur.dir === "up") {
        for (const e of this.options.store.edgesTo(cur.id)) {
          if (e.edge_type === "IMPORTS" || e.edge_type === "DEPENDS_ON" || e.edge_type === "TESTS") {
            dependents.add(e.from_id);
            queue.push({ id: e.from_id, d: cur.d + 1, dir: "up" });
          }
        }
      } else {
        for (const e of this.options.store.edgesFrom(cur.id)) {
          if (e.edge_type === "IMPORTS" || e.edge_type === "DEPENDS_ON") {
            deps.add(e.to_id);
            queue.push({ id: e.to_id, d: cur.d + 1, dir: "down" });
          }
        }
      }
    }

    return {
      node: nodeId,
      dependents: [...dependents],
      dependencies: [...deps],
      confidence: "strongly_inferred",
    };
  }

  stats(): GraphStats {
    const raw = this.options.store.getMeta("graph:stats");
    if (raw) {
      try {
        return JSON.parse(raw) as GraphStats;
      } catch {
        /* fallthrough */
      }
    }
    const edges = this.options.store.listEdges();
    const byType: Record<string, number> = {};
    for (const e of edges) {
      byType[e.edge_type] = (byType[e.edge_type] ?? 0) + 1;
    }
    return {
      nodes: this.options.store.stats().files + this.options.store.stats().symbols,
      edges: edges.length,
      byType,
    };
  }
}

export function createGraphBuilder(options: GraphBuilderOptions): GraphBuilder {
  return new GraphBuilder(options);
}
