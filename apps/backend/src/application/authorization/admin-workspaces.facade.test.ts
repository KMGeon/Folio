import { adminWorkspacesRepo } from "@folio/db";
import { describe, expect, it, vi } from "vitest";
import { AdminWorkspacesFacade } from "./admin-workspaces.facade.js";

vi.mock("@folio/db", () => ({ adminWorkspacesRepo: { list: vi.fn(), detail: vi.fn() } }));

describe("AdminWorkspacesFacade", () => {
  it("projects only approved workspace metadata and an opaque stable cursor", async () => {
    vi.mocked(adminWorkspacesRepo.list).mockResolvedValue({
      hasMore: true,
      items: [
        {
          workspace: {
            id: "00000000-0000-4000-8000-000000000010",
            githubAccountId: 1,
            accountLogin: "octo",
            accountType: "Organization",
            createdAt: new Date("2026-07-12T00:00:00.000Z"),
            updatedAt: new Date(),
          },
          owner: null,
          memberCount: 1,
          repositoryCount: 2,
          enabledRepositoryCount: 1,
          installationState: "suspended",
          recentActivityAt: null,
        },
      ],
    });
    const page = await new AdminWorkspacesFacade().list({ limit: 25 });
    expect(page.items[0]).toEqual(
      expect.objectContaining({ accountLogin: "octo", installationState: "suspended" }),
    );
    expect(Object.keys(page.items[0] ?? {})).not.toContain("reviewContent");
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
