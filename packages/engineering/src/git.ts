import { join } from "node:path";
import {
  commandExists,
  dirExists,
  execCommand,
  tryNativeGitmeta,
  type ConfidenceLevel,
} from "@arcframe/core";

export interface GitStatus {
  available: boolean;
  branch: string | null;
  clean: boolean | null;
  ahead: number | null;
  behind: number | null;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  confidence: ConfidenceLevel;
}

interface NativeStatusPayload {
  available: boolean;
  branch: string | null;
  clean: boolean | null;
  ahead: number | null;
  behind: number | null;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  confidence: ConfidenceLevel;
}

function normalizeStatus(data: NativeStatusPayload): GitStatus {
  return {
    available: Boolean(data.available),
    branch: data.branch ?? null,
    clean: data.clean ?? null,
    ahead: data.ahead ?? null,
    behind: data.behind ?? null,
    staged: Array.isArray(data.staged) ? data.staged : [],
    unstaged: Array.isArray(data.unstaged) ? data.unstaged : [],
    untracked: Array.isArray(data.untracked) ? data.untracked : [],
    confidence: data.confidence === "confirmed" ? "confirmed" : "unknown",
  };
}

export async function inspectGit(root: string): Promise<GitStatus> {
  const native = await tryNativeGitmeta<NativeStatusPayload>(root, "status");
  if (native) {
    return normalizeStatus(native.data);
  }
  return inspectGitJs(root);
}

async function inspectGitJs(root: string): Promise<GitStatus> {
  const hasGit = await commandExists("git");
  if (!hasGit || !dirExists(join(root, ".git"))) {
    return {
      available: false,
      branch: null,
      clean: null,
      ahead: null,
      behind: null,
      staged: [],
      unstaged: [],
      untracked: [],
      confidence: hasGit ? "confirmed" : "unknown",
    };
  }

  const branchRes = await execCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: root,
  });
  let branch: string | null =
    branchRes.exitCode === 0 ? branchRes.stdout.trim() : null;
  if (!branch || branch === "HEAD") {
    const sym = await execCommand("git", ["symbolic-ref", "--short", "HEAD"], {
      cwd: root,
    });
    if (sym.exitCode === 0 && sym.stdout.trim()) {
      branch = sym.stdout.trim();
    } else {
      const name = await execCommand("git", ["branch", "--show-current"], {
        cwd: root,
      });
      branch =
        name.exitCode === 0 && name.stdout.trim()
          ? name.stdout.trim()
          : "unborn";
    }
  }

  const statusRes = await execCommand(
    "git",
    ["status", "--porcelain=v1", "-b"],
    { cwd: root },
  );

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  let ahead: number | null = null;
  let behind: number | null = null;

  for (const line of statusRes.stdout.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("##")) {
      const aheadM = /ahead\s+(\d+)/.exec(line);
      const behindM = /behind\s+(\d+)/.exec(line);
      ahead = aheadM ? Number(aheadM[1]) : 0;
      behind = behindM ? Number(behindM[1]) : 0;
      continue;
    }
    const code = line.slice(0, 2);
    const file = line.slice(3);
    if (code === "??") untracked.push(file);
    else {
      if (code[0] !== " " && code[0] !== "?") staged.push(file);
      if (code[1] !== " " && code[1] !== "?") unstaged.push(file);
    }
  }

  return {
    available: true,
    branch,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
    confidence: "confirmed",
  };
}

export async function gitLog(root: string, limit = 10): Promise<string[]> {
  const native = await tryNativeGitmeta<{ entries?: string[] }>(root, "log", [
    String(limit),
  ]);
  if (native && Array.isArray(native.data.entries)) {
    return native.data.entries;
  }

  const res = await execCommand(
    "git",
    ["log", `-n${limit}`, "--pretty=format:%h %s (%an)"],
    { cwd: root },
  );
  if (res.exitCode !== 0) return [];
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

export async function gitDiff(root: string, staged = false): Promise<string> {
  const args = staged ? ["diff", "--cached"] : ["diff"];
  const res = await execCommand("git", args, { cwd: root });
  return res.stdout;
}

export async function gitBranches(root: string): Promise<{
  branches: string[];
  current: string | null;
  confidence: ConfidenceLevel;
}> {
  const status = await inspectGit(root);
  if (!status.available) {
    return { branches: [], current: null, confidence: status.confidence };
  }
  const res = await execCommand("git", ["branch", "--list", "--format=%(refname:short)"], {
    cwd: root,
  });
  const branches =
    res.exitCode === 0
      ? res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : [];
  return { branches, current: status.branch, confidence: "confirmed" };
}

export async function gitBlame(
  root: string,
  path: string,
): Promise<{ path: string; lines: string[]; confidence: ConfidenceLevel }> {
  const native = await tryNativeGitmeta<{
    path?: string;
    lines?: string[];
    confidence?: ConfidenceLevel;
  }>(root, "blame", [path]);
  if (native && Array.isArray(native.data.lines)) {
    return {
      path: native.data.path ?? path,
      lines: native.data.lines,
      confidence:
        native.data.confidence === "confirmed" ? "confirmed" : "unknown",
    };
  }

  const res = await execCommand("git", ["blame", "--line-porcelain", "--", path], {
    cwd: root,
  });
  if (res.exitCode !== 0) {
    return { path, lines: [], confidence: "unknown" };
  }
  const lines: string[] = [];
  let author = "?";
  for (const line of res.stdout.split(/\r?\n/)) {
    if (line.startsWith("author ")) author = line.slice(7);
    else if (line.startsWith("\t")) {
      lines.push(`${author}: ${line.slice(1)}`);
      if (lines.length >= 400) break;
    }
  }
  return { path, lines, confidence: "confirmed" };
}

export async function gitShow(
  root: string,
  ref: string,
): Promise<{ ref: string; content: string; confidence: ConfidenceLevel }> {
  const res = await execCommand("git", ["show", "--stat", "--format=fuller", ref], {
    cwd: root,
  });
  return {
    ref,
    content: res.stdout.slice(0, 40_000),
    confidence: res.exitCode === 0 ? "confirmed" : "unknown",
  };
}
