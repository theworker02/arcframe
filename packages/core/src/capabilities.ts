import type { Capability } from "./types.js";

const BUILTIN_CAPABILITIES: Capability[] = [
  {
    id: "repo.read",
    name: "Repository Read",
    description: "Read project files and metadata",
    category: "repository",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "repo.write",
    name: "Repository Write",
    description: "Write or modify project files",
    category: "repository",
    destructive: true,
    requiresIntent: true,
  },
  {
    id: "index.build",
    name: "Index Build",
    description: "Build or update the Arc Index",
    category: "index",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "graph.build",
    name: "Graph Build",
    description: "Build or update the Arc Graph",
    category: "graph",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "git.read",
    name: "Git Read",
    description: "Inspect git status, log, and diffs",
    category: "git",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "git.mutate",
    name: "Git Mutate",
    description: "Stage, commit, or otherwise mutate git state",
    category: "git",
    destructive: true,
    requiresIntent: true,
  },
  {
    id: "git.push",
    name: "Git Push",
    description: "Push to remote (never automatic)",
    category: "git",
    destructive: true,
    requiresIntent: true,
  },
  {
    id: "test.run",
    name: "Run Tests",
    description: "Execute project tests",
    category: "testing",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "build.run",
    name: "Run Build",
    description: "Execute project builds",
    category: "build",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "memory.write",
    name: "Memory Write",
    description: "Persist Arc Memory entries",
    category: "memory",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "decision.write",
    name: "Decision Write",
    description: "Record architectural decisions",
    category: "decision",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "db.read",
    name: "Database Read",
    description: "Inspect database schemas (never credentials)",
    category: "database",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "env.read",
    name: "Env Read",
    description: "Inspect env key names (never secret values)",
    category: "env",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "security.scan",
    name: "Security Scan",
    description: "Defensive security analysis only",
    category: "security",
    destructive: false,
    requiresIntent: false,
  },
  {
    id: "cache.clear",
    name: "Cache Clear",
    description: "Clear Arcframe caches",
    category: "cache",
    destructive: true,
    requiresIntent: true,
  },
];

export class CapabilityRegistry {
  private readonly caps = new Map<string, Capability>();

  constructor(seed: Capability[] = BUILTIN_CAPABILITIES) {
    for (const cap of seed) {
      this.register(cap);
    }
  }

  register(cap: Capability): void {
    this.caps.set(cap.id, cap);
  }

  get(id: string): Capability | undefined {
    return this.caps.get(id);
  }

  list(category?: string): Capability[] {
    const all = [...this.caps.values()];
    return category ? all.filter((c) => c.category === category) : all;
  }

  has(id: string): boolean {
    return this.caps.has(id);
  }

  isDestructive(id: string): boolean {
    return this.caps.get(id)?.destructive ?? false;
  }

  requiresIntent(id: string): boolean {
    return this.caps.get(id)?.requiresIntent ?? false;
  }
}

export function createCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry();
}
