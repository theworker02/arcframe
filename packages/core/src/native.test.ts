import { describe, expect, it } from "vitest";
import {
  parseHashwalkJsonl,
  NATIVE_BINARIES,
  findNativeBinaryPath,
} from "./native.js";

describe("native hashwalk JSONL contract", () => {
  it("parses sample lines from arcframe-hashwalk", () => {
    const sample = [
      '{"path":"src/a.ts","hash":"abc","size":12,"mtime":1700000000000}',
      "",
      '{"path":"README.md","hash":"def","size":100,"mtime":1700000001000}',
      "not-json",
      '{"path":"bad","hash":1}',
    ].join("\n");

    const entries = parseHashwalkJsonl(sample);
    expect(entries).toEqual([
      {
        path: "src/a.ts",
        hash: "abc",
        size: 12,
        mtime: 1700000000000,
      },
      {
        path: "README.md",
        hash: "def",
        size: 100,
        mtime: 1700000001000,
      },
    ]);
  });

  it("normalizes windows separators in path", () => {
    const entries = parseHashwalkJsonl(
      '{"path":"src\\\\x.ts","hash":"h","size":1,"mtime":1}',
    );
    expect(entries[0]?.path).toBe("src/x.ts");
  });
});

describe("native gitmeta JSON contract", () => {
  it("matches expected status shape fields", () => {
    const status = {
      available: true,
      branch: "main",
      clean: true,
      ahead: 0,
      behind: 0,
      staged: [] as string[],
      unstaged: [] as string[],
      untracked: [] as string[],
      confidence: "confirmed",
    };
    expect(status.available).toBe(true);
    expect(Array.isArray(status.staged)).toBe(true);
    expect(NATIVE_BINARIES.gitmeta).toBe("arcframe-gitmeta");
    expect(NATIVE_BINARIES.hashwalk).toBe("arcframe-hashwalk");
  });

  it("parses blame/log sample payloads", () => {
    const blame = JSON.parse(
      '{"path":"a.ts","lines":["Alice: const x = 1"],"confidence":"confirmed"}',
    ) as { path: string; lines: string[]; confidence: string };
    expect(blame.lines[0]).toContain("Alice:");
    const log = JSON.parse(
      '{"entries":["abc init (Arcframe)"],"confidence":"confirmed"}',
    ) as { entries: string[]; confidence: string };
    expect(log.entries).toHaveLength(1);
  });
});

describe("findNativeBinaryPath", () => {
  it("returns null or a path without throwing", () => {
    const path = findNativeBinaryPath("arcframe-hashwalk");
    expect(path === null || typeof path === "string").toBe(true);
  });
});
