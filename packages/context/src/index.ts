import {
  CONTEXT_BUDGET_TOKENS,
  type ConfidenceLevel,
  type ContextBudget,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";
import type { GraphBuilder } from "@arcframe/graph";
import type { MemoryService } from "@arcframe/memory";

export interface ContextItem {
  id: string;
  kind: "file" | "symbol" | "memory" | "decision" | "graph" | "summary";
  path?: string;
  title: string;
  content: string;
  score: number;
  reasons: string[];
  tokens: number;
  confidence: ConfidenceLevel;
}

export interface ContextPack {
  query: string;
  budget: ContextBudget;
  budgetTokens: number;
  usedTokens: number;
  items: ContextItem[];
  truncated: boolean;
}

function estimateTokens(text: string): number {
  // Rough heuristic: ~4 chars per token
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface ContextBuilderOptions {
  store: ArcStore;
  graph?: GraphBuilder;
  memory?: MemoryService;
}

export class ContextBuilder {
  constructor(private readonly options: ContextBuilderOptions) {}

  build(query: string, budget: ContextBudget = "normal"): ContextPack {
    const budgetTokens = CONTEXT_BUDGET_TOKENS[budget];
    const candidates: ContextItem[] = [];
    const q = query.toLowerCase();

    // Symbol matches
    const symbols = this.options.store.findSymbols(query, 40);
    for (const sym of symbols) {
      const content = `${sym.kind} ${sym.name} @ ${sym.file_path}:${sym.line}${
        sym.signature ? `\n${sym.signature}` : ""
      }`;
      candidates.push({
        id: `symbol:${sym.id}`,
        kind: "symbol",
        path: sym.file_path,
        title: sym.name,
        content,
        score: scoreMatch(sym.name, q) + (sym.exported ? 5 : 0),
        reasons: ["symbol name match", sym.exported ? "exported" : "local"],
        tokens: estimateTokens(content),
        confidence: "confirmed",
      });
    }

    // File path matches
    for (const file of this.options.store.listFiles()) {
      if (
        file.path.toLowerCase().includes(q) ||
        q.split(/\s+/).some((t) => t && file.path.toLowerCase().includes(t))
      ) {
        const content = `File ${file.path} (${file.language ?? "unknown"}, ${file.size} bytes)`;
        candidates.push({
          id: `file:${file.path}`,
          kind: "file",
          path: file.path,
          title: file.path,
          content,
          score: scoreMatch(file.path, q) + 2,
          reasons: ["path match"],
          tokens: estimateTokens(content),
          confidence: "confirmed",
        });
      }
    }

    // Memory
    if (this.options.memory) {
      for (const mem of this.options.memory.search(query, 20)) {
        const content = `# ${mem.title}\n${mem.content}`;
        candidates.push({
          id: `memory:${mem.id}`,
          kind: "memory",
          title: mem.title,
          content,
          score: scoreMatch(mem.title, q) + 3,
          reasons: ["memory match", `type:${mem.type}`],
          tokens: estimateTokens(content),
          confidence: "confirmed",
        });
      }
    }

    // Graph impact for top symbol/file
    if (this.options.graph && candidates.length > 0) {
      const top = [...candidates].sort((a, b) => b.score - a.score)[0];
      const nodeId =
        top.kind === "file"
          ? `file:${top.path}`
          : top.id.startsWith("symbol:")
            ? top.id
            : null;
      if (nodeId) {
        const impact = this.options.graph.impact(nodeId, 1);
        const content = JSON.stringify(impact, null, 2);
        candidates.push({
          id: `graph:${nodeId}`,
          kind: "graph",
          title: `Impact of ${nodeId}`,
          content,
          score: top.score + 1,
          reasons: ["graph neighborhood"],
          tokens: estimateTokens(content),
          confidence: impact.confidence,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const items: ContextItem[] = [];
    let used = 0;
    let truncated = false;
    for (const item of candidates) {
      if (used + item.tokens > budgetTokens) {
        truncated = true;
        break;
      }
      items.push(item);
      used += item.tokens;
    }

    return {
      query,
      budget,
      budgetTokens: Number.isFinite(budgetTokens) ? budgetTokens : used,
      usedTokens: used,
      items,
      truncated,
    };
  }
}

function scoreMatch(text: string, query: string): number {
  const t = text.toLowerCase();
  if (t === query) return 100;
  if (t.includes(query)) return 50;
  const parts = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const p of parts) {
    if (t.includes(p)) score += 10;
  }
  return score;
}

export function createContextBuilder(options: ContextBuilderOptions): ContextBuilder {
  return new ContextBuilder(options);
}
