import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as FolioDb from "@folio/db";

const listByRepoIds = vi.fn();
const listOpenByRepoIds = vi.fn();
const getByRepoAndNumber = vi.fn(async () => null);

vi.mock("@folio/db", async (importOriginal) => {
  const actual = await importOriginal<typeof FolioDb>();
  return {
    ...actual,
    getLatestJobsByDedupeKeys: vi.fn(async () => new Map()),
    pullRequestIndexRepo: {
      listByRepoIds: (...args: unknown[]) => listByRepoIds(...args),
      listOpenByRepoIds: (...args: unknown[]) => listOpenByRepoIds(...args),
    },
    pullRequestsRepo: { getByRepoAndNumber },
    revisionsRepo: { latestForPr: vi.fn() },
    chaptersRepo: { listByRevision: vi.fn() },
    reviewStateRepo: { progressForRevision: vi.fn() },
  };
});

vi.mock("../../config.js", () => ({
  config: { DASHBOARD_READ_FROM_INDEX: true },
}));

vi.mock("@folio/github", () => ({ createInstallationOctokit: vi.fn() }));

const { DashboardFacade } = await import("./dashboard.facade.js");

describe("dashboard index pull pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByRepoIds.mockResolvedValue([]);
    listOpenByRepoIds.mockResolvedValue([]);
  });

  it("uses only ready repository index rows without creating an Octokit client", async () => {
    listOpenByRepoIds.mockResolvedValue([
      indexRow({ repoId: "ready-repo", number: 1, title: "Indexed PR" }),
      indexRow({ repoId: "idle-repo", number: 2, title: "Not ready" }),
    ]);
    const octokitFactory = vi.fn();
    const workspaceScopeLoader = vi.fn(async () => workspaceScope());
    const facade = new DashboardFacade({ octokitFactory, workspaceScopeLoader });

    const pages = await facade.getOpenPullPagesForUser(
      { id: "user-1", login: "viewer" },
      { showDrafts: true },
    );

    expect(listOpenByRepoIds).toHaveBeenCalledWith(["ready-repo"]);
    expect(workspaceScopeLoader).toHaveBeenCalledWith("user-1", "viewer", expect.any(Function), {
      boardRead: true,
      indexRead: true,
    });
    expect(pages.other.items.map((pull) => pull.title)).toEqual(["Indexed PR"]);
    expect(octokitFactory).not.toHaveBeenCalled();
  });

  it("limits index reads and counts to the exact repository scope", async () => {
    listOpenByRepoIds.mockResolvedValue([
      indexRow({ repoId: "ready-repo", number: 1, title: "Widget PR" }),
    ]);
    const facade = new DashboardFacade({ workspaceScopeLoader: async () => workspaceScope() });

    const pages = await facade.getOpenPullPagesForUser(
      { id: "user-1", login: "viewer" },
      { repository: "ACME/WIDGET", showDrafts: true },
    );

    expect(listOpenByRepoIds).toHaveBeenCalledWith(["ready-repo"]);
    expect(pages.other.count).toBe(1);

    const outOfScope = await facade.getOpenPullPagesForUser(
      { id: "user-1", login: "viewer" },
      { repository: "acme/waiting", showDrafts: true },
    );
    expect(listOpenByRepoIds).toHaveBeenCalledTimes(1);
    expect(outOfScope.other.count).toBe(0);
  });

  it("filters drafts and matches queries by title, author, repository, and number", async () => {
    const rows = [
      indexRow({ number: 11, title: "Fix parser", author: "alice" }),
      indexRow({ number: 22, title: "Add metrics", author: "bob" }),
      indexRow({ number: 33, title: "Draft work", author: "carol", draft: true }),
    ];
    listOpenByRepoIds.mockResolvedValue(rows);
    listByRepoIds.mockResolvedValue(rows);
    const facade = new DashboardFacade({ workspaceScopeLoader: async () => workspaceScope() });

    const withoutDrafts = await facade.getOpenPullPagesForUser(
      { id: "user-1", login: "viewer" },
      { showDrafts: false },
    );
    expect(withoutDrafts.other.items.map((pull) => pull.number)).toEqual([11, 22]);

    for (const [q, numbers] of [
      ["parser", [11]],
      ["BOB", [22]],
      ["widget", [11, 22, 33]],
      ["33", [33]],
    ] as const) {
      const page = await facade.getPullPageForUser(
        { id: "user-1", login: "viewer" },
        { bucket: "other", q, showDrafts: true },
      );
      expect(page.items.map((pull) => pull.number)).toEqual(numbers);
    }
  });

  it("applies closedRange to completed index rows", async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    listByRepoIds.mockResolvedValue([
      indexRow({ number: 41, state: "closed", closedAt: recent }),
      indexRow({ number: 42, state: "closed", closedAt: old }),
    ]);
    const facade = new DashboardFacade({ workspaceScopeLoader: async () => workspaceScope() });

    const page = await facade.getPullPageForUser(
      { id: "user-1", login: "viewer" },
      { bucket: "completed", closedRange: "7d" },
    );

    expect(page.items.map((pull) => pull.number)).toEqual([41]);
  });
});

function workspaceScope() {
  return {
    workspace: { id: "workspace-1", githubAccountId: 1 },
    installations: [],
    repositories: [repositoryRow("ready-repo", "ready"), repositoryRow("idle-repo", "idle")],
  } as never;
}

function repositoryRow(id: string, prIndexStatus: "ready" | "idle") {
  return {
    id,
    owner: "acme",
    name: id === "ready-repo" ? "widget" : "waiting",
    fullName: id === "ready-repo" ? "acme/widget" : "acme/waiting",
    folioEnabled: true,
    prIndexStatus,
  };
}

function indexRow(input: {
  repoId?: string;
  number: number;
  title?: string;
  author?: string;
  draft?: boolean;
  state?: "open" | "closed";
  closedAt?: Date | null;
}) {
  const updatedAt = input.closedAt ?? new Date("2026-07-12T00:00:00.000Z");
  return {
    id: `${input.repoId ?? "ready-repo"}:${input.number}`,
    repoId: input.repoId ?? "ready-repo",
    githubPrNumber: input.number,
    title: input.title ?? `PR ${input.number}`,
    authorLogin: input.author ?? "contributor",
    baseRef: "main",
    headRef: `feature-${input.number}`,
    headSha: `sha-${input.number}`,
    githubState: input.state ?? "open",
    isDraft: input.draft ?? false,
    mergedAt: null,
    closedAt: input.closedAt ?? null,
    githubUpdatedAt: updatedAt,
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    labelsJson: [],
    htmlUrl: `https://github.com/acme/widget/pull/${input.number}`,
    lastSyncedAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}
