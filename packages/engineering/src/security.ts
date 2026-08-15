import {
  createIgnoreMatcher,
  listFilesRecursive,
  readText,
  relativePosix,
  type ConfidenceLevel,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";

export interface SecretFinding {
  path: string;
  line: number;
  kind: "pattern" | "entropy" | "env_key";
  /** Pattern id or env key name — never the secret value */
  label: string;
  evidence: string;
  confidence: ConfidenceLevel;
}

export interface SecretScanResult {
  findings: SecretFinding[];
  scannedFiles: number;
  confidence: ConfidenceLevel;
  note: string;
  /** Safe summary suitable for persistence (no secret values). */
  summary: {
    total: number;
    byKind: Record<string, number>;
    byLabel: Record<string, number>;
  };
}

const PATTERN_RULES: Array<{ id: string; re: RegExp }> = [
  { id: "aws_access_key_id", re: /\b(AKIA[0-9A-Z]{16})\b/ },
  { id: "github_pat", re: /\b(ghp_[A-Za-z0-9]{20,})\b/ },
  { id: "github_fine_grained", re: /\b(github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: "slack_token", re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/ },
  { id: "stripe_key", re: /\b(sk_live_[A-Za-z0-9]{20,}|pk_live_[A-Za-z0-9]{20,})\b/ },
  { id: "google_api_key", re: /\b(AIza[0-9A-Za-z_-]{30,})\b/ },
  { id: "jwt_like", re: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/ },
  { id: "private_key_header", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    id: "generic_api_key_assign",
    re: /\b([A-Z][A-Z0-9_]*(?:API[_]?KEY|SECRET|TOKEN|PASSWORD|PRIVATE[_]?KEY))\s*[:=]/i,
  },
];

function shannonEntropy(s: string): number {
  if (!s.length) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function redactEvidence(line: string, matched?: string): string {
  if (matched && matched.length > 8) {
    return `pattern hit len=${matched.length} (value redacted)`;
  }
  const assign = /^(\s*[A-Za-z0-9_.-]+\s*[:=]\s*)/.exec(line);
  if (assign) return `${assign[1]}<redacted>`;
  return `<redacted line len=${line.length}>`;
}

function buildSummary(findings: SecretFinding[]): SecretScanResult["summary"] {
  const byKind: Record<string, number> = {};
  const byLabel: Record<string, number> = {};
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    byLabel[f.label] = (byLabel[f.label] ?? 0) + 1;
  }
  return { total: findings.length, byKind, byLabel };
}

/**
 * Defensive secret scan: reports paths, line numbers, and pattern names only.
 * Never returns secret values.
 */
export function scanSecretPatterns(
  root: string,
  options: { maxFiles?: number; includeEntropy?: boolean } = {},
): SecretScanResult {
  const ignore = createIgnoreMatcher(root);
  const maxFiles = options.maxFiles ?? 400;
  const includeEntropy = options.includeEntropy ?? true;
  const findings: SecretFinding[] = [];

  const files = listFilesRecursive(root, {
    filter: (p) => {
      if (ignore.ignores(p, root)) return false;
      return /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|env|yml|yaml|json|toml|ini|cfg|conf|sh|ps1|md)$/i.test(
        p,
      );
    },
  }).slice(0, maxFiles);

  for (const abs of files) {
    let content: string;
    try {
      content = readText(abs);
    } catch {
      continue;
    }
    const rel = relativePosix(root, abs);
    const lines = content.split(/\r?\n/);
    const isEnvFile =
      /(^|\/)\.env(\.|$)/.test(rel) || /\.env\.(example|sample|template)$/i.test(rel);

    if (isEnvFile) {
      lines.forEach((line, i) => {
        const m = /^([A-Z0-9_]+)\s*=/.exec(line);
        if (!m) return;
        if (/(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE)/i.test(m[1])) {
          findings.push({
            path: rel,
            line: i + 1,
            kind: "env_key",
            label: m[1],
            evidence: "env key name only (value never read)",
            confidence: "confirmed",
          });
        }
      });
      continue;
    }

    lines.forEach((line, i) => {
      for (const rule of PATTERN_RULES) {
        const m = rule.re.exec(line);
        if (!m) continue;
        const label =
          rule.id === "generic_api_key_assign" ? (m[1] ?? rule.id) : rule.id;
        findings.push({
          path: rel,
          line: i + 1,
          kind: "pattern",
          label,
          evidence: redactEvidence(line, m[1] ?? m[0]),
          confidence:
            rule.id.startsWith("generic") || rule.id === "jwt_like"
              ? "weakly_inferred"
              : "strongly_inferred",
        });
      }

      if (includeEntropy) {
        const q = /(['"])([A-Za-z0-9\/+=_-]{24,})\1/.exec(line);
        if (q) {
          const val = q[2];
          const ent = shannonEntropy(val);
          if (
            ent >= 4.2 &&
            !/^(https?:|node_modules|sha256|sha512|application\/)/i.test(val)
          ) {
            findings.push({
              path: rel,
              line: i + 1,
              kind: "entropy",
              label: "high_entropy_string",
              evidence: `entropy=${ent.toFixed(2)} len=${val.length} (value redacted)`,
              confidence: "weakly_inferred",
            });
          }
        }
      }
    });
  }

  const capped = findings.slice(0, 200);
  return {
    findings: capped,
    scannedFiles: files.length,
    confidence: "strongly_inferred",
    note: "Defensive only — secret values are never returned; report path+line+pattern only",
    summary: buildSummary(capped),
  };
}

/** Persist a redacted scan summary into store meta (no secret values). */
export function storeSecretScanFindings(store: ArcStore, result: SecretScanResult): void {
  store.setMeta(
    "security:last_scan",
    JSON.stringify({
      at: new Date().toISOString(),
      scannedFiles: result.scannedFiles,
      summary: result.summary,
      findings: result.findings.map((f) => ({
        path: f.path,
        line: f.line,
        kind: f.kind,
        label: f.label,
        confidence: f.confidence,
      })),
    }),
  );
}
