import type { ConfidenceLevel } from "@arcframe/core";

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "const"
  | "enum"
  | "method"
  | "module"
  | "struct"
  | "trait"
  | "impl"
  | "route"
  | "unknown";

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  endLine?: number;
  exported: boolean;
  signature?: string;
}

export interface ExtractedImport {
  source: string;
  specifiers: string[];
  line: number;
  confidence: ConfidenceLevel;
}

export interface FileAnalysis {
  path: string;
  language: string;
  hash: string;
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
  routes?: Array<{ method: string; path: string; line: number }>;
}

export interface LanguageAdapter {
  id: string;
  name: string;
  extensions: string[];
  detect(root: string): boolean;
  analyzeFile(absolutePath: string, content: string, relativePosix: string): FileAnalysis;
}

export interface IndexProgress {
  scanned: number;
  indexed: number;
  skipped: number;
  removed: number;
  languages: Record<string, number>;
}

export interface IndexResult {
  progress: IndexProgress;
  durationMs: number;
  incremental: boolean;
}
