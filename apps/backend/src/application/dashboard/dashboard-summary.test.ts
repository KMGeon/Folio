import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infrastructure/github/github-contributions.js", () => ({
  fetchPublicContributions: vi.fn(async () => [{ date: "2026-06-20", count: 1 }]),
}));

const { getDashboardSummaryForUser } = await import("./dashboard-summary.js");
const { fetchPublicContributions } =
  await import("../../infrastructure/github/github-contributions.js");

describe("getDashboardSummaryForUser", () => {
  beforeEach(() => {
    vi.mocked(fetchPublicContributions).mockClear();
  });

  it("lists only Settings-enabled repositories on the project desk", async () => {
    const payload = await getDashboardSummaryForUser(
      { id: "u1", login: "KMGeon" },
      {
        workspaces: [{ id: "ws-1", githubAccountId: 1 } as never],
        installations: [],
        repositories: [
          {
            id: "r-folio",
            fullName: "KMGeon/Folio",
            folioEnabled: true,
            installationId: "i1",
          } as never,
          {
            id: "r-noise",
            fullName: "KMGeon/commerce",
            folioEnabled: false,
            installationId: "i1",
          } as never,
        ],
      },
    );

    expect(payload.repos).toEqual([
      { id: "r-folio", fullName: "KMGeon/Folio", openPrCount: 0, folioEnabled: true },
    ]);
    expect(payload.metrics).toMatchObject({
      installedRepos: 1,
      activeRepos: 1,
    });
  });
});
