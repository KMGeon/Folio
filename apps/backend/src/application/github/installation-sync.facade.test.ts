import { beforeEach, describe, expect, it, vi } from "vitest";

const installation = { id: "inst-row-1", githubAccountId: 42 };
const upsertByGithubId = vi.fn(async () => installation);
const getByGithubId = vi.fn(async () => installation);
const getByIdForUpdate = vi.fn(async () => installation);
const setSuspendedAt = vi.fn(async () => undefined);
const reconcileInstallationAccess = vi.fn(async () => []);
const disconnectInstallation = vi.fn(async () => undefined);
const getByGithubAccountId = vi.fn(async () => ({ id: "workspace-1" }));
const transaction = vi.fn(async (callback: (transaction: string) => Promise<void>) =>
  callback("tx"),
);
const getDb = vi.fn(() => ({ transaction }));

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
  getDb,
  installationsRepo: { upsertByGithubId, getByGithubId, getByIdForUpdate, setSuspendedAt },
  repositoriesRepo: { reconcileInstallationAccess, disconnectInstallation },
  workspacesRepo: { getByGithubAccountId },
}));
vi.mock("@folio/github", () => ({ createInstallationOctokit }));

const { InstallationSyncFacade } = await import("./installation-sync.facade.js");

describe("InstallationSyncFacade", () => {
  beforeEach(() => {
    upsertByGithubId.mockClear();
    getByGithubId.mockClear();
    getByIdForUpdate.mockClear();
    setSuspendedAt.mockClear();
    reconcileInstallationAccess.mockClear();
    disconnectInstallation.mockClear();
    getByGithubAccountId.mockClear();
    transaction.mockClear();
    getDb.mockClear();
    paginate.mockClear();
    createInstallationOctokit.mockClear();
  });

  it("upserts the installation and its accessible repositories", async () => {
    const facade = new InstallationSyncFacade();
    await facade.sync({
      githubInstallationId: 123,
      account: { githubAccountId: 42, login: "acme", type: "Organization" },
    });

    expect(upsertByGithubId).toHaveBeenCalledWith({
      githubInstallationId: 123,
      githubAccountId: 42,
      accountLogin: "acme",
      accountType: "Organization",
    });
    expect(reconcileInstallationAccess).toHaveBeenCalledWith("inst-row-1", "workspace-1", [
      {
        githubRepoId: 555,
        owner: "acme",
        name: "widget",
        fullName: "acme/widget",
        private: true,
        defaultBranch: "main",
      },
    ]);
  });

  it("falls back to the stored installation when no account is on the payload", async () => {
    const facade = new InstallationSyncFacade();
    await facade.sync({ githubInstallationId: 123 });

    expect(upsertByGithubId).not.toHaveBeenCalled();
    expect(getByGithubId).toHaveBeenCalledWith(123);
    expect(reconcileInstallationAccess).toHaveBeenCalledTimes(1);
  });

  it("does not reconcile when GitHub repository listing fails", async () => {
    paginate.mockRejectedValueOnce(new Error("GitHub unavailable"));

    await expect(new InstallationSyncFacade().sync({ githubInstallationId: 123 })).rejects.toThrow(
      "GitHub unavailable",
    );
    expect(reconcileInstallationAccess).not.toHaveBeenCalled();
  });

  it("leaves an in-flight GitHub fetch outside the disconnect transaction", async () => {
    const listing = deferred<ReturnType<typeof defaultRepositories>>();
    paginate.mockReturnValueOnce(listing.promise);

    const sync = new InstallationSyncFacade().sync({ githubInstallationId: 123 });
    await vi.waitFor(() => expect(paginate).toHaveBeenCalledTimes(1));
    await new InstallationSyncFacade().disconnect(123);

    expect(reconcileInstallationAccess).not.toHaveBeenCalled();
    listing.resolve(defaultRepositories());
    await sync;
    expect(disconnectInstallation.mock.invocationCallOrder[0]).toBeLessThan(
      reconcileInstallationAccess.mock.invocationCallOrder[0]!,
    );
  });

  it("tombstones a deleted installation and disconnects its repositories", async () => {
    const at = new Date("2026-07-11T00:00:00.000Z");

    await new InstallationSyncFacade().disconnect(123, at);

    expect(getByIdForUpdate).toHaveBeenCalledWith("inst-row-1", "tx");
    expect(getByIdForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      disconnectInstallation.mock.invocationCallOrder[0]!,
    );
    expect(setSuspendedAt).toHaveBeenCalledWith("inst-row-1", at, "tx");
    expect(disconnectInstallation).toHaveBeenCalledWith("inst-row-1", "tx");
  });

  it("skips disconnect writes when the installation disappears before its row lock", async () => {
    getByIdForUpdate.mockResolvedValueOnce(null as never);

    await new InstallationSyncFacade().disconnect(123);

    expect(setSuspendedAt).not.toHaveBeenCalled();
    expect(disconnectInstallation).not.toHaveBeenCalled();
  });
});

function defaultRepositories() {
  return [
    {
      id: 555,
      name: "widget",
      full_name: "acme/widget",
      owner: { login: "acme" },
      private: true,
      default_branch: "main",
    },
  ];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
