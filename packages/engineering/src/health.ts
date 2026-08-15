import { join } from "node:path";
import {
  commandExists,
  fileExists,
  readText,
  type ConfidenceLevel,
  type Evidence,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";
import type { GraphBuilder } from "@arcframe/graph";
import { inspectGit } from "./git.js";
import { findDependencyCycles } from "./deps.js";

export interface HealthReport {
  score: number;
  grade: string;
  evidence: Evidence[];
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
    confidence: ConfidenceLevel;
    weight: number;
  }>;
}

export async function buildHealthReport(
  root: string,
  store: ArcStore,
  graph?: GraphBuilder,
): Promise<HealthReport> {
  const checks: HealthReport["checks"] = [];
  const evidence: Evidence[] = [];

  const stats = store.stats();
  checks.push({
    id: "index",
    label: "Arc Index populated",
    ok: stats.files > 0,
    detail: `${stats.files} files, ${stats.symbols} symbols`,
    confidence: stats.files > 0 ? "confirmed" : "unknown",
    weight: 20,
  });

  checks.push({
    id: "graph",
    label: "Arc Graph built",
    ok: stats.edges > 0,
    detail: `${stats.edges} edges`,
    confidence: stats.edges > 0 ? "confirmed" : "unknown",
    weight: 15,
  });

  const git = await inspectGit(root);
  checks.push({
    id: "git",
    label: "Git repository",
    ok: git.available,
    detail: git.available
      ? `branch ${git.branch}${git.clean ? " (clean)" : " (dirty)"}`
      : "not a git repo or git unavailable",
    confidence: git.confidence,
    weight: 10,
  });

  const hasReadme = fileExists(join(root, "README.md"));
  checks.push({
    id: "readme",
    label: "README present",
    ok: hasReadme,
    detail: hasReadme ? "README.md found" : "missing README.md",
    confidence: "confirmed",
    weight: 5,
  });

  let cycles = 0;
  if (graph) {
    cycles = findDependencyCycles(store).length;
  }
  checks.push({
    id: "cycles",
    label: "No mutual import cycles (sample)",
    ok: cycles === 0,
    detail: cycles === 0 ? "no mutual file import pairs found" : `${cycles} mutual import pairs`,
    confidence: "strongly_inferred",
    weight: 15,
  });

  const testFiles = store
    .listFiles()
    .filter(
      (f) =>
        /\.(test|spec)\./.test(f.path) ||
        /_test\./.test(f.path) ||
        /(^|\/)tests?\//.test(f.path),
    );
  checks.push({
    id: "tests",
    label: "Test files present",
    ok: testFiles.length > 0,
    detail: `${testFiles.length} test-related files indexed`,
    confidence: "strongly_inferred",
    weight: 15,
  });

  const pkgPath = join(root, "package.json");
  if (fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(readText(pkgPath)) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};
      const hasCiScripts = Boolean(scripts.test || scripts.build || scripts.lint);
      checks.push({
        id: "scripts",
        label: "Core npm scripts",
        ok: hasCiScripts,
        detail: `scripts: ${Object.keys(scripts).slice(0, 8).join(", ") || "(none)"}`,
        confidence: "confirmed",
        weight: 10,
      });
    } catch {
      checks.push({
        id: "scripts",
        label: "Core npm scripts",
        ok: false,
        detail: "package.json unreadable",
        confidence: "confirmed",
        weight: 10,
      });
    }
  }

  let earned = 0;
  let total = 0;
  for (const c of checks) {
    total += c.weight;
    if (c.ok) earned += c.weight;
    evidence.push({
      claim: `${c.label}: ${c.detail}`,
      confidence: c.confidence,
      sources: [c.id],
    });
  }
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  const grade =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  return { score, grade, evidence, checks };
}

export interface DoctorFinding {
  id: string;
  severity: "info" | "warn" | "error";
  message: string;
  fix?: string;
  confidence: ConfidenceLevel;
}

export async function runDoctor(root: string, store?: ArcStore): Promise<{
  findings: DoctorFinding[];
  ok: boolean;
}> {
  const findings: DoctorFinding[] = [];

  if (!(await commandExists("node"))) {
    findings.push({
      id: "node",
      severity: "error",
      message: "Node.js not found on PATH",
      fix: "Install Node.js >= 20",
      confidence: "confirmed",
    });
  } else {
    findings.push({
      id: "node",
      severity: "info",
      message: `Node.js ${process.version}`,
      confidence: "confirmed",
    });
  }

  if (!(await commandExists("git"))) {
    findings.push({
      id: "git",
      severity: "warn",
      message: "git not found — git features limited",
      fix: "Install git",
      confidence: "confirmed",
    });
  }

  if (!fileExists(join(root, ".arcframe", "config.yaml"))) {
    findings.push({
      id: "init",
      severity: "error",
      message: "Arcframe not initialized",
      fix: "Run `arc init`",
      confidence: "confirmed",
    });
  }

  if (store) {
    const stats = store.stats();
    if (stats.files === 0) {
      findings.push({
        id: "index-empty",
        severity: "warn",
        message: "Index is empty",
        fix: "Run `arc index`",
        confidence: "confirmed",
      });
    }
  }

  const ok = !findings.some((f) => f.severity === "error");
  return { findings, ok };
}
