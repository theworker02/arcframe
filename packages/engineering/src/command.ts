import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  fileExists,
  readText,
  relativePosix,
  type ConfidenceLevel,
} from "@arcframe/core";

export interface CommandToken {
  text: string;
  role: "binary" | "subcommand" | "flag" | "flag_value" | "path" | "arg" | "pipe" | "redirect" | "env";
  meaning: string;
}

export interface CommandExplanation {
  command: string;
  tokens: CommandToken[];
  summary: string;
  risks: string[];
  relatedScripts: string[];
  confidence: ConfidenceLevel;
}

export interface DetectedScript {
  packagePath: string;
  name: string;
  command: string;
  category:
    | "build"
    | "test"
    | "lint"
    | "dev"
    | "start"
    | "clean"
    | "typecheck"
    | "docs"
    | "release"
    | "other";
  confidence: ConfidenceLevel;
}

const BINARY_MEANINGS: Record<string, string> = {
  node: "Run a Node.js script or module",
  npm: "Node package manager",
  npx: "Execute a package binary",
  pnpm: "Performant npm-compatible package manager",
  yarn: "Yarn package manager",
  bun: "Bun runtime / package manager",
  cargo: "Rust package manager and build tool",
  go: "Go toolchain",
  python: "Python interpreter",
  python3: "Python 3 interpreter",
  pip: "Python package installer",
  pytest: "Python test runner",
  vitest: "Vitest test runner",
  tsc: "TypeScript compiler",
  eslint: "ESLint linter",
  prettier: "Prettier formatter",
  docker: "Docker CLI",
  git: "Git VCS",
  arc: "Arcframe engineering control plane CLI",
  arcframe: "Arcframe CLI alias",
  curl: "HTTP client",
  wget: "HTTP downloader",
  make: "Make build tool",
  cmake: "CMake build system",
  rustc: "Rust compiler",
  deno: "Deno runtime",
};

const FLAG_MEANINGS: Record<string, string> = {
  "-r": "Recursive / run workspace packages (context-dependent)",
  "--filter": "Limit to matching workspace package(s)",
  "--frozen-lockfile": "Fail if lockfile would change",
  "--production": "Omit devDependencies",
  "--watch": "Re-run on file changes",
  "--coverage": "Collect test coverage",
  "--json": "Machine-readable JSON output",
  "--staged": "Operate on staged git changes only",
  "--yes": "Skip interactive confirmation",
  "--intent": "Explicit destructive intent for Arcframe",
  "-c": "Pass a command string / config (context-dependent)",
  "--noEmit": "Typecheck without emitting files",
  "--passWithNoTests": "Exit successfully when no tests match",
};

function categorizeScript(name: string, command: string): DetectedScript["category"] {
  const n = name.toLowerCase();
  const c = command.toLowerCase();
  if (/^(build|compile|bundle)/.test(n) || /\b(tsc|vite build|next build|cargo build)\b/.test(c))
    return "build";
  if (/^(test|spec|jest|vitest|pytest)/.test(n) || /\b(vitest|jest|pytest|go test)\b/.test(c))
    return "test";
  if (/lint|eslint|prettier|format/.test(n) || /\b(eslint|prettier|ruff)\b/.test(c)) return "lint";
  if (/typecheck|type-check|check-types/.test(n) || /tsc.*--noEmit/.test(c)) return "typecheck";
  if (/^(dev|watch)/.test(n) || /\b(--watch|nodemon|vite\b(?! build))\b/.test(c)) return "dev";
  if (/^(start|serve|preview)/.test(n)) return "start";
  if (/clean|rimraf|rm -rf/.test(n) || /\brimraf\b/.test(c)) return "clean";
  if (/doc|vitepress|storybook/.test(n)) return "docs";
  if (/release|publish|changeset|version/.test(n)) return "release";
  return "other";
}

function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  const re = /(?:[^\s"'|><]+|"[^"]*"|'[^']*'|\||>>|>|<)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) {
    tokens.push(m[0]);
  }
  return tokens;
}

function looksLikePath(t: string): boolean {
  return (
    t.startsWith("./") ||
    t.startsWith("../") ||
    t.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(t) ||
    /\.[a-z]{1,4}$/i.test(t)
  );
}

/**
 * Explain a shell / package-manager command for agents (no execution).
 */
export function explainCommand(
  command: string,
  options: { root?: string; scripts?: Record<string, string> } = {},
): CommandExplanation {
  const trimmed = command.trim();
  const tokens = tokenizeShell(trimmed);
  const explained: CommandToken[] = [];
  const risks: string[] = [];
  let summary = "";
  let expectFlagValue: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "|") {
      explained.push({ text: t, role: "pipe", meaning: "Pipe stdout to the next command" });
      continue;
    }
    if (t === ">" || t === ">>" || t === "<") {
      explained.push({
        text: t,
        role: "redirect",
        meaning: t === "<" ? "Redirect stdin from file" : "Redirect stdout to file",
      });
      continue;
    }
    if (/^[A-Z_][A-Z0-9_]*=/.test(t)) {
      const key = t.split("=")[0];
      explained.push({
        text: key + "=",
        role: "env",
        meaning: `Set environment variable ${key} for this command (value omitted)`,
      });
      continue;
    }
    if (expectFlagValue) {
      explained.push({
        text: t,
        role: "flag_value",
        meaning: `Value for ${expectFlagValue}`,
      });
      expectFlagValue = null;
      continue;
    }
    if (t.startsWith("-")) {
      const meaning = FLAG_MEANINGS[t] ?? `Flag ${t}`;
      explained.push({ text: t, role: "flag", meaning });
      if (
        t === "--filter" ||
        t === "-c" ||
        t === "--cwd" ||
        t === "--budget" ||
        (t.startsWith("--") && !t.includes("=") && tokens[i + 1] && !tokens[i + 1].startsWith("-"))
      ) {
        // Heuristic: long flags that take values
        if (["--filter", "--cwd", "--budget", "-c", "--package", "--file", "--related"].includes(t)) {
          expectFlagValue = t;
        }
      }
      if (t === "--force" || t === "-f" || t === "--hard") {
        risks.push(`Destructive-looking flag ${t}`);
      }
      continue;
    }
    if (i === 0 || explained.every((x) => x.role === "env" || x.role === "pipe")) {
      const bin = t.replace(/^.*[\\/]/, "");
      explained.push({
        text: t,
        role: "binary",
        meaning: BINARY_MEANINGS[bin] ?? `Executable '${bin}'`,
      });
      continue;
    }
    const prev = explained[explained.length - 1];
    if (prev?.role === "binary" || prev?.role === "subcommand") {
      if (looksLikePath(t)) {
        explained.push({ text: t, role: "path", meaning: `Path argument: ${t}` });
      } else {
        explained.push({
          text: t,
          role: "subcommand",
          meaning: `Subcommand or script name '${t}'`,
        });
      }
      continue;
    }
    if (looksLikePath(t)) {
      explained.push({ text: t, role: "path", meaning: `Path: ${t}` });
    } else {
      explained.push({ text: t, role: "arg", meaning: `Argument: ${t}` });
    }
  }

  const bin = explained.find((t) => t.role === "binary")?.text.replace(/^.*[\\/]/, "") ?? "";
  const sub = explained.find((t) => t.role === "subcommand")?.text;
  if (bin === "pnpm" || bin === "npm" || bin === "yarn" || bin === "bun") {
    if (sub === "run" || sub === "test" || sub === "build" || sub === "start" || sub === "dev") {
      summary = `Invoke package manager '${bin}' to ${sub} a project script or lifecycle`;
    } else if (sub === "install" || sub === "i" || sub === "add") {
      summary = `Install or add dependencies via ${bin}`;
      risks.push("May mutate package.json / lockfile and node_modules");
    } else {
      summary = `Run ${bin}${sub ? " " + sub : ""}`;
    }
  } else if (bin === "arc" || bin === "arcframe") {
    summary = `Arcframe CLI: ${[bin, sub].filter(Boolean).join(" ")}`;
  } else if (bin === "git") {
    summary = `Git ${sub ?? "command"}`;
    if (sub === "push" || sub === "reset" || sub === "clean") {
      risks.push(`Potentially destructive git operation: ${sub}`);
    }
  } else {
    summary = explained
      .filter((t) => t.role === "binary" || t.role === "subcommand")
      .map((t) => t.text)
      .join(" ");
    if (!summary) summary = trimmed.slice(0, 120);
  }

  if (/\brm\b|\brimraf\b|\b--force\b|\bDROP\b/i.test(trimmed)) {
    risks.push("Command may delete or overwrite data");
  }

  const scripts = options.scripts ?? (options.root ? loadRootScripts(options.root) : {});
  const relatedScripts = Object.entries(scripts)
    .filter(([, cmd]) => cmd.includes(trimmed) || trimmed.includes(cmd) || cmd === trimmed)
    .map(([name]) => name)
    .slice(0, 10);

  // Also match when explaining `pnpm run X`
  if ((sub === "run" || bin === "npm" || bin === "pnpm") && explained.length >= 3) {
    const scriptName = explained.find(
      (t, idx) => t.role === "subcommand" && explained[idx - 1]?.text === "run",
    )?.text;
    if (scriptName && scripts[scriptName]) {
      relatedScripts.push(scriptName);
      summary = `Run package script '${scriptName}': ${scripts[scriptName]}`;
    }
  }

  return {
    command: trimmed,
    tokens: explained,
    summary,
    risks: [...new Set(risks)],
    relatedScripts: [...new Set(relatedScripts)],
    confidence: explained.length ? "strongly_inferred" : "unknown",
  };
}

function loadRootScripts(root: string): Record<string, string> {
  const p = join(root, "package.json");
  if (!fileExists(p)) return {};
  try {
    const pkg = JSON.parse(readText(p)) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

function readPackageScripts(
  root: string,
  pkgPath: string,
): DetectedScript[] {
  try {
    const pkg = JSON.parse(readText(pkgPath)) as { scripts?: Record<string, string> };
    const rel = relativePosix(root, pkgPath);
    const out: DetectedScript[] = [];
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      out.push({
        packagePath: rel,
        name,
        command,
        category: categorizeScript(name, command),
        confidence: "confirmed",
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Detect package scripts across the repo (root + common workspace package.json files).
 */
export function detectPackageScripts(
  root: string,
  options: { maxPackages?: number } = {},
): {
  scripts: DetectedScript[];
  byCategory: Record<string, number>;
  confidence: ConfidenceLevel;
} {
  const maxPackages = options.maxPackages ?? 80;
  const pkgFiles: string[] = [];
  const rootPkg = join(root, "package.json");
  if (existsSync(rootPkg)) pkgFiles.push(rootPkg);

  const candidates = ["packages", "apps", "services", "cli", "servers", "fixtures"];
  for (const dir of candidates) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(abs);
    } catch {
      continue;
    }
    for (const ent of entries) {
      const pkg = join(abs, ent, "package.json");
      if (existsSync(pkg)) pkgFiles.push(pkg);
      if (pkgFiles.length >= maxPackages) break;
    }
    if (pkgFiles.length >= maxPackages) break;
  }

  // Also packages/*/* one level for nested (rare)
  const scripts = pkgFiles.flatMap((p) => readPackageScripts(root, p));
  const byCategory: Record<string, number> = {};
  for (const s of scripts) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
  }
  return { scripts, byCategory, confidence: "confirmed" };
}
