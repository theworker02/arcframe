import { createHash } from "node:crypto";
import type { ExtractedImport, ExtractedSymbol, FileAnalysis, LanguageAdapter } from "../types.js";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

export const goAdapter: LanguageAdapter = {
  id: "go",
  name: "Go",
  extensions: [".go"],
  detect() {
    return true;
  },
  analyzeFile(_abs, content, relativePosix): FileAnalysis {
    const symbols: ExtractedSymbol[] = [];
    const imports: ExtractedImport[] = [];
    let m: RegExpExecArray | null;

    // import "x" or import ( "x" "y" )
    const singleImport = /^import\s+(?:(\w+)\s+)?"([^"]+)"/gm;
    while ((m = singleImport.exec(content))) {
      imports.push({
        source: m[2],
        specifiers: [m[1] ?? m[2]],
        line: lineOf(content, m.index),
        confidence: "confirmed",
      });
    }
    const blockImport = /import\s*\(([\s\S]*?)\)/g;
    while ((m = blockImport.exec(content))) {
      const block = m[1];
      const lineBase = lineOf(content, m.index);
      const inner = /(?:(\w+)\s+)?"([^"]+)"/g;
      let im: RegExpExecArray | null;
      while ((im = inner.exec(block))) {
        imports.push({
          source: im[2],
          specifiers: [im[1] ?? im[2]],
          line: lineBase,
          confidence: "confirmed",
        });
      }
    }

    const fnRe = /^func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)/gm;
    while ((m = fnRe.exec(content))) {
      const name = m[3];
      symbols.push({
        name: m[1] ? `${m[2]}.${name}` : name,
        kind: m[1] ? "method" : "function",
        line: lineOf(content, m.index),
        exported: /^[A-Z]/.test(name),
        signature: m[0],
      });
    }

    const typeRe = /^type\s+(\w+)\s+(struct|interface)/gm;
    while ((m = typeRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: m[2] === "struct" ? "struct" : "interface",
        line: lineOf(content, m.index),
        exported: /^[A-Z]/.test(m[1]),
      });
    }

    const constRe = /^(?:const|var)\s+(\w+)/gm;
    while ((m = constRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "const",
        line: lineOf(content, m.index),
        exported: /^[A-Z]/.test(m[1]),
      });
    }

    return {
      path: relativePosix,
      language: "go",
      hash: hash(content),
      symbols,
      imports,
    };
  },
};
