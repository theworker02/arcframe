import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { toPosixPath } from "./paths.js";

const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  ".arcframe",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  "tmp",
  "temp",
];

export class IgnoreMatcher {
  private readonly patterns: string[];

  constructor(patterns: string[] = []) {
    this.patterns = [
      ...DEFAULT_IGNORES,
      ...patterns
        .map((p) => p.trim())
        .filter((p) => p && !p.startsWith("#")),
    ];
  }

  static fromProject(root: string, ignoreFile = ".arcframeignore"): IgnoreMatcher {
    const patterns: string[] = [];
    const candidates = [
      join(root, ignoreFile),
      join(root, ".arcframeignore"),
      join(root, ".gitignore"),
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      try {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        patterns.push(...lines);
      } catch {
        /* ignore */
      }
    }
    return new IgnoreMatcher(patterns);
  }

  ignores(absolutePath: string, root: string): boolean {
    const rel = toPosixPath(relative(root, absolutePath));
    if (!rel || rel.startsWith("..")) {
      // outside root — treat as ignored
      return true;
    }
    const parts = rel.split("/");
    for (const pattern of this.patterns) {
      if (matchIgnore(pattern, rel, parts)) {
        return true;
      }
    }
    return false;
  }
}

function matchIgnore(pattern: string, rel: string, parts: string[]): boolean {
  let p = pattern.replaceAll("\\", "/").replace(/\/+$/, "");
  if (!p) return false;

  // Negation not fully supported in v1 — skip
  if (p.startsWith("!")) return false;

  if (p.startsWith("/")) {
    p = p.slice(1);
    return rel === p || rel.startsWith(p + "/");
  }

  // Simple glob: *.ext
  if (p.startsWith("*.")) {
    const ext = p.slice(1);
    return rel.endsWith(ext);
  }

  // Directory or path segment match
  if (parts.includes(p) || rel === p || rel.startsWith(p + "/")) {
    return true;
  }

  // **/name style reduced to basename/segment
  if (p.includes("**/")) {
    const tail = p.split("**/").pop()!;
    return rel.endsWith(tail) || parts.includes(tail.replace(/\/.*/, ""));
  }

  // path contains pattern
  if (rel.includes(p)) return true;

  // Windows sep safety
  const winRel = rel.replaceAll("/", sep);
  return winRel.includes(p.replaceAll("/", sep));
}

export function createIgnoreMatcher(
  root: string,
  ignoreFile?: string,
): IgnoreMatcher {
  return IgnoreMatcher.fromProject(root, ignoreFile);
}
