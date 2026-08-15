import { createHash } from "node:crypto";
import type { ExtractedImport, ExtractedSymbol, FileAnalysis, LanguageAdapter } from "../types.js";
import { applyFrameworkAnalysis } from "../frameworks.js";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

export const rustAdapter: LanguageAdapter = {
  id: "rust",
  name: "Rust",
  extensions: [".rs"],
  detect() {
    return true;
  },
  analyzeFile(_abs, content, relativePosix): FileAnalysis {
    const symbols: ExtractedSymbol[] = [];
    const imports: ExtractedImport[] = [];
    let m: RegExpExecArray | null;

    const useRe = /^\s*use\s+([^;]+);/gm;
    while ((m = useRe.exec(content))) {
      imports.push({
        source: m[1].trim(),
        specifiers: [m[1].trim()],
        line: lineOf(content, m.index),
        confidence: "confirmed",
      });
    }

    const modRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)/gm;
    while ((m = modRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "module",
        line: lineOf(content, m.index),
        exported: /pub/.test(m[0]),
      });
    }

    const fnRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/gm;
    while ((m = fnRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "function",
        line: lineOf(content, m.index),
        exported: /pub/.test(m[0]),
        signature: m[0].trim(),
      });
    }

    const structRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)/gm;
    while ((m = structRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "struct",
        line: lineOf(content, m.index),
        exported: /pub/.test(m[0]),
      });
    }

    const traitRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+(\w+)/gm;
    while ((m = traitRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "trait",
        line: lineOf(content, m.index),
        exported: /pub/.test(m[0]),
      });
    }

    const enumRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)/gm;
    while ((m = enumRe.exec(content))) {
      symbols.push({
        name: m[1],
        kind: "enum",
        line: lineOf(content, m.index),
        exported: /pub/.test(m[0]),
      });
    }

    const implRe = /^\s*impl(?:<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/gm;
    while ((m = implRe.exec(content))) {
      symbols.push({
        name: m[1] ? `${m[1]} for ${m[2]}` : m[2],
        kind: "impl",
        line: lineOf(content, m.index),
        exported: false,
      });
    }

    return applyFrameworkAnalysis(
      {
        path: relativePosix,
        language: "rust",
        hash: hash(content),
        symbols,
        imports,
      },
      content,
    );
  },
};
