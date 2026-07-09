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

const MULTI_FILE_DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 const z = 3;
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -10,3 +10,2 @@
 const keep = true;
-const remove = true;
 const done = true;
`;

describe("sliceChapterCode", () => {
  it("returns only the hunks named by the refs, with mapped line kinds", () => {
    const code = sliceChapterCode(DIFF, [{ filePath: "a.ts", oldStart: 1 }]);
    expect(code.files).toEqual([{ path: "a.ts", status: "modified", additions: 1, deletions: 0 }]);
    expect(code.diffLines).toEqual([
      {
        path: "a.ts",
        n: 1,
        kind: "ctx",
        text: "const x = 1;",
        oldLineNumber: 1,
        newLineNumber: 1,
      },
      {
        path: "a.ts",
        n: 2,
        kind: "add",
        text: "const y = 2;",
        newLineNumber: 2,
      },
      {
        path: "a.ts",
        n: 3,
        kind: "ctx",
        text: "const z = 3;",
        oldLineNumber: 2,
        newLineNumber: 3,
      },
    ]);
  });

  it("preserves each rendered line's file path and old/new line numbers", () => {
    const code = sliceChapterCode(MULTI_FILE_DIFF, [
      { filePath: "a.ts", oldStart: 1 },
      { filePath: "b.ts", oldStart: 10 },
    ]);

    expect(code.files).toEqual([
      { path: "a.ts", status: "modified", additions: 1, deletions: 0 },
      { path: "b.ts", status: "modified", additions: 0, deletions: 1 },
    ]);
    expect(code.diffLines).toEqual([
      {
        path: "a.ts",
        n: 1,
        kind: "ctx",
        text: "const x = 1;",
        oldLineNumber: 1,
        newLineNumber: 1,
      },
      {
        path: "a.ts",
        n: 2,
        kind: "add",
        text: "const y = 2;",
        newLineNumber: 2,
      },
      {
        path: "a.ts",
        n: 3,
        kind: "ctx",
        text: "const z = 3;",
        oldLineNumber: 2,
        newLineNumber: 3,
      },
      {
        path: "b.ts",
        n: 10,
        kind: "ctx",
        text: "const keep = true;",
        oldLineNumber: 10,
        newLineNumber: 10,
      },
      {
        path: "b.ts",
        n: 11,
        kind: "del",
        text: "const remove = true;",
        oldLineNumber: 11,
      },
      {
        path: "b.ts",
        n: 11,
        kind: "ctx",
        text: "const done = true;",
        oldLineNumber: 12,
        newLineNumber: 11,
      },
    ]);
  });

  it("ignores refs whose file or hunk is absent", () => {
    const code = sliceChapterCode(DIFF, [{ filePath: "missing.ts", oldStart: 99 }]);
    expect(code.files).toEqual([]);
    expect(code.diffLines).toEqual([]);
  });

  it("preserves parsed file status on rendered chapter files", () => {
    const deletedDiff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index 3b18e51..0000000
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-const old = true;
-export { old };
`;

    const code = sliceChapterCode(deletedDiff, [{ filePath: "old.ts", oldStart: 1 }]);

    expect(code.files).toEqual([{ path: "old.ts", status: "deleted", additions: 0, deletions: 2 }]);
  });
});
