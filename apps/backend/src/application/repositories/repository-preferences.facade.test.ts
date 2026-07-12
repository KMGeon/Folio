import { describe, expect, it, vi } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import { RepositoryPreferencesFacade } from "./repository-preferences.facade.js";

vi.mock("@folio/db", () => ({
  auditLogsRepo: { record: vi.fn() },
  getDb: vi.fn(),
  repositoriesRepo: { getById: vi.fn() },
  usersRepo: { getById: vi.fn() },
  workspaceMembersRepo: { getMembership: vi.fn() },
  workspacesRepo: { getByIdForUpdate: vi.fn() },
}));

describe("RepositoryPreferencesFacade", () => {
  it("resolves settings against the user's selected workspace", async () => {
    const resolver = { workspaceForUser: vi.fn().mockResolvedValue(null) };
    const facade = new RepositoryPreferencesFacade(
      resolver as never,
      {
        assertLiveLevelAtLeast: vi.fn(),
      } as never,
    );

    const error = await facade
      .setPreferences(
        {
          user: { id: "user-1", login: "octocat" },
          repositoryId: "repo-1",
          aiReplyEnabled: false,
        },
        "workspace-organization",
      )
      .catch((caught: unknown) => caught);

    expect(resolver.workspaceForUser).toHaveBeenCalledWith("user-1", "workspace-organization");
    expect(error).toBeInstanceOf(CoreException);
    expect((error as CoreException).errorType).toBe(ErrorType.WorkspaceNotFound);
  });
});
