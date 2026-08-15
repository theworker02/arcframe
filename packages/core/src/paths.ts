import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import type { ArcframePaths } from "./types.js";

const ARCFRAME_DIR = ".arcframe";

/** Normalize path separators to POSIX for stable storage keys. */
export function toPosixPath(p: string): string {
  return p.replaceAll("\\", "/");
}

/** Convert a stored POSIX path back to the host filesystem path. */
export function fromPosixPath(p: string): string {
  if (platform() === "win32") {
    return p.replaceAll("/", "\\");
  }
  return p;
}

/** Resolve and normalize an absolute path on the host. */
export function resolvePath(...parts: string[]): string {
  return normalize(resolve(...parts));
}

/** Relative path from root, always stored as POSIX. */
export function relativePosix(from: string, to: string): string {
  return toPosixPath(relative(from, to));
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function fileExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

export function dirExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeText(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

export function hashContent(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function hashFile(path: string): string | null {
  try {
    return hashContent(readFileSync(path));
  } catch {
    return null;
  }
}

export function findUp(
  startDir: string,
  predicate: (dir: string) => boolean,
  maxDepth = 32,
): string | null {
  let current = resolvePath(startDir);
  for (let i = 0; i < maxDepth; i++) {
    if (predicate(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export function findProjectRoot(cwd: string = process.cwd()): string {
  const found = findUp(cwd, (dir) => {
    return (
      fileExists(join(dir, "package.json")) ||
      fileExists(join(dir, "Cargo.toml")) ||
      fileExists(join(dir, "go.mod")) ||
      fileExists(join(dir, "pyproject.toml")) ||
      fileExists(join(dir, "requirements.txt")) ||
      dirExists(join(dir, ".git")) ||
      dirExists(join(dir, ARCFRAME_DIR))
    );
  });
  return found ?? resolvePath(cwd);
}

export function getArcframePaths(root: string): ArcframePaths {
  const arcframeDir = join(root, ARCFRAME_DIR);
  return {
    root: resolvePath(root),
    arcframeDir,
    configPath: join(arcframeDir, "config.yaml"),
    dbPath: join(arcframeDir, "arcframe.db"),
    cacheDir: join(arcframeDir, "cache"),
    logsDir: join(arcframeDir, "logs"),
    indexDir: join(arcframeDir, "index"),
    graphDir: join(arcframeDir, "graph"),
    memoryDir: join(arcframeDir, "memory"),
    sessionsDir: join(arcframeDir, "sessions"),
    rulesDir: join(arcframeDir, "rules"),
    reportsDir: join(arcframeDir, "reports"),
  };
}

export function ensureArcframeLayout(root: string): ArcframePaths {
  const paths = getArcframePaths(root);
  for (const dir of [
    paths.arcframeDir,
    paths.cacheDir,
    paths.logsDir,
    paths.indexDir,
    paths.graphDir,
    paths.memoryDir,
    paths.sessionsDir,
    paths.rulesDir,
    paths.reportsDir,
  ]) {
    ensureDir(dir);
  }
  return paths;
}

export function isInitialized(root: string): boolean {
  const paths = getArcframePaths(root);
  return fileExists(paths.configPath) || fileExists(paths.dbPath);
}

export function safeJoin(root: string, ...parts: string[]): string {
  const candidate = resolvePath(root, ...parts);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${parts.join(sep)}`);
  }
  return candidate;
}

export function listFilesRecursive(
  dir: string,
  options: { maxDepth?: number; filter?: (path: string) => boolean } = {},
): string[] {
  const { maxDepth = 64, filter } = options;
  const results: string[] = [];

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (!filter || filter(full)) {
          results.push(full);
        }
      }
    }
  }

  if (dirExists(dir)) {
    walk(dir, 0);
  }
  return results;
}

export function getUserHome(): string {
  return homedir();
}

export function getTempDir(): string {
  return tmpdir();
}

export function getPlatform(): NodeJS.Platform {
  return platform();
}

export function pathBasename(p: string): string {
  return basename(p);
}

export { ARCFRAME_DIR };
