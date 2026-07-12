import { beforeEach, describe, expect, it, vi } from "vitest";
import { installationsRepo } from "./installations.js";
import { repositoriesRepo } from "./repositories.js";

vi.mock("./installations.js", () => ({
  installationsRepo: { getByIdForUpdate: vi.fn() },
}));

describe("repositoriesRepo.reconcileInstallationAccess", () => {
  const getLockedInstallation = vi.mocked(installationsRepo.getByIdForUpdate);

  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["missing", null],
    ["suspended", { id: "installation-1", suspendedAt: new Date() }],
  ])("skips repository writes when the locked installation is %s", async (_state, locked) => {
    getLockedInstallation.mockResolvedValue(locked as never);
    const transaction = vi.fn(async (operation: (tx: string) => Promise<unknown>) =>
      operation("tx"),
    );
    const upsert = vi.spyOn(repositoriesRepo, "upsertByGithubId");

    const result = await repositoriesRepo.reconcileInstallationAccess(
      "installation-1",
      "workspace-1",
      [
        {
          githubRepoId: 123,
          owner: "acme",
          name: "folio",
          fullName: "acme/folio",
          private: true,
          defaultBranch: "main",
        },
      ],
      { transaction } as never,
    );

    expect(installationsRepo.getByIdForUpdate).toHaveBeenCalledWith("installation-1", "tx");
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("locks the active installation before writing repositories", async () => {
    getLockedInstallation.mockResolvedValue({
      id: "installation-1",
      suspendedAt: null,
    } as never);
    const where = vi.fn(async () => undefined);
    const set = vi.fn((_input: Record<string, unknown>) => ({ where }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({ update }),
    );
    const upsert = vi
      .spyOn(repositoriesRepo, "upsertByGithubId")
      .mockResolvedValue({ id: "repository-1" } as never);

    await repositoriesRepo.reconcileInstallationAccess(
      "installation-1",
      "workspace-1",
      [
        {
          githubRepoId: 123,
          owner: "acme",
          name: "folio",
          fullName: "acme/folio",
          private: true,
          defaultBranch: "main",
        },
      ],
      { transaction } as never,
    );

    expect(getLockedInstallation.mock.invocationCallOrder[0]).toBeLessThan(
      upsert.mock.invocationCallOrder[0]!,
    );
  });

  it("preserves existing reply settings during installation reconciliation", async () => {
    getLockedInstallation.mockResolvedValue({
      id: "installation-1",
      suspendedAt: null,
    } as never);
    const where = vi.fn(async () => undefined);
    const set = vi.fn((_input: Record<string, unknown>) => ({ where }));
    const update = vi.fn(() => ({ set }));
    const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({ update }),
    );
    vi.spyOn(repositoriesRepo, "upsertByGithubId").mockResolvedValue({
      id: "repository-1",
      aiReplyEnabled: false,
      priority: "high",
    } as never);

    const [repository] = await repositoriesRepo.reconcileInstallationAccess(
      "installation-1",
      "workspace-1",
      [
        {
          githubRepoId: 123,
          owner: "acme",
          name: "folio",
          fullName: "acme/folio",
          private: true,
          defaultBranch: "main",
        },
      ],
      { transaction } as never,
    );

    expect(repository).toMatchObject({ aiReplyEnabled: false, priority: "high" });
  });
});

describe("repositoriesRepo.updatePreferences", () => {
  it("updates both repository reply preferences", async () => {
    const row = { id: "repository-1", aiReplyEnabled: false, priority: "high" };
    const returning = vi.fn().mockResolvedValue([row]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn((_input: Record<string, unknown>) => ({ where }));
    const update = vi.fn(() => ({ set }));

    const result = await repositoriesRepo.updatePreferences(
      "repository-1",
      { aiReplyEnabled: false, priority: "high" },
      { update } as never,
    );

    expect(result).toEqual(row);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        aiReplyEnabled: false,
        priority: "high",
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("leaves the stored reply setting unchanged for a priority-only update", async () => {
    const row = { id: "repository-1", aiReplyEnabled: true, priority: "high" };
    const returning = vi.fn().mockResolvedValue([row]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn((_input: Record<string, unknown>) => ({ where }));
    const update = vi.fn(() => ({ set }));

    const result = await repositoriesRepo.updatePreferences("repository-1", { priority: "high" }, {
      update,
    } as never);

    expect(result).toEqual(row);
    const [input] = set.mock.calls[0]!;
    expect(input).not.toHaveProperty("aiReplyEnabled");
  });
});
