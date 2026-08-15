/**
 * Agent-facing engineering helpers — ownership, workspace, env, security,
 * performance imports, CI/local mapping, release, search, command risk.
 * Never returns secret values.
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  dirExists,
  execCommand,
  fileExists,
  listFilesRecursive,
  readText,
  relativePosix,
  type ConfidenceLevel,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";

// —— ownership / CODEOWNERS ——

export interface CodeOwnerRule {
  pattern: string;
  owners: string[];
  line: number;
}

export function parseCodeowners(root: string): {
  path: string | null;
  rules: CodeOwnerRule[];
  confidence: ConfidenceLevel;
} {
  const candidates = [
    "CODEOWNERS",
    ".github/CODEOWNERS",
    "docs/CODEOWNERS",
    ".gitlab/CODEOWNERS",
  ];
  let hit: string | null = null;
  for (const c of candidates) {
    if (fileExists(join(root, c))) {
      hit = c;
      break;
    }
  }
  if (!hit) {
    return { path: null, rules: [], confidence: "confirmed" };
  }
  const rules: CodeOwnerRule[] = [];
  let lineNo = 0;
  for (const line of readText(join(root, hit)).split(/\r?\n/)) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    rules.push({
      pattern: parts[0],
      owners: parts.slice(1),
      line: lineNo,
    });
  }
  return { path: hit, rules, confidence: "confirmed" };
}

/** Minimal CODEOWNERS-style matcher (globs with * and ** and trailing /). */
export function matchCodeownersPattern(filePath: string, pattern: string): boolean {
  const path = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
  let pat = pattern.replaceAll("\\", "/");
  if (pat.startsWith("/")) pat = pat.slice(1);
  if (pat.endsWith("/")) {
    return path === pat.slice(0, -1) || path.startsWith(pat);
  }
  // Escape regex specials except * which we treat as glob
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  if (re.test(path)) return true;
  // Also match basename-only patterns
  if (!pat.includes("/")) {
    return re.test(basename(path)) || path.endsWith(`/${pat.replace(/\*/g, "")}`);
  }
  return false;
}

export function ownersForPath(
  root: string,
  path: string,
): {
  path: string;
  owners: string[];
  matchedRule: CodeOwnerRule | null;
  codeownersPath: string | null;
  confidence: ConfidenceLevel;
} {
  const { path: codeownersPath, rules } = parseCodeowners(root);
  const normalized = path.replaceAll("\\", "/");
  let matched: CodeOwnerRule | null = null;
  for (const rule of rules) {
    if (matchCodeownersPattern(normalized, rule.pattern)) {
      matched = rule; // last match wins (CODEOWNERS semantics)
    }
  }
  return {
    path: normalized,
    owners: matched?.owners ?? [],
    matchedRule: matched,
    codeownersPath,
    confidence: codeownersPath ? "confirmed" : "unknown",
  };
}

export function uncoveredByCodeowners(
  root: string,
  store: ArcStore,
  options: { limit?: number } = {},
): {
  uncovered: string[];
  totalIndexed: number;
  rules: number;
  confidence: ConfidenceLevel;
} {
  const { rules } = parseCodeowners(root);
  const limit = options.limit ?? 100;
  if (!rules.length) {
    return {
      uncovered: store.listFiles().slice(0, limit).map((f) => f.path),
      totalIndexed: store.listFiles().length,
      rules: 0,
      confidence: "confirmed",
    };
  }
  const uncovered: string[] = [];
  for (const f of store.listFiles()) {
    let owned = false;
    for (const rule of rules) {
      if (matchCodeownersPattern(f.path, rule.pattern)) {
        owned = true;
        break;
      }
    }
    if (!owned) {
      uncovered.push(f.path);
      if (uncovered.length >= limit) break;
    }
  }
  return {
    uncovered,
    totalIndexed: store.listFiles().length,
    rules: rules.length,
    confidence: "strongly_inferred",
  };
}

// —— symbol blame history ——

export async function symbolBlameHistory(
  root: string,
  store: ArcStore,
  name: string,
  options: { limit?: number } = {},
): Promise<{
  symbol: string;
  definitions: Array<{ path: string; line: number; kind: string }>;
  commits: string[];
  blameSample: string[];
  confidence: ConfidenceLevel;
  note?: string;
}> {
  const hits = store.findSymbols(name, 10);
  const exact = hits.filter((s) => s.name === name);
  const defs = (exact.length ? exact : hits).slice(0, 5).map((s) => ({
    path: s.file_path,
    line: s.line ?? 1,
    kind: s.kind,
  }));
  if (!defs.length) {
    return {
      symbol: name,
      definitions: [],
      commits: [],
      blameSample: [],
      confidence: "unknown",
      note: "Symbol not found in index",
    };
  }
  const primary = defs[0];
  const limit = options.limit ?? 15;
  const start = Math.max(1, primary.line);
  const end = start + 20;
  const logRes = await execCommand(
    "git",
    ["log", `-n${limit}`, "-L", `${start},${end}:${primary.path}`, "--pretty=format:%h %ad %an %s", "--date=short"],
    { cwd: root },
  );
  let commits: string[] = [];
  if (logRes.exitCode === 0 && logRes.stdout.trim()) {
    commits = logRes.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("diff ") && !l.startsWith("---") && !l.startsWith("+++") && !l.startsWith("@@"))
      .filter((l) => /^[0-9a-f]{7,}/i.test(l))
      .slice(0, limit);
  } else {
    // Fallback: file-level log
    const fileLog = await execCommand(
      "git",
      ["log", `-n${limit}`, "--pretty=format:%h %ad %an %s", "--date=short", "--", primary.path],
      { cwd: root },
    );
    commits =
      fileLog.exitCode === 0
        ? fileLog.stdout.split(/\r?\n/).filter(Boolean).slice(0, limit)
        : [];
  }
  const blameRes = await execCommand(
    "git",
    ["blame", "-L", `${start},${Math.min(end, start + 8)}`, "--", primary.path],
    { cwd: root },
  );
  const blameSample =
    blameRes.exitCode === 0
      ? blameRes.stdout.split(/\r?\n/).filter(Boolean).slice(0, 12)
      : [];
  return {
    symbol: name,
    definitions: defs,
    commits,
    blameSample,
    confidence: commits.length ? "strongly_inferred" : "weakly_inferred",
    note: logRes.exitCode !== 0 ? "git log -L unsupported or failed; used file-level history" : undefined,
  };
}

// —— monorepo workspace map ——

export interface WorkspacePackage {
  name: string;
  path: string;
  version?: string;
  private?: boolean;
  scripts: string[];
  dependencies: string[];
  kind: "npm" | "cargo" | "go" | "python" | "unknown";
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readText(path)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function mapWorkspace(root: string): {
  monorepo: boolean;
  packages: WorkspacePackage[];
  workspaceGlobs: string[];
  confidence: ConfidenceLevel;
} {
  const packages: WorkspacePackage[] = [];
  const workspaceGlobs: string[] = [];
  const rootPkg = readJsonSafe(join(root, "package.json"));
  if (rootPkg?.workspaces) {
    const ws = rootPkg.workspaces;
    if (Array.isArray(ws)) workspaceGlobs.push(...ws.map(String));
    else if (ws && typeof ws === "object" && Array.isArray((ws as { packages?: string[] }).packages)) {
      workspaceGlobs.push(...((ws as { packages: string[] }).packages));
    }
  }
  const pnpmWs = join(root, "pnpm-workspace.yaml");
  if (fileExists(pnpmWs)) {
    for (const line of readText(pnpmWs).split(/\r?\n/)) {
      const m = /^\s*-\s*['"]?([^'"]+)['"]?/.exec(line);
      if (m) workspaceGlobs.push(m[1]);
    }
  }

  const candidateDirs = ["packages", "apps", "services", "cli", "servers", "adapters", "fixtures"];
  const seen = new Set<string>();
  const addPkg = (abs: string, kind: WorkspacePackage["kind"]) => {
    const rel = relativePosix(root, abs);
    const dir = dirname(rel) === "." ? rel.replace(/\/package\.json$/, "") || "." : dirname(rel);
    const key = kind === "npm" ? dir : rel;
    if (seen.has(key)) return;
    seen.add(key);
    if (kind === "npm") {
      const pkg = readJsonSafe(abs);
      if (!pkg) return;
      const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      packages.push({
        name: String(pkg.name ?? basename(dir === "." ? root : dir)),
        path: dir === "." && rel === "package.json" ? "." : dir,
        version: pkg.version ? String(pkg.version) : undefined,
        private: Boolean(pkg.private),
        scripts: Object.keys((pkg.scripts as object) ?? {}),
        dependencies: Object.keys(deps).filter((d) => d.startsWith("@") || !d.includes("/")).slice(0, 80),
        kind: "npm",
      });
    }
  };

  if (fileExists(join(root, "package.json"))) {
    addPkg(join(root, "package.json"), "npm");
  }
  for (const d of candidateDirs) {
    const abs = join(root, d);
    if (!dirExists(abs)) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(abs);
    } catch {
      continue;
    }
    for (const ent of entries) {
      const pkg = join(abs, ent, "package.json");
      if (fileExists(pkg)) addPkg(pkg, "npm");
    }
  }

  // Cargo workspace members
  const cargo = join(root, "Cargo.toml");
  if (fileExists(cargo)) {
    const text = readText(cargo);
    if (/\[workspace\]/.test(text)) {
      const memberBlock = /members\s*=\s*\[([\s\S]*?)\]/.exec(text);
      if (memberBlock) {
        for (const m of memberBlock[1].matchAll(/"([^"]+)"/g)) {
          const memberPath = m[1];
          const memberCargo = join(root, memberPath, "Cargo.toml");
          if (!fileExists(memberCargo)) continue;
          const nameM = /^name\s*=\s*"([^"]+)"/m.exec(readText(memberCargo));
          packages.push({
            name: nameM?.[1] ?? basename(memberPath),
            path: memberPath,
            scripts: [],
            dependencies: [],
            kind: "cargo",
          });
        }
      }
    }
  }

  const monorepo =
    workspaceGlobs.length > 0 ||
    packages.filter((p) => p.path !== ".").length > 1 ||
    fileExists(pnpmWs);

  return {
    monorepo,
    packages,
    workspaceGlobs: [...new Set(workspaceGlobs)],
    confidence: "confirmed",
  };
}

export function workspacePackageInfo(
  root: string,
  nameOrPath: string,
): { package: WorkspacePackage | null; confidence: ConfidenceLevel } {
  const map = mapWorkspace(root);
  const q = nameOrPath.replaceAll("\\", "/");
  const hit =
    map.packages.find((p) => p.name === q || p.path === q || p.path.endsWith(`/${q}`)) ?? null;
  return { package: hit, confidence: hit ? "confirmed" : "unknown" };
}

export function workspaceCrossDeps(root: string): {
  edges: Array<{ from: string; to: string; via: string }>;
  confidence: ConfidenceLevel;
} {
  const map = mapWorkspace(root);
  const byName = new Map(map.packages.map((p) => [p.name, p]));
  const edges: Array<{ from: string; to: string; via: string }> = [];
  for (const pkg of map.packages) {
    if (pkg.kind !== "npm") continue;
    const abs = join(root, pkg.path === "." ? "package.json" : join(pkg.path, "package.json"));
    const json = readJsonSafe(abs);
    if (!json) continue;
    const all = {
      ...(json.dependencies as Record<string, string> | undefined),
      ...(json.devDependencies as Record<string, string> | undefined),
      ...(json.peerDependencies as Record<string, string> | undefined),
    };
    for (const [dep, ver] of Object.entries(all)) {
      if (byName.has(dep)) {
        edges.push({ from: pkg.name, to: dep, via: ver });
      }
    }
  }
  return { edges, confidence: "confirmed" };
}

// —— adapters status ——

export function adaptersStatus(
  store: ArcStore,
  adapters: Array<{ id: string; name: string; extensions: string[] }>,
): {
  adapters: Array<{
    id: string;
    name: string;
    extensions: string[];
    indexedFiles: number;
    languages: string[];
  }>;
  uncoveredExtensions: Array<{ ext: string; count: number }>;
  confidence: ConfidenceLevel;
} {
  const files = store.listFiles();
  const byExt: Record<string, number> = {};
  for (const f of files) {
    const m = /\.[^.]+$/.exec(f.path);
    const ext = m ? m[0].toLowerCase() : "";
    if (ext) byExt[ext] = (byExt[ext] ?? 0) + 1;
  }
  const covered = new Set<string>();
  const result = adapters.map((a) => {
    let indexedFiles = 0;
    const langs = new Set<string>();
    for (const ext of a.extensions) {
      const e = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      covered.add(e);
      indexedFiles += byExt[e] ?? 0;
    }
    for (const f of files) {
      const m = /\.[^.]+$/.exec(f.path);
      const ext = m ? m[0].toLowerCase() : "";
      if (a.extensions.map((x) => x.toLowerCase()).includes(ext)) {
        if (f.language) langs.add(f.language);
      }
    }
    return {
      id: a.id,
      name: a.name,
      extensions: a.extensions,
      indexedFiles,
      languages: [...langs],
    };
  });
  const uncoveredExtensions = Object.entries(byExt)
    .filter(([ext]) => !covered.has(ext))
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
  return { adapters: result, uncoveredExtensions, confidence: "confirmed" };
}

export function adapterForFilePath(
  path: string,
  adapters: Array<{ id: string; name: string; extensions: string[] }>,
): { path: string; adapter: { id: string; name: string } | null; confidence: ConfidenceLevel } {
  const m = /\.[^.]+$/.exec(path);
  const ext = m ? m[0].toLowerCase() : "";
  const hit = adapters.find((a) =>
    a.extensions.map((e) => e.toLowerCase()).includes(ext),
  );
  return {
    path,
    adapter: hit ? { id: hit.id, name: hit.name } : null,
    confidence: hit ? "confirmed" : "unknown",
  };
}

// —— performance imports ——

export function findDuplicateImports(
  store: ArcStore,
  options: { limit?: number } = {},
): {
  duplicates: Array<{ file: string; source: string; count: number }>;
  confidence: ConfidenceLevel;
} {
  const limit = options.limit ?? 50;
  const duplicates: Array<{ file: string; source: string; count: number }> = [];
  for (const f of store.listFiles()) {
    const raw = store.getMeta(`imports:${f.path}`);
    if (!raw) continue;
    let imports: Array<{ source?: string }> = [];
    try {
      imports = JSON.parse(raw) as Array<{ source?: string }>;
    } catch {
      continue;
    }
    const counts = new Map<string, number>();
    for (const im of imports) {
      const src = im.source;
      if (!src) continue;
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    for (const [source, count] of counts) {
      if (count > 1) duplicates.push({ file: f.path, source, count });
    }
  }
  duplicates.sort((a, b) => b.count - a.count);
  return { duplicates: duplicates.slice(0, limit), confidence: "strongly_inferred" };
}

export function findHeavyImports(
  store: ArcStore,
  options: { limit?: number } = {},
): {
  heavy: Array<{ path: string; importCount: number; samples: string[] }>;
  confidence: ConfidenceLevel;
} {
  const limit = options.limit ?? 25;
  const heavy: Array<{ path: string; importCount: number; samples: string[] }> = [];
  for (const f of store.listFiles()) {
    const raw = store.getMeta(`imports:${f.path}`);
    let imports: Array<{ source?: string }> = [];
    if (raw) {
      try {
        imports = JSON.parse(raw) as Array<{ source?: string }>;
      } catch {
        /* ignore */
      }
    }
    const graphOut = store
      .edgesFrom(`file:${f.path}`)
      .filter((e) => e.edge_type === "IMPORTS" || e.edge_type === "DEPENDS_ON").length;
    const count = Math.max(imports.length, graphOut);
    if (count < 8) continue;
    heavy.push({
      path: f.path,
      importCount: count,
      samples: imports.map((i) => i.source ?? "").filter(Boolean).slice(0, 8),
    });
  }
  heavy.sort((a, b) => b.importCount - a.importCount);
  return { heavy: heavy.slice(0, limit), confidence: "strongly_inferred" };
}

// —— security sensitive / insecure config (defensive) ——

const SENSITIVE_PATH_RE =
  /(^|\/)(\.env($|\.)|.*secrets?.*|.*credentials?.*|.*\.pem$|.*\.key$|id_rsa|id_ed25519|.*\.p12$|.*\.pfx$|keystore|auth\.json|service-account.*\.json)/i;

export function findSensitiveFiles(
  store: ArcStore,
  options: { limit?: number } = {},
): {
  files: Array<{ path: string; reason: string }>;
  confidence: ConfidenceLevel;
  note: string;
} {
  const limit = options.limit ?? 80;
  const files: Array<{ path: string; reason: string }> = [];
  for (const f of store.listFiles()) {
    if (SENSITIVE_PATH_RE.test(f.path)) {
      files.push({ path: f.path, reason: "path_pattern_sensitive" });
    } else if (/\.env/i.test(f.path) && !/\.example|\.sample|\.template/i.test(f.path)) {
      files.push({ path: f.path, reason: "env_file_not_example" });
    }
    if (files.length >= limit) break;
  }
  return {
    files,
    confidence: "strongly_inferred",
    note: "Defensive path classification only — never reads or returns secret values",
  };
}

export function findInsecureConfig(
  root: string,
  store: ArcStore,
): {
  findings: Array<{ path: string; issue: string; confidence: ConfidenceLevel }>;
  confidence: ConfidenceLevel;
  note: string;
} {
  const findings: Array<{ path: string; issue: string; confidence: ConfidenceLevel }> = [];
  const checkFiles = [
    ...store.listFiles().filter((f) =>
      /(docker-compose|Dockerfile|\.ya?ml$|nginx|cors|next\.config|vite\.config|webpack)/i.test(
        f.path,
      ),
    ),
  ].slice(0, 60);

  for (const f of checkFiles) {
    const abs = join(root, f.path);
    if (!existsSync(abs)) continue;
    let text = "";
    try {
      text = readText(abs).slice(0, 80_000);
    } catch {
      continue;
    }
    // Never report matching substrings that could be secrets — only issue labels
    if (/privileged\s*:\s*true/i.test(text)) {
      findings.push({ path: f.path, issue: "docker_privileged_true", confidence: "strongly_inferred" });
    }
    if (/network_mode\s*:\s*['"]?host['"]?/i.test(text)) {
      findings.push({ path: f.path, issue: "docker_host_network", confidence: "strongly_inferred" });
    }
    if (/cors.*origin.*\*|Access-Control-Allow-Origin.\s*\*/i.test(text)) {
      findings.push({ path: f.path, issue: "cors_allow_all_origins", confidence: "weakly_inferred" });
    }
    if (/NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0/i.test(text)) {
      findings.push({
        path: f.path,
        issue: "tls_verification_disabled",
        confidence: "confirmed",
      });
    }
    if (/dangerouslyAllow|insecure|disable.?ssl|verify\s*=\s*False/i.test(text)) {
      findings.push({
        path: f.path,
        issue: "insecure_flag_keyword",
        confidence: "weakly_inferred",
      });
    }
    if (/0\.0\.0\.0.*(debug|dev)/i.test(text) && /expose|ports:/i.test(text)) {
      findings.push({
        path: f.path,
        issue: "bind_all_interfaces_with_dev",
        confidence: "weakly_inferred",
      });
    }
  }
  return {
    findings,
    confidence: findings.length ? "strongly_inferred" : "confirmed",
    note: "Defensive static heuristics — no exploit guidance; labels only",
  };
}

// —— env missing / usage (key names only) ——

function collectEnvKeysFromExamples(root: string): string[] {
  const keys: string[] = [];
  for (const name of [".env.example", ".env.sample", ".env.template", ".env.local.example"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readText(p).split(/\r?\n/)) {
      const m = /^([A-Z][A-Z0-9_]*)=/.exec(line);
      if (m) keys.push(m[1]);
    }
  }
  return [...new Set(keys)];
}

const ENV_REF_RE =
  /(?:process\.env|import\.meta\.env|os\.environ|os\.getenv|dotenv|env::var)\s*[\[(.]?\s*['"`]?([A-Z][A-Z0-9_]{2,})/g;

export function findEnvUsage(
  root: string,
  store: ArcStore,
  options: { maxFiles?: number } = {},
): {
  keys: Array<{ key: string; files: string[] }>;
  confidence: ConfidenceLevel;
  note: string;
} {
  const maxFiles = options.maxFiles ?? 200;
  const byKey = new Map<string, Set<string>>();
  let scanned = 0;
  for (const f of store.listFiles()) {
    if (scanned >= maxFiles) break;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|env)$/i.test(f.path)) continue;
    if (/\.env($|\.)/i.test(f.path) && !/\.example|\.sample|\.template/i.test(f.path)) continue;
    const abs = join(root, f.path);
    if (!existsSync(abs)) continue;
    let text = "";
    try {
      text = readText(abs).slice(0, 100_000);
    } catch {
      continue;
    }
    scanned++;
    ENV_REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENV_REF_RE.exec(text))) {
      const key = m[1];
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key)!.add(f.path);
    }
    // Also NODE_ENV style bare references in quotes
    for (const qm of text.matchAll(/['"`]([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|URL|HOST|PORT|DATABASE|API)[A-Z0-9_]*)['"`]/g)) {
      const key = qm[1];
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key)!.add(f.path);
    }
  }
  const keys = [...byKey.entries()]
    .map(([key, files]) => ({ key, files: [...files].slice(0, 20) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    keys,
    confidence: "strongly_inferred",
    note: "Key names and referencing paths only — never values",
  };
}

export function findEnvMissing(
  root: string,
  store: ArcStore,
): {
  documentedKeys: string[];
  usedKeys: string[];
  missingFromExample: string[];
  unusedInCode: string[];
  confidence: ConfidenceLevel;
  note: string;
} {
  const documented = collectEnvKeysFromExamples(root);
  const usage = findEnvUsage(root, store);
  const usedKeys = usage.keys.map((k) => k.key);
  const docSet = new Set(documented);
  const usedSet = new Set(usedKeys);
  return {
    documentedKeys: documented,
    usedKeys,
    missingFromExample: usedKeys.filter((k) => !docSet.has(k) && k !== "NODE_ENV" && k !== "PATH"),
    unusedInCode: documented.filter((k) => !usedSet.has(k)),
    confidence: "strongly_inferred",
    note: "Compares example key names to code references — never returns values",
  };
}

// —— db migrations / models ——

export function findDbMigrations(store: ArcStore): {
  files: Array<{ path: string; kind: string }>;
  confidence: ConfidenceLevel;
} {
  const files: Array<{ path: string; kind: string }> = [];
  for (const f of store.listFiles()) {
    const p = f.path;
    if (/migrations?\//i.test(p) || /\/migrate\//i.test(p)) {
      files.push({ path: p, kind: "migration_dir" });
    } else if (/\d{8,}.*\.(sql|ts|js)$/i.test(p) && /migrat/i.test(p)) {
      files.push({ path: p, kind: "timestamped_migration" });
    } else if (/prisma\/migrations/i.test(p)) {
      files.push({ path: p, kind: "prisma_migration" });
    } else if (/drizzle.*migrat/i.test(p)) {
      files.push({ path: p, kind: "drizzle_migration" });
    } else if (/alembic\/versions/i.test(p)) {
      files.push({ path: p, kind: "alembic" });
    }
  }
  return { files, confidence: "strongly_inferred" };
}

export function findDbModels(store: ArcStore): {
  files: Array<{ path: string; kind: string }>;
  symbols: Array<{ name: string; path: string; kind: string }>;
  confidence: ConfidenceLevel;
} {
  const files: Array<{ path: string; kind: string }> = [];
  for (const f of store.listFiles()) {
    const p = f.path;
    if (/schema\.prisma$/i.test(p)) files.push({ path: p, kind: "prisma_schema" });
    else if (/models?\.(ts|js|py)$/i.test(p) || /\/models?\//i.test(p))
      files.push({ path: p, kind: "models_path" });
    else if (/drizzle.*schema/i.test(p) || /schema\.ts$/i.test(p) && /db|drizzle|sql/i.test(p))
      files.push({ path: p, kind: "drizzle_or_schema" });
    else if (/entities?\//i.test(p) || /entity\.(ts|py)$/i.test(p))
      files.push({ path: p, kind: "entity" });
  }
  const symbols: Array<{ name: string; path: string; kind: string }> = [];
  for (const f of files.slice(0, 40)) {
    for (const s of store.listSymbols(f.path)) {
      if (/model|entity|table|schema|collection/i.test(s.kind) || /Model|Entity|Table/.test(s.name)) {
        symbols.push({ name: s.name, path: f.path, kind: s.kind });
      }
    }
  }
  return { files, symbols: symbols.slice(0, 80), confidence: "strongly_inferred" };
}

// —— CI local equivalent ——

export function ciLocalEquivalent(root: string): {
  workflows: Array<{
    file: string;
    jobs: string[];
    suggestedLocal: Array<{ ciStep: string; localCommand: string | null; confidence: ConfidenceLevel }>;
  }>;
  rootScripts: string[];
  confidence: ConfidenceLevel;
} {
  const rootPkg = readJsonSafe(join(root, "package.json"));
  const scripts = (rootPkg?.scripts as Record<string, string>) ?? {};
  const rootScripts = Object.keys(scripts);
  const dir = join(root, ".github", "workflows");
  const workflows: Array<{
    file: string;
    jobs: string[];
    suggestedLocal: Array<{ ciStep: string; localCommand: string | null; confidence: ConfidenceLevel }>;
  }> = [];

  if (!dirExists(dir)) {
    return { workflows: [], rootScripts, confidence: "confirmed" };
  }

  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f))) {
    const text = readText(join(dir, file));
    const jobs: string[] = [];
    for (const m of text.matchAll(/^\s{2}([a-zA-Z0-9_-]+):\s*$/gm)) {
      if (!["on", "env", "defaults", "concurrency", "permissions", "name"].includes(m[1])) {
        jobs.push(m[1]);
      }
    }
    const suggestedLocal: Array<{
      ciStep: string;
      localCommand: string | null;
      confidence: ConfidenceLevel;
    }> = [];
    const runLines = [...text.matchAll(/run:\s*[|>]?\s*(.+)/g)].map((m) => m[1].trim());
    const usesLines = [...text.matchAll(/uses:\s*(.+)/g)].map((m) => m[1].trim());

    for (const run of runLines.slice(0, 40)) {
      let local: string | null = null;
      let conf: ConfidenceLevel = "weakly_inferred";
      if (/\bnpm\s+test\b|\bpnpm\s+test\b|\byarn\s+test\b/.test(run) && scripts.test) {
        local = "pnpm test";
        conf = "confirmed";
      } else if (/\bbuild\b/.test(run) && scripts.build) {
        local = "pnpm run build";
        conf = "strongly_inferred";
      } else if (/\blint\b/.test(run) && (scripts.lint || scripts["lint:check"])) {
        local = scripts.lint ? "pnpm run lint" : "pnpm run lint:check";
        conf = "strongly_inferred";
      } else if (/vitest|jest|pytest|cargo test|go test/.test(run)) {
        local = run.replace(/\$\{\{.*?\}\}/g, "").trim().slice(0, 120);
        conf = "weakly_inferred";
      } else if (scripts[run.replace(/^pnpm (?:run )?/, "").split(/\s/)[0] ?? ""]) {
        const name = run.replace(/^pnpm (?:run )?/, "").split(/\s/)[0];
        local = `pnpm run ${name}`;
        conf = "confirmed";
      }
      // Map run script names mentioned in CI
      for (const [name] of Object.entries(scripts)) {
        if (run.includes(`run ${name}`) || run.includes(`pnpm ${name}`) || run.endsWith(name)) {
          local = `pnpm run ${name}`;
          conf = "confirmed";
          break;
        }
      }
      suggestedLocal.push({ ciStep: run.slice(0, 160), localCommand: local, confidence: conf });
    }
    for (const uses of usesLines.slice(0, 20)) {
      let local: string | null = null;
      if (/setup-node/i.test(uses)) local = "node --version && corepack enable";
      else if (/setup-pnpm/i.test(uses)) local = "pnpm --version";
      else if (/checkout/i.test(uses)) local = null;
      suggestedLocal.push({
        ciStep: `uses: ${uses.slice(0, 100)}`,
        localCommand: local,
        confidence: local ? "weakly_inferred" : "unknown",
      });
    }
    workflows.push({ file: `.github/workflows/${file}`, jobs: [...new Set(jobs)], suggestedLocal });
  }
  return { workflows, rootScripts, confidence: "strongly_inferred" };
}

// —— release ——

export async function releaseUncommitted(root: string): Promise<{
  clean: boolean | null;
  blocking: string[];
  staged: string[];
  unstaged: string[];
  untracked: string[];
  confidence: ConfidenceLevel;
}> {
  const { inspectGit } = await import("./git.js");
  const git = await inspectGit(root);
  const blocking = [...git.staged, ...git.unstaged, ...git.untracked];
  return {
    clean: git.clean,
    blocking,
    staged: git.staged,
    unstaged: git.unstaged,
    untracked: git.untracked,
    confidence: git.confidence,
  };
}

export async function detectReleaseVersion(root: string): Promise<{
  packageJson?: string;
  cargo?: string;
  gitTag?: string | null;
  suggested?: string;
  confidence: ConfidenceLevel;
}> {
  const out: {
    packageJson?: string;
    cargo?: string;
    gitTag?: string | null;
    suggested?: string;
    confidence: ConfidenceLevel;
  } = { confidence: "confirmed" };
  const pkg = readJsonSafe(join(root, "package.json"));
  if (pkg?.version) out.packageJson = String(pkg.version);
  const cargo = join(root, "Cargo.toml");
  if (fileExists(cargo)) {
    const m = /^version\s*=\s*"([^"]+)"/m.exec(readText(cargo));
    if (m) out.cargo = m[1];
  }
  const tagRes = await execCommand("git", ["describe", "--tags", "--abbrev=0"], { cwd: root });
  out.gitTag = tagRes.exitCode === 0 ? tagRes.stdout.trim() : null;
  out.suggested = out.packageJson ?? out.cargo ?? out.gitTag ?? undefined;
  return out;
}

// —— search docs / unified ——

export function searchDocs(
  root: string,
  query: string,
  options: { limit?: number } = {},
): {
  hits: Array<{ path: string; line: number; preview: string }>;
  confidence: ConfidenceLevel;
} {
  const limit = options.limit ?? 40;
  const q = query.toLowerCase();
  const hits: Array<{ path: string; line: number; preview: string }> = [];
  const roots = ["docs", "apps/docs", "."];
  const seen = new Set<string>();

  const consider = (rel: string, abs: string) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!/\.(md|mdx|txt)$/i.test(rel)) return;
    if (/node_modules|dist\/|\.arcframe/.test(rel)) return;
    let text = "";
    try {
      text = readText(abs);
    } catch {
      return;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({
          path: rel,
          line: i + 1,
          preview: lines[i].trim().slice(0, 200),
        });
        if (hits.length >= limit) return;
      }
    }
  };

  for (const r of roots) {
    const absRoot = r === "." ? root : join(root, r);
    if (!existsSync(absRoot)) continue;
    if (r === ".") {
      for (const name of ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "AGENTS.md"]) {
        const abs = join(root, name);
        if (fileExists(abs)) consider(name, abs);
      }
      continue;
    }
    try {
      const files = listFilesRecursive(absRoot, {
        filter: (p) => /\.(md|mdx)$/i.test(p) && !p.includes("node_modules"),
      });
      for (const abs of files) {
        consider(relativePosix(root, abs), abs);
        if (hits.length >= limit) break;
      }
    } catch {
      /* ignore */
    }
    if (hits.length >= limit) break;
  }
  return { hits, confidence: "confirmed" };
}

export function searchUnified(
  root: string,
  store: ArcStore,
  query: string,
  memoryHits: Array<{ id: string; title: string; type: string }>,
  options: { limit?: number } = {},
): {
  query: string;
  symbols: unknown[];
  files: unknown[];
  docs: ReturnType<typeof searchDocs>["hits"];
  memory: typeof memoryHits;
  confidence: ConfidenceLevel;
} {
  const limit = options.limit ?? 20;
  const q = query.toLowerCase();
  return {
    query,
    symbols: store.findSymbols(query, limit),
    files: store.listFiles().filter((f) => f.path.toLowerCase().includes(q)).slice(0, limit),
    docs: searchDocs(root, query, { limit }).hits,
    memory: memoryHits.slice(0, limit),
    confidence: "strongly_inferred",
  };
}

// —— command / terminal risk ——

export type RiskLevel = "low" | "medium" | "high" | "critical";

export function classifyCommandRisk(command: string): {
  command: string;
  level: RiskLevel;
  reasons: string[];
  destructive: boolean;
  network: boolean;
  writes: boolean;
  confidence: ConfidenceLevel;
} {
  const cmd = command.trim();
  const reasons: string[] = [];
  let level: RiskLevel = "low";
  let destructive = false;
  let network = false;
  let writes = false;

  const bump = (l: RiskLevel, reason: string) => {
    const order: RiskLevel[] = ["low", "medium", "high", "critical"];
    if (order.indexOf(l) > order.indexOf(level)) level = l;
    reasons.push(reason);
  };

  if (/\brm\s+(-[a-zA-Z]*f|-[a-zA-Z]*r)|rimraf|Remove-Item\s+.*-Recurse|del\s+\/s/i.test(cmd)) {
    destructive = true;
    bump("critical", "Recursive/forced delete");
  }
  if (/\bgit\s+push\s+.*--force|\bgit\s+reset\s+--hard|\bgit\s+clean\s+-f/i.test(cmd)) {
    destructive = true;
    bump("critical", "Destructive git rewrite");
  }
  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\b/i.test(cmd)) {
    destructive = true;
    bump("critical", "Destructive database DDL");
  }
  if (/\bchmod\s+-R\s+777|\bcurl\s+[^\n]*\|\s*(ba)?sh/i.test(cmd)) {
    bump("critical", "Dangerous permission or pipe-to-shell");
  }
  if (/\bnpm\s+publish|\bpnpm\s+publish|\byarn\s+publish|twine\s+upload|cargo\s+publish/i.test(cmd)) {
    writes = true;
    network = true;
    bump("high", "Publishes package to registry");
  }
  if (/\bdocker\s+(system\s+)?prune|\bdocker\s+rm\s+-f/i.test(cmd)) {
    destructive = true;
    bump("high", "Docker prune/force remove");
  }
  if (/\b(curl|wget|Invoke-WebRequest)\b/i.test(cmd)) {
    network = true;
    bump("medium", "Network request");
  }
  if (/\bnpm\s+i(nstall)?|\bpnpm\s+i(nstall)?|\byarn\s+add|\bpip\s+install/i.test(cmd)) {
    writes = true;
    network = true;
    bump("medium", "Installs dependencies (mutates lockfile/node_modules)");
  }
  if (/\b--force\b|\b-f\b|\b--yes\b|\b-y\b|\b--no-verify\b/i.test(cmd)) {
    bump("medium", "Skips confirmation or safety hooks");
  }
  if (/\bmigrate\b|\bprisma\s+db\s+push|\bdrizzle-kit\s+push/i.test(cmd)) {
    writes = true;
    bump("high", "May mutate database schema");
  }
  if (/\b(test|lint|typecheck|build|tsc|vitest|eslint)\b/i.test(cmd) && level === "low") {
    bump("low", "Typical local verify/build command");
  }

  return {
    command: cmd,
    level,
    reasons: [...new Set(reasons)],
    destructive,
    network,
    writes,
    confidence: reasons.length ? "strongly_inferred" : "weakly_inferred",
  };
}

// —— rules applicable / generate ——

export function rulesApplicable(
  _root: string,
  rulesDir: string,
  path: string,
): {
  path: string;
  applicable: Array<{ file: string; reason: string; excerpt: string }>;
  confidence: ConfidenceLevel;
} {
  const normalized = path.replaceAll("\\", "/");
  const applicable: Array<{ file: string; reason: string; excerpt: string }> = [];
  if (!dirExists(rulesDir)) {
    return { path: normalized, applicable, confidence: "confirmed" };
  }
  const ruleFiles = readdirSync(rulesDir).filter(
    (f) => f.endsWith(".md") || f.endsWith(".mdc") || f.endsWith(".markdown"),
  );
  for (const file of ruleFiles) {
    const content = readText(join(rulesDir, file));
    const lower = content.toLowerCase();
    const reasons: string[] = [];
    // Frontmatter-ish globs
    const globM = /(?:globs?|paths?|applies(?:_to)?)\s*[:=]\s*[`"']?([^`"'\n]+)/i.exec(content);
    if (globM) {
      const g = globM[1].trim();
      if (matchCodeownersPattern(normalized, g) || normalized.includes(g.replace(/\*/g, ""))) {
        reasons.push(`matched declared glob ${g}`);
      }
    }
    const segments = normalized.split("/");
    for (const seg of segments) {
      if (seg.length > 2 && lower.includes(seg.toLowerCase())) {
        reasons.push(`mentions path segment '${seg}'`);
        break;
      }
    }
    if (/always|global|project-wide|all files/i.test(content)) {
      reasons.push("marked global/always");
    }
    if (/\.ts|\.tsx|typescript/i.test(content) && /\.tsx?$/i.test(normalized)) {
      reasons.push("typescript-oriented rule");
    }
    if (reasons.length) {
      applicable.push({
        file,
        reason: reasons.join("; "),
        excerpt: content.slice(0, 400),
      });
    }
  }
  // If nothing matched, include always-on short rules heuristically
  if (!applicable.length) {
    for (const file of ruleFiles.slice(0, 5)) {
      const content = readText(join(rulesDir, file));
      if (/local-first|evidence|confidence/i.test(content)) {
        applicable.push({
          file,
          reason: "default engineering discipline rule",
          excerpt: content.slice(0, 400),
        });
      }
    }
  }
  return { path: normalized, applicable, confidence: "strongly_inferred" };
}

export function generateRuleStub(options: {
  title: string;
  scope?: string;
  guidance?: string;
}): {
  filename: string;
  content: string;
  confidence: ConfidenceLevel;
  note: string;
} {
  const slug = options.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const filename = `${slug || "custom-rule"}.md`;
  const content = `# ${options.title}

${options.scope ? `Applies to: \`${options.scope}\`\n` : ""}
## Guidance

${options.guidance?.trim() || "Prefer evidence over assumptions. Label confidence. Never return secret values."}

## Checks

- [ ] Confirmed by index/graph when making claims about code location
- [ ] Destructive ops require explicit intent
`;
  return {
    filename,
    content,
    confidence: "confirmed",
    note: "Stub only — not written to disk; caller may save via rules workflow",
  };
}
