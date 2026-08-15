import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyCommandRisk,
  matchCodeownersPattern,
  parseCodeowners,
  generateRuleStub,
  mapWorkspace,
} from "./agent-tools.js";
import { openStore } from "@arcframe/storage";
import { findSensitiveFiles, findEnvMissing } from "./agent-tools.js";

describe("CODEOWNERS helpers", () => {
  it("parses rules and matches globs", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-own-"));
    mkdirSync(join(dir, ".github"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "CODEOWNERS"),
      `# comment\n* @org/all\n/packages/core/ @org/core\n*.rs @org/rust\n`,
    );
    const parsed = parseCodeowners(dir);
    expect(parsed.path).toBe(".github/CODEOWNERS");
    expect(parsed.rules.length).toBe(3);
    expect(matchCodeownersPattern("packages/core/src/a.ts", "/packages/core/")).toBe(true);
    expect(matchCodeownersPattern("src/main.rs", "*.rs")).toBe(true);
  });
});

describe("classifyCommandRisk", () => {
  it("flags destructive commands", () => {
    const r = classifyCommandRisk("rm -rf /tmp/build");
    expect(r.level).toBe("critical");
    expect(r.destructive).toBe(true);
  });

  it("keeps test commands low", () => {
    const r = classifyCommandRisk("pnpm test");
    expect(r.level).toBe("low");
  });
});

describe("generateRuleStub", () => {
  it("returns markdown stub", () => {
    const stub = generateRuleStub({ title: "No Secrets", scope: "**/.env*" });
    expect(stub.filename).toContain("no-secrets");
    expect(stub.content).toContain("# No Secrets");
  });
});

describe("mapWorkspace", () => {
  it("detects packages layout", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-ws-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
    );
    mkdirSync(join(dir, "packages", "a"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "a", "package.json"),
      JSON.stringify({ name: "@x/a", version: "1.0.0", scripts: { build: "tsc" } }),
    );
    const map = mapWorkspace(dir);
    expect(map.monorepo).toBe(true);
    expect(map.packages.some((p) => p.name === "@x/a")).toBe(true);
  });
});

describe("env + sensitive (no values)", () => {
  it("never returns secret values from env_missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-env-"));
    writeFileSync(join(dir, ".env.example"), "API_SECRET=super-secret-value\n");
    writeFileSync(join(dir, "app.ts"), `const x = process.env.API_SECRET;\n`);
    const db = join(dir, "t.db");
    const store = openStore(db);
    store.upsertFile({
      path: "app.ts",
      hash: "1",
      language: "typescript",
      size: 10,
      mtime: 1,
      indexed_at: 1,
    });
    const result = findEnvMissing(dir, store);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-value");
    expect(result.documentedKeys).toContain("API_SECRET");
    store.close();
  });

  it("classifies sensitive paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-sens-"));
    const db = join(dir, "t.db");
    const store = openStore(db);
    store.upsertFile({
      path: "secrets/prod.pem",
      hash: "1",
      language: "unknown",
      size: 1,
      mtime: 1,
      indexed_at: 1,
    });
    const result = findSensitiveFiles(store);
    expect(result.files.some((f) => f.path.includes("prod.pem"))).toBe(true);
    store.close();
  });
});
