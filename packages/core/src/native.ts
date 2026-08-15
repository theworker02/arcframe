/**
 * Optional native accelerator discovery and invocation.
 *
 * Binaries are never required — TypeScript callers must fall back when missing.
 *
 * Discovery order:
 * 1. `ARCFRAME_NATIVE_DIR` (directory containing binaries)
 * 2. `native/bin/` under a repo root found by walking up from cwd
 * 3. Per-crate build outputs (`native/arcframe-hashwalk/target/release`, …)
 * 4. PATH
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileExists } from "./paths.js";
import { commandExists, execCommand } from "./process.js";

export const NATIVE_BINARIES = {
  hashwalk: "arcframe-hashwalk",
  gitmeta: "arcframe-gitmeta",
} as const;

export type NativeBinaryName =
  (typeof NATIVE_BINARIES)[keyof typeof NATIVE_BINARIES];

function exeName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function candidateDirsFrom(start: string): string[] {
  const dirs: string[] = [];
  let current = start;
  for (let i = 0; i < 12; i++) {
    dirs.push(join(current, "native", "bin"));
    dirs.push(join(current, "native", "arcframe-hashwalk", "target", "release"));
    dirs.push(join(current, "native", "arcframe-hashwalk", "target", "debug"));
    dirs.push(join(current, "native", "arcframe-gitmeta"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

/**
 * Resolve an absolute path to a native binary, or null if not found locally.
 * Does not search PATH (use {@link resolveNativeBinary} for that).
 */
export function findNativeBinaryPath(base: NativeBinaryName): string | null {
  const name = exeName(base);
  const dirs: string[] = [];

  const envDir = process.env.ARCFRAME_NATIVE_DIR?.trim();
  if (envDir) dirs.push(envDir);

  dirs.push(...candidateDirsFrom(process.cwd()));

  // Also walk from this package location (packages/core/dist → repo root)
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    dirs.push(...candidateDirsFrom(here));
  } catch {
    /* ignore */
  }

  const seen = new Set<string>();
  for (const dir of dirs) {
    const full = join(dir, name);
    if (seen.has(full)) continue;
    seen.add(full);
    if (fileExists(full)) return full;
  }
  return null;
}

/**
 * Resolve binary path or bare command name if present on PATH.
 */
export async function resolveNativeBinary(
  base: NativeBinaryName,
): Promise<string | null> {
  const local = findNativeBinaryPath(base);
  if (local) return local;
  if (await commandExists(base)) return base;
  // Windows: try with .exe via where already covered by commandExists(base)
  return null;
}

export interface HashwalkEntry {
  path: string;
  hash: string;
  size: number;
  mtime: number;
}

/** Parse JSONL from arcframe-hashwalk stdout. */
export function parseHashwalkJsonl(stdout: string): HashwalkEntry[] {
  const out: HashwalkEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const o = parsed as Record<string, unknown>;
    if (
      typeof o.path !== "string" ||
      typeof o.hash !== "string" ||
      typeof o.size !== "number" ||
      typeof o.mtime !== "number"
    ) {
      continue;
    }
    out.push({
      path: o.path.replaceAll("\\", "/"),
      hash: o.hash,
      size: o.size,
      mtime: o.mtime,
    });
  }
  return out;
}

export interface NativeHashwalkResult {
  entries: HashwalkEntry[];
  binary: string;
  durationMs: number;
}

/**
 * Run arcframe-hashwalk if available. Returns null when binary missing or fails.
 */
export async function tryNativeHashwalk(
  root: string,
  options: { ignoreFile?: string; timeoutMs?: number } = {},
): Promise<NativeHashwalkResult | null> {
  const binary = await resolveNativeBinary(NATIVE_BINARIES.hashwalk);
  if (!binary) return null;

  const args = [root];
  if (options.ignoreFile) {
    args.push("--ignore-file", options.ignoreFile);
  }

  try {
    const result = await execCommand(binary, args, {
      cwd: root,
      timeoutMs: options.timeoutMs ?? 120_000,
    });
    if (result.exitCode !== 0) return null;
    return {
      entries: parseHashwalkJsonl(result.stdout),
      binary,
      durationMs: result.durationMs,
    };
  } catch {
    return null;
  }
}

export type GitmetaCommand = "status" | "blame" | "log";

/**
 * Run arcframe-gitmeta <cmd> … with cwd=root. Returns parsed JSON or null.
 */
export async function tryNativeGitmeta<T = unknown>(
  root: string,
  command: GitmetaCommand,
  args: string[] = [],
  options: { timeoutMs?: number } = {},
): Promise<{ data: T; binary: string; durationMs: number } | null> {
  const binary = await resolveNativeBinary(NATIVE_BINARIES.gitmeta);
  if (!binary) return null;

  try {
    const result = await execCommand(binary, [command, ...args], {
      cwd: root,
      timeoutMs: options.timeoutMs ?? 60_000,
    });
    if (result.exitCode !== 0) return null;
    const data = JSON.parse(result.stdout) as T;
    return { data, binary, durationMs: result.durationMs };
  } catch {
    return null;
  }
}
