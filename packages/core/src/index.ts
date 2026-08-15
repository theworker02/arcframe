export * from "./types.js";
export * from "./errors.js";
export * from "./paths.js";
export * from "./logging.js";
export * from "./config.js";
export * from "./cache.js";
export * from "./events.js";
export * from "./container.js";
export * from "./capabilities.js";
export * from "./permissions.js";
export * from "./process.js";
export * from "./project.js";
export * from "./ignore.js";
export * from "./native.js";

import { createCache, type CacheStore } from "./cache.js";
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "./capabilities.js";
import { loadConfig } from "./config.js";
import { ServiceContainer, ServiceIds } from "./container.js";
import { EventBus } from "./events.js";
import { createLogger, setRootLogger, type Logger } from "./logging.js";
import {
  ensureArcframeLayout,
  findProjectRoot,
  getArcframePaths,
} from "./paths.js";
import { createPermissionGate, type PermissionGate } from "./permissions.js";
import { discoverProject } from "./project.js";
import type { ArcframeConfig, ArcframePaths, ProjectIdentity } from "./types.js";

export interface ArcframeRuntime {
  root: string;
  paths: ArcframePaths;
  config: ArcframeConfig;
  logger: Logger;
  cache: CacheStore;
  events: EventBus;
  capabilities: CapabilityRegistry;
  permissions: PermissionGate;
  project: ProjectIdentity;
  container: ServiceContainer;
}

export function createRuntime(cwd: string = process.cwd()): ArcframeRuntime {
  const project = discoverProject(cwd);
  const root = project.root;
  const paths = ensureArcframeLayout(root);
  const config = loadConfig(root);
  const logger = createLogger({
    level: config.logLevel,
    name: "arcframe",
    logDir: paths.logsDir,
  });
  setRootLogger(logger);

  const cache = createCache(paths.cacheDir);
  const events = new EventBus();
  const capabilities = createCapabilityRegistry();
  const permissions = createPermissionGate(config, capabilities);

  const container = new ServiceContainer();
  container.registerValue(ServiceIds.ROOT, root);
  container.registerValue(ServiceIds.PATHS, paths);
  container.registerValue(ServiceIds.CONFIG, config);
  container.registerValue(ServiceIds.LOGGER, logger);
  container.registerValue(ServiceIds.CACHE, cache);
  container.registerValue(ServiceIds.EVENTS, events);
  container.registerValue(ServiceIds.CAPABILITIES, capabilities);
  container.registerValue(ServiceIds.PERMISSIONS, permissions);

  return {
    root,
    paths,
    config,
    logger,
    cache,
    events,
    capabilities,
    permissions,
    project,
    container,
  };
}

export function resolveWorkspaceRoot(cwd?: string): string {
  return findProjectRoot(cwd ?? process.cwd());
}

export { getArcframePaths, findProjectRoot };
