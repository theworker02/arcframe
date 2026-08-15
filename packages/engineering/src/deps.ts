import type { ConfidenceLevel } from "@arcframe/core";
import type { ArcStore, SymbolRecord } from "@arcframe/storage";

/** Mutual file-level IMPORTS pairs (A→B and B→A). */
export function findDependencyCycles(store: ArcStore): Array<[string, string]> {
  const edges = store.listEdges("IMPORTS");
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!e.from_id.startsWith("file:") || !e.to_id.startsWith("file:")) continue;
    if (!adj.has(e.from_id)) adj.set(e.from_id, new Set());
    adj.get(e.from_id)!.add(e.to_id);
  }
  const cycles: Array<[string, string]> = [];
  for (const [from, tos] of adj) {
    for (const to of tos) {
      if (adj.get(to)?.has(from) && from < to) {
        cycles.push([from, to]);
      }
    }
  }
  return cycles;
}

export interface UnusedCandidate {
  name: string;
  file: string;
  line: number;
  kind: string;
  exported: boolean;
  confidence: ConfidenceLevel;
  reasons: string[];
}

function collectImportedNames(store: ArcStore): Set<string> {
  const importedNames = new Set<string>();
  for (const file of store.listFiles()) {
    const raw = store.getMeta(`imports:${file.path}`);
    if (!raw) continue;
    try {
      const imports = JSON.parse(raw) as Array<{ specifiers: string[] }>;
      for (const imp of imports) {
        for (const s of imp.specifiers) {
          const cleaned = s.replace(/[{}\s*]/g, "").split(",")[0]?.trim();
          if (cleaned) importedNames.add(cleaned);
          const asMatch = /(?:as\s+)?(\w+)\s*$/.exec(s);
          if (asMatch) importedNames.add(asMatch[1]);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return importedNames;
}

function isEntryish(path: string, name: string): boolean {
  const p = path.replaceAll("\\", "/").toLowerCase();
  if (/(^|\/)(index|main|mod|app|server|cli|bin)\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py)$/.test(p)) {
    return true;
  }
  if (/\/(bin|scripts|src\/bin)\//.test(p)) return true;
  if (name === "default" || name === "main" || name === "run") return true;
  return false;
}

function isTestOrGenerated(path: string): boolean {
  const p = path.replaceAll("\\", "/").toLowerCase();
  return (
    /\.(test|spec)\./.test(p) ||
    /\/(__tests__|__mocks__|fixtures|testdata|snapshots)\//.test(p) ||
    /\/(dist|build|coverage|\.next)\//.test(p)
  );
}

function referencedInEdges(store: ArcStore, sym: SymbolRecord): boolean {
  const id = `symbol:${sym.id}`;
  const edges = [...store.edgesTo(id), ...store.edgesFrom(id)];
  return edges.some((e) => e.edge_type === "CALLS" || e.edge_type === "REFERENCES");
}

/**
 * Heuristic unused / dead-code candidates with confidence labels.
 * Verify before deleting — dynamic imports and framework entrypoints are missed.
 */
export function findUnusedSymbols(
  store: ArcStore,
  options: { limit?: number; includePrivate?: boolean } = {},
): {
  candidates: UnusedCandidate[];
  confidence: ConfidenceLevel;
  note: string;
} {
  const limit = options.limit ?? 100;
  const includePrivate = options.includePrivate ?? false;
  const importedNames = collectImportedNames(store);
  const symbols = store
    .listSymbols()
    .filter((s) => (includePrivate ? true : s.exported));

  const candidates: UnusedCandidate[] = [];

  for (const s of symbols) {
    if (importedNames.has(s.name)) continue;
    if (isTestOrGenerated(s.file_path)) continue;

    const reasons: string[] = [];
    let confidence: ConfidenceLevel = "weakly_inferred";

    if (s.exported) {
      reasons.push("exported symbol name not seen in any indexed import specifier");
    } else {
      reasons.push("non-exported symbol with no import references (limited visibility)");
    }

    if (referencedInEdges(store, s)) {
      continue;
    }
    reasons.push("no CALLS/REFERENCES edges to this symbol");

    if (isEntryish(s.file_path, s.name)) {
      reasons.push("possible entrypoint / barrel — lower confidence");
      confidence = "weakly_inferred";
    } else if (s.exported && !/^(get|set|handle|use|create|on)/i.test(s.name)) {
      confidence = "strongly_inferred";
      reasons.push("non-entry exported symbol with zero import hits");
    }

    if (
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|default|middleware|layout|loading|error|notFound)$/.test(
        s.name,
      )
    ) {
      confidence = "weakly_inferred";
      reasons.push("framework/route convention name — may be framework-invoked");
    }

    candidates.push({
      name: s.name,
      file: s.file_path,
      line: s.line,
      kind: s.kind,
      exported: Boolean(s.exported),
      confidence,
      reasons,
    });
  }

  const rank = (c: ConfidenceLevel) =>
    c === "strongly_inferred" ? 0 : c === "weakly_inferred" ? 1 : 2;
  candidates.sort(
    (a, b) => rank(a.confidence) - rank(b.confidence) || a.name.localeCompare(b.name),
  );

  return {
    candidates: candidates.slice(0, limit),
    confidence: "weakly_inferred",
    note: "Heuristic only — verify before deleting (dynamic imports, DI, framework entrypoints)",
  };
}

/** String form for backward-compatible deps unused output. */
export function findUnusedExportCandidates(store: ArcStore): string[] {
  return findUnusedSymbols(store)
    .candidates.filter((c) => c.exported)
    .map((c) => `${c.name} (${c.file}:${c.line}) [${c.confidence}]`);
}

/** Strongly connected components via Tarjan — deeper than pairwise mutual imports. */
export function findImportSccs(store: ArcStore, minSize = 3): string[][] {
  const edges = store.listEdges("IMPORTS");
  const nodes = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.from_id.startsWith("file:") || !e.to_id.startsWith("file:")) continue;
    nodes.add(e.from_id);
    nodes.add(e.to_id);
    if (!adj.has(e.from_id)) adj.set(e.from_id, []);
    adj.get(e.from_id)!.push(e.to_id);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length >= minSize) sccs.push(comp);
    }
  }

  for (const v of nodes) {
    if (!indices.has(v)) strongconnect(v);
  }
  return sccs;
}
