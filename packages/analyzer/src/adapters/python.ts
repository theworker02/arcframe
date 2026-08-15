import { createHash } from "node:crypto";
import type { ExtractedImport, ExtractedSymbol, FileAnalysis, LanguageAdapter } from "../types.js";
import { applyFrameworkAnalysis } from "../frameworks.js";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

export const pythonAdapter: LanguageAdapter = {
  id: "python",
  name: "Python",
  extensions: [".py"],
  detect() {
    return true;
  },
  analyzeFile(_abs, content, relativePosix): FileAnalysis {
    const symbols: ExtractedSymbol[] = [];
    const imports: ExtractedImport[] = [];
    let m: RegExpExecArray | null;

    const importRe =
      /^(?:from\s+([\w.]+)\s+import\s+(.+)|import\s+([\w.,\s]+))/gm;
    while ((m = importRe.exec(content))) {
      const source = (m[1] ?? m[3] ?? "").trim();
      const specs = (m[2] ?? m[3] ?? "").split(",").map((s) => s.trim());
      imports.push({
        source,
        specifiers: specs,
        line: lineOf(content, m.index),
        confidence: "confirmed",
      });
    }

    const classRe = /^class\s+(\w+)/gm;
    while ((m = classRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "class",
        line: lineOf(content, m.index),
        exported: true,
      });
    }

    const fnRe = /^(?:async\s+)?def\s+(\w+)/gm;
    while ((m = fnRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "function",
        line: lineOf(content, m.index),
        exported: !m[1].startsWith("_"),
        signature: m[0],
      });
    }

    return applyFrameworkAnalysis(
      {
        path: relativePosix,
        language: "python",
        hash: hash(content),
        symbols,
        imports,
        routes: [],
      },
      content,
    );
  },
};
