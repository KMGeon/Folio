import { describe, expect, it } from "vitest";
import { RepositoryPrioritySchema, RepositorySchema } from "./repository.js";

const baseRepository = {
  id: "repo-1",
  installationId: "installation-1",
  githubRepoId: 101,
  owner: "acme",
  name: "folio",
  fullName: "acme/folio",
  private: true,
  defaultBranch: "main",
  folioEnabled: false,
  githubAccessActive: true,
};

describe("repository types", () => {
  it("requires the GitHub access state", () => {
    expect(
      RepositorySchema.parse({
        ...baseRepository,
        aiReplyEnabled: true,
        priority: "normal",
      }).githubAccessActive,
    ).toBe(true);

    expect(() =>
      RepositorySchema.parse({
        ...baseRepository,
        aiReplyEnabled: true,
        priority: "normal",
        githubAccessActive: undefined,
      }),
    ).toThrow();
  });

  it("accepts only supported repository priorities", () => {
    expect(RepositoryPrioritySchema.parse("high")).toBe("high");
    expect(RepositoryPrioritySchema.parse("normal")).toBe("normal");
    expect(RepositoryPrioritySchema.parse("low")).toBe("low");
    expect(() => RepositoryPrioritySchema.parse("urgent")).toThrow();
  });

  it("requires AI reply and priority settings", () => {
    expect(() => RepositorySchema.parse(baseRepository)).toThrow();
    expect(
      RepositorySchema.parse({ ...baseRepository, aiReplyEnabled: true, priority: "normal" }),
    ).toMatchObject({ aiReplyEnabled: true, priority: "normal" });
  });
});
