import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { ConfigError } from "./errors.js";
import {
  ensureArcframeLayout,
  fileExists,
  getArcframePaths,
  readText,
  writeText,
} from "./paths.js";
import {
  DEFAULT_CONFIG,
  type ArcframeConfig,
  type ContextBudget,
  type LogLevel,
} from "./types.js";

const configSchema = z.object({
  version: z.number().int().positive(),
  projectName: z.string().optional(),
  ignoreFile: z.string().default(".arcframeignore"),
  logLevel: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  index: z
    .object({
      incremental: z.boolean().default(true),
      watch: z.boolean().default(false),
    })
    .default(DEFAULT_CONFIG.index),
  context: z
    .object({
      defaultBudget: z
        .enum(["tiny", "small", "normal", "large", "unlimited"])
        .default("normal"),
    })
    .default(DEFAULT_CONFIG.context),
  mcp: z
    .object({
      enabled: z.boolean().default(true),
    })
    .default(DEFAULT_CONFIG.mcp),
  permissions: z
    .object({
      allowDestructive: z.boolean().default(false),
      autoPush: z.boolean().default(false),
    })
    .default(DEFAULT_CONFIG.permissions),
  adapters: z
    .object({
      languages: z.array(z.string()).default(DEFAULT_CONFIG.adapters.languages),
      frameworks: z.array(z.string()).default(DEFAULT_CONFIG.adapters.frameworks),
    })
    .default(DEFAULT_CONFIG.adapters),
});

export function loadConfig(root: string): ArcframeConfig {
  const paths = getArcframePaths(root);
  if (!fileExists(paths.configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = parseYaml(readText(paths.configPath));
    const parsed = configSchema.parse(raw ?? {});
    return parsed as ArcframeConfig;
  } catch (err) {
    throw new ConfigError(`Failed to load config: ${(err as Error).message}`, {
      path: paths.configPath,
    });
  }
}

export function saveConfig(root: string, config: ArcframeConfig): void {
  const paths = ensureArcframeLayout(root);
  const validated = configSchema.parse(config) as ArcframeConfig;
  writeText(paths.configPath, stringifyYaml(validated));
}

export function mergeConfig(
  base: ArcframeConfig,
  patch: Partial<ArcframeConfig>,
): ArcframeConfig {
  return {
    ...base,
    ...patch,
    index: { ...base.index, ...patch.index },
    context: { ...base.context, ...patch.context },
    mcp: { ...base.mcp, ...patch.mcp },
    permissions: { ...base.permissions, ...patch.permissions },
    adapters: {
      languages: patch.adapters?.languages ?? base.adapters.languages,
      frameworks: patch.adapters?.frameworks ?? base.adapters.frameworks,
    },
  };
}

export function initConfig(
  root: string,
  overrides: Partial<ArcframeConfig> = {},
): ArcframeConfig {
  const existing = fileExists(getArcframePaths(root).configPath)
    ? loadConfig(root)
    : { ...DEFAULT_CONFIG };
  const next = mergeConfig(existing, overrides);
  saveConfig(root, next);
  return next;
}

export function setConfigValue(
  root: string,
  key: string,
  value: string,
): ArcframeConfig {
  const config = loadConfig(root);
  switch (key) {
    case "logLevel":
      config.logLevel = value as LogLevel;
      break;
    case "context.defaultBudget":
      config.context.defaultBudget = value as ContextBudget;
      break;
    case "index.incremental":
      config.index.incremental = value === "true";
      break;
    case "index.watch":
      config.index.watch = value === "true";
      break;
    case "mcp.enabled":
      config.mcp.enabled = value === "true";
      break;
    case "permissions.allowDestructive":
      config.permissions.allowDestructive = value === "true";
      break;
    case "permissions.autoPush":
      config.permissions.autoPush = value === "true";
      break;
    case "projectName":
      config.projectName = value;
      break;
    case "ignoreFile":
      config.ignoreFile = value;
      break;
    default:
      throw new ConfigError(`Unknown config key: ${key}`);
  }
  saveConfig(root, config);
  return config;
}

export function getConfigValue(root: string, key: string): unknown {
  const config = loadConfig(root);
  const parts = key.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new ConfigError(`Unknown config key: ${key}`);
    }
  }
  return current;
}
