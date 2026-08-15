#!/usr/bin/env node
/**
 * One-shot generator for Open Plugins root layout (rules, skills, agents, commands, manifests, mcp).
 * Prefer editing the generated files directly afterward; re-run only when intentionally regenerating.
 */
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const rules = [
  [
    "01-local-first",
    "01 — Local-first",
    "Prefer local analysis; never upload repository source to Arcframe servers.",
    "Never upload repository source to Arcframe servers. All analysis runs locally. Prefer offline-capable workflows.",
  ],
  [
    "02-evidence",
    "02 — Evidence over assumptions",
    "Label analytical claims with confidence; never present guesses as facts.",
    "Label claims: Confirmed, Strongly inferred, Weakly inferred, Unknown. Do not present guesses as facts.",
  ],
  [
    "03-incremental",
    "03 — Incremental analysis",
    "Prefer incremental index/graph updates over full rescans.",
    "Prefer hash/FS/git-based incremental updates over full rescans. Rebuild fully only when explicitly requested.",
  ],
  [
    "04-one-engine",
    "04 — One engine",
    "CLI, MCP, plugin, and workflows must share one core engine.",
    "CLI, MCP, Cursor UI, and workflows must share `@arcframe/core`. Do not fork analyzers per surface.",
  ],
  [
    "05-safe-automation",
    "05 — Safe automation",
    "Reads are automatic; destructive ops need explicit intent; never auto-push.",
    "Reads are automatic. Destructive operations (write, delete, mutate, push) require explicit intent. Never auto-push.",
  ],
  [
    "06-cross-platform",
    "06 — Cross-platform",
    "Support Windows, macOS, and Linux without Bash-only assumptions.",
    "Support Windows, macOS, and Linux. Avoid Bash-only assumptions and hard-coded POSIX paths in core code.",
  ],
  [
    "07-cursor-apis",
    "07 — No invented Cursor APIs",
    "Do not invent Cursor/VS Code APIs; verify host capabilities first.",
    "Inspect current Cursor/VS Code extension capabilities before plugin work. Keep capability in core/MCP/CLI when the host cannot support it.",
  ],
  [
    "08-secrets",
    "08 — Secrets hygiene",
    "Never return secret values; expose env key names only.",
    "Never return secret values from env tools. Never expose database credentials. Prefer `.env.example` key names only.",
  ],
  [
    "09-confidence-ui",
    "09 — Confidence in UI",
    "UI scores and impact views must attach confidence and sources.",
    "Surfaces that show scores or impact must attach confidence and evidence sources.",
  ],
  [
    "10-dogfood",
    "10 — Dogfood",
    "Dogfood Arcframe on this repository before release claims.",
    "`arc init/status/graph/impact/health/validate` must work on the Arcframe repository itself before release claims.",
  ],
  [
    "11-mcp-precision",
    "11 — Precise MCP tools",
    "Prefer narrow MCP tools over a single dump-everything tool.",
    "Prefer narrow tools (`symbol_search`, `impact_analyze`) over one generic dump. Resources mirror durable project views.",
  ],
  [
    "12-context-budgets",
    "12 — Context budgets",
    "Respect context pack budgets and report truncation.",
    "Respect tiny/small/normal/large/unlimited budgets. Truncate lowest-score items first; report truncation.",
  ],
  [
    "13-architecture-policies",
    "13 — Architecture policies",
    "Encode architectural constraints as rules validated with graph evidence.",
    "Encode architectural constraints as rules; validate with graph evidence when possible.",
  ],
  [
    "14-test-gaps",
    "14 — Test gaps",
    "Treat test-gap detection as heuristic with labeled confidence.",
    "Test gap detection is heuristic. Label Weakly/Strongly inferred; never claim coverage percentages without a runner report.",
  ],
  [
    "15-deps-honesty",
    "15 — Dependency honesty",
    "Unused-export findings are candidates requiring human confirmation.",
    "Unused export detection is a candidate list. Require human confirmation before deletions.",
  ],
  [
    "16-docs-graph",
    "16 — Docs as graph",
    "Document modules from symbols and neighbors; prefer broken-command detection.",
    "Document modules from symbols + neighbors. Prefer broken-command detection over marketing copy.",
  ],
  [
    "17-review",
    "17 — Review discipline",
    "Diff review should cite impacted graph nodes with confidence.",
    "Diff review should cite impacted nodes from the graph and attach confidence.",
  ],
  [
    "18-performance",
    "18 — Performance claims",
    "Only report measured timings or confirmed index metadata.",
    "Only report measured timings or confirmed index metadata. No fake metrics.",
  ],
  [
    "19-release",
    "19 — Release readiness",
    "Release readiness must consult health, changelog, and git status.",
    "Release prompts must consult health, changelog, and git status — not invent green checks.",
  ],
  [
    "20-consolidate",
    "20 — Consolidate packages",
    "Add packages only for real architectural boundaries.",
    "Add packages only for real architectural boundaries. Avoid thin wrapper packages and folder theater.",
  ],
];

mkdirSync(join(root, "rules"), { recursive: true });
for (const [id, title, description, body] of rules) {
  writeFileSync(
    join(root, "rules", `${id}.mdc`),
    `---\ndescription: ${description}\nalwaysApply: true\n---\n\n# ${title}\n\n${body}\n`,
  );
  const md = join(root, "rules", `${id}.md`);
  if (existsSync(md)) unlinkSync(md);
}

const skills = [
  [
    "bug-investigator",
    "Investigate defects with Arcframe MCP evidence (git, symbols, impact, tests).",
    `# Bug Investigator

Use Arcframe MCP tools to investigate defects with evidence:

1. \`git_status\` / \`git_diff\` — capture change surface
2. \`symbol_search\` / \`debug_index_explain\` — locate code
3. \`impact_analyze\` / \`graph_neighbors\` — blast radius
4. \`tests_inventory\` — related tests
5. Label confidence on every claim
`,
  ],
  [
    "feature-builder",
    "Implement features with context packs, graph impact, and health checks.",
    `# Feature Builder

1. \`context_pack\` with an appropriate budget
2. \`symbol_search\` + \`graph_neighbors\`
3. \`impact_analyze\` before large edits
4. \`decision_create\` for architectural choices
5. \`project_health_report\` after implementation
`,
  ],
  [
    "refactor-planner",
    "Plan refactors using graph cycles, impact analysis, and incremental waves.",
    `# Refactor Planner

1. \`graph_neighbors\` + \`deps_cycles\`
2. \`impact_analyze\` on candidate modules
3. \`decision_create\` for the approach
4. Execute in small increments; rebuild index between waves
`,
  ],
];

for (const [name, description, body] of skills) {
  const dir = join(root, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
  );
  const flat = join(root, "skills", `${name}.md`);
  if (existsSync(flat)) unlinkSync(flat);
}

const agents = [
  [
    "arcframe-investigator",
    "Evidence-first bug and regression investigator using Arcframe MCP.",
    `# Arcframe Investigator

You investigate defects with labeled evidence. Prefer Arcframe MCP tools over guesses.

## Workflow
1. Capture \`git_status\` / \`git_diff\`
2. Locate with \`symbol_search\` and \`debug_index_explain\`
3. Map blast radius with \`impact_analyze\` / \`graph_neighbors\`
4. Check \`tests_inventory\` and related coverage
5. Report findings with Confirmed / Strongly inferred / Weakly inferred / Unknown
`,
  ],
  [
    "arcframe-implementer",
    "Feature implementer that budgets context and checks impact before edits.",
    `# Arcframe Implementer

You implement features with Arcframe as the control plane.

## Workflow
1. Build a \`context_pack\` at an appropriate budget
2. Explore with \`symbol_search\` and \`graph_neighbors\`
3. Run \`impact_analyze\` before large edits
4. Record architectural choices with \`decision_create\`
5. Finish with \`project_health_report\` / \`validate\`
`,
  ],
  [
    "arcframe-reviewer",
    "Diff reviewer that cites graph impact and confidence on every claim.",
    `# Arcframe Reviewer

You review changes with graph-backed impact and confidence labels.

## Workflow
1. Inspect the change surface (\`git_diff\` / \`changes\`)
2. Cite impacted nodes from \`impact_analyze\`
3. Flag secrets, unsafe automation, and invented APIs
4. Prefer narrow, actionable findings over style nitpicks
5. Never invent green checks — consult health/validate evidence
`,
  ],
];

mkdirSync(join(root, "agents"), { recursive: true });
for (const [name, description, body] of agents) {
  writeFileSync(
    join(root, "agents", `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
  );
}

const commands = [
  [
    "arcframe-status",
    "Show Arcframe project status (index, graph, paths).",
    `# Arcframe Status

Run Arcframe status for the current workspace:

\`\`\`bash
node ./cli/dist/bin.js status --json
\`\`\`

If the MCP server is available, prefer status tools. Summarize index freshness, graph stats, and any doctor warnings.
`,
  ],
  [
    "arcframe-health",
    "Run Arcframe health/doctor checks with evidence.",
    `# Arcframe Health

\`\`\`bash
node ./cli/dist/bin.js health --json
node ./cli/dist/bin.js doctor --json
\`\`\`

Or use MCP health/doctor tools. Report failures with confidence labels; do not invent green checks.
`,
  ],
  [
    "arcframe-reindex",
    "Rebuild the Arc Index and refresh the graph.",
    `# Arcframe Rebuild Index

\`\`\`bash
node ./cli/dist/bin.js index rebuild
node ./cli/dist/bin.js graph
\`\`\`

Confirm rebuild completed and report file/symbol/edge counts from status afterward.
`,
  ],
  [
    "arcframe-impact",
    "Analyze blast radius for a file or symbol via Arc Graph.",
    `# Arcframe Impact

Ask which file/symbol to analyze if unclear, then:

\`\`\`bash
node ./cli/dist/bin.js impact <path> [depth]
\`\`\`

Prefer MCP \`impact_analyze\` / \`graph_neighbors\`. Label dependents vs dependencies and confidence.
`,
  ],
  [
    "arcframe-context",
    "Build a budgeted context pack for the current task.",
    `# Arcframe Context Pack

\`\`\`bash
node ./cli/dist/bin.js context <query-or-path>
\`\`\`

Prefer MCP \`context_pack\` with an explicit budget (\`tiny\` → \`unlimited\`). Report truncation if any.
`,
  ],
  [
    "arcframe-investigate",
    "Start an evidence-first investigation using Arcframe tools.",
    `# Arcframe Investigate

Follow the Bug Investigator skill:

1. git status/diff
2. symbol search + index explain
3. impact / neighbors
4. tests inventory
5. confidence-labeled report
`,
  ],
];

mkdirSync(join(root, "commands"), { recursive: true });
for (const [name, description, body] of commands) {
  writeFileSync(
    join(root, "commands", `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
  );
}

const mcp = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: {
    arcframe: {
      type: "stdio",
      command: "node",
      args: ["${PLUGIN_ROOT}/servers/mcp/dist/index.js"],
      cwd: "${PLUGIN_ROOT}",
      env: {
        ARCFRAME_ROOT: "${PLUGIN_ROOT}",
      },
    },
  },
};
const mcpBody = `${JSON.stringify(mcp, null, 2)}\n`;
writeFileSync(join(root, "mcp.json"), mcpBody);
writeFileSync(join(root, ".mcp.json"), mcpBody);

const agentPlugin = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "arcframe",
  version: "0.4.0",
  description:
    "Local-first engineering control plane for Cursor — Arc Index, Arc Graph, impact analysis, and evidence-backed MCP tools.",
  author: { name: "theworker02", url: "https://github.com/theworker02" },
  homepage: "https://github.com/theworker02/arcframe",
  repository: "https://github.com/theworker02/arcframe",
  license: "MIT",
  keywords: [
    "cursor",
    "mcp",
    "local-first",
    "repository-intelligence",
    "arc-index",
    "arc-graph",
  ],
};
writeFileSync(join(root, "plugin.json"), `${JSON.stringify(agentPlugin, null, 2)}\n`);

mkdirSync(join(root, ".cursor-plugin"), { recursive: true });
const cursorPlugin = {
  name: "arcframe",
  version: "0.4.0",
  description:
    "Local-first engineering control plane for Cursor — Arc Index, Arc Graph, impact analysis, rules, skills, and MCP.",
  author: {
    name: "theworker02",
    email: "theworker02@users.noreply.github.com",
  },
  homepage: "https://github.com/theworker02/arcframe",
  repository: "https://github.com/theworker02/arcframe",
  license: "MIT",
  keywords: [
    "mcp",
    "local-first",
    "repository-intelligence",
    "arc-index",
    "arc-graph",
    "evidence",
  ],
  logo: "assets/arcframe-readme.svg",
};
writeFileSync(
  join(root, ".cursor-plugin", "plugin.json"),
  `${JSON.stringify(cursorPlugin, null, 2)}\n`,
);

console.log("Open Plugins layout generated.");
