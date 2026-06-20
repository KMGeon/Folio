import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertByGithubId = vi.fn(async () => ({ id: "inst-row-1" }));
const getByGithubId = vi.fn(async () => ({ id: "inst-row-1" }));
const repoUpsert = vi.fn(async () => ({ id: "repo-row" }));

const paginate = vi.fn(async () => [
  {
    id: 555,
    name: "widget",
    full_name: "acme/widget",
    owner: { login: "acme" },
    private: true,
    default_branch: "main",
  },
]);
const createInstallationOctokit = vi.fn(async () => ({
  paginate,
  rest: { apps: { listReposAccessibleToInstallation: "list-fn" } },
}));

vi.mock("@folio/db", () => ({
  installationsRepo: { upsertByGithubId, getByGithubId },
  repositoriesRepo: { upsertByGithubId: repoUpsert },
}));
vi.mock("@folio/github", () => ({ createInstallationOctokit }));

const { InstallationSyncFacade } = await import("./installation-sync.facade.js");

describe("InstallationSyncFacade", () => {
  beforeEach(() => {
    upsertByGithubId.mockClear();
    getByGithubId.mockClear();
    repoUpsert.mockClear();
    createInstallationOctokit.mockClear();
  });

  it("upserts the installation and its accessible repositories", async () => {
    const facade = new InstallationSyncFacade();
    await facade.sync({
      githubInstallationId: 123,
      account: { login: "acme", type: "Organization" },
    });

    expect(upsertByGithubId).toHaveBeenCalledWith({
      githubInstallationId: 123,
      accountLogin: "acme",
      accountType: "Organization",
    });
    expect(repoUpsert).toHaveBeenCalledWith({
      installationId: "inst-row-1",
      githubRepoId: 555,
      owner: "acme",
      name: "widget",
      fullName: "acme/widget",
      private: true,
      defaultBranch: "main",
    });
  });

  it("falls back to the stored installation when no account is on the payload", async () => {
    const facade = new InstallationSyncFacade();
    await facade.sync({ githubInstallationId: 123 });

    expect(upsertByGithubId).not.toHaveBeenCalled();
    expect(getByGithubId).toHaveBeenCalledWith(123);
    expect(repoUpsert).toHaveBeenCalledTimes(1);
  });
});
