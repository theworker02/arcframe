import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanSecretPatterns } from "./security.js";
import { parseStacktrace, investigateStacktrace } from "./debug.js";
import { explainCommand, detectPackageScripts } from "./command.js";
import { openStore } from "@arcframe/storage";

describe("scanSecretPatterns", () => {
  it("reports pattern name without secret values", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-sec-"));
    writeFileSync(
      join(dir, "leak.ts"),
      `const token = "ghp_${"a".repeat(36)}";\n`,
    );
    writeFileSync(join(dir, ".env.example"), "API_SECRET=do-not-print-me\n");
    const result = scanSecretPatterns(dir, { includeEntropy: false });
    expect(result.findings.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("do-not-print-me");
    expect(serialized).not.toMatch(/ghp_a{10,}/);
    expect(result.findings.every((f) => f.path && f.line && f.label)).toBe(true);
    expect(result.summary.total).toBe(result.findings.length);
  });

  it("flags high-entropy quoted strings", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-ent-"));
    // high entropy random-looking string
    writeFileSync(
      join(dir, "cfg.ts"),
      `export const x = "xK9mP2qR7sT4vW8yZ1nB5cD3fG6hJ0";\n`,
    );
    const result = scanSecretPatterns(dir, { includeEntropy: true });
    expect(result.findings.some((f) => f.kind === "entropy")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("xK9mP2qR7sT4vW8yZ1nB5cD3fG6hJ0");
  });
});

describe("parseStacktrace / investigateStacktrace", () => {
  it("parses JS frames", () => {
    const frames = parseStacktrace(`Error: boom
    at doThing (C:/proj/src/app.ts:42:11)
    at Object.<anonymous> (C:/proj/src/main.ts:10:5)
`);
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[0].file?.replaceAll("\\", "/")).toContain("app.ts");
    expect(frames[0].line).toBe(42);
    expect(frames[0].functionName).toBe("doThing");
  });

  it("maps frames to indexed symbols", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-dbg-"));
    const db = join(dir, "test.db");
    const store = openStore(db);
    store.upsertFile({
      path: "src/app.ts",
      hash: "a",
      language: "typescript",
      size: 10,
      mtime: 1,
      indexed_at: 1,
    });
    store.upsertSymbol({
      id: "src/app.ts:doThing:42",
      file_path: "src/app.ts",
      name: "doThing",
      kind: "function",
      line: 40,
      end_line: 50,
      exported: 1,
      signature: "function doThing()",
    });
    const result = investigateStacktrace(
      store,
      `Error: x\n    at doThing (/repo/src/app.ts:42:1)\n`,
    );
    expect(result.suspects.length).toBe(1);
    expect(result.suspects[0].symbol).toBe("doThing");
    expect(result.suspects[0].confidence).toBe("confirmed");
    store.close();
  });
});

describe("explainCommand / detectPackageScripts", () => {
  it("explains pnpm run build", () => {
    const exp = explainCommand("pnpm run build --filter @arcframe/cli", {
      scripts: { build: "tsc -p tsconfig.json" },
    });
    expect(exp.tokens.some((t) => t.role === "binary" && t.text === "pnpm")).toBe(
      true,
    );
    expect(exp.summary.toLowerCase()).toContain("build");
    expect(exp.confidence).not.toBe("unknown");
  });

  it("detects package scripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-cmd-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: { build: "tsc", test: "vitest run", lint: "eslint ." },
      }),
    );
    mkdirSync(join(dir, "packages", "foo"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "foo", "package.json"),
      JSON.stringify({ scripts: { dev: "vite" } }),
    );
    const detected = detectPackageScripts(dir);
    expect(detected.scripts.length).toBeGreaterThanOrEqual(4);
    expect(detected.byCategory.build).toBeGreaterThanOrEqual(1);
    expect(detected.byCategory.test).toBeGreaterThanOrEqual(1);
  });
});

describe("findBrokenDocCommands", () => {
  it("does not treat mermaid closing fences as shell blocks", async () => {
    const { findBrokenDocCommands } = await import("./ops.js");
    const dir = mkdtempSync(join(tmpdir(), "arc-docs-"));
    writeFileSync(
      join(dir, "README.md"),
      [
        "# Demo",
        "",
        "```mermaid",
        "flowchart LR",
        "  A --> B",
        "```",
        "",
        "| Surface | Install path |",
        "|---------|----------------|",
        "| CLI | Clone → `pnpm build` → `node ./cli/dist/bin.js` |",
        "",
        "```bash",
        "node ./cli/dist/bin.js init",
        "```",
        "",
      ].join("\n"),
    );
    mkdirSync(join(dir, "cli", "dist"), { recursive: true });
    writeFileSync(join(dir, "cli", "dist", "bin.js"), "console.log('ok')\n");

    const result = findBrokenDocCommands(dir);
    expect(result.broken).toEqual([]);
    expect(result.scanned).toBe(1);
  });
});
