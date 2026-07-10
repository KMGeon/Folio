import { describe, expect, it } from "vitest";

import type { ChangedFile } from "./changed-file-summary";
import { buildChangedFileTree } from "./changed-file-tree-model";

const files: ChangedFile[] = [
  {
    path: "src/domain/order.ts",
    status: "modified",
    additions: 3,
    deletions: 1,
    viewed: false,
    chapterIndex: 1,
    chapterTitle: "Domain",
  },
  {
    path: "src/application/service.ts",
    status: "added",
    additions: 5,
    deletions: 0,
    viewed: true,
    chapterIndex: 1,
    chapterTitle: "Application",
  },
  {
    path: "README.md",
    status: "modified",
    additions: 1,
    deletions: 0,
    viewed: false,
    chapterIndex: 2,
    chapterTitle: "Docs",
  },
];

describe("buildChangedFileTree", () => {
  it("creates one node for every directory segment", () => {
    const tree = buildChangedFileTree(files);
    const src = tree.directories[0];
    if (!src) {
      throw new Error("Expected src directory");
    }
    const application = src.directories[0];
    if (!application) {
      throw new Error("Expected application directory");
    }

    expect(src.name).toBe("src");
    expect(src.path).toBe("src");
    expect(src.directories.map((directory) => directory.name)).toEqual(["application", "domain"]);
    expect(application.files.map((file) => file.path)).toEqual(["src/application/service.ts"]);
  });

  it("keeps repository-root files at the tree root", () => {
    const tree = buildChangedFileTree(files);

    expect(tree.files.map((file) => file.path)).toEqual(["README.md"]);
  });
});
