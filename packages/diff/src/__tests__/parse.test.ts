import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateDiffStats, parseGitDiff, parseUnifiedDiff } from "../parse.js";

function fixture(name: string): string {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("parseUnifiedDiff", () => {
  it("returns [] for empty / whitespace input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("   \n \t ")).toEqual([]);
  });

  it("parseGitDiff is an alias of parseUnifiedDiff", () => {
    expect(parseGitDiff).toBe(parseUnifiedDiff);
  });

  it("parses a single-file modify with correct status, paths and line numbers", () => {
    const [file, ...rest] = parseUnifiedDiff(fixture("single-modify.diff"));
    expect(rest).toHaveLength(0);
    if (!file) {
      throw new Error("no file");
    }
    expect(file.path).toBe("src/app.ts");
    expect(file.filename).toBe("app.ts");
    expect(file.status).toBe("modified");
    expect(file.oldPath).toBeUndefined();
    expect(file.additions).toBe(2);
    expect(file.deletions).toBe(1);
    expect(file.hunks).toHaveLength(1);

    const hunk = file.hunks[0];
    if (!hunk) {
      throw new Error("no hunk");
    }
    expect(hunk.oldStart).toBe(1);
    expect(hunk.newStart).toBe(1);

    // context line keeps both numbers, no +/-/space prefix on content
    const ctx = hunk.lines[0];
    if (!ctx) {
      throw new Error("no ctx");
    }
    expect(ctx.type).toBe("context");
    expect(ctx.content).toBe('import { foo } from "./foo";');
    expect(ctx.oldLineNumber).toBe(1);
    expect(ctx.newLineNumber).toBe(1);

    const del = hunk.lines.find((l) => l.type === "deletion");
    if (!del) {
      throw new Error("no del");
    }
    expect(del.content).toBe("const x = 1;");
    expect(del.oldLineNumber).toBe(2);
    expect(del.newLineNumber).toBeUndefined();

    const add = hunk.lines.find((l) => l.type === "addition");
    if (!add) {
      throw new Error("no add");
    }
    expect(add.content).toBe("const x = 2;");
    expect(add.newLineNumber).toBe(2);
    expect(add.oldLineNumber).toBeUndefined();

    // per-file header preserved on patch
    expect(file.patch).toContain("diff --git a/src/app.ts b/src/app.ts");
    expect(file.patch).toContain("index 1234567..89abcde 100644");
  });

  it("parses an added file with oldStart 0", () => {
    const [file] = parseUnifiedDiff(fixture("added.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.status).toBe("added");
    expect(file.path).toBe("src/new.ts");
    expect(file.deletions).toBe(0);
    expect(file.additions).toBe(3);
    expect(file.hunks[0]?.oldStart).toBe(0);
  });

  it("parses a deleted file", () => {
    const [file] = parseUnifiedDiff(fixture("deleted.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.status).toBe("deleted");
    expect(file.path).toBe("src/old.ts");
    expect(file.additions).toBe(0);
    expect(file.deletions).toBe(2);
  });

  it("classifies a rename with content change as renamed and sets oldPath", () => {
    const [file] = parseUnifiedDiff(fixture("rename-modify.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.status).toBe("renamed");
    expect(file.path).toBe("src/new-name.ts");
    expect(file.oldPath).toBe("src/old-name.ts");
  });

  it("classifies a pure move (no content change) as moved", () => {
    const [file] = parseUnifiedDiff(fixture("pure-move.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.status).toBe("moved");
    expect(file.path).toBe("src/b/util.ts");
    expect(file.oldPath).toBe("src/a/util.ts");
    expect(file.additions).toBe(0);
    expect(file.deletions).toBe(0);
  });

  it("detects a symlink add (mode 120000) and its target", () => {
    const [file] = parseUnifiedDiff(fixture("symlink-add.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.isSymlink).toBe(true);
    expect(file.symlinkTarget).toBe("target/real-file.ts");
    expect(file.oldSymlinkTarget).toBeUndefined();
  });

  it("detects a symlink remove and its old target", () => {
    const [file] = parseUnifiedDiff(fixture("symlink-remove.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.isSymlink).toBe(true);
    expect(file.oldSymlinkTarget).toBe("target/old-file.ts");
  });

  it("parses a mode-only change with no hunks", () => {
    const [file] = parseUnifiedDiff(fixture("mode-change.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.path).toBe("scripts/run.sh");
    expect(file.status).toBe("modified");
    expect(file.hunks).toHaveLength(0);
    expect(file.isSymlink).toBeUndefined();
  });

  it("parses a binary file (no hunks) and keeps the Binary marker in patch", () => {
    const [file] = parseUnifiedDiff(fixture("binary.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.path).toBe("assets/logo.bin");
    expect(file.hunks).toHaveLength(0);
    expect(file.patch).toContain("Binary files");
  });

  it("parses a multi-hunk file preserving both hunks and line numbers", () => {
    const [file] = parseUnifiedDiff(fixture("multi-hunk.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.hunks).toHaveLength(2);
    expect(file.hunks[0]?.oldStart).toBe(1);
    expect(file.hunks[1]?.oldStart).toBe(10);
    expect(file.hunks[1]?.newStart).toBe(10);
  });

  it("parses multiple files in one diff, splitting on diff --git boundaries", () => {
    const files = parseUnifiedDiff(fixture("multi-file.diff"));
    expect(files.map((f) => f.path)).toEqual(["src/one.ts", "pnpm-lock.yaml", "README.md"]);
    // each file's patch starts with its own diff --git header
    for (const f of files) {
      expect(f.patch?.startsWith("diff --git ")).toBe(true);
    }
  });

  it("handles CRLF and 'No newline at end of file' markers", () => {
    const [file] = parseUnifiedDiff(fixture("crlf-nonewline.diff"));
    if (!file) {
      throw new Error("no file");
    }
    expect(file.path).toBe("src/crlf.ts");
    const add = file.hunks[0]?.lines.find((l) => l.type === "addition");
    expect(add?.content).toBe("beta-new\r");
  });
});

describe("calculateDiffStats", () => {
  it("aggregates additions, deletions and file count", () => {
    const files = parseUnifiedDiff(fixture("multi-file.diff"));
    const stats = calculateDiffStats(files);
    expect(stats.fileCount).toBe(3);
    expect(stats.totalAdditions).toBe(3);
    expect(stats.totalDeletions).toBe(1);
  });

  it("returns zeros for no files", () => {
    expect(calculateDiffStats([])).toEqual({
      totalAdditions: 0,
      totalDeletions: 0,
      fileCount: 0,
    });
  });
});
