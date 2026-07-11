import { describe, expect, it } from "vitest";
import { RepositorySchema } from "./repository.js";

describe("repository types", () => {
  it("requires the GitHub access state", () => {
    expect(
      RepositorySchema.parse({
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
      }).githubAccessActive,
    ).toBe(true);

    expect(() =>
      RepositorySchema.parse({
        id: "repo-1",
        installationId: "installation-1",
        githubRepoId: 101,
        owner: "acme",
        name: "folio",
        fullName: "acme/folio",
        private: true,
        defaultBranch: "main",
        folioEnabled: false,
      }),
    ).toThrow();
  });
});
