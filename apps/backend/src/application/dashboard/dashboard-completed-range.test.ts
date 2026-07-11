import { beforeEach, describe, expect, it, vi } from "vitest";

const { listByAccountLogin, listByInstallation } = vi.hoisted(() => ({
  listByAccountLogin: vi.fn(async () => [{ id: "i1", githubInstallationId: 111 }]),
  listByInstallation: vi.fn(async () => [
    {
      id: "r1",
      owner: "KMGeon",
      name: "Folio",
      fullName: "KMGeon/Folio",
      folioEnabled: true,
    },
  ]),
}));

vi.mock("@folio/db", () => ({
  installationsRepo: { listByAccountLogin },
  repositoriesRepo: { listByInstallation },
}));
vi.mock("@folio/github", () => ({ createInstallationOctokit: vi.fn() }));

const octokit = {};
const { getDashboardPullPageForUser } = await import("./dashboard-pull-page.js");

describe("dashboard completed range", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("limits completed pull pages to the last day when requested", async () => {
    vi.setSystemTime(new Date("2026-07-09T12:00:00Z"));
    const details = vi.fn(async (_client, _owner, _repo, state) => {
      if (state !== "all") {
        return [];
      }
      return [
        completedPull(70, "Recent merge", "2026-07-09T08:00:00Z"),
        completedPull(69, "Older merge", "2026-07-07T08:00:00Z"),
      ];
    });

    const page = await getDashboardPullPageForUser(
      { id: "u1", login: "KMGeon" },
      {
        bucket: "completed",
        limit: 20,
        ordering: "updated",
        direction: "desc",
        closedRange: "1d",
        showDrafts: true,
      },
      {
        octokitFactory: async () => octokit as never,
        listPulls: details,
        resolveStatus: vi.fn(),
      },
      workspaceScope(await listByInstallation()),
    );

    expect(page.items.map((pull) => pull.number)).toEqual([70]);
    expect(page.count).toBe(1);
  });

  it("starts completed pull list requests for enabled repos concurrently", async () => {
    listByInstallation.mockResolvedValue([
      enabledRepo("r1", "Folio"),
      enabledRepo("r2", "frogfish"),
    ]);
    const firstRepoPulls = deferred<ReturnType<typeof completedPull>[]>();
    const listPulls = vi.fn(async (_client, _owner, repo) =>
      repo === "Folio"
        ? firstRepoPulls.promise
        : [completedPull(71, "Other repo merge", "2026-07-09T09:00:00Z")],
    );

    const pagePromise = getDashboardPullPageForUser(
      { id: "u1", login: "KMGeon" },
      {
        bucket: "completed",
        limit: 20,
        ordering: "updated",
        direction: "desc",
        closedRange: "all",
        showDrafts: true,
      },
      {
        octokitFactory: async () => octokit as never,
        listPulls,
        resolveStatus: vi.fn(),
      },
      workspaceScope(await listByInstallation()),
    );

    await vi.waitFor(() => expect(listPulls.mock.calls.length).toBeGreaterThanOrEqual(1));
    await Promise.resolve();
    const callsBeforeFirstRepoFinishes = listPulls.mock.calls.length;
    firstRepoPulls.resolve([completedPull(70, "First repo merge", "2026-07-09T08:00:00Z")]);
    await pagePromise;

    expect(callsBeforeFirstRepoFinishes).toBe(2);
  });
});

function workspaceScope(repositories: Awaited<ReturnType<typeof listByInstallation>>) {
  return {
    workspace: { id: "workspace-1", githubAccountId: 42 },
    installations: [{ id: "i1", githubInstallationId: 111 }],
    repositories: repositories.map((repository) => ({ installationId: "i1", ...repository })),
  } as never;
}

function enabledRepo(id: string, name: string) {
  return {
    id,
    owner: "KMGeon",
    name,
    fullName: `KMGeon/${name}`,
    folioEnabled: true,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function completedPull(number: number, title: string, mergedAt: string) {
  return {
    number,
    title,
    user: { login: "octo" },
    head: { ref: "feature" },
    base: { ref: "main" },
    updated_at: mergedAt,
    closed_at: mergedAt,
    merged_at: mergedAt,
  };
}
