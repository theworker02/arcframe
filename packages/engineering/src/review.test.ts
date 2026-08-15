import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./review.js";

describe("parseUnifiedDiff", () => {
  it("extracts added lines with numbers", () => {
    const diff = `diff --git a/foo.ts b/foo.ts
--- a/foo.ts
+++ b/foo.ts
@@ -1,2 +1,3 @@
 keep
-old
+new
+export function hello() {}
`;
    const hunks = parseUnifiedDiff(diff);
    expect(hunks.length).toBe(1);
    expect(hunks[0].file).toBe("foo.ts");
    expect(hunks[0].added.some((a) => a.text.includes("hello"))).toBe(true);
  });
});
