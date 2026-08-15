export type FlowId =
  | "feature"
  | "bugfix"
  | "hotfix"
  | "refactor"
  | "migration"
  | "dependency-update"
  | "release"
  | "documentation"
  | "test-expansion"
  | "api-change"
  | "database-change";

export interface FlowStep {
  id: string;
  title: string;
  description: string;
  tools: string[];
  optional?: boolean;
}

export interface FlowDefinition {
  id: FlowId;
  name: string;
  description: string;
  steps: FlowStep[];
}

export const BUILTIN_FLOWS: FlowDefinition[] = [
  {
    id: "feature",
    name: "Feature",
    description: "Implement a feature with context + impact discipline",
    steps: [
      { id: "scope", title: "Scope", description: "Clarify goal and constraints", tools: ["repository_info", "context_pack"] },
      { id: "locate", title: "Locate", description: "Find related symbols and modules", tools: ["symbol_search", "graph_neighbors"] },
      { id: "impact", title: "Impact", description: "Assess blast radius", tools: ["impact_analyze"] },
      { id: "implement", title: "Implement", description: "Make changes with explicit intent for writes", tools: ["repository_file"] },
      { id: "verify", title: "Verify", description: "Health + tests inventory", tools: ["project_health_report", "tests_inventory"] },
    ],
  },
  {
    id: "bugfix",
    name: "Bugfix",
    description: "Evidence-first bug investigation",
    steps: [
      { id: "repro", title: "Reproduce", description: "Capture failing behavior", tools: ["git_status", "debug_index_explain"] },
      { id: "trace", title: "Trace", description: "Follow imports/routes", tools: ["graph_neighbors", "api_routes"] },
      { id: "fix", title: "Fix", description: "Apply minimal change", tools: ["impact_analyze"] },
      { id: "regress", title: "Regression check", description: "Look for related tests", tools: ["tests_inventory"] },
    ],
  },
  {
    id: "hotfix",
    name: "Hotfix",
    description: "Narrow, urgent fix with impact check",
    steps: [
      { id: "pin", title: "Pin failure", description: "Identify exact surface", tools: ["symbol_search"] },
      { id: "impact", title: "Impact", description: "Confirm blast radius is small", tools: ["impact_analyze"] },
      { id: "ship-check", title: "Ship check", description: "Health + git status", tools: ["project_health_report", "git_status"] },
    ],
  },
  {
    id: "refactor",
    name: "Refactor",
    description: "Plan and execute a refactor with graph evidence",
    steps: [
      { id: "map", title: "Map", description: "Graph neighborhood", tools: ["graph_neighbors", "deps_cycles"] },
      { id: "plan", title: "Plan", description: "Record decision", tools: ["decision_create"] },
      { id: "apply", title: "Apply", description: "Incremental changes", tools: ["impact_analyze"] },
    ],
  },
  {
    id: "migration",
    name: "Migration",
    description: "Schema/data migration workflow",
    steps: [
      { id: "schema", title: "Schema files", description: "Locate schema artifacts", tools: ["db_schema_files"] },
      { id: "review", title: "Review", description: "Impact + decision", tools: ["impact_analyze", "decision_create"] },
    ],
  },
  {
    id: "dependency-update",
    name: "Dependency update",
    description: "Update deps with cycle/unused awareness",
    steps: [
      { id: "audit", title: "Audit", description: "Cycles and unused candidates", tools: ["deps_cycles", "deps_unused_candidates"] },
      { id: "health", title: "Health", description: "Post-update health", tools: ["project_health_report"] },
    ],
  },
  {
    id: "release",
    name: "Release",
    description: "Release readiness from evidence",
    steps: [
      { id: "health", title: "Health", description: "Evidence-based score", tools: ["project_health_report"] },
      { id: "notes", title: "Notes", description: "Changelog + git", tools: ["release_changelog", "git_status"] },
    ],
  },
  {
    id: "documentation",
    name: "Documentation",
    description: "Document a module from index + graph",
    steps: [
      { id: "symbols", title: "Symbols", description: "List exports", tools: ["symbol_in_file"] },
      { id: "neighbors", title: "Neighbors", description: "Import graph", tools: ["graph_neighbors"] },
      { id: "readme", title: "README", description: "Existing docs", tools: ["docs_readme"] },
    ],
  },
  {
    id: "test-expansion",
    name: "Test expansion",
    description: "Grow tests where gaps are inferred",
    steps: [
      { id: "inventory", title: "Inventory", description: "Existing tests", tools: ["tests_inventory"] },
      { id: "targets", title: "Targets", description: "High-impact modules", tools: ["impact_analyze"] },
    ],
  },
  {
    id: "api-change",
    name: "API change",
    description: "Review route/API changes",
    steps: [
      { id: "routes", title: "Routes", description: "Indexed routes", tools: ["api_routes"] },
      { id: "impact", title: "Impact", description: "Dependents", tools: ["impact_analyze"] },
    ],
  },
  {
    id: "database-change",
    name: "Database change",
    description: "Review database/schema changes safely",
    steps: [
      { id: "files", title: "Schema files", description: "Find schema artifacts (no credentials)", tools: ["db_schema_files"] },
      { id: "decision", title: "Decision", description: "Record ADR", tools: ["decision_create"] },
    ],
  },
];

export function listFlows(): FlowDefinition[] {
  return BUILTIN_FLOWS;
}

export function getFlow(id: FlowId | string): FlowDefinition | undefined {
  return BUILTIN_FLOWS.find((f) => f.id === id);
}

export function renderFlowPrompt(flow: FlowDefinition): string {
  const steps = flow.steps
    .map(
      (s, i) =>
        `${i + 1}. **${s.title}** — ${s.description}\n   Tools: ${s.tools.join(", ")}`,
    )
    .join("\n");
  return `# Arc Flow: ${flow.name}\n\n${flow.description}\n\n${steps}\n`;
}
