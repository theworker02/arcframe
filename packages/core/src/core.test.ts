import { describe, expect, it } from "vitest";
import { hashContent, toPosixPath, mergeConfig, DEFAULT_CONFIG } from "./index.js";

describe("paths", () => {
  it("normalizes to posix", () => {
    expect(toPosixPath("a\\b\\c")).toBe("a/b/c");
  });
});

describe("hash", () => {
  it("is stable", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });
});

describe("config", () => {
  it("merges nested patches", () => {
    const next = mergeConfig(DEFAULT_CONFIG, {
      logLevel: "debug",
      index: { incremental: false, watch: true },
    });
    expect(next.logLevel).toBe("debug");
    expect(next.index.incremental).toBe(false);
    expect(next.index.watch).toBe(true);
    expect(next.mcp.enabled).toBe(true);
  });
});
