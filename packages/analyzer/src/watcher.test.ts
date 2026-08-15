import { describe, expect, it } from "vitest";
import { coalesceInvalidationBatch } from "./watcher.js";

describe("coalesceInvalidationBatch", () => {
  it("returns unchanged when under threshold", () => {
    const r = coalesceInvalidationBatch("/repo", ["a.ts", "b.ts"], 12);
    expect(r.coalesced).toBe(false);
    expect(r.changed).toEqual(["a.ts", "b.ts"]);
  });

  it("coalesces package dirs when batch is large", () => {
    const paths = Array.from({ length: 15 }, (_, i) => `packages/core/src/f${i}.ts`);
    paths.push("packages/graph/src/x.ts");
    const r = coalesceInvalidationBatch("/repo", paths, 12);
    expect(r.coalesced).toBe(true);
    expect(r.coalescedDirs).toContain("packages/core");
    expect(r.coalescedDirs).toContain("packages/graph");
  });
});
