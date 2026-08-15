import type { ExtractedImport, ExtractedSymbol, FileAnalysis, LanguageAdapter } from "../types.js";
import { createHash } from "node:crypto";
import { applyFrameworkAnalysis } from "../frameworks.js";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

/** Shared regex-based extractors for JS/TS family. */
export function analyzeJsFamily(
  relativePosix: string,
  content: string,
  language: "typescript" | "javascript",
): FileAnalysis {
  const symbols: ExtractedSymbol[] = [];
  const imports: ExtractedImport[] = [];

  const importRe =
    /(?:import\s+(?:type\s+)?(?:([\w*\s{},]+)\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content))) {
    const source = m[2] ?? m[3] ?? "";
    const spec = (m[1] ?? "*").trim();
    imports.push({
      source,
      specifiers: [spec],
      line: lineOf(content, m.index),
      confidence: "confirmed",
    });
  }

  const exportFn =
    /export\s+(?:async\s+)?function\s+(\w+)/g;
  while ((m = exportFn.exec(content))) {
    symbols.push({
      name: m[1],
      kind: "function",
      line: lineOf(content, m.index),
      exported: true,
      signature: m[0],
    });
  }

  const fnRe = /(?:^|\n)\s*(?:async\s+)?function\s+(\w+)/g;
  while ((m = fnRe.exec(content))) {
    if (symbols.some((s) => s.name === m![1] && s.kind === "function")) continue;
    symbols.push({
      name: m[1],
      kind: "function",
      line: lineOf(content, m.index),
      exported: false,
    });
  }

  const classRe = /export\s+class\s+(\w+)|(?:^|\n)\s*class\s+(\w+)/g;
  while ((m = classRe.exec(content))) {
    const name = m[1] ?? m[2];
    symbols.push({
      name,
      kind: "class",
      line: lineOf(content, m.index),
      exported: Boolean(m[1]),
    });
  }

  const ifaceRe = /export\s+interface\s+(\w+)|interface\s+(\w+)/g;
  while ((m = ifaceRe.exec(content))) {
    const name = m[1] ?? m[2];
    symbols.push({
      name,
      kind: "interface",
      line: lineOf(content, m.index),
      exported: Boolean(m[1]),
    });
  }

  const typeRe = /export\s+type\s+(\w+)|type\s+(\w+)\s*=/g;
  while ((m = typeRe.exec(content))) {
    const name = m[1] ?? m[2];
    symbols.push({
      name,
      kind: "type",
      line: lineOf(content, m.index),
      exported: Boolean(m[1]),
    });
  }

  const constRe =
    /export\s+(?:const|let|var)\s+(\w+)|(?:^|\n)\s*(?:const|let|var)\s+(\w+)\s*=/g;
  while ((m = constRe.exec(content))) {
    const name = m[1] ?? m[2];
    if (["require", "module", "exports"].includes(name)) continue;
    symbols.push({
      name,
      kind: "const",
      line: lineOf(content, m.index),
      exported: Boolean(m[1]),
    });
  }

  // Express/Fastify route heuristics (also expanded in applyFrameworkAnalysis)
  const routes: FileAnalysis["routes"] = [];
  const routeRe =
    /\.(get|post|put|patch|delete|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = routeRe.exec(content))) {
    routes.push({
      method: m[1].toUpperCase(),
      path: m[2],
      line: lineOf(content, m.index),
    });
    symbols.push({
      name: `${m[1].toUpperCase()} ${m[2]}`,
      kind: "route",
      line: lineOf(content, m.index),
      exported: false,
    });
  }

  return applyFrameworkAnalysis(
    {
      path: relativePosix,
      language,
      hash: hash(content),
      symbols,
      imports,
      routes,
    },
    content,
  );
}

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript",
  name: "TypeScript",
  extensions: [".ts", ".tsx", ".mts", ".cts"],
  detect(_root) {
    return true; // availability gated by file extensions
  },
  analyzeFile(_abs, content, relativePosix) {
    return analyzeJsFamily(relativePosix, content, "typescript");
  },
};

export const javascriptAdapter: LanguageAdapter = {
  id: "javascript",
  name: "JavaScript",
  extensions: [".js", ".jsx", ".mjs", ".cjs"],
  detect() {
    return true;
  },
  analyzeFile(_abs, content, relativePosix) {
    return analyzeJsFamily(relativePosix, content, "javascript");
  },
};
