import type { ConfidenceLevel } from "@arcframe/core";
import type { ArcStore, SymbolRecord } from "@arcframe/storage";

export interface StackFrame {
  raw: string;
  functionName?: string;
  file?: string;
  line?: number;
  column?: number;
  kind: "js" | "python" | "rust" | "go" | "generic";
}

export interface StackSuspect {
  file: string;
  line: number;
  symbol?: string;
  symbolKind?: string;
  confidence: ConfidenceLevel;
  reason: string;
}

export interface StackInvestigation {
  frames: StackFrame[];
  suspects: StackSuspect[];
  unmatched: StackFrame[];
  confidence: ConfidenceLevel;
  note: string;
}

/** Path + :line[:col] — handles Windows drive letters (C:...) without splitting early. */
const LOC =
  "(?<file>(?:file:///)?(?:[A-Za-z]:)?[^\\s:()]+?\\.[A-Za-z][A-Za-z0-9]*):(?<line>\\d+)(?::(?<col>\\d+))?";
const JS_FRAME = new RegExp(
  `^\\s*at\\s+(?:(?<fn>[\\w.$<>\\[\\]]+)\\s+)?\\(?${LOC}\\)?`,
);
const JS_FRAME_SIMPLE = new RegExp(`^\\s*at\\s+${LOC}`);
const PYTHON_FRAME =
  /^\s*File\s+"(?<file>[^"]+)",\s+line\s+(?<line>\d+)(?:,\s+in\s+(?<fn>\S+))?/;
const RUST_FRAME = new RegExp(
  `^\\s*(?:\\d+:\\s+)?(?:(?<fn>[\\w:]+)\\s+)?(?:at\\s+)?${LOC}`,
);
const GO_FRAME_FILE =
  /^\s*(?<file>(?:[A-Za-z]:)?[^\s:]+\.go):(?<line>\d+)\s*(?:\+(?:0x)?[0-9a-fA-F]+)?/;

function normalizePath(file: string): string {
  let f = file.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "");
  // Windows file:///C:/...
  if (/^[A-Za-z]\//.test(f) && f.includes("/")) {
    f = f.replace(/^([A-Za-z])\//, "$1:/");
  }
  return f.replaceAll("\\", "/");
}

function isInternal(file: string): boolean {
  return (
    file.startsWith("node:") ||
    file.includes("node_modules/") ||
    file.includes("/internal/") ||
    file.startsWith("<") ||
    /^(?:native|unknown)/i.test(file)
  );
}

/** Parse a pasted multi-line stack trace into structured frames. */
export function parseStacktrace(text: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    let m = JS_FRAME.exec(line) ?? JS_FRAME_SIMPLE.exec(line);
    if (m?.groups?.file) {
      const file = normalizePath(m.groups.file);
      if (!isInternal(file) || file.includes("node_modules/")) {
        frames.push({
          raw: line.trim(),
          functionName: m.groups.fn,
          file,
          line: Number(m.groups.line),
          column: m.groups.col ? Number(m.groups.col) : undefined,
          kind: "js",
        });
      }
      continue;
    }

    m = PYTHON_FRAME.exec(line);
    if (m?.groups?.file) {
      frames.push({
        raw: line.trim(),
        functionName: m.groups.fn,
        file: normalizePath(m.groups.file),
        line: Number(m.groups.line),
        kind: "python",
      });
      continue;
    }

    if (/\.go:\d+/.test(line)) {
      m = GO_FRAME_FILE.exec(line);
      if (m?.groups?.file) {
        frames.push({
          raw: line.trim(),
          file: normalizePath(m.groups.file),
          line: Number(m.groups.line),
          kind: "go",
        });
        continue;
      }
    }

    if (/\.(?:rs|ts|tsx|js|jsx|mjs|cjs):\d+/.test(line) && !/^Error\b/i.test(line)) {
      m = RUST_FRAME.exec(line);
      if (m?.groups?.file && m.groups.line) {
        frames.push({
          raw: line.trim(),
          functionName: m.groups.fn,
          file: normalizePath(m.groups.file),
          line: Number(m.groups.line),
          column: m.groups.col ? Number(m.groups.col) : undefined,
          kind: m.groups.file.endsWith(".rs") ? "rust" : "generic",
        });
      }
    }
  }
  return frames;
}

function pathTail(p: string): string {
  const parts = p.replaceAll("\\", "/").split("/");
  return parts[parts.length - 1] ?? p;
}

function matchFileInIndex(store: ArcStore, frameFile: string): string | undefined {
  const norm = frameFile.replaceAll("\\", "/");
  const files = store.listFiles();
  const exact = files.find((f) => f.path === norm || norm.endsWith("/" + f.path));
  if (exact) return exact.path;
  const byTail = files.filter((f) => pathTail(f.path) === pathTail(norm));
  if (byTail.length === 1) return byTail[0].path;
  // Prefer longest suffix match
  let best: string | undefined;
  let bestLen = 0;
  for (const f of files) {
    if (norm.endsWith(f.path) && f.path.length > bestLen) {
      best = f.path;
      bestLen = f.path.length;
    }
  }
  return best;
}

function symbolAtLine(
  symbols: SymbolRecord[],
  line: number,
): SymbolRecord | undefined {
  const covering = symbols.filter((s) => {
    const end = s.end_line ?? s.line;
    return line >= s.line && line <= end;
  });
  if (covering.length) {
    covering.sort((a, b) => {
      const spanA = (a.end_line ?? a.line) - a.line;
      const spanB = (b.end_line ?? b.line) - b.line;
      return spanA - spanB;
    });
    return covering[0];
  }
  // nearest above
  const above = symbols.filter((s) => s.line <= line).sort((a, b) => b.line - a.line);
  return above[0];
}

/**
 * Map stack frames to indexed files/symbols.
 * Returns suspects with confidence — never invents certainty.
 */
export function investigateStacktrace(
  store: ArcStore,
  stackText: string,
): StackInvestigation {
  const frames = parseStacktrace(stackText);
  const suspects: StackSuspect[] = [];
  const unmatched: StackFrame[] = [];

  for (const frame of frames) {
    if (!frame.file || frame.line == null) {
      unmatched.push(frame);
      continue;
    }
    if (isInternal(frame.file) && !frame.file.includes("node_modules/")) {
      unmatched.push(frame);
      continue;
    }

    const indexed = matchFileInIndex(store, frame.file);
    if (!indexed) {
      unmatched.push(frame);
      continue;
    }

    const symbols = store.listSymbols(indexed);
    const sym =
      (frame.functionName
        ? symbols.find(
            (s) =>
              s.name === frame.functionName ||
              frame.functionName!.endsWith("." + s.name) ||
              frame.functionName!.endsWith("/" + s.name),
          )
        : undefined) ?? symbolAtLine(symbols, frame.line);

    let confidence: ConfidenceLevel = "weakly_inferred";
    let reason = `frame maps to indexed file ${indexed}:${frame.line}`;
    if (sym && frame.functionName && sym.name === frame.functionName) {
      confidence = "confirmed";
      reason = `symbol name + file/line match`;
    } else if (sym && frame.line >= sym.line && frame.line <= (sym.end_line ?? sym.line + 40)) {
      confidence = "strongly_inferred";
      reason = `line falls within symbol ${sym.name} span`;
    } else if (sym) {
      confidence = "weakly_inferred";
      reason = `nearest symbol above line is ${sym.name}`;
    }

    suspects.push({
      file: indexed,
      line: frame.line,
      symbol: sym?.name,
      symbolKind: sym?.kind,
      confidence,
      reason,
    });
  }

  // Prefer project frames over node_modules in ordering
  suspects.sort((a, b) => {
    const aNm = a.file.includes("node_modules") ? 1 : 0;
    const bNm = b.file.includes("node_modules") ? 1 : 0;
    return aNm - bNm;
  });

  const confidence: ConfidenceLevel =
    suspects.some((s) => s.confidence === "confirmed")
      ? "confirmed"
      : suspects.some((s) => s.confidence === "strongly_inferred")
        ? "strongly_inferred"
        : suspects.length
          ? "weakly_inferred"
          : "unknown";

  return {
    frames,
    suspects,
    unmatched,
    confidence,
    note: "Suspects are index-backed hypotheses — verify against the live stack",
  };
}
