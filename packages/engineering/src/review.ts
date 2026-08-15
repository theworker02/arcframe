import { join } from "node:path";
import {
  fileExists,
  type ConfidenceLevel,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";
import type { GraphBuilder } from "@arcframe/graph";
import { gitDiff, inspectGit } from "./git.js";

export interface ReviewFinding {
  severity: "info" | "warn" | "risk";
  path: string;
  line?: number;
  symbol?: string;
  category:
    | "scope"
    | "api"
    | "tests"
    | "security"
    | "docs"
    | "generated"
    | "impact"
    | "general";
  message: string;
  evidence: string[];
  confidence: ConfidenceLevel;
}

export interface DiffHunk {
  file: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  added: Array<{ line: number; text: string }>;
  removed: Array<{ line: number; text: string }>;
}

const GENERATED_PATTERNS = [
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.next\//,
  /(^|\/)out\//,
  /(^|\/)coverage\//,
  /\.min\.(js|css)$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /\.generated\./,
];

const SECRET_LINE =
  /(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}/i;
const HARDCODED_CRED =
  /(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/;

export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentFile = "";
  let hunk: DiffHunk | null = null;
  let newLine = 0;
  let oldLine = 0;

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith("+++ b/")) {
      currentFile = raw.slice(6).trim();
      continue;
    }
    if (raw.startsWith("diff --git ")) {
      const m = / b\/(.+)$/.exec(raw);
      if (m) currentFile = m[1];
      continue;
    }
    const hm = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (hm) {
      hunk = {
        file: currentFile,
        oldStart: Number(hm[1]),
        oldLines: Number(hm[2] ?? 1),
        newStart: Number(hm[3]),
        newLines: Number(hm[4] ?? 1),
        added: [],
        removed: [],
      };
      hunks.push(hunk);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      continue;
    }
    if (!hunk || !currentFile) continue;
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      hunk.added.push({ line: newLine, text: raw.slice(1) });
      newLine++;
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      hunk.removed.push({ line: oldLine, text: raw.slice(1) });
      oldLine++;
    } else if (raw.startsWith(" ") || raw === "") {
      oldLine++;
      newLine++;
    }
  }
  return hunks;
}

function symbolsTouchingLines(
  store: ArcStore,
  file: string,
  lines: number[],
): string[] {
  if (lines.length === 0) return [];
  const min = Math.min(...lines);
  const max = Math.max(...lines);
  return store
    .listSymbols(file)
    .filter((s) => {
      const end = s.end_line ?? s.line + 30;
      return s.line <= max && end >= min;
    })
    .map((s) => s.name);
}

export async function reviewChanges(
  root: string,
  store: ArcStore,
  graph: GraphBuilder,
  staged = false,
): Promise<{
  staged: boolean;
  files: string[];
  diffBytes: number;
  hunks: number;
  findings: ReviewFinding[];
  impactSummary: Array<{
    file: string;
    dependents: number;
    dependencies: number;
    symbolsTouched: string[];
  }>;
  confidence: ConfidenceLevel;
}> {
  const git = await inspectGit(root);
  const files = staged
    ? git.staged
    : [...new Set([...git.staged, ...git.unstaged, ...git.untracked])];
  const normalized = files.map((f) => f.replaceAll("\\", "/"));
  const diff = await gitDiff(root, staged);
  const hunks = parseUnifiedDiff(diff);
  const findings: ReviewFinding[] = [];
  const impactSummary: Array<{
    file: string;
    dependents: number;
    dependencies: number;
    symbolsTouched: string[];
  }> = [];

  // Unexpected scope: large untracked trees / many files
  if (normalized.length > 40) {
    findings.push({
      severity: "warn",
      path: "(changeset)",
      category: "scope",
      message: `Large changeset: ${normalized.length} paths`,
      evidence: normalized.slice(0, 15),
      confidence: "confirmed",
    });
  }

  const hunkByFile = new Map<string, DiffHunk[]>();
  for (const h of hunks) {
    const list = hunkByFile.get(h.file) ?? [];
    list.push(h);
    hunkByFile.set(h.file, list);
  }

  for (const rel of normalized.slice(0, 80)) {
    if (GENERATED_PATTERNS.some((re) => re.test(rel))) {
      findings.push({
        severity: "info",
        path: rel,
        category: "generated",
        message: "Looks like a generated/lock/build artifact",
        evidence: [rel],
        confidence: "strongly_inferred",
      });
    }

    if (/\.(env|pem|key)$/i.test(rel) || /(^|\/)\.env(\.|$)/.test(rel)) {
      findings.push({
        severity: "risk",
        path: rel,
        category: "security",
        message: "Possible secrets file in changeset",
        evidence: [rel],
        confidence: "strongly_inferred",
      });
    }

    if (/\.(md|mdx)$/i.test(rel)) {
      findings.push({
        severity: "info",
        path: rel,
        category: "docs",
        message: "Documentation file changed",
        evidence: [rel],
        confidence: "confirmed",
      });
    }

    const fileHunks = hunkByFile.get(rel) ?? [];
    const addedLines = fileHunks.flatMap((h) => h.added);
    const touchedLineNums = addedLines.map((a) => a.line);

    for (const a of addedLines) {
      if (SECRET_LINE.test(a.text) || HARDCODED_CRED.test(a.text)) {
        findings.push({
          severity: "risk",
          path: rel,
          line: a.line,
          category: "security",
          message: "Possible secret or credential pattern in added line",
          evidence: [a.text.slice(0, 120)],
          confidence: "strongly_inferred",
        });
      }
      if (
        /\.(get|post|put|patch|delete)\s*\(|@(?:app|router)\.(get|post)|Route::|path\s*\(/.test(
          a.text,
        )
      ) {
        findings.push({
          severity: "warn",
          path: rel,
          line: a.line,
          category: "api",
          message: "Possible API/route change in hunk",
          evidence: [a.text.trim().slice(0, 160)],
          confidence: "weakly_inferred",
        });
      }
      if (/^export\s+(async\s+)?function|^export\s+(const|class|type|interface)/.test(a.text.trim())) {
        findings.push({
          severity: "info",
          path: rel,
          line: a.line,
          category: "api",
          message: "New or modified export surface",
          evidence: [a.text.trim().slice(0, 160)],
          confidence: "confirmed",
        });
      }
    }

    const symbolsTouched = symbolsTouchingLines(store, rel, touchedLineNums);
    const indexed = store.getFile(rel);
    if (indexed) {
      const impact = graph.impact(`file:${rel}`, 1);
      impactSummary.push({
        file: rel,
        dependents: impact.dependents.length,
        dependencies: impact.dependencies.length,
        symbolsTouched,
      });
      if (impact.dependents.length > 10) {
        findings.push({
          severity: "warn",
          path: rel,
          category: "impact",
          message: `High fan-in: ${impact.dependents.length} dependents`,
          evidence: impact.dependents.slice(0, 8),
          confidence: impact.confidence,
        });
      }
      if (symbolsTouched.length > 0) {
        findings.push({
          severity: "info",
          path: rel,
          category: "general",
          message: `Hunks touch symbols: ${symbolsTouched.slice(0, 8).join(", ")}`,
          evidence: symbolsTouched.slice(0, 12),
          confidence: "strongly_inferred",
        });
      }

      // Missing tests for changed source
      if (
        /\.(ts|tsx|js|jsx|rs|py|go)$/.test(rel) &&
        !/\.(test|spec)\./.test(rel) &&
        !/_test\./.test(rel)
      ) {
        const related = store
          .listFiles()
          .filter(
            (f) =>
              (/\.(test|spec)\./.test(f.path) || /_test\./.test(f.path)) &&
              (store.edgesFrom(`file:${f.path}`).some(
                (e) => e.edge_type === "TESTS" && e.to_id === `file:${rel}`,
              ) ||
                f.path.includes(rel.replace(/\.[^.]+$/, ""))),
          );
        if (related.length === 0) {
          findings.push({
            severity: "warn",
            path: rel,
            category: "tests",
            message: "No related test files inferred for this change",
            evidence: [`file:${rel}`],
            confidence: "weakly_inferred",
          });
        }
      }
    } else if (/\.(ts|tsx|js|jsx|rs|py|go)$/.test(rel) && fileExists(join(root, rel))) {
      findings.push({
        severity: "info",
        path: rel,
        category: "general",
        message: "Not in Arc Index yet — run `arc index`",
        evidence: [rel],
        confidence: "confirmed",
      });
    }
  }

  // Diff-level markers
  if (/\bTODO\b|\bFIXME\b/.test(diff)) {
    findings.push({
      severity: "info",
      path: "(diff)",
      category: "general",
      message: "TODO/FIXME markers present in diff",
      evidence: ["matched TODO|FIXME in unified diff"],
      confidence: "confirmed",
    });
  }

  // README changed without code? or code without docs for API
  const docsChanged = normalized.some((f) => /\.(md|mdx)$/i.test(f));
  const apiFindings = findings.filter((f) => f.category === "api");
  if (apiFindings.length > 0 && !docsChanged) {
    findings.push({
      severity: "info",
      path: "(docs)",
      category: "docs",
      message: "API/route-like changes without documentation file updates",
      evidence: apiFindings.slice(0, 5).map((f) => `${f.path}:${f.line ?? "?"}`),
      confidence: "weakly_inferred",
    });
  }

  return {
    staged,
    files: normalized,
    diffBytes: Buffer.byteLength(diff, "utf8"),
    hunks: hunks.length,
    findings,
    impactSummary,
    confidence: hunks.length > 0 || normalized.length > 0 ? "strongly_inferred" : "confirmed",
  };
}
