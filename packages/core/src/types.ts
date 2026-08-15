/**
 * Confidence levels for Arcframe evidence claims.
 * Prefer Confirmed over inference; never invent certainty.
 */
export type ConfidenceLevel =
  | "confirmed"
  | "strongly_inferred"
  | "weakly_inferred"
  | "unknown";

export interface Evidence {
  claim: string;
  confidence: ConfidenceLevel;
  sources: string[];
  observedAt?: string;
}

export interface ArcframePaths {
  root: string;
  arcframeDir: string;
  configPath: string;
  dbPath: string;
  cacheDir: string;
  logsDir: string;
  indexDir: string;
  graphDir: string;
  memoryDir: string;
  sessionsDir: string;
  rulesDir: string;
  reportsDir: string;
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface ProjectIdentity {
  name: string;
  root: string;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  monorepo: boolean;
  git: boolean;
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
  destructive: boolean;
  requiresIntent: boolean;
}

export type PermissionAction = "read" | "write" | "execute" | "mutate" | "delete";

export interface PermissionRequest {
  action: PermissionAction;
  resource: string;
  reason: string;
  destructive?: boolean;
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  requiresExplicitIntent: boolean;
}

export type ContextBudget = "tiny" | "small" | "normal" | "large" | "unlimited";

export const CONTEXT_BUDGET_TOKENS: Record<ContextBudget, number> = {
  tiny: 2_000,
  small: 8_000,
  normal: 32_000,
  large: 100_000,
  unlimited: Number.POSITIVE_INFINITY,
};

export interface ArcframeConfig {
  version: number;
  projectName?: string;
  ignoreFile: string;
  logLevel: LogLevel;
  index: {
    incremental: boolean;
    watch: boolean;
  };
  context: {
    defaultBudget: ContextBudget;
  };
  mcp: {
    enabled: boolean;
  };
  permissions: {
    allowDestructive: boolean;
    autoPush: boolean;
  };
  adapters: {
    languages: string[];
    frameworks: string[];
  };
}

export const DEFAULT_CONFIG: ArcframeConfig = {
  version: 1,
  ignoreFile: ".arcframeignore",
  logLevel: "info",
  index: {
    incremental: true,
    watch: false,
  },
  context: {
    defaultBudget: "normal",
  },
  mcp: {
    enabled: true,
  },
  permissions: {
    allowDestructive: false,
    autoPush: false,
  },
  adapters: {
    languages: ["typescript", "javascript", "rust", "python", "go"],
    frameworks: [
      "react",
      "nextjs",
      "vue",
      "express",
      "fastify",
      "fastapi",
      "flask",
      "django",
      "axum",
      "actix",
    ],
  },
};
