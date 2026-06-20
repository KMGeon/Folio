import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PullRequestFile } from "@folio/types";
import ignore from "ignore";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filterFilesForLlm, loadFolioIgnore, shouldIncludeFile } from "../filter.js";

function file(p: string): PullRequestFile {
  return {
    path: p,
    filename: p.split("/").at(-1) ?? p,
    status: "modified",
    additions: 1,
    deletions: 0,
    hunks: [
      {
        header: "@@ -1 +1 @@",
        oldStart: 1,
        newStart: 1,
        oldLines: 1,
        newLines: 1,
        lines: [{ type: "addition", content: "x", newLineNumber: 1 }],
      },
    ],
  };
}

describe("shouldIncludeFile", () => {
  it("excludes every IGNORED_FILENAMES lockfile (and is case-insensitive)", () => {
    for (const name of [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb",
      "bun.lock",
      "composer.lock",
      "gemfile.lock",
      "cargo.lock",
      "poetry.lock",
      "pipfile.lock",
      "go.sum",
      "flake.lock",
      ".ds_store",
      "thumbs.db",
    ]) {
      expect(shouldIncludeFile(name)).toBe(false);
      expect(shouldIncludeFile(`nested/dir/${name}`)).toBe(false);
    }
    expect(shouldIncludeFile("Pnpm-Lock.yaml")).toBe(false);
  });

  it("excludes every IGNORED_EXTENSIONS suffix", () => {
    for (const ext of [
      ".min.js",
      ".min.css",
      ".map",
      ".snap",
      ".svg",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".ico",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
      ".mp4",
      ".webm",
      ".pdf",
    ]) {
      expect(shouldIncludeFile(`assets/file${ext}`)).toBe(false);
      expect(shouldIncludeFile(`assets/FILE${ext.toUpperCase()}`)).toBe(false);
    }
  });

  it("includes ordinary source files", () => {
    expect(shouldIncludeFile("src/app.ts")).toBe(true);
    expect(shouldIncludeFile("README.md")).toBe(true);
    expect(shouldIncludeFile("src/icon.tsx")).toBe(true); // not .ico
  });
});

describe("filterFilesForLlm", () => {
  it("partitions a mixed reviewable + excluded set", () => {
    const files = [
      file("src/app.ts"),
      file("pnpm-lock.yaml"),
      file("assets/logo.png"),
      file("README.md"),
    ];
    const res = filterFilesForLlm(files);
    expect(res.files.map((f) => f.path)).toEqual(["src/app.ts", "README.md"]);
    expect(res.excludedByPath).toEqual(["pnpm-lock.yaml", "assets/logo.png"]);
  });

  it("honors a .folioignore matcher (anchoring + negation)", () => {
    const fi = ignore().add("dist/\n*.generated.ts\n!keep.generated.ts");
    const files = [
      file("dist/bundle.js"),
      file("src/types.generated.ts"),
      file("keep.generated.ts"),
      file("src/app.ts"),
    ];
    const res = filterFilesForLlm(files, fi);
    expect(res.excludedByPath).toEqual(["dist/bundle.js", "src/types.generated.ts"]);
    expect(res.files.map((f) => f.path)).toEqual(["keep.generated.ts", "src/app.ts"]);
  });

  it("treats a null matcher as no extra exclusions", () => {
    const res = filterFilesForLlm([file("src/app.ts")], null);
    expect(res.excludedByPath).toEqual([]);
    expect(res.files).toHaveLength(1);
  });
});

describe("loadFolioIgnore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "folioignore-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when .folioignore is absent", () => {
    expect(loadFolioIgnore(dir)).toBeNull();
  });

  it("loads patterns from .folioignore", () => {
    writeFileSync(path.join(dir, ".folioignore"), "# comment\ngenerated/\n");
    const fi = loadFolioIgnore(dir);
    expect(fi).not.toBeNull();
    expect(fi?.ignores("generated/out.ts")).toBe(true);
    expect(fi?.ignores("src/app.ts")).toBe(false);
  });
});
