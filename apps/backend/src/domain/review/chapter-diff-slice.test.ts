import { describe, expect, it } from "vitest";
import { sliceChapterCode } from "./chapter-diff-slice.js";

const DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 const z = 3;
`;

describe("sliceChapterCode", () => {
  it("returns only the hunks named by the refs, with mapped line kinds", () => {
    const code = sliceChapterCode(DIFF, [{ filePath: "a.ts", oldStart: 1 }]);
    expect(code.files).toEqual([{ path: "a.ts", additions: 1, deletions: 0 }]);
    expect(code.diffLines).toEqual([
      { n: 1, kind: "ctx", text: "const x = 1;" },
      { n: 2, kind: "add", text: "const y = 2;" },
      { n: 3, kind: "ctx", text: "const z = 3;" },
    ]);
  });

  it("ignores refs whose file or hunk is absent", () => {
    const code = sliceChapterCode(DIFF, [{ filePath: "missing.ts", oldStart: 99 }]);
    expect(code.files).toEqual([]);
    expect(code.diffLines).toEqual([]);
  });
});
